/**
 * SQLite + asset snapshot backup / restore (main process only).
 * Uses better-sqlite3 backup() so WAL live copies stay consistent.
 */
const fs = require('fs');
const path = require('path');
const { app, dialog, BrowserWindow } = require('electron');
const { getDb, getAllSettings, setSetting, closeDatabase, initDatabase } = require('./database');
const { getDataDir, getDbPath } = require('./portable-paths');
const { logError } = require('./logger');
const { stopScheduler, startScheduler } = require('./scheduler');

const ASSET_DIRS = ['wallpapers', 'sounds', 'themes'];
const KEEP_LOCAL = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
const STAMP_RE = /(\d{4}-\d{2}-\d{2}_\d{6})$/;

let lock = Promise.resolve();

/** Serialize backup/restore so auto + manual cannot overlap. */
function withLock(fn) {
  const run = lock.then(fn, fn);
  lock = run.catch(() => {});
  return run;
}

/** Local timestamp folder name: yyyy-mm-dd_HHmmss */
function formatStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function getBackupsDir() {
  return path.join(getDataDir(), 'backups');
}

function ensureBackupsDir() {
  const dir = getBackupsDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Push last-backup fields to all renderer windows. */
function notifyBackupDidRun(payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('backup:didRun', payload);
  }
}

function copyAssetDirs(srcRoot, destRoot, { replace = false } = {}) {
  for (const dir of ASSET_DIRS) {
    const src = path.join(srcRoot, dir);
    const dest = path.join(destRoot, dir);
    if (replace && fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true, force: true });
    }
    if (fs.existsSync(src)) {
      fs.cpSync(src, dest, { recursive: true });
    } else if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
  }
}

function writeManifest(folder, stamp, dbBytes) {
  const manifest = {
    created: new Date().toISOString(),
    stamp,
    dbBytes,
    included: [...ASSET_DIRS],
  };
  fs.writeFileSync(
    path.join(folder, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8'
  );
  return manifest;
}

/** Drop oldest local snapshots; never touch folders outside data/backups/. */
function pruneBackups() {
  const root = getBackupsDir();
  if (!fs.existsSync(root)) return;
  const dirs = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_writing_'))
    .map((e) => {
      const m = e.name.match(STAMP_RE);
      return { name: e.name, stamp: m ? m[1] : '', full: path.join(root, e.name) };
    })
    .filter((d) => d.stamp)
    .sort((a, b) => (a.stamp < b.stamp ? 1 : a.stamp > b.stamp ? -1 : 0));

  for (const extra of dirs.slice(KEEP_LOCAL)) {
    fs.rmSync(extra.full, { recursive: true, force: true });
  }
}

function removeStaleWritingDirs() {
  const root = getBackupsDir();
  if (!fs.existsSync(root)) return;
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    if (e.isDirectory() && e.name.startsWith('_writing_')) {
      fs.rmSync(path.join(root, e.name), { recursive: true, force: true });
    }
  }
}

