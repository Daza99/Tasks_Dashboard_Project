/**
 * Trackers CRUD, period logs, wall-clock stopwatch/countdown.
 * Habits stay binary; this module is counts / ratings / mood / energy / clocks.
 */
const { getDb } = require('../../main/database');
const { logError } = require('../../main/logger');
const { getItemTagNames, syncUserTags } = require('./tags');
const { clampPriority, DEFAULT_PRIORITY } = require('../../utils/priority.cjs');
const { uniqueTitleFor } = require('../../utils/unique-title.cjs');

const KINDS = ['count', 'scale', 'mood', 'energy', 'stopwatch', 'countdown'];
const PERIODS = ['daily', 'weekly', 'monthly', 'bimonthly', 'as_needed'];
const LOG_KINDS = new Set(['count', 'scale', 'mood', 'energy']);
const TIMER_KINDS = new Set(['stopwatch', 'countdown']);
const STAMP_KINDS = new Set(['mood', 'energy']);
/** Mood 1–5 faces — stored as ints, not glyphs. */
const MOOD_FACES = ['😫', '😕', '😐', '🙂', '😄'];
/** Energy 1–4: very tired → tired → neutral → normal. */
const ENERGY_FACES = ['😩', '😪', '😐', '🙂'];
/** Stamp strip: keep last N local calendar days. */
const STAMP_DAYS = 7;

/** Local YYYY-MM-DD. */
function dateKey(d = new Date()) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function parseJson(raw, fallback = {}) {
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
    return v && typeof v === 'object' ? v : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Kind-specific config. Rejects invalid ranges / durations.
 * @param {string} kind
 * @param {object} cfg
 */
function normalizeConfig(kind, cfg = {}) {
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  if (kind === 'count') {
    const step = Math.max(1, Number(c.step) || 1);
    const unit = String(c.unit || '').trim().slice(0, 32);
    const targetRaw = c.target;
    const target =
      targetRaw == null || targetRaw === ''
        ? null
        : Math.max(0, Number(targetRaw));
    if (target != null && !Number.isFinite(target)) {
      throw new Error('Count target must be a number');
    }
    return { step, unit, target };
  }
  if (kind === 'scale') {
    const min = Number.parseInt(c.min, 10);
    const max = Number.parseInt(c.max, 10);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
      throw new Error('Scale needs min < max integers');
    }
    if (max - min > 100) throw new Error('Scale range too wide (max 100)');
    return { min, max };
  }
  if (kind === 'mood') return {};
  if (kind === 'energy') return {};
  if (kind === 'stopwatch') return {};
  if (kind === 'countdown') {
    const duration_ms = Math.round(Number(c.duration_ms) || 0);
    if (!Number.isFinite(duration_ms) || duration_ms < 1000) {
      throw new Error('Countdown needs a duration of at least 1 second');
    }
    return { duration_ms };
  }
  throw new Error('Unknown tracker kind');
}

/**
 * Current period window as local date keys [start, endExclusive).
 * as_needed → null (all-time stats). Bimonthly anchored on created_at month.
 */
function periodWindow(period, createdAt, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'as_needed') return null;
  if (period === 'daily') {
    return { start: dateKey(today), endExclusive: dateKey(addDays(today, 1)) };
  }
  if (period === 'weekly') {
    const day = today.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const weekStart = addDays(today, mondayOffset);
    return {
      start: dateKey(weekStart),
      endExclusive: dateKey(addDays(weekStart, 7)),
    };
  }
  if (period === 'monthly') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { start: dateKey(start), endExclusive: dateKey(end) };
  }
  if (period === 'bimonthly') {
    const created = createdAt ? new Date(createdAt) : now;
    const cAbs = created.getFullYear() * 12 + created.getMonth();
    const nowAbs = now.getFullYear() * 12 + now.getMonth();
    const bucket = Math.floor((nowAbs - cAbs) / 2);
    const startAbs = cAbs + bucket * 2;
    const startY = Math.floor(startAbs / 12);
    const startM = ((startAbs % 12) + 12) % 12;
    const start = new Date(startY, startM, 1);
    const end = new Date(startY, startM + 2, 1);
    return { start: dateKey(start), endExclusive: dateKey(end) };
  }
  return { start: dateKey(today), endExclusive: dateKey(addDays(today, 1)) };
}

function logDateKey(loggedAt) {
  if (!loggedAt) return '';
  const d = new Date(loggedAt);
  return Number.isNaN(d.getTime()) ? String(loggedAt).slice(0, 10) : dateKey(d);
}

