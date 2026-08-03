/**

 * Tag auditor + due-reminder poller.

 */

const { expireStaleTodo24 } = require('../services/db/tasks');

const {

  listDuePending,

  listDueSnoozed,

  markFired,

  expireGraceReminders,

} = require('../services/db/reminders');

const { showReminderNotification } = require('./notification-window');

const { logError } = require('./logger');



let intervalId = null;

const firedThisSession = new Set();



/** Allow re-popup after snooze in the same app session. */

function clearFiredSession(id) {

  firedThisSession.delete(id);

}



/** Run lifecycle transitions once. */

function runTagAudit() {

  try {

    const expired = expireStaleTodo24();

    const ignored = expireGraceReminders();

    return { expired, ignored };

  } catch (err) {

    logError('runTagAudit', err);

    return { expired: 0, ignored: 0, error: String(err) };

  }

}



/** Fire popups for newly due rem_pending and elapsed rem_snoozed items. */

function pollDueReminders() {

  try {

    const due = [...listDuePending(), ...listDueSnoozed()];

    for (const rem of due) {

      if (firedThisSession.has(rem.id)) continue;

      markFired(rem.id);

      firedThisSession.add(rem.id);

      showReminderNotification(rem);

    }

  } catch (err) {

    logError('pollDueReminders', err);

  }

}



function tick() {

  runTagAudit();

  pollDueReminders();

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

}



module.exports = {

  startScheduler,

  stopScheduler,

  runTagAudit,

  pollDueReminders,

  clearFiredSession,

};


