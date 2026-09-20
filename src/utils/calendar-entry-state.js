import { differenceInCalendarDays, format, isValid, parseISO } from 'date-fns';

/** Local yyyy-mm-dd for a Date. */
function todayKey(d = new Date()) {
  return format(d, 'yyyy-MM-dd');
}

/** Local date from yyyy-mm-dd (avoids UTC day-shift). */
function parseLocalDay(key) {
  const [y, m, day] = String(key || '')
    .slice(0, 10)
    .split('-')
    .map(Number);
  if (!y || !m || !day) return null;
  const d = new Date(y, m - 1, day);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Occurrence day for a reminder chip. */
function reminderDayKey(ev) {
  const occ = ev?.occurrence_date ? String(ev.occurrence_date).slice(0, 10) : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(occ)) return occ;
  if (!ev?.start_datetime) return null;
  try {
    const d = parseISO(ev.start_datetime);
    return isValid(d) ? format(d, 'yyyy-MM-dd') : null;
  } catch {
    return null;
  }
}

/** Paid / Unpaid / Late for a bill occurrence. */
function billState(ev, today) {
  const oncePaid = !ev.bill_recurrence && ev.bill_paid_status === 'paid';
  if (ev.bill_cycle_paid || oncePaid) return 'Paid';
  const occ = ev.occurrence_date ? String(ev.occurrence_date).slice(0, 10) : '';
  if (occ && occ < todayKey(today)) return 'Late';
  return 'Unpaid';
}

/** Local yyyy-mm-dd from reminder.datetime ISO. */
function reminderDueKey(ev) {
  if (!ev?.reminder_datetime) return null;
  try {
    const d = parseISO(ev.reminder_datetime);
    return isValid(d) ? format(d, 'yyyy-MM-dd') : null;
  } catch {
    return null;
  }
}

/**
 * One-shot completed_at, or repeating occurrence already advanced past.
 * @param {object} ev
 * @returns {boolean}
 */
export function isReminderDone(ev) {
  if (!ev || ev.source_type !== 'reminder') return false;
  if (ev.reminder_completed_at) return true;
  if (!ev.reminder_recurrence) return false;
  const occ = reminderDayKey(ev);
  const due = reminderDueKey(ev);
  return Boolean(occ && due && occ < due);
}

/** N days away / today / expired vs local today. */
function reminderState(ev, today) {
  const key = reminderDayKey(ev);
  const remDay = parseLocalDay(key);
  if (!remDay) return null;
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = differenceInCalendarDays(remDay, start);
  if (days < 0) return 'expired';
  if (days === 0) return 'today';
  if (days === 1) return '1 day away';
  return `${days} days away`;
}

/**
 * Day-list status suffix (no parens). Null for manual events.
 * @param {object} ev
 * @param {Date} [today]
 * @returns {string|null}
 */
export function calendarEntryState(ev, today = new Date()) {
  const type = ev?.source_type;
  if (type === 'bill') return billState(ev, today);
  if (type === 'reminder') return reminderState(ev, today);
  if (type === 'habit') return ev.habit_completed ? 'completed' : 'Not completed';
  if (type === 'task') {
    if (ev.task_completed_at) return 'Done';
    if (ev.task_half_done) return 'half done';
    if (ev.task_started) return 'Started';
    return 'Not started';
  }
  return null;
}