function inWindow(loggedAt, win) {
  if (!win) return true;
  const k = logDateKey(loggedAt);
  return k >= win.start && k < win.endExclusive;
}

/** Wall-clock elapsed for a timer row. */
function liveElapsedMs(row, now = Date.now()) {
  const base = Number(row.elapsed_ms) || 0;
  if (row.status === 'running' && row.started_at) {
    const t = new Date(row.started_at).getTime();
    if (Number.isFinite(t)) return base + Math.max(0, now - t);
  }
  return base;
}

function liveDisplayMs(row, config, now = Date.now()) {
  const elapsed = liveElapsedMs(row, now);
  if (row.kind === 'countdown') {
    const dur = Number(config.duration_ms) || 0;
    return Math.max(0, dur - elapsed);
  }
  return elapsed;
}

/** Last STAMP_DAYS of mood/energy logs for the list chip strip. */
function stampLogsFrom(logs, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const cutoff = dateKey(addDays(today, -(STAMP_DAYS - 1)));
  return logs
    .filter((l) => logDateKey(l.logged_at) >= cutoff)
    .map((l) => ({ id: l.id, logged_at: l.logged_at, value: l.value }));
}

function periodStats(id, period, createdAt, kind) {
  const win = periodWindow(period, createdAt);
  const logs = getDb()
    .prepare(
      `SELECT id, logged_at, value FROM tracker_logs
       WHERE tracker_id = ? ORDER BY logged_at ASC, id ASC`
    )
    .all(id);
  const inPeriod = logs.filter((l) => inWindow(l.logged_at, win));
  const last = logs.length ? logs[logs.length - 1] : null;
  const periodTotal = inPeriod.reduce((s, l) => s + (Number(l.value) || 0), 0);
  return {
    period_total: periodTotal,
    period_log_count: inPeriod.length,
    last_value: last ? last.value : null,
    last_logged_at: last ? last.logged_at : null,
    logged_this_period: inPeriod.length > 0,
    stamp_logs: STAMP_KINDS.has(kind) ? stampLogsFrom(logs) : [],
  };
}

function enrich(row) {
  if (!row) return null;
  settleOne(row);
  const fresh = getDb().prepare('SELECT * FROM trackers WHERE id = ?').get(row.id);
  if (!fresh) return null;
  const config = normalizeConfig(fresh.kind, parseJson(fresh.config_json));
  const stats = periodStats(fresh.id, fresh.period, fresh.created_at, fresh.kind);
  const now = Date.now();
  return {
    ...fresh,
    config,
    tags: getItemTagNames('tracker', fresh.id),
    elapsed_live_ms: liveElapsedMs(fresh, now),
    display_ms: liveDisplayMs(fresh, config, now),
    ...stats,
  };
}

/**
 * If a running countdown has hit 0, log the session and mark done.
 * @returns {object|null} remaining row or null if deleted
 */
function settleOne(row) {
  if (!row || row.kind !== 'countdown' || row.status !== 'running') return row;
  const config = parseJson(row.config_json);
  const dur = Number(config.duration_ms) || 0;
  if (liveElapsedMs(row) < dur) return row;
  return completeCountdown(row.id);
}

/** Fire the shared due-popup; lazy require avoids a cycle with notification-window. */
function fireCountdownFinished(row) {
  if (!row) return;
  try {
    const { showItemNotification } = require('../../main/notification-window');
    showItemNotification({
      id: row.id,
      title: `${row.name} (Countdown Finished)`,
      itemType: 'countdown',
      description: row.description,
      tags: row.tags,
    });
  } catch (err) {
    logError('fireCountdownFinished', err);
  }
}

/**
 * Complete an expired/finished countdown. Logs duration; stays in the list as done.
 * @param {number} id
 * @returns {object|null}
 */
function completeCountdown(id) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM trackers WHERE id = ?').get(id);
  if (!row || row.kind !== 'countdown') return row ? enrich(row) : null;
  if (row.status !== 'running') return getTracker(id);
  const config = parseJson(row.config_json);
  const dur = Number(config.duration_ms) || 0;
  db.prepare(
    `INSERT INTO tracker_logs (tracker_id, logged_at, value) VALUES (?, ?, ?)`
  ).run(id, new Date().toISOString(), dur);
  db.prepare(
    `UPDATE trackers SET status = 'done', started_at = NULL, elapsed_ms = ? WHERE id = ?`
  ).run(dur, id);
  const done = getTracker(id);
  fireCountdownFinished(done || { ...row, status: 'done' });
  return done;
}

