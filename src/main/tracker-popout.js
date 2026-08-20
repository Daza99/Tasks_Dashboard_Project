/**
 * Persistent always-on-top tracker widgets. Not the due-notification pipeline.
 * Payload is { controls: [...] } so a later Kit reuses this chrome.
 */
const { BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const { getAllSettings, setSetting } = require('./database');
const { logError } = require('./logger');
const { getDashboardWindow } = require('./notification-window');
const {
  getTracker,
  toPopoutPayload,
  settleExpiredCountdowns,
  hasRunningCountdowns,
} = require('../services/db/trackers');

const BOUNDS_KEY = 'tracker_popout_bounds';
/** @type {Map<number, Electron.BrowserWindow>} */
const openPopouts = new Map();
/** Hidden popouts waiting in the taskbar dock. */
const minimizedIds = new Set();
/** @type {Electron.BrowserWindow|null} */
let dockWindow = null;
let closingDock = false;
let handlersRegistered = false;
let tickTimer = null;

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
    map[String(id)] = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    setSetting(BOUNDS_KEY, JSON.stringify(map));
  } catch (err) {
    logError('saveTrackerPopoutBounds', err);
  }
}

function sizeForPayload(payload) {
  const n = payload?.controls?.length || 1;
  const kind = payload?.controls?.[0]?.kind;
  const cfg = payload?.controls?.[0]?.config || {};
  let width = 300;
  let height = 168;
  if (kind === 'scale') {
    const span = Math.max(0, (cfg.max ?? 10) - (cfg.min ?? 1) + 1);
    height = span > 12 ? 176 : Math.min(280, 150 + Math.ceil(span / 6) * 28);
    width = span > 12 ? 300 : 340;
  } else if (kind === 'mood' || kind === 'energy') {
    height = 168;
    width = 340;
  } else if (kind === 'count') {
    height = 168;
  } else if (kind === 'stopwatch' || kind === 'countdown') {
    height = 176;
  }
  height += Math.max(0, n - 1) * 120;
  return { width, height };
}

function defaultOrigin(width, height) {
  const wa = screen.getPrimaryDisplay().workArea;
  const stack = openPopouts.size;
  return {
    x: Math.round(wa.x + wa.width - width - 16),
    y: Math.round(wa.y + 16 + stack * 28),
    width,
    height,
  };
}

/** Show a popout without the Windows DWM fade on transparent windows. */
function showPopout(win) {
  if (!win || win.isDestroyed()) return;
  win.setOpacity(1);
  win.show();
  win.focus();
}

function idForSender(sender) {
  for (const [id, win] of openPopouts) {
    if (!win.isDestroyed() && win.webContents === sender) return id;
  }
  return null;
}

/** Names of currently hidden popouts for the dock list. */
function dockItems() {
  const items = [];
  for (const id of [...minimizedIds]) {
    const win = openPopouts.get(id);
    if (!win || win.isDestroyed()) {
      minimizedIds.delete(id);
      continue;
    }
    const row = getTracker(id);
    if (!row) {
      closeTrackerPopout(id);
      continue;
    }
    items.push({ id, name: row.name, kind: row.kind });
  }
  return items;
}

function pushDockList() {
  if (!dockWindow || dockWindow.isDestroyed()) return;
  dockWindow.webContents.send('trackers:dock-list', { items: dockItems() });
}

/** Destroy the dock window when nothing is minimized. */
function closeDockIfEmpty() {
  if (minimizedIds.size) return;
  if (!dockWindow || dockWindow.isDestroyed()) {
    dockWindow = null;
    return;
  }
  closingDock = true;
  const win = dockWindow;
  dockWindow = null;
  if (!win.isDestroyed()) win.close();
  closingDock = false;
}

/** One taskbar window listing hidden popouts. Created on first Min. */
function ensureDock() {
  if (dockWindow && !dockWindow.isDestroyed()) {
    pushDockList();
    return;
  }
  const win = new BrowserWindow({
    width: 300,
    height: 360,
    minWidth: 240,
    minHeight: 160,
    skipTaskbar: false,
    alwaysOnTop: false,
    autoHideMenuBar: true,
    title: 'Minimized Trackers',
    backgroundColor: '#f4f1ea',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'tracker-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  dockWindow = win;
  win.loadFile(path.join(__dirname, 'tracker-dock.html'));
  win.webContents.once('did-finish-load', () => pushDockList());
  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) win.show();
  });
  win.on('close', () => {
    if (closingDock) return;
    dockWindow = null;
    // Don't leave popouts hidden with no taskbar handle
    for (const id of [...minimizedIds]) {
      minimizedIds.delete(id);
      const pop = openPopouts.get(id);
      if (pop && !pop.isDestroyed()) showPopout(pop);
    }
  });
}

/**
 * Hide a popout into the single taskbar dock. Window stays alive (timers run).
 * @param {number} id
 */
function minimizeTrackerPopout(id) {
  const numId = Number(id);
  const win = openPopouts.get(numId);
  if (!win || win.isDestroyed()) return false;
  win.hide();
  minimizedIds.add(numId);
  ensureDock();
  pushDockList();
  return true;
}

/**
 * Show a hidden popout again.
 * @param {number} id
 */
function restoreTrackerPopout(id) {
  const numId = Number(id);
  minimizedIds.delete(numId);
  const win = openPopouts.get(numId);
  if (win && !win.isDestroyed()) {
    showPopout(win);
  }
  if (!minimizedIds.size) closeDockIfEmpty();
  else pushDockList();
  return true;
}

