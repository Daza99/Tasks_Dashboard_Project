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
const { uniqueTitleFor } = require('../../utils/unique-title.cjs');

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

/** Local YYYY-MM-DD from ISO (for calendar occurrence moves). */
function dateKeyFromIso(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
  const tags = getItemTagNames('reminder', row.id);
  return {
    ...row,
    tags,
    item_type: 'reminder',
    locked: Number(row.locked) === 1 || tags.includes('locked'),
  };
}

/**
 * Resolve nudge columns from create/update payload + due ISO.
 * Open / nudge off → all null. day_before = due minus 1 calendar day.
 */
function resolveNudgeFields(scope, dueIso, { nudge, nudge_mode, nudge_datetime } = {}) {
  if (scope === 'open' || !nudge) {
    return { nudge_datetime: null, nudge_mode: null, nudge_alerted: 0 };
  }
  const mode = nudge_mode === 'custom' ? 'custom' : 'day_before';
  if (mode === 'custom') {
    if (!nudge_datetime) throw new Error('nudge_datetime required for custom nudge');
    const at = new Date(nudge_datetime);
    if (Number.isNaN(at.getTime())) throw new Error('Invalid nudge_datetime');
    return {
      nudge_datetime: at.toISOString(),
      nudge_mode: 'custom',
      nudge_alerted: 0,
    };
  }
  const due = new Date(dueIso);
  if (Number.isNaN(due.getTime()) || String(dueIso).startsWith('9999')) {
    return { nudge_datetime: null, nudge_mode: null, nudge_alerted: 0 };
  }
  return {
    nudge_datetime: addDays(due, -1).toISOString(),
    nudge_mode: 'day_before',
    nudge_alerted: 0,
  };
}

function createReminder({
  title,
  scope,
  datetime = null,
  recurrence = null,
  is_appointment = 0,
  description = null,
  nudge = false,
  nudge_mode = null,
  nudge_datetime = null,
}) {
  try {
    const remTitle = uniqueTitleFor('reminder', title);
    const resolved = resolveScope(scope, datetime);
    const appointment = scope === 'open' ? 0 : is_appointment ? 1 : 0;
    const rec = scope === 'open' ? null : recurrence || null;
    const details = description != null ? String(description).trim() || null : null;
    const nudgeFields = resolveNudgeFields(scope, resolved.datetime, {
      nudge,
      nudge_mode,
      nudge_datetime,
    });
    const db = getDb();
    const info = db
      .prepare(
        `INSERT INTO reminders (title, datetime, recurrence, is_appointment, description,
           nudge_datetime, nudge_mode, nudge_alerted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        remTitle,
        resolved.datetime,
        rec,
        appointment,
        details,
        nudgeFields.nudge_datetime,
        nudgeFields.nudge_mode,
        nudgeFields.nudge_alerted
      );
    const id = Number(info.lastInsertRowid);
    addTag('reminder', id, resolved.scopeTag);
    addTag('reminder', id, 'rem_pending');
    const row = getReminder(id);
    require('./calendar-sync').syncReminder(row);
    return row;
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
           AND (container IS NULL OR container = 'active')
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
    const cur = getDb().prepare('SELECT * FROM reminders WHERE id = ?').get(id);
    const prevDate = cur?.datetime && !String(cur.datetime).startsWith('9999')
      ? dateKeyFromIso(cur.datetime)
      : null;
    const allowed = [
      'title',
      'datetime',
      'recurrence',
      'snooze_until',
      'is_appointment',
      'description',
      'nudge_datetime',
      'nudge_mode',
      'nudge_alerted',
    ];
    const sets = [];
    const vals = [];
    const nextFields = { ...fields };
    if (nextFields.title !== undefined) {
      nextFields.title = uniqueTitleFor('reminder', nextFields.title, id);
    }
    if (nextFields.scope === 'open') {
      nextFields.is_appointment = 0;
      nextFields.recurrence = null;
    }
    if (nextFields.is_appointment !== undefined) {
      nextFields.is_appointment = nextFields.is_appointment ? 1 : 0;
    }
    const nextScope = nextFields.scope || null;
    const dueIso = nextFields.datetime !== undefined ? nextFields.datetime : cur?.datetime;
    const nudgeTouched =
      nextFields.nudge !== undefined ||
      nextFields.nudge_mode !== undefined ||
      nextFields.nudge_datetime !== undefined ||
      (nextFields.datetime !== undefined && cur?.nudge_mode === 'day_before') ||
      nextScope === 'open';
    if (nudgeTouched) {
      const nudgeOn =
        nextScope === 'open'
          ? false
          : nextFields.nudge !== undefined
            ? Boolean(nextFields.nudge)
            : Boolean(cur?.nudge_datetime);
      const mode =
        nextFields.nudge_mode !== undefined ? nextFields.nudge_mode : cur?.nudge_mode;
      const customAt =
        nextFields.nudge_datetime !== undefined
          ? nextFields.nudge_datetime
          : cur?.nudge_datetime;
      const resolvedNudge = resolveNudgeFields(nextScope === 'open' ? 'open' : 'dated', dueIso, {
        nudge: nudgeOn,
        nudge_mode: mode,
        nudge_datetime: customAt,
      });
      nextFields.nudge_datetime = resolvedNudge.nudge_datetime;
      nextFields.nudge_mode = resolvedNudge.nudge_mode;
      nextFields.nudge_alerted = resolvedNudge.nudge_alerted;
    }
    for (const key of allowed) {
      if (nextFields[key] !== undefined) {
        sets.push(`${key} = ?`);
        const val =
          key === 'description'
            ? String(nextFields[key] || '').trim() || null
            : nextFields[key];
        vals.push(val);
      }
    }
    const db = getDb();
    const tx = db.transaction(() => {
      if (sets.length) {
        vals.push(id);
        db.prepare(`UPDATE reminders SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
      }
      if (['today', 'tomorrow', 'dated', 'open'].includes(nextFields.scope)) {
        replaceTags('reminder', id, SCOPE_TAGS, `rem_${nextFields.scope}`);
      }
      // Re-schedule: datetime change returns item to pending so scheduler can re-fire
      if (nextFields.datetime !== undefined) {
        db.prepare(
          `UPDATE reminders SET dismissed = 0, snooze_until = NULL, completed_at = NULL WHERE id = ?`
        ).run(id);
        replaceTags('reminder', id, STATE_TAGS, 'rem_pending');
      }
      if (nextFields.tags !== undefined) {
        const { syncUserTags } = require('./tags');
        syncUserTags('reminder', id, nextFields.tags);
      }
    });
    tx();
    const row = getReminder(id);
    require('./calendar-sync').syncReminder(row, { prevDate });
    return row;
  } catch (err) {
    logError('updateReminder', err);
    throw err;
  }
}

