/**
 * Upsert / hide / cascade linked calendar events for bills, habits,
 * appointment reminders, and tasks. Dedupes on (source_type, source_id, occurrence_date).
 *
 * Future sources (e.g. tasks): pass description into upsertLinkedEvent so
 * calendar hover notes work automatically. Date-only sources (bill, habit)
 * use dateAtNine — do not add task/reminder/event to that date-only set.
 */
const { getDb } = require('../../main/database');
const { logError } = require('../../main/logger');
const { dateKey, isDueOn } = require('./habits');
const { createEvent, getEvent, deleteEvent } = require('./events');
const { advanceDue, addMonthsIso, addDaysIso, watchDateFrom } = require('./bills');

/** How far to persist recurring bill chips from local today. */
const BILL_HORIZON_MONTHS = 12;
/** Fortnight over 12 months is ~26; cap runaway loops. */
const BILL_OCCURRENCE_CAP = 40;

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

/** yyyy-mm-dd keys in a calendar month. */
function daysInMonth(year, monthIndex) {
  const last = new Date(year, monthIndex + 1, 0).getDate();
  const out = [];
  for (let d = 1; d <= last; d += 1) {
    out.push(dateKey(new Date(year, monthIndex, d)));
  }
  return out;
}

/** Occurrence dates for a habit in the viewed month. */
function habitOccurrenceDates(habit, year, monthIndex) {
  const freq = habit.frequency || 'daily';
  if (freq === 'monthly' || freq === 'custom') {
    return [monthlyHabitDate(habit, year, monthIndex)];
  }
  const days = daysInMonth(year, monthIndex);
  if (freq === 'weekly' || freq === 'weekdays') {
    return days.filter((k) => {
      const [y, m, d] = k.split('-').map(Number);
      const dow = new Date(y, m - 1, d).getDay();
      return dow >= 1 && dow <= 5;
    });
  }
  if (freq === 'daily') return days;
  // 3day, fortnightly, and any other interval → isDueOn
  return days.filter((k) => {
    const [y, m, d] = k.split('-').map(Number);
    return isDueOn(habit, new Date(y, m - 1, d));
  });
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
      getDb()
        .prepare(
          `UPDATE events SET title = ?, start_datetime = ?, description = ? WHERE id = ?`
        )
        .run(title, start_datetime, details, existing.id);
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
        getDb()
          .prepare(
            `UPDATE events SET title = ?, start_datetime = ?, description = ? WHERE id = ?`
          )
          .run(title, startIso, details, dest.id);
      }
      getDb().prepare('DELETE FROM events WHERE id = ?').run(src.id);
      return getEvent(dest.id);
    }
    getDb()
      .prepare(
        `UPDATE events SET title = ?, start_datetime = ?, occurrence_date = ?, description = ? WHERE id = ?`
      )
      .run(title, startIso, toDate, details, src.id);
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

/** Local today + 12 months (yyyy-mm-dd). */
function billHorizonDate() {
  return addMonthsIso(dateKey(), BILL_HORIZON_MONTHS);
}

/**
 * Recurrence watch dates from current due through horizon.
 * @param {object} bill
 * @param {string} horizon
 * @returns {string[]}
 */
function billOccurrenceDates(bill, horizon) {
  const dueDate = bill?.due_date;
  if (!dueDate) return [];
  const offset = Number(bill.date_offset_days) || 0;
  const billingDay = bill.billing_day || Number(String(dueDate).slice(8, 10));
  const watched = (base) => addDaysIso(base, offset);
  if (!bill.recurrence) return [watched(dueDate)];
  const out = [];
  let d = dueDate;
  for (let i = 0; i < BILL_OCCURRENCE_CAP; i += 1) {
    const w = watched(d);
    if (w > horizon) break;
    out.push(w);
    const next = advanceDue(d, bill.recurrence, billingDay);
    if (!next || next <= d) break;
    d = next;
  }
  const first = watched(dueDate);
  if (!out.includes(first)) out.unshift(first);
  return out;
}

/** Stored recurrence → calendar hover label. Once/null is omitted. */
const BILL_RECUR_LABEL = {
  monthly: 'Monthly',
  fortnight: 'Fortnight',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};

