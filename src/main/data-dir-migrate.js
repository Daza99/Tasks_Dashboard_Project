/**
 * Desktop-only: pick a data folder and copy the live data tree there, then relaunch.
 */
const path = require('path');
const fs = require('fs');
const { app, dialog, BrowserWindow } = require('electron');
const { closeDatabase, initDatabase } = require('./database');
const { stopScheduler, startScheduler } = require('./scheduler');
const { logError } = require('./logger');
const {
  getFlavor,
  getDataDir,
  getDefaultDesktopDataDir,
  writePointer,
  assertValidMigrateDest,
  ensureWritableDir,
  copyDataTree,
} = require('./portable-paths');

function dialogParent() {
  return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || undefined;
}

function requireDesktop() {
  if (getFlavor() !== 'desktop') {
    throw new Error('Data location can only be changed in the Desktop build');
  }
}

/**
 * Folder picker. Does not migrate yet — renderer confirms, then calls migrateDataDir.
 * @returns {Promise<{ cancelled: true }|{ cancelled: false, path: string, hasExistingDb: boolean }>}
 */
async function chooseDataDir() {
  requireDesktop();
  const parent = dialogParent();
  const result = await dialog.showOpenDialog(parent, {
    title: 'Choose data folder',
    defaultPath: getDataDir(),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) return { cancelled: true };

  const dest = path.resolve(result.filePaths[0]);
  assertValidMigrateDest(dest);
  ensureWritableDir(dest);
  const hasExistingDb = fs.existsSync(path.join(dest, 'dashboard.db'));
  return { cancelled: false, path: dest, hasExistingDb };
}

/**
 * Copy current data tree to dest, write/clear pointer, relaunch.
 * @param {string} dest
 * @param {{ overwrite?: boolean, reset?: boolean }} [opts]
 */
async function migrateDataDir(dest, opts = {}) {
  requireDesktop();
  const resolved = path.resolve(dest);
  const src = path.resolve(getDataDir());
  const defaultDir = path.resolve(getDefaultDesktopDataDir());
  const reset = Boolean(opts.reset);

  assertValidMigrateDest(resolved, { allowSame: false });
  ensureWritableDir(resolved);

  const destDb = path.join(resolved, 'dashboard.db');
  if (fs.existsSync(destDb) && !opts.overwrite && !reset) {
    throw new Error('That folder already has a dashboard.db');
  }

  try {
    stopScheduler();
    closeDatabase();
    copyDataTree(src, resolved);
    if (reset || resolved === defaultDir) {
      writePointer(null);
    } else {
      writePointer(resolved);
    }
  } catch (err) {
    logError('migrateDataDir', err);
    try {
      initDatabase();
      startScheduler();
    } catch (reopenErr) {
      logError('migrateDataDir.reopen', reopenErr);
    }
    throw err;
  }

  app.relaunch();
  app.exit(0);
  return { ok: true };
}

/** Move data back to the AppData default folder and drop the pointer. */
async function resetDataDir() {
  requireDesktop();
  const dest = getDefaultDesktopDataDir();
  if (path.resolve(getDataDir()) === path.resolve(dest)) {
    throw new Error('Already using the default location');
  }
  return migrateDataDir(dest, { overwrite: true, reset: true });
}

module.exports = { chooseDataDir, migrateDataDir, resetDataDir };