/** True when a countdown is still counting down (for the main-process settle tick). */
function hasRunningCountdowns() {
  try {
    return Boolean(
      getDb()
        .prepare(
          `SELECT 1 FROM trackers WHERE kind = 'countdown' AND status = 'running' LIMIT 1`
        )
        .get()
    );
  } catch (err) {
    logError('hasRunningCountdowns', err);
    return false;
  }
}

/** Settle every running countdown that has expired (popout poll + list). */
function settleExpiredCountdowns() {
  try {
    const rows = getDb()
      .prepare(`SELECT * FROM trackers WHERE kind = 'countdown' AND status = 'running'`)
      .all();
    let changed = false;
    for (const row of rows) {
      const next = settleOne(row);
      if (!next || next.status !== 'running') changed = true;
    }
    return changed;
  } catch (err) {
    logError('settleExpiredCountdowns', err);
    return false;
  }
}

function requireKind(kind) {
  if (!KINDS.includes(kind)) {
    throw new Error('kind must be count, scale, mood, energy, stopwatch, or countdown');
  }
}

function requirePeriod(period) {
  if (!PERIODS.includes(period)) {
    throw new Error('period must be daily, weekly, monthly, bimonthly, or as_needed');
  }
}

/**
 * Create a tracker.
 * @param {{ name: string, kind: string, period?: string, config?: object, keep?: boolean, tags?: string[]|string, description?: string|null, priority?: number }} data
 */
