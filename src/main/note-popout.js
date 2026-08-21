/**
 * Framed note editor popout. Minimize / close flushes then destroys.
 */
const { BrowserWindow, screen, app, ipcMain } = require('electron');
const path = require('path');
const { getAllSettings, setSetting } = require('./database');
const { logError } = require('./logger');
const { getDashboardWindow } = require('./notification-window');
const { getNote } = require('../services/db/notes');

const BOUNDS_KEY = 'note_popout_bounds';
const isDev = !app.isPackaged;

/** @type {Map<number, Electron.BrowserWindow>} */
const openPopouts = new Map();
/** Windows allowed to finish closing after flush. */
const allowClose = new WeakSet();
let handlersRegistered = false;

function readBoundsMap() {
  try {
    const raw = getAllSettings()[BOUNDS_KEY];
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

function saveBounds(id, bounds) {
  try {
    const map = readBoundsMap();
    map[String(id)] = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    };
    setSetting(BOUNDS_KEY, JSON.stringify(map));
  } catch (err) {
    logError('saveNotePopoutBounds', err);
  }
}

function defaultOrigin() {
  const wa = screen.getPrimaryDisplay().workArea;
  return {
    x: Math.round(wa.x + 80),
    y: Math.round(wa.y + 60),
    width: 900,
    height: 700,
  };
}

function broadcastOpenIds() {
  const ids = [...openPopouts.keys()];
  const dash = getDashboardWindow();
  if (dash && !dash.isDestroyed()) {
    dash.webContents.send('notes:popouts', ids);
  }
}

function requestFlushClose(win) {
  if (!win || win.isDestroyed()) return;
  try {
    win.webContents.send('notes:popout-flush-close');
  } catch (err) {
    logError('requestNotePopoutFlush', err);
    if (!win.isDestroyed()) win.destroy();
  }
}

function winId(win) {
  for (const [id, w] of openPopouts) {
    if (w === win) return id;
  }
  return null;
}

/**
 * Open or focus a note popout.
 * @param {number} id
 */
function openNotePopout(id) {
  try {
    const numId = Number(id);
    const existing = openPopouts.get(numId);
    if (existing && !existing.isDestroyed()) {
      if (existing.isMinimized()) existing.restore();
      existing.show();
      existing.focus();
      return true;
    }
    const row = getNote(numId);
    if (!row) throw new Error('Note not found');
    const saved = readBoundsMap()[String(numId)];
    const bounds =
      saved && Number.isFinite(saved.x) ? saved : defaultOrigin();

    const win = new BrowserWindow({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width || 900,
      height: bounds.height || 700,
      minWidth: 560,
      minHeight: 400,
      backgroundColor: '#0a1628',
      title: row.title || 'Note',
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    openPopouts.set(numId, win);
    broadcastOpenIds();

    if (isDev) {
      win.loadURL(`http://localhost:5173/?notePopout=${numId}`);
    } else {
      win.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'), {
        query: { notePopout: String(numId) },
      });
    }

    win.once('ready-to-show', () => {
      if (!win.isDestroyed()) win.show();
    });
    win.on('moved', () => {
      if (!win.isDestroyed()) saveBounds(numId, win.getBounds());
    });
    win.on('resized', () => {
      if (!win.isDestroyed()) saveBounds(numId, win.getBounds());
    });
    win.on('minimize', () => {
      if (allowClose.has(win)) return;
      if (!win.isDestroyed()) win.hide();
      requestFlushClose(win);
    });
    win.on('close', (e) => {
      if (allowClose.has(win)) return;
      e.preventDefault();
      requestFlushClose(win);
    });
    win.on('closed', () => {
      openPopouts.delete(numId);
      broadcastOpenIds();
    });
    return true;
  } catch (err) {
    logError('openNotePopout', err);
    throw err;
  }
}

function closeNotePopoutById(id) {
  const win = openPopouts.get(Number(id));
  if (!win || win.isDestroyed()) return false;
  allowClose.add(win);
  try {
    win.webContents.send('notes:popout-flush-close');
  } catch {
    /* ignore */
  }
  try {
    win.destroy();
  } catch {
    /* ignore */
  }
  return true;
}

function focusNotePopout(id) {
  const win = openPopouts.get(Number(id));
  if (!win || win.isDestroyed()) return false;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  return true;
}

function closeNotePopoutSelf(event) {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return true;
  allowClose.add(win);
  const id = winId(win);
  if (id != null) saveBounds(id, win.getBounds());
  win.destroy();
  return true;
}

function requestFlushAllNotePopouts() {
  for (const win of openPopouts.values()) {
    if (!win.isDestroyed()) requestFlushClose(win);
  }
}

function closeAllNotePopouts() {
  for (const win of [...openPopouts.values()]) {
    if (win.isDestroyed()) continue;
    allowClose.add(win);
    try {
      win.webContents.send('notes:popout-flush-close');
    } catch {
      /* ignore */
    }
    try {
      win.destroy();
    } catch {
      /* ignore */
    }
  }
  openPopouts.clear();
  broadcastOpenIds();
}

function registerNotePopoutIpc() {
  if (handlersRegistered) return;
  handlersRegistered = true;
  ipcMain.handle('notes:popoutOpen', (_e, id) => openNotePopout(id));
  ipcMain.handle('notes:popoutFocus', (_e, id) => focusNotePopout(id));
  ipcMain.handle('notes:popoutCloseSelf', (e) => closeNotePopoutSelf(e));
  ipcMain.handle('notes:popoutList', () => [...openPopouts.keys()]);
}

module.exports = {
  openNotePopout,
  focusNotePopout,
  closeNotePopoutById,
  closeAllNotePopouts,
  requestFlushAllNotePopouts,
  registerNotePopoutIpc,
};
