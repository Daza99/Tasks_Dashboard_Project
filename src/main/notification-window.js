/**
 * Custom due popup — BrowserWindow with taskbar presence (not OS toast).
 * itemType: reminder | reminder_nudge | task | bill | habit
 */
const { BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const { getAllSettings } = require('./database');
const {
  completeReminder,
  ignoreReminder,
  snoozeReminder,
  dismissReminderNudge,
  snoozeReminderNudge,
  getReminder,
} = require('../services/db/reminders');
const {
  completeTask,
  ignoreTaskAlert,
  snoozeTask,
  getTask,
} = require('../services/db/tasks');
const {
  markPaid,
  snoozeBill,
  dismissBillAlert,
  getBill,
} = require('../services/db/bills');
const {
  markCheckin,
  snoozeHabit,
  dismissHabitNudge,
  getHabit,
} = require('../services/db/habits');
const { getTracker, deleteTracker } = require('../services/db/trackers');
const { logError } = require('./logger');
const { pickNotifTheme } = require('../utils/notif-colors.cjs');

const VALID_TYPES = new Set([
  'reminder',
  'reminder_nudge',
  'task',
  'bill',
  'habit',
  'countdown',
]);

/** Unknown types / missing getter → no details block. */
const DETAILS_GETTERS = {
  reminder: getReminder,
  reminder_nudge: getReminder,
  task: getTask,
  bill: getBill,
  habit: getHabit,
  countdown: getTracker,
};

/** Popup itemType → App.jsx requestEdit type. Nudge is the same reminder row. */
const ITEM_TO_EDIT_TYPE = {
  reminder: 'reminder',
  reminder_nudge: 'reminder',
  task: 'task',
  bill: 'bill',
  habit: 'habit',
  countdown: 'tracker',
};

/** Map key → { win, resolved, itemType, id, details } */
const openWindows = new Map();
let handlersRegistered = false;
let dashboardWindow = null;

/** Called from index.js after createWindow (avoids circular require). */
function setDashboardWindow(win) {
  dashboardWindow = win;
}

function getDashboardWindow() {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) return dashboardWindow;
  return null;
}

/**
 * Trimmed description or null. Future types with no getter stay hidden.
 * @param {string} itemType
 * @param {number} id
 * @param {string|null|undefined} fallback already on the item
 */
function resolveDetails(itemType, id, fallback) {
  const fromItem = String(fallback || '').trim();
  if (fromItem) return fromItem;
  const getter = DETAILS_GETTERS[itemType];
  if (!getter) return null;
  try {
    const row = getter(id);
    return String(row?.description || '').trim() || null;
  } catch (err) {
    logError('resolveDetails', err);
    return null;
  }
}

function winKey(itemType, id) {
  return `${itemType}:${id}`;
}

/** Normalize IPC payload: object `{ id, itemType }` or legacy bare id (reminder). */
function parsePayload(payload) {
  if (payload && typeof payload === 'object') {
    const itemType = VALID_TYPES.has(payload.itemType)
      ? payload.itemType
      : 'reminder';
    return { id: Number(payload.id), itemType };
  }
  return { id: Number(payload), itemType: 'reminder' };
}