/** Hover text: amount (+ mode + frequency), category, notes. */
function billEventDescription(bill) {
  const lines = [];
  const amt = Number(bill.amount);
  if (Number.isFinite(amt)) {
    const mode = bill.amount_mode;
    let line = `$${amt.toFixed(2)}`;
    if (mode === 'estimate') line += ' Estimate';
    else if (mode === 'average') line += ' Avg';
    const freq = BILL_RECUR_LABEL[bill.recurrence];
    if (freq) line += ` (${freq})`;
    lines.push(line);
  }
  const cat = bill.category != null ? String(bill.category).trim() : '';
  if (cat) lines.push(cat);
  const notes = bill.description != null ? String(bill.description).trim() : '';
  if (notes) lines.push(notes);
  return lines.length ? lines.join('\n') : null;
}

/**
 * Persist bill chips from current due through today+12 months.
 * Past chips stay only when a bill_payments row exists for that cycle.
 * @param {object} bill
 */
function syncBill(bill) {
  if (!bill?.id) return;
  if (Number(bill.show_on_calendar) === 0) {
    deleteEventsForSource('bill', bill.id);
    return;
  }
  if (!bill.due_date) return;

  const title = `${bill.name} Due`;
  const details = billEventDescription(bill);
  const series = billOccurrenceDates(bill, billHorizonDate());
  const seriesSet = new Set(series);
  const offset = Number(bill.date_offset_days) || 0;
  const paidWatchDates = new Set(
    getDb()
      .prepare('SELECT due_date FROM bill_payments WHERE bill_id = ?')
      .all(bill.id)
      .map((p) => watchDateFrom(p.due_date, offset))
      .filter(Boolean)
  );

  for (const occ of series) {
    upsertLinkedEvent({
      source_type: 'bill',
      source_id: bill.id,
      occurrence_date: occ,
      title,
      start_datetime: dateAtNine(occ),
      description: details,
    });
  }
  // Paid leftovers share current title + hover details
  getDb()
    .prepare(
      `UPDATE events SET title = ?, description = ?
       WHERE source_type = 'bill' AND source_id = ? AND COALESCE(hidden, 0) = 0`
    )
    .run(title, details, bill.id);

  const rows = getDb()
    .prepare(`SELECT id, occurrence_date, hidden FROM events WHERE source_type = 'bill' AND source_id = ?`)
    .all(bill.id);
  for (const row of rows) {
    if (Number(row.hidden) === 1) continue;
    const occ = row.occurrence_date;
    if (seriesSet.has(occ) || paidWatchDates.has(occ)) continue;
    getDb().prepare('DELETE FROM events WHERE id = ?').run(row.id);
  }
}

/**
 * Sync a habit for a given month (defaults to now). Flag off / archived → drop all.
 * @param {object} habit
 * @param {{ year?: number, monthIndex?: number }} [opts]
 */
function syncHabit(habit, { year, monthIndex } = {}) {
  if (!habit?.id) return;
  if (Number(habit.show_on_calendar) === 0 || isArchivedHabit(habit.id)) {
    deleteEventsForSource('habit', habit.id);
    return;
  }
  const now = new Date();
  const y = year ?? now.getFullYear();
  const m = monthIndex ?? now.getMonth();
  const series = habitOccurrenceDates(habit, y, m);
  const seriesSet = new Set(series);
  const monthPrefix = `${y}-${String(m + 1).padStart(2, '0')}`;
  for (const occ of series) {
    upsertLinkedEvent({
      source_type: 'habit',
      source_id: habit.id,
      occurrence_date: occ,
      title: habit.name,
      start_datetime: dateAtNine(occ),
      description: habit.description,
    });
  }
  if (habit.name) retitleSourceEvents('habit', habit.id, habit.name);
  const rows = getDb()
    .prepare(
      `SELECT id, occurrence_date, hidden FROM events WHERE source_type = 'habit' AND source_id = ?`
    )
    .all(habit.id);
  for (const row of rows) {
    if (Number(row.hidden) === 1) continue;
    const occ = row.occurrence_date;
    if (!occ || !String(occ).startsWith(monthPrefix)) continue;
    if (seriesSet.has(occ)) continue;
    getDb().prepare('DELETE FROM events WHERE id = ?').run(row.id);
  }
}

/**
 * Sync a flagged task. No due / flag off → drop events.
 * Completed tasks stay visible so the day list can show (Done).
 * @param {object} task
 * @param {{ prevDate?: string }} [opts]
 */
