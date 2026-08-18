/**
 * Electron main entry — window, DB init, portable paths.
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { initDatabase, closeDatabase } = require('./database');
const { registerIpcHandlers } = require('./ipc-handlers');
const { ensureDirs } = require('./portable-paths');
const { logError } = require('./logger');
const { startScheduler, stopScheduler } = require('./scheduler');
const { maybeAutoBackup } = require('./backup');

const isDev = !app.isPackaged;

let mainWindow = null;
let allowQuit = false;
let flushing = false;

function shutdown() {
  stopScheduler();
  closeDatabase();
}

/** Close DB then quit. Idempotent once allowQuit is set. */
function finishQuit() {
  if (!allowQuit) {
    allowQuit = true;
    shutdown();
  }
  app.quit();
}

/**
 * Ask renderer to flush debounced notepad saves, then quit.
 * Times out at 2s so a hung renderer cannot trap Exit.
 */
function requestFlushThenQuit() {
  if (allowQuit) {
    app.quit();
    return;
  }
  if (flushing) return;
  flushing = true;

  let settled = false;
  function done() {
    if (settled) return;
    settled = true;
    ipcMain.removeListener('app:flushed', onFlushed);
    clearTimeout(timer);
    finishQuit();
  }

  function onFlushed() {
    done();
  }

  const timer = setTimeout(() => {
    logError('requestFlushThenQuit', new Error('renderer flush timed out'));
    done();
  }, 2000);

  ipcMain.once('app:flushed', onFlushed);

  const win = mainWindow;
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) {
    done();
    return;
  }
  win.webContents.send('app:flush');
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a1628',
    title: 'Personal Dashboard',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // better-sqlite3 lives in main; preload needs require
    },
  });

  win.on('close', (e) => {
    if (allowQuit) return;
    e.preventDefault();
    requestFlushThenQuit();
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
    // DevTools: Ctrl+Shift+I — avoid Autofill protocol noise on open
  } else {
    win.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
  }
  return win;
}

app.whenReady().then(() => {
  try {
    ensureDirs();
    initDatabase();
    registerIpcHandlers();
    startScheduler();
    mainWindow = createWindow();
    // Wait so the renderer can show the backup splash
    mainWindow.webContents.once('did-finish-load', () => {
      maybeAutoBackup().catch((err) => logError('maybeAutoBackup', err));
    });
  } catch (err) {
    logError('app.whenReady', err);
    allowQuit = true;
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') finishQuit();
});

app.on('before-quit', (e) => {
  if (allowQuit) {
    shutdown();
    return;
  }
  e.preventDefault();
  requestFlushThenQuit();
});