function registerNotificationIpc() {
  if (handlersRegistered) return;
  handlersRegistered = true;

  ipcMain.handle('notif:complete', (_e, payload) => {
    try {
      const { id, itemType } = parsePayload(payload);
      markResolved(itemType, id);
      if (itemType === 'countdown') {
        /* already done — Done just dismisses */
      } else if (itemType === 'task') completeTask(id);
      else if (itemType === 'bill') markPaid(id);
      else if (itemType === 'habit') markCheckin(id);
      else if (itemType === 'reminder_nudge') dismissReminderNudge(id);
      else completeReminder(id);
      closeNotif(itemType, id);
      return true;
    } catch (err) {
      logError('notif:complete', err);
      throw err;
    }
  });

  ipcMain.handle('notif:snooze', (_e, payload, minutes) => {
    try {
      const { id, itemType } = parsePayload(payload);
      if (itemType === 'countdown') return true;
      markResolved(itemType, id);
      if (itemType === 'task') snoozeTask(id, minutes);
      else if (itemType === 'bill') snoozeBill(id, minutes);
      else if (itemType === 'habit') snoozeHabit(id, minutes);
      else if (itemType === 'reminder_nudge') snoozeReminderNudge(id, minutes);
      else snoozeReminder(id, minutes);
      const { clearFiredSession } = require('./scheduler');
      clearFiredSession(itemType, id);
      // Bill session keys include alertKind — clear both variants
      if (itemType === 'bill') {
        clearFiredSession('bill', `${id}:before`);
        clearFiredSession('bill', `${id}:due`);
      }
      closeNotif(itemType, id);
      return true;
    } catch (err) {
      logError('notif:snooze', err);
      throw err;
    }
  });

  ipcMain.handle('notif:ignore', (_e, payload) => {
    try {
      const { id, itemType } = parsePayload(payload);
      markResolved(itemType, id);
      if (itemType === 'countdown') {
        /* dismiss only — tracker stays */
      } else if (itemType === 'task') ignoreTaskAlert(id);
      else if (itemType === 'bill') dismissBillAlert(id);
      else if (itemType === 'habit') dismissHabitNudge(id);
      else if (itemType === 'reminder_nudge') dismissReminderNudge(id);
      else ignoreReminder(id);
      closeNotif(itemType, id);
      return true;
    } catch (err) {
      logError('notif:ignore', err);
      throw err;
    }
  });

  ipcMain.handle('notif:delete', (_e, payload) => {
    try {
      const { id, itemType } = parsePayload(payload);
      markResolved(itemType, id);
      if (itemType === 'countdown') {
        deleteTracker(id);
        try {
          const { broadcastTrackersChanged } = require('./tracker-popout');
          broadcastTrackersChanged(id);
        } catch (err) {
          logError('notif:delete broadcast', err);
        }
      }
      closeNotif(itemType, id);
      return true;
    } catch (err) {
      logError('notif:delete', err);
      throw err;
    }
  });

  ipcMain.handle('notif:minimize', (_e, payload) => {
    const { id, itemType } = parsePayload(payload);
    const entry = openWindows.get(winKey(itemType, id));
    if (entry?.win && !entry.win.isDestroyed()) {
      entry.win.minimize();
    }
    return true;
  });

  ipcMain.handle('notif:getMeta', (e) => {
    for (const entry of openWindows.values()) {
      if (
        entry.win &&
        !entry.win.isDestroyed() &&
        entry.win.webContents === e.sender
      ) {
        return { details: entry.details || null };
      }
    }
    return { details: null };
  });

  ipcMain.handle('notif:view', (_e, payload) => {
    try {
      const { id, itemType } = parsePayload(payload);
      const dash = getDashboardWindow();
      if (dash && !dash.isDestroyed()) {
        if (dash.isMinimized()) {
          dash.restore();
          dash.maximize();
        } else if (!dash.isVisible()) {
          dash.show();
        }
        dash.show();
        dash.focus();
        const editType = ITEM_TO_EDIT_TYPE[itemType] || null;
        if (!dash.webContents.isDestroyed()) {
          dash.webContents.send('app:open-item', {
            type: editType,
            id: editType ? id : null,
          });
        }
      }
      return true;
    } catch (err) {
      logError('notif:view', err);
      throw err;
    }
  });
}

function markResolved(itemType, id) {
  const entry = openWindows.get(winKey(itemType, id));
  if (entry) entry.resolved = true;
}

function closeNotif(itemType, id) {
  const key = winKey(itemType, id);
  const entry = openWindows.get(key);
  if (entry?.win && !entry.win.isDestroyed()) entry.win.close();
  openWindows.delete(key);
}