/** True when this row is the Settings-owned backup reminder. */
function isBackupRemindId(id) {
  const raw = getDb().prepare(`SELECT value FROM settings WHERE key = 'backup_remind_id'`).get()
    ?.value;
  const stored = Number(raw);
  return Number.isFinite(stored) && stored > 0 && Number(id) === stored;
}

/** Interval for the backup reminder (settings), minimum 1. */
function backupRemindDays() {
  const raw = getDb().prepare(`SELECT value FROM settings WHERE key = 'backup_remind_days'`).get()
    ?.value;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) && n >= 1 ? n : 5;
}

function completeReminder(id) {
  try {
    const cur = getDb().prepare('SELECT * FROM reminders WHERE id = ?').get(id);
    const isDaily = cur?.recurrence === 'daily';
    const isBackupRemind = isBackupRemindId(id);
    const isOpen = !cur?.datetime || String(cur.datetime).startsWith('9999');
    if ((isDaily || isBackupRemind) && !isOpen) {
      const prevDate = dateKeyFromIso(cur.datetime);
      const step = isBackupRemind ? backupRemindDays() : 1;
      const next = addDays(new Date(cur.datetime), step).toISOString();
      let nextNudge = cur.nudge_datetime;
      let nextAlerted = cur.nudge_alerted;
      if (cur.nudge_mode === 'day_before') {
        nextNudge = addDays(new Date(next), -1).toISOString();
        nextAlerted = 0;
      }
      getDb()
        .prepare(
          `UPDATE reminders SET datetime = ?, completed_at = NULL, dismissed = 0,
             snooze_until = NULL, container = 'active', archived = 0,
             nudge_datetime = ?, nudge_alerted = ?,
             is_appointment = CASE WHEN ? = 1 THEN 1 ELSE is_appointment END
           WHERE id = ?`
        )
        .run(next, nextNudge, nextAlerted, isBackupRemind ? 1 : 0, id);
      replaceTags('reminder', id, STATE_TAGS, 'rem_pending');
      replaceTags('reminder', id, SCOPE_TAGS, 'rem_dated');
      removeTag('reminder', id, 'archived');
      const row = getReminder(id);
      require('./calendar-sync').syncReminder(row, { prevDate });
      return row;
    }
    getDb()
      .prepare(
        `UPDATE reminders SET completed_at = CURRENT_TIMESTAMP, dismissed = 1,
           container = 'active', archived = 0
         WHERE id = ?`
      )
      .run(id);
    replaceTags('reminder', id, STATE_TAGS, 'rem_completed');
    removeTag('reminder', id, 'archived');
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

/** Un-complete → rem_pending (restore from Completed). */
function uncompleteReminder(id) {
  try {
    getDb()
      .prepare(
        `UPDATE reminders SET completed_at = NULL, dismissed = 0, container = 'active'
         WHERE id = ?`
      )
      .run(id);
    replaceTags('reminder', id, STATE_TAGS, 'rem_pending');
    return getReminder(id);
  } catch (err) {
    logError('uncompleteReminder', err);
    throw err;
  }
}

/**
 * Delete a reminder and its calendar events.
 * @param {number} id
 * @param {{ force?: boolean }} [opts] — force skips the padlock (system backup reminder)
 */
function deleteReminder(id, { force = false } = {}) {
  try {
    if (!force) {
      const row = getDb().prepare('SELECT locked FROM reminders WHERE id = ?').get(id);
      if (row && Number(row.locked) === 1) throw new Error('Reminder is locked');
      if (hasTag('reminder', id, 'locked')) {
        throw new Error('Reminder is locked');
      }
    }
    const db = getDb();
    const tx = db.transaction(() => {
      require('./calendar-sync').deleteEventsForSource('reminder', id);
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

function uniqPositiveIds(ids) {
  return [...new Set((ids || []).map(Number).filter((n) => Number.isFinite(n) && n > 0))];
}

function reminderIsLocked(id) {
  const row = getDb().prepare('SELECT locked FROM reminders WHERE id = ?').get(id);
  if (row && Number(row.locked) === 1) return true;
  return hasTag('reminder', id, 'locked');
}

/**
 * Bulk-delete reminders (skips locked). One transaction + calendar cleanup.
 * @param {number[]} ids
 * @returns {number} how many were deleted
 */
function deleteReminders(ids) {
  try {
    const list = uniqPositiveIds(ids);
    if (!list.length) return 0;
    const db = getDb();
    const delTags = db.prepare(
      `DELETE FROM item_tags WHERE item_type = 'reminder' AND item_id = ?`
    );
    const delRow = db.prepare('DELETE FROM reminders WHERE id = ?');
    const run = db.transaction((idList) => {
      let n = 0;
      for (const id of idList) {
        if (reminderIsLocked(id)) continue;
        require('./calendar-sync').deleteEventsForSource('reminder', id);
        delTags.run(id);
        const r = delRow.run(id);
        if (r.changes) n += 1;
      }
      return n;
    });
    return run(list);
  } catch (err) {
    logError('deleteReminders', err);
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
         AND (r.container IS NULL OR r.container = 'active')
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
         AND (r.container IS NULL OR r.container = 'active')
         AND r.snooze_until IS NOT NULL
         AND datetime(r.snooze_until) <= datetime('now')`
    )
    .all()
    .map(enrich);
}

/** rem_grace past grace window → rem_ignored. Returns {id, title}[]. */
function expireGraceReminders() {
  try {
    const rows = getDb()
      .prepare(
        `SELECT r.id, r.title FROM reminders r
         JOIN item_tags it ON it.item_id = r.id AND it.item_type = 'reminder'
         JOIN tags t ON t.id = it.tag_id AND t.name = 'rem_grace'
         WHERE r.completed_at IS NULL
           AND (r.container IS NULL OR r.container = 'active')
           AND r.snooze_until IS NOT NULL
           AND datetime(r.snooze_until) <= datetime('now')
         GROUP BY r.id`
      )
      .all();
    for (const row of rows) {
      replaceTags('reminder', row.id, STATE_TAGS, 'rem_ignored');
    }
    return rows;
  } catch (err) {
    logError('expireGraceReminders', err);
    throw err;
  }
}

/** Pending reminders whose nudge_datetime has arrived and not yet alerted. */
function listDueReminderNudges() {
  return getDb()
    .prepare(
      `SELECT r.* FROM reminders r
       JOIN item_tags it ON it.item_id = r.id AND it.item_type = 'reminder'
       JOIN tags t ON t.id = it.tag_id AND t.name = 'rem_pending'
       WHERE r.completed_at IS NULL AND r.archived = 0
         AND (r.container IS NULL OR r.container = 'active')
         AND r.nudge_datetime IS NOT NULL
         AND COALESCE(r.nudge_alerted, 0) = 0
         AND datetime(r.nudge_datetime) <= datetime('now')`
    )
    .all()
    .map(enrich);
}

/** Mark the pre-reminder nudge as shown/dismissed. Does not complete the reminder. */
function markNudgeAlerted(id) {
  getDb().prepare('UPDATE reminders SET nudge_alerted = 1 WHERE id = ?').run(id);
  return getReminder(id);
}

/** Snooze only the nudge; reminder due is unchanged. */
function snoozeReminderNudge(id, minutes) {
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
        `UPDATE reminders SET nudge_datetime = ?, nudge_alerted = 0 WHERE id = ?`
      )
      .run(until, id);
    return getReminder(id);
  } catch (err) {
    logError('snoozeReminderNudge', err);
    throw err;
  }
}

/** X / Done on nudge popup — drop this nudge only. */
function dismissReminderNudge(id) {
  return markNudgeAlerted(id);
}

module.exports = {
  createReminder,
  getReminder,
  listReminders,
  updateReminder,
  completeReminder,
  uncompleteReminder,
  dismissReminder,
  ignoreReminder,
  snoozeReminder,
  markFired,
  deleteReminder,
  deleteReminders,
  listDuePending,
  listDueSnoozed,
  expireGraceReminders,
  listDueReminderNudges,
  markNudgeAlerted,
  snoozeReminderNudge,
  dismissReminderNudge,
  resolveScope,
  startOfDay,
  endOfDay,
  addDays,
  SCOPE_TAGS,
  STATE_TAGS,
  ALL_REM,
  removeTag,
};
