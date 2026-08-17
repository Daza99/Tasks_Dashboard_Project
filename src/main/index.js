/**
 * Electron main entry — window, DB init, portable paths.
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const { initDatabase, closeDatabase } = require('./database');
const { registerIpcHandlers } = require('./ipc-handlers');
const { ensureDirs } = require('./portable-paths');
const { logError } = require('./logger');
const { startScheduler, stopScheduler } = require('./scheduler');
const { maybeAutoBackup } = require('./backup');

const isDev = !app.isPackaged;

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

  if (isDev) {
    win.loadURL('http://localhost:5173');
    // DevTools: Ctrl+Shift+I — avoid Autofill protocol noise on open
  } else {
    win.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  try {
    ensureDirs();
    initDatabase();
    registerIpcHandlers();
    startScheduler();
    createWindow();
    maybeAutoBackup().catch((err) => logError('maybeAutoBackup', err));
  } catch (err) {
    logError('app.whenReady', err);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopScheduler();
  closeDatabase();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopScheduler();
  closeDatabase();
});
