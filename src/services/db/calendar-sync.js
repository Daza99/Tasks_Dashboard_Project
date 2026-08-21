/**
 * Upsert / hide / cascade linked calendar events for bills, monthly habits,
 * and appointment reminders. Dedupes on (source_type, source_id, occurrence_date).
 *
 * Future sources (e.g. tasks): pass description into upsertLinkedEvent so
 * calendar hover notes work automatically. Date-only sources (bill, habit)
 * use dateAtNine — do not add task/reminder/event to that date-only set.
 */
const { getDb } = require('../../main/database');
const { logError } = require('../../main/logger');
const { dateKey } = require('./habits');
const { createEvent, getEvent, deleteEvent } = require('./events');
const { uniqueTitleFor } = require('../../utils/unique-title.cjs');

const OPEN_SENTINEL = '9999';

/** Local YYYY-MM-DD at 09:00 → ISO (avoids UTC day-shift). */
function dateAtNine(dayKey) {
  const [y, m, d] = String(dayKey).split('-').map(Number);
  return new Date(y, m - 1, d, 9, 0, 0).toISOString();
}

/** Local date key from an ISO datetime. */
function localDateKey(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return dateKey(d);
}

function isOpenDatetime(iso) {
  return !iso || String(iso).startsWith(OPEN_SENTINEL);
}

/** Due day in year/month (0-indexed month) from habit created_at DOM. */
function monthlyHabitDate(habit, year, monthIndex) {
  const created = habit.created_at ? new Date(habit.created_at) : new Date();
  const dom = Number.isNaN(created.getTime()) ? 1 : created.getDate();
  const last = new Date(year, monthIndex + 1, 0).getDate();
  return dateKey(new Date(year, monthIndex, Math.min(dom, last)));
}

function findLinked(sourceType, sourceId, occurrenceDate) {
  return getDb()
    .prepare(
      `SELECT * FROM events
       WHERE source_type = ? AND source_id = ? AND occurrence_date = ?`
    )
    .get(sourceType, sourceId, occurrenceDate);
}

function isArchivedHabit(id) {
  return Boolean(
    getDb()
      .prepare(
        `SELECT 1 FROM item_tags it
         JOIN tags t ON t.id = it.tag_id
         WHERE it.item_type = 'habit' AND it.item_id = ? AND t.name = 'archived'`
      )
      .get(id)
  );
}

function normDesc(text) {
  const t = text != null ? String(text).trim() : '';
  return t || null;
}

/**
 * Insert or update a linked event. Hidden rows are left alone (calendar-only delete).
 * @param {{ source_type: string, source_id: number, occurrence_date: string, title: string, start_datetime: string, description?: string|null }} data
 */
function upsertLinkedEvent({
  source_type,
  source_id,
  occurrence_date,
  title,
  start_datetime,
  description = null,
}) {
  try {
    if (!source_type || source_id == null || !occurrence_date) return null;
    const details = normDesc(description);
    const existing = findLinked(source_type, source_id, occurrence_date);
    if (existing) {
      if (Number(existing.hidden) === 1) return getEvent(existing.id);
      const eventTitle = uniqueTitleFor('event', title, existing.id);
      getDb()
        .prepare(
          `UPDATE events SET title = ?, start_datetime = ?, description = ? WHERE id = ?`
        )
        .run(eventTitle, start_datetime, details, existing.id);
      return getEvent(existing.id);
    }
    return createEvent({
      title,
      start_datetime,
      description: details,
      source_type,
      source_id,
      occurrence_date,
    });
  } catch (err) {
    logError('upsertLinkedEvent', err);
    throw err;
  }
}

/**
 * Move a linked occurrence to a new date (edit due/datetime). Skips if hidden.
 * @param {string} sourceType
 * @param {number} sourceId
 * @param {string} fromDate
 * @param {string} toDate
 * @param {string} title
 * @param {string} startIso
 * @param {string|null} [description]
 */