function syncTask(task, { prevDate } = {}) {
  if (!task?.id) return;
  const flagged = Number(task.show_on_calendar) === 1;
  if (!flagged || isOpenDatetime(task.due_datetime)) {
    deleteEventsForSource('task', task.id);
    return;
  }
  const occ = localDateKey(task.due_datetime);
  if (!occ) {
    deleteEventsForSource('task', task.id);
    return;
  }
  if (prevDate && prevDate !== occ) {
    moveLinkedEvent(
      'task',
      task.id,
      prevDate,
      occ,
      task.title,
      task.due_datetime,
      task.description
    );
    return;
  }
  upsertLinkedEvent({
    source_type: 'task',
    source_id: task.id,
    occurrence_date: occ,
    title: task.title,
    start_datetime: task.due_datetime,
    description: task.description,
  });
}

const REM_RECURRENCES = ['daily', 'monthly', 'fortnight', 'quarterly', 'yearly'];

/** yyyy-mm-dd plus N calendar days. */
function addDaysKey(dayKey, n) {
  const [y, m, d] = String(dayKey).split('-').map(Number);
  return dateKey(new Date(y, m - 1, d + n));
}

/** yyyy-mm-dd plus N months, clamp DOM (31 Jan → 28/29 Feb). */
function addMonthsKey(dayKey, months) {
  const [y, m, d] = String(dayKey).split('-').map(Number);
  const x = new Date(y, m - 1 + months, 1);
  const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
  x.setDate(Math.min(d, last));
  return dateKey(x);
}

/** Apply reminder wall-clock time onto an occurrence day. */
function startOnOccurrence(iso, occKey) {
  const dueKey = localDateKey(iso);
  if (dueKey === occKey) return iso;
  const src = new Date(iso);
  if (Number.isNaN(src.getTime())) return dateAtNine(occKey);
  const [y, m, d] = String(occKey).split('-').map(Number);
  return new Date(
    y,
    m - 1,
    d,
    src.getHours(),
    src.getMinutes(),
    src.getSeconds(),
    src.getMilliseconds()
  ).toISOString();
}

/**
 * Reminder chips in the viewed month. Recurrence expands from current datetime
 * forward; past (already-completed) days are kept by syncReminder keepPast.
 * @param {object} rem
 * @param {number} year
 * @param {number} monthIndex
 * @returns {string[]}
 */
function reminderOccurrenceDates(rem, year, monthIndex) {
  const due = localDateKey(rem.datetime);
  if (!due) return [];
  const rec = rem.recurrence;
  const days = daysInMonth(year, monthIndex);
  const monthPrefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  if (!rec || !REM_RECURRENCES.includes(rec)) {
    return due.startsWith(monthPrefix) ? [due] : [];
  }
  if (rec === 'daily') return days.filter((d) => d >= due);
  if (rec === 'fortnight') {
    const monthEnd = days[days.length - 1];
    const out = [];
    let d = due;
    for (let i = 0; i < 48; i += 1) {
      if (d > monthEnd) break;
      if (d.startsWith(monthPrefix)) out.push(d);
      const next = addDaysKey(d, 14);
      if (!next || next <= d) break;
      d = next;
    }
    return out;
  }
  const stepMonths = rec === 'yearly' ? 12 : rec === 'quarterly' ? 3 : 1;
  const dueDate = new Date(due + 'T12:00:00');
  const monthsDiff =
    (year - dueDate.getFullYear()) * 12 + (monthIndex - dueDate.getMonth());
  if (monthsDiff < 0 || monthsDiff % stepMonths !== 0) return [];
  const occ = addMonthsKey(due, monthsDiff);
  return occ.startsWith(monthPrefix) && occ >= due ? [occ] : [];
}

/**
 * Sync appointment reminder chips for a month. Open / unticked → drop events.
 * Completed one-shots stay. Repeating: keepPast leaves occ < current due.
 * @param {object} rem
 * @param {{ year?: number, monthIndex?: number, keepPast?: boolean }} [opts]
 */