function removeLiveDbFiles() {
  const dbPath = getDbPath();
  for (const p of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

/**
 * Snapshot live DB + asset dirs into data/backups/.
 * @param {{ kind?: 'manual'|'auto'|'pre-restore' }} [opts]
 * @returns {Promise<{ ok: boolean, path: string, created: string, lastBackupAt: string|null }>}
 */
async function runBackup(opts = {}) {
  const kind = opts.kind || 'manual';
  ensureBackupsDir();
  removeStaleWritingDirs();

  const stamp = formatStamp();
  let folderName = kind === 'pre-restore' ? `pre-restore_${stamp}` : stamp;
  const writing = path.join(getBackupsDir(), `_writing_${folderName}`);
  let finalPath = path.join(getBackupsDir(), folderName);
  if (fs.existsSync(finalPath)) {
    folderName = `${folderName}_${Date.now()}`;
    finalPath = path.join(getBackupsDir(), folderName);
  }

  fs.mkdirSync(writing, { recursive: true });
  try {
    const destDb = path.join(writing, 'dashboard.db');
    await getDb().backup(destDb);
    copyAssetDirs(getDataDir(), writing);
    const dbBytes = fs.statSync(destDb).size;
    const manifest = writeManifest(writing, stamp, dbBytes);
    fs.renameSync(writing, finalPath);

    let lastBackupAt = null;
    if (kind !== 'pre-restore') {
      lastBackupAt = manifest.created;
      setSetting('last_backup_at', lastBackupAt);
      setSetting('last_backup_path', finalPath);
      pruneBackups();
      notifyBackupDidRun({ lastBackupAt, lastBackupPath: finalPath });
    }

    return {
      ok: true,
      path: finalPath,
      created: manifest.created,
      lastBackupAt: lastBackupAt || getAllSettings().last_backup_at || null,
    };
  } catch (err) {
    try {
      if (fs.existsSync(writing)) fs.rmSync(writing, { recursive: true, force: true });
    } catch {
      /* ignore cleanup failure */
    }
    logError('runBackup', err);
    throw err;
  }
}

/** Status for Settings / status bar. */
function getBackupStatus() {
  const s = getAllSettings();
  return {
    lastBackupAt: s.last_backup_at || null,
    lastBackupPath: s.last_backup_path || null,
    autoDaily: s.backup_auto_daily !== 'false',
  };
}

/** On launch: snapshot if auto enabled and last backup is missing or older than 24h. */
async function maybeAutoBackup() {
  return withLock(async () => {
    const s = getAllSettings();
    if (s.backup_auto_daily === 'false') return { skipped: true, reason: 'disabled' };
    const last = s.last_backup_at;
    if (last && Date.now() - Date.parse(last) < DAY_MS) {
      return { skipped: true, reason: 'fresh' };
    }
    return runBackup({ kind: 'auto' });
  });
}

function dialogParent() {
  return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || undefined;
}

function latestLocalBackupPath() {
  const s = getAllSettings();
  const stored = s.last_backup_path;
  if (stored && fs.existsSync(path.join(stored, 'dashboard.db'))) return stored;

  const root = getBackupsDir();
  if (!fs.existsSync(root)) return null;
  const dirs = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_writing_') && STAMP_RE.test(e.name))
    .map((e) => ({
      name: e.name,
      stamp: e.name.match(STAMP_RE)[1],
      full: path.join(root, e.name),
    }))
    .filter((d) => fs.existsSync(path.join(d.full, 'dashboard.db')))
    .sort((a, b) => (a.stamp < b.stamp ? 1 : -1));
  return dirs[0]?.full || null;
}

/**
 * Copy the latest local snapshot to a user-chosen folder (dialog in main).
 * @returns {Promise<{ cancelled: true }|{ ok: true, path: string }>}
 */
async function chooseDestAndCopy() {
  return withLock(async () => {
    const parent = dialogParent();
    const result = await dialog.showOpenDialog(parent, {
      title: 'Save backup copy to…',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return { cancelled: true };

    let src = latestLocalBackupPath();
    if (!src) {
      const made = await runBackup({ kind: 'manual' });
      src = made.path;
    }

    const destRoot = result.filePaths[0];
    let dest = path.join(destRoot, path.basename(src));
    if (fs.existsSync(dest)) dest = `${dest}_${formatStamp()}`;
    fs.cpSync(src, dest, { recursive: true });
    return { ok: true, path: dest };
  });
}

/**
 * Folder picker for restore. Returns a path the renderer may pass back to restoreFromFolder.
 * @returns {Promise<{ cancelled: true }|{ cancelled: false, path: string, stamp: string|null, created: string|null }>}
 */
async function pickRestoreFolder() {
  const parent = dialogParent();
  const result = await dialog.showOpenDialog(parent, {
    title: 'Restore from backup folder',
    defaultPath: ensureBackupsDir(),
    properties: ['openDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) return { cancelled: true };

  const folder = path.resolve(result.filePaths[0]);
  const dbFile = path.join(folder, 'dashboard.db');
  if (!fs.existsSync(dbFile) || !fs.statSync(dbFile).isFile()) {
    throw new Error('That folder has no dashboard.db — pick a backup snapshot.');
  }

  let created = null;
  const manPath = path.join(folder, 'manifest.json');
  if (fs.existsSync(manPath)) {
    try {
      const man = JSON.parse(fs.readFileSync(manPath, 'utf8'));
      created = man.created || null;
    } catch {
      /* ignore bad manifest */
    }
  }
  const m = path.basename(folder).match(STAMP_RE);
  return { cancelled: false, path: folder, stamp: m ? m[1] : null, created };
}

/**
 * Replace live data with a snapshot, then relaunch.
 * @param {string} rawPath Folder returned by pickRestoreFolder
 */
async function restoreFromFolder(rawPath) {
  return withLock(async () => {
    if (!rawPath || typeof rawPath !== 'string') {
      throw new Error('Restore path required');
    }
    const folder = path.resolve(rawPath);
    const srcDb = path.join(folder, 'dashboard.db');
    if (!fs.existsSync(srcDb) || !fs.statSync(srcDb).isFile()) {
      throw new Error('That folder has no dashboard.db');
    }
    if (path.resolve(srcDb) === path.resolve(getDbPath())) {
      throw new Error('Cannot restore from the live data folder');
    }

    const safety = await runBackup({ kind: 'pre-restore' });

    try {
      stopScheduler();
      closeDatabase();
      removeLiveDbFiles();
      fs.copyFileSync(srcDb, getDbPath());
      // Replace live asset dirs with snapshot copies
      const dataDir = getDataDir();
      for (const dir of ASSET_DIRS) {
        const dest = path.join(dataDir, dir);
        const src = path.join(folder, dir);
        if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
        if (fs.existsSync(src)) fs.cpSync(src, dest, { recursive: true });
        else fs.mkdirSync(dest, { recursive: true });
      }
    } catch (err) {
      logError('restoreFromFolder', err);
      try {
        removeLiveDbFiles();
        fs.copyFileSync(path.join(safety.path, 'dashboard.db'), getDbPath());
        copyAssetDirs(safety.path, getDataDir(), { replace: true });
        initDatabase();
        startScheduler();
      } catch (rollbackErr) {
        logError('restoreFromFolder.rollback', rollbackErr);
      }
      throw err;
    }

    app.relaunch();
    app.exit(0);
    return { ok: true };
  });
}

module.exports = {
  runBackup: (opts) => withLock(() => runBackup(opts)),
  maybeAutoBackup,
  getBackupStatus,
  chooseDestAndCopy,
  pickRestoreFolder,
  restoreFromFolder,
};
