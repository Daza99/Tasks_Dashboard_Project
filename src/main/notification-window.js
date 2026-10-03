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
  advanceDue,
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

/** Map key → { win, resolved, itemType, id, details, createdAt, z, pausedForHold } */
const openWindows = new Map();
/** Snooze+ / Paid+date owner. Other popups stay hidden until this clears. */
let priorityHoldKey = null;
/** Due alerts that arrived during a hold. Scheduler already marked them alerted. */
const deferredShows = [];
/** After a hold, keep this key above popups that were waiting. */
let stackAnchorKey = null;
let anchoredPending = 0;
/** Bumped when a hold starts so a late ready-to-show cannot retop a new dialog. */
let anchorGen = 0;
let zSeq = 0;
let handlersRegistered = false;
let dashboardWindow = null;

const TYPE_LABELS = {
  reminder: 'Reminder',
  reminder_nudge: 'Reminder',
  task: 'Task',
  bill: 'Bill',
  bill_nudge: 'Bill',
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

  ipcMain.handle('notif:complete', (_e, payload, opts) => {
    try {
      const { id, itemType } = parsePayload(payload);
      markResolved(itemType, id);
      if (itemType === 'countdown') {
        /* already done — Done just dismisses */
      } else if (itemType === 'task') completeTask(id);
      else if (itemType === 'bill') markPaid(id, opts || {});
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
      // Cap custom hours at 72h; do not raise a floor (default snooze is 10m)
      const mins = Number(minutes);
      const useMins = Number.isFinite(mins) ? Math.min(mins, 72 * 60) : minutes;
      markResolved(itemType, id);
      if (itemType === 'task') snoozeTask(id, useMins);
      else if (itemType === 'bill') snoozeBill(id, useMins);
      else if (itemType === 'bill_nudge') snoozeBillNudge(id, useMins);
      else if (itemType === 'habit') snoozeHabit(id, useMins);
      else if (itemType === 'reminder_nudge') snoozeReminderNudge(id, useMins);
      else snoozeReminder(id, useMins);
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
          nextDueDate: entry.nextDueDate || null,
          recurring: Boolean(entry.recurring),
        };
      }
    }
    return { details: null, createdAt: null };
  });

  ipcMain.handle('notif:priorityHold', (_e, payload, active) => {
    try {
      const { id, itemType } = parsePayload(payload);
      if (active) return beginPriorityHold(itemType, id);
      // Cancel / Escape — window stays open and remains the top card
      endPriorityHold(winKey(itemType, id), true);
      return true;
    } catch (err) {
      logError('notif:priorityHold', err);
      throw err;
    }
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
  // Submit / X / taskbar close. closed may have released already.
  endPriorityHold(key, false);
}

/** Normalized popup key for a showItemNotification argument. */
function itemKey(item) {
  const itemType = VALID_TYPES.has(item?.itemType) ? item.itemType : 'reminder';
  return winKey(itemType, item?.id);
}

/** Queue a popup instead of opening it. Caller already alerted the row. */
function deferNotification(item) {
  const key = itemKey(item);
  if (openWindows.has(key)) return;
  if (deferredShows.some((queued) => itemKey(queued) === key)) return;
  deferredShows.push(item);
}

/** Put the resumed card back above any popup that showed late. */
function raiseStackAnchor() {
  if (!stackAnchorKey) return;
  const anchor = openWindows.get(stackAnchorKey);
  if (!anchor?.win || anchor.win.isDestroyed()) {
    stackAnchorKey = null;
    anchoredPending = 0;
    return;
  }
  try {
    anchor.win.setAlwaysOnTop(true);
    anchor.win.moveTop();
  } catch (err) {
    logError('raiseStackAnchor', err);
  }
}

/**
 * One deferred popup has shown. Drop the anchor once the batch is up.
 * @param {number} gen anchor generation captured when the window was created
 */
function noteAnchoredShow(gen) {
  if (gen !== anchorGen) return;
  if (anchoredPending > 0) anchoredPending -= 1;
  raiseStackAnchor();
  if (anchoredPending <= 0) stackAnchorKey = null;
}

/**
 * Pause every other visible popup and pin this one above the stack.
 * @param {string} itemType
 * @param {number} id
 * @returns {boolean}
 */
function beginPriorityHold(itemType, id) {
  const key = winKey(itemType, id);
  const entry = openWindows.get(key);
  if (!entry?.win || entry.win.isDestroyed()) return false;
  if (priorityHoldKey && priorityHoldKey !== key) return false;
  anchorGen += 1;
  stackAnchorKey = null;
  anchoredPending = 0;
  priorityHoldKey = key;
  for (const [otherKey, other] of openWindows) {
    if (otherKey === key || other.pausedForHold) continue;
    if (!other.win || other.win.isDestroyed()) continue;
    if (other.win.isMinimized() || !other.win.isVisible()) continue;
    other.pausedForHold = true;
    try {
      other.win.hide();
    } catch (err) {
      logError('beginPriorityHold hide', err);
    }
  }
  try {
    entry.z = ++zSeq;
    // Above sibling always-on-top popups (those use the default floating level)
    entry.win.setAlwaysOnTop(true, 'pop-up-menu');
    entry.win.moveTop();
    entry.win.focus();
  } catch (err) {
    logError('beginPriorityHold', err);
  }
  return true;
}

/**
 * Resume the stack. Cancel keeps this card on top; close raises the previous next.
 * Alerts queued during the hold show behind that card.
 * @param {string} key
 * @param {boolean} heldStillOpen
 */
function endPriorityHold(key, heldStillOpen) {
  if (priorityHoldKey !== key) return;
  priorityHoldKey = null;

  const paused = [];
  for (const other of openWindows.values()) {
    if (!other.pausedForHold) continue;
    other.pausedForHold = false;
    if (!other.win || other.win.isDestroyed()) continue;
    paused.push(other);
  }
  paused.sort((a, b) => (a.z || 0) - (b.z || 0));

  const pending = deferredShows.splice(0);
  const topPaused = paused.length ? paused[paused.length - 1] : null;
  const anchorKey =
    heldStillOpen && openWindows.has(key)
      ? key
      : topPaused
        ? winKey(topPaused.itemType, topPaused.id)
        : null;
  anchorGen += 1;
  const gen = anchorGen;
  stackAnchorKey = anchorKey;
  anchoredPending = 0;

  for (const item of pending) showItemNotification(item);

  const held = heldStillOpen ? openWindows.get(key) : null;
  const heldWin = held?.win && !held.win.isDestroyed() ? held.win : null;
  // Stay above the pile while hidden cards are shown, or they paint over the dialog
  if (heldWin) {
    try {
      heldWin.setAlwaysOnTop(true, 'pop-up-menu');
      heldWin.moveTop();
    } catch (err) {
      logError('endPriorityHold keep', err);
    }
  }

  for (const other of paused) {
    try {
      other.win.setAlwaysOnTop(true);
      other.win.showInactive();
    } catch (err) {
      logError('endPriorityHold restore', err);
    }
  }

  if (heldWin) {
    try {
      // Back to the normal always-on-top level, still above the restored pile
      heldWin.setAlwaysOnTop(true);
      heldWin.moveTop();
      heldWin.focus();
    } catch (err) {
      logError('endPriorityHold retop', err);
    }
  } else if (topPaused?.win && !topPaused.win.isDestroyed()) {
    try {
      topPaused.win.show();
      topPaused.win.moveTop();
    } catch (err) {
      logError('endPriorityHold next', err);
    }
  }

  if (gen !== anchorGen) return;
  if (anchoredPending <= 0) stackAnchorKey = null;
  else raiseStackAnchor();
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
    // Hold owns the screen until Snooze+ / Paid+date is resolved
    if (priorityHoldKey) {
      if (!openWindows.has(key)) deferNotification(item);
      return;
    }
    if (openWindows.has(key)) return;

    const underAnchor = Boolean(stackAnchorKey && stackAnchorKey !== key);
    const gen = anchorGen;
    const settings = getAllSettings();
    const randomize = settings.notif_random_bg === 'true';
    const theme = pickNotifTheme(randomize);
    const snoozeMins = settings.notif_default_snooze_minutes || '10';
    const tags = Array.isArray(item.tags) ? item.tags.filter(Boolean) : [];
    const details = resolveDetails(itemType, item.id, item.description);
    const createdAt = resolveCreatedAt(itemType, item.id, item.created_at);
    let nextDueDate = null;
    let recurring = false;
    if (itemType === 'bill') {
      try {
        const bill = getBill(item.id);
        if (bill?.recurrence) {
          recurring = true;
          nextDueDate = advanceDue(bill.due_date, bill.recurrence, bill.billing_day);
        }
      } catch (err) {
        logError('showItemNotification bill next due', err);
      }
    }
    // Extra height for Created line (~18px) vs prior 180/200/260; bills get pay-row wrap
    let height = details ? 278 : tags.length ? 218 : 198;
    let width = 340;
    if (itemType === 'bill') {
      height += 48;
      width = 400;
    }
    const bounds = cornerBounds(settings.notif_position, width, height);
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
      nextDueDate,
      recurring,
      z: ++zSeq,
      pausedForHold: false,
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
    // underAnchor windows must release the anchor even if they never show
    let anchorSettled = !underAnchor;
    if (underAnchor) anchoredPending += 1;

    win.once('ready-to-show', () => {
      const entry = openWindows.get(key);
      if (entry) entry.z = ++zSeq;
      // A new hold started while this window was still loading — stay in the pile
      if (priorityHoldKey && priorityHoldKey !== key) {
        if (entry) entry.pausedForHold = true;
        anchorSettled = true;
        try {
          win.hide();
        } catch (err) {
          logError('ready-to-show hold hide', err);
        }
        return;
      }
      if (underAnchor && gen === anchorGen) {
        try {
          win.showInactive();
        } catch (err) {
          logError('ready-to-show inactive', err);
        }
        anchorSettled = true;
        noteAnchoredShow(gen);
      } else {
        win.show();
        if (stackAnchorKey && stackAnchorKey !== key) raiseStackAnchor();
      }
      flash();
    });

    win.on('focus', () => {
      const entry = openWindows.get(key);
      if (entry) entry.z = ++zSeq;
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
      if (!anchorSettled && underAnchor) {
        anchorSettled = true;
        noteAnchoredShow(gen);
      }
      openWindows.delete(key);
      endPriorityHold(key, false);
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