function syncReminder(rem, { year, monthIndex, keepPast = false } = {}) {
  if (!rem?.id) return;
  const flagged = Number(rem.is_appointment) === 1;
  if (!flagged || isOpenDatetime(rem.datetime)) {
    deleteEventsForSource('reminder', rem.id);
    return;
  }
  const due = localDateKey(rem.datetime);
  if (!due) return;
  const y = year ?? Number(due.slice(0, 4));
  const m = monthIndex ?? Number(due.slice(5, 7)) - 1;
  if (!y || m < 0 || m > 11) return;
  const series = reminderOccurrenceDates(rem, y, m);
  const seriesSet = new Set(series);
  const monthPrefix = `${y}-${String(m + 1).padStart(2, '0')}`;
  for (const occ of series) {
    upsertLinkedEvent({
      source_type: 'reminder',
      source_id: rem.id,
      occurrence_date: occ,
      title: rem.title,
      start_datetime: startOnOccurrence(rem.datetime, occ),
      description: rem.description,
    });
  }
  if (rem.title) retitleSourceEvents('reminder', rem.id, rem.title);
  const rows = getDb()
    .prepare(
      `SELECT id, occurrence_date, hidden FROM events WHERE source_type = 'reminder' AND source_id = ?`
    )
    .all(rem.id);
  for (const row of rows) {
    if (Number(row.hidden) === 1) continue;
    const occ = row.occurrence_date;
    if (!occ || !String(occ).startsWith(monthPrefix)) continue;
    if (seriesSet.has(occ)) continue;
    if (keepPast && due && occ < due) continue;
    getDb().prepare('DELETE FROM events WHERE id = ?').run(row.id);
  }
}

/**
 * Sync each distinct month covering the given yyyy-mm-dd keys.
 * @param {object} rem
 * @param {(string|null|undefined)[]} dayKeys
 * @param {{ keepPast?: boolean }} [opts]
 */
function syncReminderForDates(rem, dayKeys, { keepPast = false } = {}) {
  const seen = new Set();
  for (const key of dayKeys) {
    if (!key) continue;
    const y = Number(String(key).slice(0, 4));
    const mo = Number(String(key).slice(5, 7)) - 1;
    if (!y || mo < 0 || mo > 11) continue;
    const stamp = `${y}-${mo}`;
    if (seen.has(stamp)) continue;
    seen.add(stamp);
    syncReminder(rem, { year: y, monthIndex: mo, keepPast });
  }
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
    const habits = db.prepare(`SELECT * FROM habits`).all();
    for (const h of habits) {
      syncHabit(h, { year, monthIndex });
    }
    const rems = db.prepare(`SELECT * FROM reminders WHERE COALESCE(is_appointment, 0) = 1`).all();
    for (const r of rems) {
      syncReminder(r, { year, monthIndex, keepPast: true });
    }
    const tasks = db
      .prepare(
        `SELECT * FROM tasks
         WHERE COALESCE(show_on_calendar, 0) = 1`
      )
      .all();
    for (const t of tasks) {
      syncTask(t);
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
 * Untick Add to Calendar / Calendar on the source. Sync then drops its event rows
 * so a later tick + Save can recreate them.
 * @param {string} sourceType
 * @param {number} sourceId
 */
function optOutOfCalendar(sourceType, sourceId) {
  if (sourceType === 'bill') {
    require('./bills').updateBill(sourceId, { show_on_calendar: 0 });
  } else if (sourceType === 'habit') {
    require('./habits').updateHabit(sourceId, { show_on_calendar: 0 });
  } else if (sourceType === 'task') {
    require('./tasks').updateTask(sourceId, { show_on_calendar: 0 });
  } else if (sourceType === 'reminder') {
    require('./reminders').updateReminder(sourceId, { is_appointment: 0 });
  } else {
    deleteEventsForSource(sourceType, sourceId);
  }
}

/**
 * Delete a calendar selection, or opt the linked source off the calendar.
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
          } else if (e.source_type === 'task') {
            require('./tasks').deleteTask(e.source_id);
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
      const seen = new Set();
      for (const e of linked) {
        const key = `${e.source_type}:${e.source_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        try {
          optOutOfCalendar(e.source_type, e.source_id);
        } catch (err) {
          if (String(err.message || err).includes('locked')) {
            skippedLocked.push(e.title);
            continue;
          }
          throw err;
        }
      }
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
  syncReminderForDates,
  syncTask,
  syncMonth,
  syncOnAppStart,
  removeSelection,
  monthlyHabitDate,
};