function cornerBounds(position, width, height) {
  const display = screen.getPrimaryDisplay();
  const { workArea } = display;
  const margin = 16;
  const pos = position || 'br';
  let x = workArea.x + workArea.width - width - margin;
  let y = workArea.y + workArea.height - height - margin;
  if (pos === 'bl') {
    x = workArea.x + margin;
  } else if (pos === 'tr') {
    y = workArea.y + margin;
  } else if (pos === 'tl') {
    x = workArea.x + margin;
    y = workArea.y + margin;
  }
  return { x, y, width, height };
}

const TYPE_LABELS = {
  reminder: 'Reminder',
  reminder_nudge: 'Nudge',
  task: 'Task',
  bill: 'Bill',
  habit: 'Habit',
  countdown: 'Countdown',
};

/**
 * Show always-on-top popup with taskbar entry + flash until action.
 * @param {{ id: number, title: string, itemType?: string, tags?: string[] }} item
 */
function showItemNotification(item) {
  const itemType = VALID_TYPES.has(item.itemType) ? item.itemType : 'reminder';
  const key = winKey(itemType, item.id);
  const label = TYPE_LABELS[itemType] || 'Alert';

  try {
    registerNotificationIpc();
    if (openWindows.has(key)) return;

    const settings = getAllSettings();
    const randomize = settings.notif_random_bg === 'true';
    const theme = pickNotifTheme(randomize);
    const snoozeMins = settings.notif_default_snooze_minutes || '10';
    const tags = Array.isArray(item.tags) ? item.tags.filter(Boolean) : [];
    const details = resolveDetails(itemType, item.id, item.description);
    // Extra height for tags and/or a details pane (~3 lines then scroll)
    const height = details ? 260 : tags.length ? 200 : 180;
    const bounds = cornerBounds(settings.notif_position, 340, height);
    // Query strings cannot carry '#' — HTML prepends it
    const stripHash = (hex) => String(hex || '').replace(/^#/, '');

    const win = new BrowserWindow({
      ...bounds,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: false,
      resizable: false,
      minimizable: true,
      closable: true,
      focusable: true,
      show: false,
      title: `${label}: ${item.title || label}`,
      webPreferences: {
        preload: path.join(__dirname, 'notif-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    openWindows.set(key, {
      win,
      resolved: false,
      itemType,
      id: item.id,
      details,
    });

    const query = {
      id: String(item.id),
      itemType,
      title: item.title || label,
      bgColor: stripHash(theme.bg),
      borderColor: stripHash(theme.border),
      textColor: stripHash(theme.text),
      snoozeMins: String(snoozeMins),
      label,
      tags: tags.join(','),
    };
    win.loadFile(path.join(__dirname, 'notification.html'), { query });

    const flash = () => {
      if (!win.isDestroyed()) win.flashFrame(true);
    };

    win.once('ready-to-show', () => {
      win.show();
      flash();
    });

    win.on('restore', flash);
    win.on('show', flash);

    // X / Alt+F4 / taskbar close without Done/Snooze → ignored
    win.on('close', () => {
      const entry = openWindows.get(key);
      if (!entry || entry.resolved) return;
      entry.resolved = true;
      try {
        if (itemType === 'countdown') {
          /* leave tracker in the list */
        } else if (itemType === 'task') ignoreTaskAlert(item.id);
        else if (itemType === 'bill') dismissBillAlert(item.id);
        else if (itemType === 'habit') dismissHabitNudge(item.id);
        else if (itemType === 'reminder_nudge') dismissReminderNudge(item.id);
        else ignoreReminder(item.id);
      } catch (err) {
        logError('notif close→ignore', err);
      }
    });

    win.on('closed', () => {
      openWindows.delete(key);
    });
  } catch (err) {
    logError('showItemNotification', err);
  }
}

/** @deprecated Prefer showItemNotification */
function showReminderNotification(reminder) {
  showItemNotification({ ...reminder, itemType: 'reminder' });
}

module.exports = {
  showItemNotification,
  showReminderNotification,
  registerNotificationIpc,
  setDashboardWindow,
  getDashboardWindow,
};