function createTracker({
  name,
  kind,
  period = 'daily',
  config = {},
  keep = true,
  tags = undefined,
  description = null,
  priority = DEFAULT_PRIORITY,
}) {
  try {
    const trackerName = uniqueTitleFor('tracker', name);
    requireKind(kind);
    requirePeriod(period);
    const cfg = normalizeConfig(kind, config);
    const details = description != null ? String(description).trim() || null : null;
    const keepFlag = kind === 'countdown' ? (keep ? 1 : 0) : 1;
    const info = getDb()
      .prepare(
        `INSERT INTO trackers (name, kind, period, config_json, keep, description, priority)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        trackerName,
        kind,
        period,
        JSON.stringify(cfg),
        keepFlag,
        details,
        clampPriority(priority)
      );
    const id = Number(info.lastInsertRowid);
    if (tags !== undefined) syncUserTags('tracker', id, tags);
    if (TIMER_KINDS.has(kind)) return timerStart(id);
    return getTracker(id);
  } catch (err) {
    logError('createTracker', err);
    throw err;
  }
}

function getTracker(id) {
  try {
    const row = getDb().prepare('SELECT * FROM trackers WHERE id = ?').get(id);
    return enrich(row);
  } catch (err) {
    logError('getTracker', err);
    throw err;
  }
}

/** @param {{}} [_opts] */
function listTrackers(_opts = {}) {
  try {
    settleExpiredCountdowns();
    const rows = getDb()
      .prepare(
        `SELECT * FROM trackers
         ORDER BY CASE WHEN kind IN ('stopwatch', 'countdown') THEN 0 ELSE 1 END,
                  CASE WHEN kind IN ('stopwatch', 'countdown') THEN created_at END DESC,
                  COALESCE(priority, 3) ASC, name COLLATE NOCASE ASC`
      )
      .all();
    return rows.map((r) => enrich(r)).filter(Boolean);
  } catch (err) {
    logError('listTrackers', err);
    throw err;
  }
}

function updateTracker(id, fields) {
  try {
    const cur = getDb().prepare('SELECT * FROM trackers WHERE id = ?').get(id);
    if (!cur) throw new Error('Tracker not found');
    const name =
      fields.name !== undefined
        ? uniqueTitleFor('tracker', fields.name, id)
        : cur.name;
    const period = fields.period !== undefined ? fields.period : cur.period;
    requirePeriod(period);
    const kind = cur.kind;
    const cfg =
      fields.config !== undefined
        ? normalizeConfig(kind, fields.config)
        : normalizeConfig(kind, parseJson(cur.config_json));
    const details =
      fields.description !== undefined
        ? String(fields.description || '').trim() || null
        : cur.description;
    const priority =
      fields.priority !== undefined
        ? clampPriority(fields.priority)
        : clampPriority(cur.priority);
    let keep = cur.keep;
    if (kind === 'countdown' && fields.keep !== undefined) {
      keep = fields.keep ? 1 : 0;
    }
    getDb()
      .prepare(
        `UPDATE trackers SET name = ?, period = ?, config_json = ?, keep = ?,
         description = ?, priority = ? WHERE id = ?`
      )
      .run(name, period, JSON.stringify(cfg), keep, details, priority, id);
    if (fields.tags !== undefined) syncUserTags('tracker', id, fields.tags);
    return getTracker(id);
  } catch (err) {
    logError('updateTracker', err);
    throw err;
  }
}

function deleteTracker(id) {
  try {
    const db = getDb();
    db.prepare(
      `DELETE FROM item_tags WHERE item_type = 'tracker' AND item_id = ?`
    ).run(id);
    db.prepare('DELETE FROM tracker_logs WHERE tracker_id = ?').run(id);
    db.prepare('DELETE FROM trackers WHERE id = ?').run(id);
    return true;
  } catch (err) {
    logError('deleteTracker', err);
    throw err;
  }
}

/**
 * Bulk-delete trackers (and their tags/logs) in one transaction.
 * @param {number[]} ids
 * @returns {number} how many were deleted
 */
function deleteTrackers(ids) {
  try {
    const list = [...new Set((ids || []).map(Number).filter((n) => Number.isFinite(n) && n > 0))];
    if (!list.length) return 0;
    const db = getDb();
    const delTags = db.prepare(
      `DELETE FROM item_tags WHERE item_type = 'tracker' AND item_id = ?`
    );
    const delLogs = db.prepare('DELETE FROM tracker_logs WHERE tracker_id = ?');
    const delRow = db.prepare('DELETE FROM trackers WHERE id = ?');
    const run = db.transaction((idList) => {
      let n = 0;
      for (const id of idList) {
        delTags.run(id);
        delLogs.run(id);
        const r = delRow.run(id);
        if (r.changes) n += 1;
      }
      return n;
    });
    return run(list);
  } catch (err) {
    logError('deleteTrackers', err);
    throw err;
  }
}

/**
 * Append a log. Count uses signed step; scale/mood/energy store the chosen value.
 * @param {number} id
 * @param {number|string} value
 */
function logValue(id, value) {
  try {
    const row = getDb().prepare('SELECT * FROM trackers WHERE id = ?').get(id);
    if (!row) throw new Error('Tracker not found');
    if (!LOG_KINDS.has(row.kind)) throw new Error('This tracker is not a log kind');
    const config = normalizeConfig(row.kind, parseJson(row.config_json));
    const stats = periodStats(id, row.period, row.created_at, row.kind);
    let num = Number(value);
    if (row.kind === 'count') {
      const step = config.step || 1;
      if (!Number.isFinite(num) || num === 0) num = step;
      const next = stats.period_total + num;
      if (next < 0) {
        if (stats.period_total <= 0) return getTracker(id);
        num = -stats.period_total;
      }
    } else if (row.kind === 'scale') {
      if (!Number.isFinite(num) || num < config.min || num > config.max) {
        throw new Error(`Scale value must be ${config.min}–${config.max}`);
      }
    } else if (row.kind === 'mood') {
      if (!Number.isFinite(num) || num < 1 || num > 5) {
        throw new Error('Mood must be 1–5');
      }
    } else if (row.kind === 'energy') {
      if (!Number.isFinite(num) || num < 1 || num > 4) {
        throw new Error('Energy must be 1–4');
      }
    }
    getDb()
      .prepare(
        `INSERT INTO tracker_logs (tracker_id, logged_at, value) VALUES (?, ?, ?)`
      )
      .run(id, new Date().toISOString(), num);
    return getTracker(id);
  } catch (err) {
    logError('logValue', err);
    throw err;
  }
}

/** Delete the most recent log for this tracker. */
function undoLastLog(id) {
  try {
    const last = getDb()
      .prepare(
        `SELECT id FROM tracker_logs WHERE tracker_id = ? ORDER BY logged_at DESC, id DESC LIMIT 1`
      )
      .get(id);
    if (!last) return getTracker(id);
    getDb().prepare('DELETE FROM tracker_logs WHERE id = ?').run(last.id);
    return getTracker(id);
  } catch (err) {
    logError('undoLastLog', err);
    throw err;
  }
}

function timerStart(id) {
  try {
    settleExpiredCountdowns();
    const row = getDb().prepare('SELECT * FROM trackers WHERE id = ?').get(id);
    if (!row) throw new Error('Tracker not found');
    if (!TIMER_KINDS.has(row.kind)) throw new Error('Not a timer tracker');
    if (row.status === 'running') return getTracker(id);
    if (row.kind === 'countdown' && row.status === 'done') {
      getDb()
        .prepare(
          `UPDATE trackers SET status = 'idle', elapsed_ms = 0, started_at = NULL WHERE id = ?`
        )
        .run(id);
    }
    getDb()
      .prepare(
        `UPDATE trackers SET status = 'running', started_at = ? WHERE id = ?`
      )
      .run(new Date().toISOString(), id);
    return getTracker(id);
  } catch (err) {
    logError('timerStart', err);
    throw err;
  }
}

function timerPause(id) {
  try {
    const row = getDb().prepare('SELECT * FROM trackers WHERE id = ?').get(id);
    if (!row) throw new Error('Tracker not found');
    if (row.status !== 'running') return getTracker(id);
    const elapsed = liveElapsedMs(row);
    if (row.kind === 'countdown') {
      const dur = Number(parseJson(row.config_json).duration_ms) || 0;
      // Slack so a renderer tick slightly ahead of main still completes.
      if (elapsed >= dur - 250) return completeCountdown(id);
    }
    getDb()
      .prepare(
        `UPDATE trackers SET status = 'paused', elapsed_ms = ?, started_at = NULL WHERE id = ?`
      )
      .run(elapsed, id);
    return getTracker(id);
  } catch (err) {
    logError('timerPause', err);
    throw err;
  }
}

function timerReset(id) {
  try {
    const row = getDb().prepare('SELECT * FROM trackers WHERE id = ?').get(id);
    if (!row) throw new Error('Tracker not found');
    if (!TIMER_KINDS.has(row.kind)) throw new Error('Not a timer tracker');
    getDb()
      .prepare(
        `UPDATE trackers SET status = 'idle', elapsed_ms = 0, started_at = NULL WHERE id = ?`
      )
      .run(id);
    return getTracker(id);
  } catch (err) {
    logError('timerReset', err);
    throw err;
  }
}

/**
 * Wipe logs and timer progress. Keeps the tracker and created_at.
 * @param {number} id
 */
function resetTracker(id) {
  try {
    const db = getDb();
    const row = db.prepare('SELECT * FROM trackers WHERE id = ?').get(id);
    if (!row) throw new Error('Tracker not found');
    db.prepare('DELETE FROM tracker_logs WHERE tracker_id = ?').run(id);
    if (TIMER_KINDS.has(row.kind)) {
      db.prepare(
        `UPDATE trackers SET status = 'idle', elapsed_ms = 0, started_at = NULL WHERE id = ?`
      ).run(id);
    }
    return getTracker(id);
  } catch (err) {
    logError('resetTracker', err);
    throw err;
  }
}

/**
 * Count/scale/mood/energy with no log in the current period (not as_needed, not timers).
 */
function listDueThisPeriod() {
  try {
    return listTrackers().filter(
      (t) =>
        LOG_KINDS.has(t.kind) &&
        t.period !== 'as_needed' &&
        !t.logged_this_period
    );
  } catch (err) {
    logError('listDueThisPeriod', err);
    throw err;
  }
}

/**
 * Kit-ready popout payload — v1 is a one-element controls array.
 * @param {object} tracker enriched row
 */
function toPopoutPayload(tracker) {
  if (!tracker) return { controls: [] };
  return {
    controls: [
      {
        id: tracker.id,
        name: tracker.name,
        kind: tracker.kind,
        period: tracker.period,
        config: tracker.config,
        keep: tracker.keep,
        status: tracker.status,
        started_at: tracker.started_at,
        elapsed_ms: tracker.elapsed_ms,
        elapsed_live_ms: tracker.elapsed_live_ms,
        display_ms: tracker.display_ms,
        period_total: tracker.period_total,
        period_log_count: tracker.period_log_count,
        last_value: tracker.last_value,
        logged_this_period: tracker.logged_this_period,
        created_at: tracker.created_at,
      },
    ],
  };
}

module.exports = {
  KINDS,
  PERIODS,
  MOOD_FACES,
  ENERGY_FACES,
  LOG_KINDS,
  createTracker,
  getTracker,
  listTrackers,
  updateTracker,
  deleteTracker,
  deleteTrackers,
  logValue,
  undoLastLog,
  timerStart,
  timerPause,
  timerReset,
  resetTracker,
  completeCountdown,
  settleExpiredCountdowns,
  hasRunningCountdowns,
  listDueThisPeriod,
  toPopoutPayload,
  normalizeConfig,
  liveElapsedMs,
  liveDisplayMs,
};
