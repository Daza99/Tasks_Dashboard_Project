/**
 * Reminders CRUD + lifecycle tags.
 */
const { getDb } = require('../../main/database');
const { logError } = require('../../main/logger');
const {
  addTag,
  replaceTags,
  getItemTagNames,
  hasTag,
  removeTag,
} = require('./tags');

const SCOPE_TAGS = ['rem_today', 'rem_tomorrow', 'rem_dated', 'rem_open'];
const STATE_TAGS = [
  'rem_pending',
  'rem_fired',
  'rem_grace',
  'rem_ignored',
  'rem_completed',
  'rem_snoozed',
];
const ALL_REM = [...SCOPE_TAGS, ...STATE_TAGS];

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Resolve datetime + scope tag from creation choice. */
function resolveScope(scope, datetime) {
  const now = new Date();
  if (scope === 'today') {
    const due = datetime ? new Date(datetime) : new Date(now.getTime() + 60 * 60 * 1000);
    return { datetime: due.toISOString(), scopeTag: 'rem_today' };
  }
  if (scope === 'tomorrow') {
    const due = datetime
      ? new Date(datetime)
      : new Date(addDays(startOfDay(now), 1).getTime() + 9 * 60 * 60 * 1000);
    return { datetime: due.toISOString(), scopeTag: 'rem_tomorrow' };
  }
  if (scope === 'dated') {
    if (!datetime) throw new Error('datetime required for dated scope');
    return { datetime: new Date(datetime).toISOString(), scopeTag: 'rem_dated' };
  }
  if (scope === 'open') {
    // Far-future sentinel so scheduler ignores until user sets a date
    return {
      datetime: datetime
        ? new Date(datetime).toISOString()
        : '9999-12-31T00:00:00.000Z',
      scopeTag: 'rem_open',
    };
  }
  throw new Error('scope must be today|tomorrow|dated|open');
}

function enrich(row) {
  if (!row) return null;
  return { ...row, tags: getItemTagNames('reminder', row.id) };
}

function createReminder({ title, scope, datetime = null, recurrence = null }) {
  try {
    if (!title?.trim()) throw new Error('Title required');
    const resolved = resolveScope(scope, datetime);
    const db = getDb();
    const info = db
      .prepare(
        `INSERT INTO reminders (title, datetime, recurrence)
         VALUES (?, ?, ?)`
      )
      .run(title.trim(), resolved.datetime, recurrence);
    const id = Number(info.lastInsertRowid);
    addTag('reminder', id, resolved.scopeTag);
    addTag('reminder', id, 'rem_pending');
    return getReminder(id);
  } catch (err) {
    logError('createReminder', err);
    throw err;
  }
}

function getReminder(id) {
  const row = getDb().prepare('SELECT * FROM reminders WHERE id = ?').get(id);
  return enrich(row);
}

function listReminders({ includeCompleted = false } = {}) {
  try {
    const rows = getDb()
      .prepare(
        `SELECT * FROM reminders
         WHERE archived = 0
         ${includeCompleted ? '' : 'AND completed_at IS NULL'}
         ORDER BY datetime ASC`
      )
      .all();
    return rows.map(enrich);
  } catch (err) {
    logError('listReminders', err);
    throw err;
  }
}

