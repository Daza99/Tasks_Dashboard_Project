/**
 * Calendar events CRUD.
 */
const { getDb, getAllSettings, setSetting } = require('../../main/database');
const { logError } = require('../../main/logger');
const { startOfDay, endOfDay } = require('./reminders');
const { dateKey } = require('./habits');
const { uniqueTitleFor } = require('../../utils/unique-title.cjs');

function enrich(row) {
  if (!row) return null;
  return {
    ...row,
    hidden: Number(row.hidden) === 1,
    source_id: row.source_id != null ? Number(row.source_id) : null,
  };
}

const VISIBLE = 'AND COALESCE(e.hidden, 0) = 0';

/** Event row plus reminder/bill nudge; bill nudge only on the current due occurrence. */
const EVENT_WITH_NUDGE = `SELECT e.*,
       COALESCE(
         r.nudge_datetime,
         CASE WHEN e.occurrence_date = date(b.due_date, CAST(COALESCE(b.date_offset_days, 0) AS TEXT) || ' days') THEN b.nudge_datetime END
       ) AS nudge_datetime
       FROM events e
       LEFT JOIN reminders r ON e.source_type = 'reminder' AND e.source_id = r.id
       LEFT JOIN bills b ON e.source_type = 'bill' AND e.source_id = b.id`;

function getEvent(id) {
  const row = getDb().prepare(`${EVENT_WITH_NUDGE} WHERE e.id = ?`).get(id);
  return enrich(row);
}

/** All events overlapping a local calendar day (YYYY-MM-DD). */
function listEventsForDay(dayKey) {
  try {
    const start = startOfDay(new Date(`${dayKey}T12:00:00`)).toISOString();
    const end = endOfDay(new Date(`${dayKey}T12:00:00`)).toISOString();
    return getDb()
      .prepare(
        `${EVENT_WITH_NUDGE}
         WHERE datetime(e.start_datetime) <= datetime(?)
           AND datetime(COALESCE(e.end_datetime, e.start_datetime)) >= datetime(?)
           ${VISIBLE}
         ORDER BY e.start_datetime ASC`
      )
      .all(end, start)
      .map(enrich);
  } catch (err) {
    logError('listEventsForDay', err);
    throw err;
  }
}

/** Events in [monthStart, monthEnd] for calendar dots (ISO month bounds). */
function listEventsInRange(rangeStartIso, rangeEndIso) {
  try {
    return getDb()
      .prepare(
        `${EVENT_WITH_NUDGE}
         WHERE datetime(e.start_datetime) <= datetime(?)
           AND datetime(COALESCE(e.end_datetime, e.start_datetime)) >= datetime(?)
           ${VISIBLE}
         ORDER BY e.start_datetime ASC`
      )
      .all(rangeEndIso, rangeStartIso)
      .map(enrich);
  } catch (err) {
    logError('listEventsInRange', err);
    throw err;
  }
}

/** Create event (manual or linked). */
function createEvent({
  title,
  start_datetime,
  end_datetime = null,
  description = null,
  source_type = null,
  source_id = null,
  occurrence_date = null,
  hidden = 0,
}) {
  try {
    // Linked series share a title (e.g. 12 months of "Rent Due"); manuals stay unique.
    const eventTitle = source_type
      ? String(title ?? '').trim() || uniqueTitleFor('event', title)
      : uniqueTitleFor('event', title);
    if (!start_datetime) throw new Error('start_datetime required');
    const info = getDb()
      .prepare(
        `INSERT INTO events (title, start_datetime, end_datetime, description,
           source_type, source_id, occurrence_date, hidden)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        eventTitle,
        start_datetime,
        end_datetime,
        description,
        source_type || null,
        source_id ?? null,
        occurrence_date || null,
        hidden ? 1 : 0
      );
    return getEvent(Number(info.lastInsertRowid));
  } catch (err) {
    logError('createEvent', err);
    throw err;
  }
}

/** Events starting today (brief). */
function listEventsToday() {
  return listEventsForDay(dateKey());
}

function updateEvent(id, fields) {
  try {
    const cur = getDb().prepare('SELECT * FROM events WHERE id = ?').get(id);
    if (!cur) throw new Error('Event not found');
    const title =
      fields.title !== undefined
        ? cur.source_type
          ? String(fields.title ?? '').trim() || cur.title
          : uniqueTitleFor('event', fields.title, id)
        : cur.title;
    const start_datetime =
      fields.start_datetime !== undefined
        ? fields.start_datetime
        : cur.start_datetime;
    const end_datetime =
      fields.end_datetime !== undefined ? fields.end_datetime : cur.end_datetime;
    const description =
      fields.description !== undefined ? fields.description : cur.description;
    getDb()
      .prepare(
        `UPDATE events SET title = ?, start_datetime = ?, end_datetime = ?, description = ?
         WHERE id = ?`
      )
      .run(title, start_datetime, end_datetime, description, id);
    return getEvent(id);
  } catch (err) {
    logError('updateEvent', err);
    throw err;
  }
}

function deleteEvent(id) {
  try {
    getDb().prepare('DELETE FROM events WHERE id = ?').run(id);
    return true;
  } catch (err) {
    logError('deleteEvent', err);
    throw err;
  }
}

/** Local calendar year from a row; skip open-sentinel / junk. */
function yearFromEventRow(row) {
  const occ = row.occurrence_date;
  if (occ && !String(occ).startsWith('9999')) {
    const y = Number(String(occ).slice(0, 4));
    if (y > 1970 && y < 2100) return y;
  }
  const iso = row.start_datetime;
  if (!iso || String(iso).startsWith('9999')) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  if (y > 1970 && y < 2100) return y;
  return null;
}

/** Earliest visible event year, or null if none. */
function earliestVisibleEventYear() {
  const rows = getDb()
    .prepare(
      `SELECT occurrence_date, start_datetime FROM events
       WHERE COALESCE(hidden, 0) = 0`
    )
    .all();
  let min = null;
  for (const row of rows) {
    const y = yearFromEventRow(row);
    if (y == null) continue;
    if (min == null || y < min) min = y;
  }
  return min;
}

/**
 * Year dropdown: contiguous floor … currentYear+5. Floor never rises.
 * @param {number} [visitedYear] — year on screen (‹ › can lower the floor)
 * @returns {number[]}
 */
function listCalendarYearOptions(visitedYear) {
  try {
    const now = new Date().getFullYear();
    const persisted = parseInt(getAllSettings().calendar_year_min, 10);
    const eventMin = earliestVisibleEventYear();
    const visited = Number(visitedYear);
    const candidates = [now];
    if (Number.isFinite(persisted)) candidates.push(persisted);
    if (eventMin != null) candidates.push(eventMin);
    if (Number.isFinite(visited) && visited > 1970 && visited < 2100) {
      candidates.push(visited);
    }
    const floor = Math.min(...candidates);
    if (!Number.isFinite(persisted) || floor < persisted) {
      setSetting('calendar_year_min', String(floor));
    }
    const max = now + 5;
    const out = [];
    for (let y = floor; y <= max; y += 1) out.push(y);
    return out;
  } catch (err) {
    logError('listCalendarYearOptions', err);
    throw err;
  }
}

module.exports = {
  createEvent,
  getEvent,
  listEventsForDay,
  listEventsInRange,
  listEventsToday,
  listCalendarYearOptions,
  updateEvent,
  deleteEvent,
};