function moveLinkedEvent(sourceType, sourceId, fromDate, toDate, title, startIso, description) {
  try {
    if (!fromDate || fromDate === toDate) {
      return upsertLinkedEvent({
        source_type: sourceType,
        source_id: sourceId,
        occurrence_date: toDate,
        title,
        start_datetime: startIso,
        description,
      });
    }
    const src = findLinked(sourceType, sourceId, fromDate);
    if (!src) {
      return upsertLinkedEvent({
        source_type: sourceType,
        source_id: sourceId,
        occurrence_date: toDate,
        title,
        start_datetime: startIso,
        description,
      });
    }
    if (Number(src.hidden) === 1) return getEvent(src.id);
    const details = description !== undefined ? normDesc(description) : src.description;
    const dest = findLinked(sourceType, sourceId, toDate);
    if (dest) {
      if (Number(dest.hidden) !== 1) {
        const destTitle = uniqueTitleFor('event', title, dest.id);
        getDb()
          .prepare(
            `UPDATE events SET title = ?, start_datetime = ?, description = ? WHERE id = ?`
          )
          .run(destTitle, startIso, details, dest.id);
      }
      getDb().prepare('DELETE FROM events WHERE id = ?').run(src.id);
      return getEvent(dest.id);
    }
    const srcTitle = uniqueTitleFor('event', title, src.id);
    getDb()
      .prepare(
        `UPDATE events SET title = ?, start_datetime = ?, occurrence_date = ?, description = ? WHERE id = ?`
      )
      .run(srcTitle, startIso, toDate, details, src.id);
    return getEvent(src.id);
  } catch (err) {
    logError('moveLinkedEvent', err);
    throw err;
  }
}

/** Soft-hide so sync will not recreate this occurrence. */
function hideEvent(id) {
  getDb().prepare('UPDATE events SET hidden = 1 WHERE id = ?').run(id);
}

/** Hard-delete every event for a source (opt-out / source deleted). */
function deleteEventsForSource(sourceType, sourceId) {
  getDb()
    .prepare('DELETE FROM events WHERE source_type = ? AND source_id = ?')
    .run(sourceType, sourceId);
}

/** Update titles on all visible events for a source. */
function retitleSourceEvents(sourceType, sourceId, title) {
  getDb()
    .prepare(
      `UPDATE events SET title = ? WHERE source_type = ? AND source_id = ? AND COALESCE(hidden, 0) = 0`
    )
    .run(title, sourceType, sourceId);
}

/**
 * Sync a bill's current due_date. Pass prevDueDate to move on edit (not pay).
 * @param {object} bill
 * @param {{ prevDueDate?: string }} [opts]
 */
function syncBill(bill, { prevDueDate } = {}) {
  if (!bill?.id || !bill.due_date) return;
  const title = `${bill.name} Due`;
  const start = dateAtNine(bill.due_date);
  if (prevDueDate && prevDueDate !== bill.due_date) {
    moveLinkedEvent('bill', bill.id, prevDueDate, bill.due_date, title, start, bill.description);
    return;
  }
  upsertLinkedEvent({
    source_type: 'bill',
    source_id: bill.id,
    occurrence_date: bill.due_date,
    title,
    start_datetime: start,
    description: bill.description,
  });
}

/**
 * Sync a monthly habit for a given month (defaults to now).
 * Non-monthly → drop all linked events.
 * @param {object} habit
 * @param {{ year?: number, monthIndex?: number }} [opts]
 */
function syncHabit(habit, { year, monthIndex } = {}) {
  if (!habit?.id) return;
  if (habit.frequency !== 'monthly' || isArchivedHabit(habit.id)) {
    deleteEventsForSource('habit', habit.id);
    return;
  }
  const now = new Date();
  const y = year ?? now.getFullYear();
  const m = monthIndex ?? now.getMonth();
  const occ = monthlyHabitDate(habit, y, m);
  upsertLinkedEvent({
    source_type: 'habit',
    source_id: habit.id,
    occurrence_date: occ,
    title: habit.name,
    start_datetime: dateAtNine(occ),
    description: habit.description,
  });
  if (habit.name) retitleSourceEvents('habit', habit.id, habit.name);
}