function updateReminder(id, fields) {
  try {
    const allowed = ['title', 'datetime', 'recurrence', 'snooze_until'];
    const sets = [];
    const vals = [];
    for (const key of allowed) {
      if (fields[key] !== undefined) {
        sets.push(`${key} = ?`);
        vals.push(fields[key]);
      }
    }
    const db = getDb();
    const tx = db.transaction(() => {
      if (sets.length) {
        vals.push(id);
        db.prepare(`UPDATE reminders SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
      }
      if (['today', 'tomorrow', 'dated', 'open'].includes(fields.scope)) {
        replaceTags('reminder', id, SCOPE_TAGS, `rem_${fields.scope}`);
      }
      // Re-schedule: datetime change returns item to pending so scheduler can re-fire
      if (fields.datetime !== undefined) {
        db.prepare(
          `UPDATE reminders SET dismissed = 0, snooze_until = NULL, completed_at = NULL WHERE id = ?`
        ).run(id);
        replaceTags('reminder', id, STATE_TAGS, 'rem_pending');
      }
      if (fields.tags !== undefined) {
        const { syncUserTags } = require('./tags');
        syncUserTags('reminder', id, fields.tags);
      }
    });
    tx();
    return getReminder(id);
  } catch (err) {
    logError('updateReminder', err);
    throw err;
  }
}

function completeReminder(id) {
  try {
    getDb()
      .prepare(
        `UPDATE reminders SET completed_at = CURRENT_TIMESTAMP, dismissed = 1
         WHERE id = ?`
      )
      .run(id);
    replaceTags('reminder', id, STATE_TAGS, 'rem_completed');
    return getReminder(id);
  } catch (err) {
    logError('completeReminder', err);
    throw err;
  }
}

/** Popup dismissed → rem_grace (or complete path handled separately). */
function dismissReminder(id) {
  try {
    getDb()
      .prepare(`UPDATE reminders SET dismissed = 1 WHERE id = ?`)
      .run(id);
    replaceTags('reminder', id, STATE_TAGS, 'rem_grace');
    // Store grace start via snooze_until field reuse as grace_until marker
    const hours = Number(
      getDb().prepare(`SELECT value FROM settings WHERE key = 'notif_grace_period_hours'`).get()
        ?.value || 1
    );
    const graceUntil = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    getDb()
      .prepare(`UPDATE reminders SET snooze_until = ? WHERE id = ?`)
      .run(graceUntil, id);
    return getReminder(id);
  } catch (err) {
    logError('dismissReminder', err);
    throw err;
  }
}

/** Popup X/close → rem_ignored immediately (no snooze, no grace). */
function ignoreReminder(id) {
  try {
    getDb()
      .prepare(
        `UPDATE reminders SET dismissed = 1, snooze_until = NULL WHERE id = ?`
      )
      .run(id);
    replaceTags('reminder', id, STATE_TAGS, 'rem_ignored');
    return getReminder(id);
  } catch (err) {
    logError('ignoreReminder', err);
    throw err;
  }
}

/**
 * Snooze reminder for N minutes (default from notif_default_snooze_minutes).
 * @param {number} id
 * @param {number} [minutes]
 */
function snoozeReminder(id, minutes) {
  try {
    const settingsMins = Number(
      getDb()
        .prepare(`SELECT value FROM settings WHERE key = 'notif_default_snooze_minutes'`)
        .get()?.value || 10
    );
    const mins = Number(minutes);
    const useMins = Number.isFinite(mins) && mins > 0 ? mins : settingsMins;
    const until = new Date(Date.now() + useMins * 60 * 1000).toISOString();
    getDb()
      .prepare(
        `UPDATE reminders SET dismissed = 0, snooze_until = ? WHERE id = ?`
      )
      .run(until, id);
    replaceTags('reminder', id, STATE_TAGS, 'rem_snoozed');
    return getReminder(id);
  } catch (err) {
    logError('snoozeReminder', err);
    throw err;
  }
}

function markFired(id) {
  replaceTags('reminder', id, STATE_TAGS, 'rem_fired');
  return getReminder(id);
}

function deleteReminder(id) {
  try {
    if (hasTag('reminder', id, 'locked')) {
      throw new Error('Reminder is locked');
    }
    const db = getDb();
    const tx = db.transaction(() => {
      db.prepare(
        `DELETE FROM item_tags WHERE item_type = 'reminder' AND item_id = ?`
      ).run(id);
      db.prepare('DELETE FROM reminders WHERE id = ?').run(id);
    });
    tx();
    return true;
  } catch (err) {
    logError('deleteReminder', err);
    throw err;
  }
}

/** Pending reminders whose datetime has arrived. */
function listDuePending() {
  return getDb()
    .prepare(
      `SELECT r.* FROM reminders r
       JOIN item_tags it ON it.item_id = r.id AND it.item_type = 'reminder'
       JOIN tags t ON t.id = it.tag_id AND t.name = 'rem_pending'
       WHERE r.completed_at IS NULL AND r.archived = 0
         AND datetime(r.datetime) <= datetime('now')
         AND r.datetime < '9999-01-01'`
    )
    .all()
    .map(enrich);
}

/** Snoozed reminders whose snooze_until has elapsed — ready to re-fire. */
function listDueSnoozed() {
  return getDb()
    .prepare(
      `SELECT r.* FROM reminders r
       JOIN item_tags it ON it.item_id = r.id AND it.item_type = 'reminder'
       JOIN tags t ON t.id = it.tag_id AND t.name = 'rem_snoozed'
       WHERE r.completed_at IS NULL AND r.archived = 0
         AND r.snooze_until IS NOT NULL
         AND datetime(r.snooze_until) <= datetime('now')`
    )
    .all()
    .map(enrich);
}

/** rem_grace past grace window → rem_ignored. */
function expireGraceReminders() {
  try {
    const rows = getDb()
      .prepare(
        `SELECT r.id FROM reminders r
         JOIN item_tags it ON it.item_id = r.id AND it.item_type = 'reminder'
         JOIN tags t ON t.id = it.tag_id AND t.name = 'rem_grace'
         WHERE r.completed_at IS NULL
           AND r.snooze_until IS NOT NULL
           AND datetime(r.snooze_until) <= datetime('now')`
      )
      .all();
    for (const row of rows) {
      replaceTags('reminder', row.id, STATE_TAGS, 'rem_ignored');
    }
    return rows.length;
  } catch (err) {
    logError('expireGraceReminders', err);
    throw err;
  }
}

module.exports = {
  createReminder,
  getReminder,
  listReminders,
  updateReminder,
  completeReminder,
  dismissReminder,
  ignoreReminder,
  snoozeReminder,
  markFired,
  deleteReminder,
  listDuePending,
  listDueSnoozed,
  expireGraceReminders,
  resolveScope,
  startOfDay,
  endOfDay,
  addDays,
  SCOPE_TAGS,
  STATE_TAGS,
  ALL_REM,
  removeTag,
};
