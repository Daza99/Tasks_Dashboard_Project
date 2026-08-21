/**
 * Resolve data directory: portable (beside exe / workspace) vs desktop (AppData + optional pointer).
 */
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const DATA_SUBDIRS = ['wallpapers', 'sounds', 'exports', 'themes', 'backups'];
const POINTER_NAME = 'data-location.json';
const SKIP_ON_MIGRATE = new Set(['chromium']);

let cachedFlavor = null;

/** Packaged extraMetadata.flavor, else DASHBOARD_FLAVOR env, else portable. */
function getFlavor() {
  if (cachedFlavor) return cachedFlavor;
  const env = String(process.env.DASHBOARD_FLAVOR || '').toLowerCase();
  if (env === 'desktop' || env === 'portable') {
    cachedFlavor = env;
    return cachedFlavor;
  }
  try {
    const pkg = require(path.join(app.getAppPath(), 'package.json'));
    if (pkg.flavor === 'desktop' || pkg.flavor === 'portable') {
      cachedFlavor = pkg.flavor;
      return cachedFlavor;
    }
  } catch {
    /* unpackaged source package.json has no flavor */
  }
  cachedFlavor = 'portable';
  return cachedFlavor;
}

/** Pointer lives in Electron default userData (AppData on Desktop). Portable ignores it. */
function getPointerPath() {
  return path.join(app.getPath('userData'), POINTER_NAME);
}

/** Default Desktop data root: %APPDATA%\personal-dashboard\data */
function getDefaultDesktopDataDir() {
  return path.join(app.getPath('userData'), 'data');
}

function readPointerDataDir() {
  const p = getPointerPath();
  if (!fs.existsSync(p)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    const dir = raw && raw.dataDir;
    if (typeof dir === 'string' && dir.trim() && path.isAbsolute(dir)) {
      return path.resolve(dir.trim());
    }
  } catch {
    /* ignore corrupt pointer */
  }
  return null;
}

/**
 * Persist custom data dir. Pass null to remove the pointer (use default).
 * @param {string|null} dataDir
 */
function writePointer(dataDir) {
  const p = getPointerPath();
  if (!dataDir) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
    return;
  }
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${JSON.stringify({ dataDir }, null, 2)}\n`, 'utf8');
}

/** True if `inner` is `outer` or a descendant. */
function isSubPath(inner, outer) {
  const a = path.resolve(inner);
  const b = path.resolve(outer);
  if (a === b) return true;
  const rel = path.relative(b, a);
  return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function getInstallDir() {
  if (app.isPackaged) return path.dirname(process.execPath);
  return path.resolve(__dirname, '..', '..');
}

/** Absolute path to the data root (DB + assets). */
function getDataDir() {
  if (getFlavor() === 'desktop') {
    return readPointerDataDir() || getDefaultDesktopDataDir();
  }
  if (!app.isPackaged) {
    return path.join(__dirname, '..', '..', 'data');
  }
  return path.join(path.dirname(process.execPath), 'data');
}

/** Paths for Settings / IPC. */
function getPathInfo() {
  const flavor = getFlavor();
  const dataDir = getDataDir();
  const defaultDataDir = flavor === 'desktop' ? getDefaultDesktopDataDir() : dataDir;
  const custom =
    flavor === 'desktop' && path.resolve(dataDir) !== path.resolve(defaultDataDir);
  return { dataDir, flavor, defaultDataDir, custom };
}

/** Ensure data/ and known subfolders exist. Returns dataDir. */
function ensureDirs() {
  const dataDir = getDataDir();
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  for (const sub of DATA_SUBDIRS) {
    const p = path.join(dataDir, sub);
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p, { recursive: true });
    }
  }
  return dataDir;
}

/** Path to dashboard.db inside data/. */
function getDbPath() {
  return path.join(getDataDir(), 'dashboard.db');
}

/** Path to schema.sql (dev vs packaged resources). */
function getSchemaPath() {
  if (!app.isPackaged) {
    return path.join(__dirname, '..', 'services', 'db', 'schema.sql');
  }
  return path.join(process.resourcesPath, 'schema.sql');
}

/**
 * Packaged portable only: Chromium userData next to the exe (USB, no AppData).
 * Must run before app.whenReady(). Desktop keeps default AppData userData.
 */
function applyPortableUserData() {
  if (!app.isPackaged) return;
  if (getFlavor() !== 'portable') return;
  ensureDirs();
  const chromiumDir = path.join(getDataDir(), 'chromium');
  if (!fs.existsSync(chromiumDir)) {
    fs.mkdirSync(chromiumDir, { recursive: true });
  }
  app.setPath('userData', chromiumDir);
  app.setPath('sessionData', chromiumDir);
}

/**
 * Throw if dest is not a valid migration target.
 * @param {string} dest
 * @param {{ allowSame?: boolean }} [opts]
 */
function assertValidMigrateDest(dest, opts = {}) {
  const resolved = path.resolve(dest);
  const current = path.resolve(getDataDir());
  if (!opts.allowSame && resolved === current) {
    throw new Error('Already using that folder');
  }
  if (isSubPath(resolved, current) || isSubPath(current, resolved)) {
    throw new Error('Choose a folder that is not inside the current data directory (or vice versa)');
  }
  const installDir = getInstallDir();
  if (isSubPath(resolved, installDir)) {
    throw new Error('Cannot store data inside the app install folder');
  }
}

/** Create dest and prove we can write. */
function ensureWritableDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const probe = path.join(dir, `.dash-write-${process.pid}`);
  fs.writeFileSync(probe, 'ok');
  fs.unlinkSync(probe);
}

/**
 * Copy data tree to dest, skipping chromium/. Overwrites same-named files.
 * @param {string} src
 * @param {string} dest
 */
function copyDataTree(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (SKIP_ON_MIGRATE.has(name)) continue;
    fs.cpSync(path.join(src, name), path.join(dest, name), { recursive: true });
  }
}

module.exports = {
  getFlavor,
  getDataDir,
  getPathInfo,
  getDefaultDesktopDataDir,
  ensureDirs,
  getDbPath,
  getSchemaPath,
  applyPortableUserData,
  writePointer,
  readPointerDataDir,
  assertValidMigrateDest,
  ensureWritableDir,
  copyDataTree,
  DATA_SUBDIRS,
};