/**
 * Sync an appointment reminder. Open / unticked → drop events.
 * @param {object} rem
 * @param {{ prevDate?: string }} [opts]
 */
function syncReminder(rem, { prevDate } = {}) {
  if (!rem?.id) return;
  const flagged = Number(rem.is_appointment) === 1;
  if (!flagged || isOpenDatetime(rem.datetime)) {
    deleteEventsForSource('reminder', rem.id);
    return;
  }
  const occ = localDateKey(rem.datetime);
  if (!occ) return;
  if (prevDate && prevDate !== occ) {
    moveLinkedEvent('reminder', rem.id, prevDate, occ, rem.title, rem.datetime, rem.description);
    return;
  }
  upsertLinkedEvent({
    source_type: 'reminder',
    source_id: rem.id,
    occurrence_date: occ,
    title: rem.title,
    start_datetime: rem.datetime,
    description: rem.description,
  });
}

/**
 * Upsert current-occurrence events for the given month (habits) + all bills/appointments.
 * @param {number} year
 * @param {number} monthIndex — 0–11
 */
function syncMonth(year, monthIndex) {
  try {
    const db = getDb();
    for (const bill of db.prepare('SELECT * FROM bills').all()) {
      syncBill(bill);
    }
    const habits = db.prepare(`SELECT * FROM habits WHERE frequency = 'monthly'`).all();
    for (const h of habits) {
      syncHabit(h, { year, monthIndex });
    }
    const rems = db.prepare(`SELECT * FROM reminders WHERE COALESCE(is_appointment, 0) = 1`).all();
    for (const r of rems) {
      syncReminder(r);
    }
    return true;
  } catch (err) {
    logError('syncMonth', err);
    throw err;
  }
}

/** App-start: current month + leftover dupe collapse. */
function syncOnAppStart() {
  const now = new Date();
  collapseSourceDupes();
  syncMonth(now.getFullYear(), now.getMonth());
}

function collapseSourceDupes() {
  getDb()
    .prepare(
      `DELETE FROM events
       WHERE source_type IS NOT NULL
         AND occurrence_date IS NOT NULL
         AND id NOT IN (
           SELECT MIN(id) FROM events
           WHERE source_type IS NOT NULL AND occurrence_date IS NOT NULL
           GROUP BY source_type, source_id, occurrence_date
         )`
    )
    .run();
}

/**
 * Delete/hide a calendar selection.
 * @param {number[]} ids
 * @param {{ deleteSources?: boolean }} opts — true = also delete linked bills/habits/reminders
 */
function removeSelection(ids, { deleteSources = false } = {}) {
  try {
    const skippedLocked = [];
    const events = (ids || []).map((id) => getEvent(id)).filter(Boolean);
    const manuals = events.filter((e) => !e.source_type);
    const linked = events.filter((e) => e.source_type);

    for (const e of manuals) deleteEvent(e.id);

    if (deleteSources) {
      const seen = new Set();
      for (const e of linked) {
        const key = `${e.source_type}:${e.source_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        try {
          if (e.source_type === 'bill') {
            require('./bills').deleteBill(e.source_id);
          } else if (e.source_type === 'habit') {
            require('./habits').deleteHabit(e.source_id);
          } else if (e.source_type === 'reminder') {
            require('./reminders').deleteReminder(e.source_id);
          } else {
            deleteEvent(e.id);
          }
        } catch (err) {
          if (String(err.message || err).includes('locked')) {
            skippedLocked.push(e.title);
            continue;
          }
          throw err;
        }
      }
    } else {
      for (const e of linked) hideEvent(e.id);
    }
    return { ok: true, skippedLocked };
  } catch (err) {
    logError('removeSelection', err);
    throw err;
  }
}

module.exports = {
  upsertLinkedEvent,
  moveLinkedEvent,
  hideEvent,
  deleteEventsForSource,
  syncBill,
  syncHabit,
  syncReminder,
  syncMonth,
  syncOnAppStart,
  removeSelection,
  monthlyHabitDate,
};
