/**
 * Calendar events CRUD.
 */
const { getDb } = require('../../main/database');
const { logError } = require('../../main/logger');
const { startOfDay, endOfDay } = require('./reminders');
const { dateKey } = require('./habits');

function enrich(row) {
  if (!row) return null;
  return {
    ...row,
    hidden: Number(row.hidden) === 1,
    source_id: row.source_id != null ? Number(row.source_id) : null,
  };
}

const VISIBLE = 'AND COALESCE(hidden, 0) = 0';

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
    if (!title?.trim()) throw new Error('Title required');
    if (!start_datetime) throw new Error('start_datetime required');
    const info = getDb()
      .prepare(
        `INSERT INTO events (title, start_datetime, end_datetime, description,
           source_type, source_id, occurrence_date, hidden)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        title.trim(),
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

function getEvent(id) {
  const row = getDb().prepare('SELECT * FROM events WHERE id = ?').get(id);
  return enrich(row);
}

/** All events overlapping a local calendar day (YYYY-MM-DD). */
function listEventsForDay(dayKey) {
  try {
    const start = startOfDay(new Date(`${dayKey}T12:00:00`)).toISOString();
    const end = endOfDay(new Date(`${dayKey}T12:00:00`)).toISOString();
    return getDb()
      .prepare(
        `SELECT * FROM events
         WHERE datetime(start_datetime) <= datetime(?)
           AND datetime(COALESCE(end_datetime, start_datetime)) >= datetime(?)
           ${VISIBLE}
         ORDER BY start_datetime ASC`
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
        `SELECT * FROM events
         WHERE datetime(start_datetime) <= datetime(?)
           AND datetime(COALESCE(end_datetime, start_datetime)) >= datetime(?)
           ${VISIBLE}
         ORDER BY start_datetime ASC`
      )
      .all(rangeEndIso, rangeStartIso)
      .map(enrich);
  } catch (err) {
    logError('listEventsInRange', err);
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
      fields.title !== undefined ? String(fields.title).trim() : cur.title;
    if (!title) throw new Error('Title required');
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

module.exports = {
  createEvent,
  getEvent,
  listEventsForDay,
  listEventsInRange,
  listEventsToday,
  updateEvent,
  deleteEvent,
};
