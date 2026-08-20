/**
 * Tag auditor + due-item poller (tasks, reminders, bills, habits).
 */
const {
  listDueTasksForAlert,
  markTaskAlerted,
} = require('../services/db/tasks');
const {
  listDuePending,
  listDueSnoozed,
  markFired,
  listDueReminderNudges,
  markNudgeAlerted,
} = require('../services/db/reminders');
const {
  listDueNudges,
  markHabitNudged,
} = require('../services/db/habits');
const {
  listDueBillAlerts,
  markBillAlerted,
} = require('../services/db/bills');
const { showItemNotification } = require('./notification-window');
const { logError } = require('./logger');
const { inspectTags } = require('../services/db/tag-inspector');

let intervalId = null;
let didLaunchAudit = false;
/** Session keys: `reminder:12` | `reminder_nudge:12` | `task:4` | `bill:3` | `habit:1` */
const firedThisSession = new Set();

function sessionKey(itemType, id) {
  return `${itemType}:${id}`;
}

/** Allow re-popup after snooze / due reschedule in the same app session. */
function clearFiredSession(itemType, id) {
  if (id === undefined) {
    // Back-compat: clearFiredSession(reminderId)
    firedThisSession.delete(sessionKey('reminder', itemType));
    firedThisSession.delete(itemType);
    return;
  }
  firedThisSession.delete(sessionKey(itemType, id));
}

/** Manual inspector (IPC alias). Launch/scheduler ticks call inspectTags directly. */
function runTagAudit() {
  try {
    return inspectTags('manual');
  } catch (err) {
    logError('runTagAudit', err);
    return { expired: 0, ignored: 0, overdue: 0, error: String(err) };
  }
}

/** Pre-reminder nudge popup — does not complete or fire the reminder itself. */
function pollReminderNudges() {
  try {
    const due = listDueReminderNudges();
    for (const rem of due) {
      const key = sessionKey('reminder_nudge', rem.id);
      if (firedThisSession.has(key)) continue;
      markNudgeAlerted(rem.id);
      firedThisSession.add(key);
      showItemNotification({
        id: rem.id,
        title: rem.title,
        itemType: 'reminder_nudge',
      });
    }
  } catch (err) {
    logError('pollReminderNudges', err);
  }
}

/** Fire popups for due reminders (pending/snoozed). */
function pollDueReminders() {
  try {
    const due = [...listDuePending(), ...listDueSnoozed()];
    for (const rem of due) {
      const key = sessionKey('reminder', rem.id);
      if (firedThisSession.has(key)) continue;
      markFired(rem.id);
      firedThisSession.add(key);
      showItemNotification({ ...rem, itemType: 'reminder' });
    }
  } catch (err) {
    logError('pollDueReminders', err);
  }
}

/**
 * Fire popups for due todo_24 tasks before inspectTags expires them.
 */
function pollDueTasks() {
  try {
    const due = listDueTasksForAlert();
    for (const task of due) {
      const key = sessionKey('task', task.id);
      if (firedThisSession.has(key)) continue;
      markTaskAlerted(task.id);
      firedThisSession.add(key);
      showItemNotification({ ...task, itemType: 'task' });
    }
  } catch (err) {
    logError('pollDueTasks', err);
  }
}

/** Day-before / day-of bill alerts. */
function pollDueBills() {
  try {
    const due = listDueBillAlerts();
    for (const bill of due) {
      const key = sessionKey('bill', `${bill.id}:${bill.alertKind}`);
      if (firedThisSession.has(key)) continue;
      markBillAlerted(bill.id, bill.alertKind);
      firedThisSession.add(key);
      const prefix = bill.alertKind === 'before' ? 'Tomorrow: ' : 'Due: ';
      showItemNotification({
        id: bill.id,
        title: `${prefix}${bill.name} ($${Number(bill.amount).toFixed(2)})`,
        itemType: 'bill',
      });
    }
  } catch (err) {
    logError('pollDueBills', err);
  }
}

/** Habit nudge_time check-ins. */
function pollHabitNudges() {
  try {
    const due = listDueNudges();
    for (const habit of due) {
      const key = sessionKey('habit', habit.id);
      if (firedThisSession.has(key)) continue;
      markHabitNudged(habit.id);
      firedThisSession.add(key);
      showItemNotification({
        id: habit.id,
        title: habit.name,
        itemType: 'habit',
        tags: habit.tags || ['nudge'],
      });
    }
  } catch (err) {
    logError('pollHabitNudges', err);
  }
}

function tick() {
  // Alerts first (while items still match due queries), then audit/expire
  pollDueTasks();
  pollReminderNudges();
  pollDueReminders();
  pollDueBills();
  pollHabitNudges();
  const trigger = didLaunchAudit ? 'scheduler' : 'launch';
  didLaunchAudit = true;
  try {
    inspectTags(trigger);
  } catch (err) {
    logError('tick inspectTags', err);
  }
}

/** Start ~30s scheduler; runs immediately once. */
function startScheduler() {
  if (intervalId) return;
  tick();
  intervalId = setInterval(tick, 30_000);
}

function stopScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  firedThisSession.clear();
  didLaunchAudit = false;
}

module.exports = {
  startScheduler,
  stopScheduler,
  runTagAudit,
  pollDueReminders,
  pollReminderNudges,
  pollDueTasks,
  pollDueBills,
  pollHabitNudges,
  clearFiredSession,
  sessionKey,
};