function pushState(id) {
  const win = openPopouts.get(id);
  if (!win || win.isDestroyed()) return;
  const row = getTracker(id);
  if (!row) {
    closeTrackerPopout(id);
    return;
  }
  win.webContents.send('trackers:popout-state', toPopoutPayload(row));
}

/** Notify dashboard + every open popout after a mutation. */
function broadcastTrackersChanged(id) {
  try {
    settleExpiredCountdowns();
    const dash = getDashboardWindow();
    if (dash && !dash.isDestroyed()) {
      dash.webContents.send('trackers:changed', { id });
    }
    if (id != null && openPopouts.has(Number(id))) {
      pushState(Number(id));
    } else {
      for (const tid of [...openPopouts.keys()]) pushState(tid);
    }
  } catch (err) {
    logError('broadcastTrackersChanged', err);
  }
}

function ensureTick() {
  if (tickTimer) return;
  tickTimer = setInterval(() => {
    const changed = settleExpiredCountdowns();
    if (changed) {
      const dash = getDashboardWindow();
      if (dash && !dash.isDestroyed()) dash.webContents.send('trackers:changed', {});
    }
    for (const [id, win] of openPopouts) {
      if (win.isDestroyed()) {
        openPopouts.delete(id);
        continue;
      }
      const row = getTracker(id);
      if (!row) {
        closeTrackerPopout(id);
        continue;
      }
      // Local clock tick handles running display; only push when data changed.
      if (changed) {
        win.webContents.send('trackers:popout-state', toPopoutPayload(row));
      }
    }
    if (!openPopouts.size && !hasRunningCountdowns() && tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  }, 500);
}

/**
 * Open (or focus) a per-tracker popout. Closing it does not stop a running timer.
 * @param {number} id
 */
function openTrackerPopout(id) {
  try {
    const numId = Number(id);
    const existing = openPopouts.get(numId);
    if (existing && !existing.isDestroyed()) {
      if (minimizedIds.has(numId)) restoreTrackerPopout(numId);
      else {
        showPopout(existing);
      }
      return true;
    }
    const row = getTracker(numId);
    if (!row) throw new Error('Tracker not found');
    const payload = toPopoutPayload(row);
    const size = sizeForPayload(payload);
    const saved = readBoundsMap()[String(numId)];
    const bounds =
      saved && Number.isFinite(saved.x)
        ? { ...size, x: saved.x, y: saved.y }
        : defaultOrigin(size.width, size.height);

    const win = new BrowserWindow({
      ...bounds,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      minimizable: false,
      closable: true,
      focusable: true,
      show: false,
      title: row.name,
      webPreferences: {
        preload: path.join(__dirname, 'tracker-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    openPopouts.set(numId, win);
    win.loadFile(path.join(__dirname, 'tracker-popout.html'), {
      query: { id: String(numId) },
    });

    win.once('ready-to-show', () => {
      if (!win.isDestroyed()) showPopout(win);
    });
    win.on('moved', () => {
      if (!win.isDestroyed()) saveBounds(numId, win.getBounds());
    });
    win.on('closed', () => {
      openPopouts.delete(numId);
      minimizedIds.delete(numId);
      if (!minimizedIds.size) closeDockIfEmpty();
      else pushDockList();
      if (!openPopouts.size && !hasRunningCountdowns() && tickTimer) {
        clearInterval(tickTimer);
        tickTimer = null;
      }
    });
    ensureTick();
    return true;
  } catch (err) {
    logError('openTrackerPopout', err);
    throw err;
  }
}

function closeTrackerPopout(id) {
  const numId = Number(id);
  minimizedIds.delete(numId);
  const win = openPopouts.get(numId);
  if (win && !win.isDestroyed()) win.close();
  openPopouts.delete(numId);
  if (!minimizedIds.size) closeDockIfEmpty();
  else pushDockList();
  return true;
}

function closeAllTrackerPopouts() {
  closingDock = true;
  if (dockWindow && !dockWindow.isDestroyed()) {
    try {
      dockWindow.close();
    } catch {
      /* shutting down */
    }
  }
  dockWindow = null;
  closingDock = false;
  minimizedIds.clear();
  for (const [id, win] of openPopouts) {
    try {
      if (!win.isDestroyed()) win.close();
    } catch {
      /* shutting down */
    }
    openPopouts.delete(id);
  }
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

function registerTrackerPopoutIpc() {
  if (handlersRegistered) return;
  handlersRegistered = true;
  ipcMain.handle('trackers:popoutState', (e) => {
    const id = idForSender(e.sender);
    if (id == null) return { controls: [] };
    const row = getTracker(id);
    if (!row) return { controls: [] };
    return toPopoutPayload(row);
  });
  ipcMain.handle('trackers:popoutCloseSelf', (e) => {
    const id = idForSender(e.sender);
    if (id == null) return false;
    return closeTrackerPopout(id);
  });
  ipcMain.handle('trackers:popoutMinimizeSelf', (e) => {
    const id = idForSender(e.sender);
    if (id == null) return false;
    return minimizeTrackerPopout(id);
  });
  ipcMain.handle('trackers:dockList', () => ({ items: dockItems() }));
  ipcMain.handle('trackers:dockRestore', (_e, id) => restoreTrackerPopout(id));
}

module.exports = {
  registerTrackerPopoutIpc,
  openTrackerPopout,
  closeTrackerPopout,
  closeAllTrackerPopouts,
  broadcastTrackersChanged,
  ensureTick,
};
