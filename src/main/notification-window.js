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
} = require('../services/db/reminders');
const {
  completeTask,
  ignoreTaskAlert,
  snoozeTask,
} = require('../services/db/tasks');
const {
  markPaid,
  snoozeBill,
  dismissBillAlert,
} = require('../services/db/bills');
const {
  markCheckin,
  snoozeHabit,
  dismissHabitNudge,
} = require('../services/db/habits');
const { logError } = require('./logger');

const VALID_TYPES = new Set(['reminder', 'reminder_nudge', 'task', 'bill', 'habit']);

/** Map key → { win, resolved, itemType, id } */
const openWindows = new Map();
let handlersRegistered = false;

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
      if (itemType === 'task') completeTask(id);
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
      if (itemType === 'task') ignoreTaskAlert(id);
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

  ipcMain.handle('notif:minimize', (_e, payload) => {
    const { id, itemType } = parsePayload(payload);
    const entry = openWindows.get(winKey(itemType, id));
    if (entry?.win && !entry.win.isDestroyed()) {
      entry.win.minimize();
    }
    return true;
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
    const textColor = settings.notif_text_color || '#ffffff';
    const snoozeMins = settings.notif_default_snooze_minutes || '10';
    const tags = Array.isArray(item.tags) ? item.tags.filter(Boolean) : [];
    // Extra height when tags render under the title
    const height = tags.length ? 200 : 180;
    const bounds = cornerBounds(settings.notif_position, 340, height);

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

    openWindows.set(key, { win, resolved: false, itemType, id: item.id });

    win.loadFile(path.join(__dirname, 'notification.html'), {
      query: {
        id: String(item.id),
        itemType,
        title: item.title || label,
        textColor,
        snoozeMins: String(snoozeMins),
        label,
        tags: tags.join(','),
      },
    });

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
        if (itemType === 'task') ignoreTaskAlert(item.id);
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
};
