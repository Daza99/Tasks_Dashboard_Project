/**
 * Custom due popup — BrowserWindow with taskbar presence (not OS toast).
 * itemType: reminder | reminder_nudge | task | bill | habit | countdown
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
  dismissBillNudge,
  snoozeBillNudge,
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
  'bill_nudge',
  'habit',
  'countdown',
]);

/** Unknown types / missing getter → no details block. */
const DETAILS_GETTERS = {
  reminder: getReminder,
  reminder_nudge: getReminder,
  task: getTask,
  bill: getBill,
  bill_nudge: getBill,
  habit: getHabit,
  countdown: getTracker,
};

/** Popup itemType → App.jsx requestEdit type. Nudge is the same reminder/bill row. */
const ITEM_TO_EDIT_TYPE = {
  reminder: 'reminder',
  reminder_nudge: 'reminder',
  task: 'task',
  bill: 'bill',
  bill_nudge: 'bill',
  habit: 'habit',
  countdown: 'tracker',
};

/** Map key → { win, resolved, itemType, id, details, createdAt } */
const openWindows = new Map();
let handlersRegistered = false;
let dashboardWindow = null;

const TYPE_LABELS = {
  reminder: 'Reminder',
  reminder_nudge: 'Nudge',
  task: 'Task',
  bill: 'Bill',
  bill_nudge: 'Nudge',
  habit: 'Habit',
  countdown: 'Countdown',
};

/** Called from index.js after createWindow (avoids circular require). */
function setDashboardWindow(win) {
  dashboardWindow = win;
}

function getDashboardWindow() {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) return dashboardWindow;
  return null;
}

/** Local yyyy-mm-dd from ISO / SQLite datetime. */
function toDateKey(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    const s = String(iso).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

/** created_at → yyyy-mm-dd for popup chrome. */
function resolveCreatedAt(itemType, id, fallback) {
  const fromItem = toDateKey(fallback);
  if (fromItem) return fromItem;
  const getter = DETAILS_GETTERS[itemType];
  if (!getter) return null;
  try {
    const row = getter(id);
    return toDateKey(row?.created_at) || null;
  } catch (err) {
    logError('resolveCreatedAt', err);
    return null;
  }
}

/** Display title from a DB row (tasks/reminders use title; others name). */
function titleFromRow(row) {
  if (!row) return null;
  return String(row.title || row.name || '').trim() || null;
}

function winKey(itemType, id) {
  return `${itemType}:${id}`;
}

/**
 * Which popup keys may mirror a dashboard entity edit.
 * @param {string} editType reminder|task|bill|habit|tracker
 * @param {number} id
 */
function popupKeysForEdit(editType, id) {
  if (editType === 'reminder') {
    return [winKey('reminder', id), winKey('reminder_nudge', id)];
  }
  if (editType === 'bill') {
    return [winKey('bill', id), winKey('bill_nudge', id)];
  }
  if (editType === 'tracker') return [winKey('countdown', id)];
  if (VALID_TYPES.has(editType)) return [winKey(editType, id)];
  return [];
}

/**
 * Push title / details / created into an open due popup after entity save.
 * @param {string} editType App edit type (reminder|task|bill|habit|tracker)
 * @param {number} id
 */
function refreshOpenNotifications(editType, id) {
  try {
    const keys = popupKeysForEdit(editType, id);
    for (const key of keys) {
      const entry = openWindows.get(key);
      if (!entry?.win || entry.win.isDestroyed()) continue;
      const itemType = entry.itemType;
      const getter = DETAILS_GETTERS[itemType];
      let row = null;
      try {
        row = getter ? getter(id) : null;
      } catch (err) {
        logError('refreshOpenNotifications get', err);
      }
      const title = titleFromRow(row);
      const details = resolveDetails(itemType, id, row?.description);
      const createdAt = resolveCreatedAt(itemType, id, row?.created_at);
      entry.details = details;
      entry.createdAt = createdAt;
      if (title) {
        try {
          entry.win.setTitle(`${TYPE_LABELS[itemType] || 'Alert'}: ${title}`);
        } catch {
          /* ignore */
        }
      }
      if (!entry.win.webContents.isDestroyed()) {
        entry.win.webContents.send('notif:refresh', {
          title: title || undefined,
          details,
          createdAt,
        });
      }
    }
  } catch (err) {
    logError('refreshOpenNotifications', err);
  }
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
      else if (itemType === 'bill_nudge') dismissBillNudge(id);
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
      else if (itemType === 'bill_nudge') snoozeBillNudge(id, minutes);
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
      else if (itemType === 'bill_nudge') dismissBillNudge(id);
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
        return {
          details: entry.details || null,
          createdAt: entry.createdAt || null,
        };
      }
    }
    return { details: null, createdAt: null };
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

/**
 * Show always-on-top popup with taskbar entry + flash until action.
 * @param {{ id: number, title: string, itemType?: string, tags?: string[], description?: string, created_at?: string }} item
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
    const createdAt = resolveCreatedAt(itemType, item.id, item.created_at);
    // Extra height for Created line (~18px) vs prior 180/200/260
    const height = details ? 278 : tags.length ? 218 : 198;
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
      createdAt,
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
        else if (itemType === 'bill_nudge') dismissBillNudge(item.id);
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
  refreshOpenNotifications,
  registerNotificationIpc,
  setDashboardWindow,
  getDashboardWindow,
};
