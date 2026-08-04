/**
 * Habits CRUD, daily check-ins, streaks, nudge alerts.
 */
const { getDb } = require('../../main/database');
const { logError } = require('../../main/logger');
const { addDays } = require('./reminders');

const FREQUENCIES = ['daily', 'weekdays', 'custom'];

/** Local YYYY-MM-DD for a Date. */
function dateKey(d = new Date()) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** True if habit is due on the given local date. */
function isDueOn(habit, d = new Date()) {
  const freq = habit.frequency || 'daily';
  if (freq === 'daily' || freq === 'custom') return true;
  if (freq === 'weekdays') {
    const day = d.getDay();
    return day >= 1 && day <= 5;
  }
  return true;
}

function enrich(row, { date = dateKey() } = {}) {
  if (!row) return null;
  const log = getDb()
    .prepare(
      'SELECT completed FROM habit_logs WHERE habit_id = ? AND date = ?'
    )
    .get(row.id, date);
  return {
    ...row,
    completed_today: Boolean(log?.completed),
    streak: getStreak(row.id),
  };
}

/** Create habit. frequency: daily | weekdays | custom. */
function createHabit({ name, frequency = 'daily', color = null, nudge_time = null }) {
  try {
    if (!name?.trim()) throw new Error('Name required');
    if (!FREQUENCIES.includes(frequency)) {
      throw new Error('frequency must be daily, weekdays, or custom');
    }
    const nudge = nudge_time && /^\d{2}:\d{2}$/.test(nudge_time) ? nudge_time : null;
    const info = getDb()
      .prepare(
        `INSERT INTO habits (name, frequency, color, nudge_time)
         VALUES (?, ?, ?, ?)`
      )
      .run(name.trim(), frequency, color, nudge);
    return getHabit(Number(info.lastInsertRowid));
  } catch (err) {
    logError('createHabit', err);
    throw err;
  }
}

function getHabit(id) {
  const row = getDb().prepare('SELECT * FROM habits WHERE id = ?').get(id);
  return enrich(row);
}

/** List habits with today's check-in + streak. */
function listHabits() {
  try {
    const rows = getDb()
      .prepare('SELECT * FROM habits ORDER BY name COLLATE NOCASE ASC')
      .all();
    return rows.map((r) => enrich(r));
  } catch (err) {
    logError('listHabits', err);
    throw err;
  }
}

/** Habits due today (for brief strip). */
function listHabitsDueToday() {
  try {
    const today = new Date();
    return listHabits().filter((h) => isDueOn(h, today));
  } catch (err) {
    logError('listHabitsDueToday', err);
    throw err;
  }
}

function updateHabit(id, fields) {
  try {
    const cur = getDb().prepare('SELECT * FROM habits WHERE id = ?').get(id);
    if (!cur) throw new Error('Habit not found');
    const name = fields.name !== undefined ? String(fields.name).trim() : cur.name;
    if (!name) throw new Error('Name required');
    const frequency =
      fields.frequency !== undefined ? fields.frequency : cur.frequency;
    if (!FREQUENCIES.includes(frequency)) {
      throw new Error('frequency must be daily, weekdays, or custom');
    }
    const color = fields.color !== undefined ? fields.color : cur.color;
    let nudge = cur.nudge_time;
    if (fields.nudge_time !== undefined) {
      nudge =
        fields.nudge_time && /^\d{2}:\d{2}$/.test(fields.nudge_time)
          ? fields.nudge_time
          : null;
    }
    getDb()
      .prepare(
        `UPDATE habits SET name = ?, frequency = ?, color = ?, nudge_time = ?
         WHERE id = ?`
      )
      .run(name, frequency, color, nudge, id);
    // Reschedule nudge if time changed
    if (fields.nudge_time !== undefined) {
      getDb()
        .prepare(
          'UPDATE habits SET last_nudge_date = NULL, snooze_until = NULL WHERE id = ?'
        )
        .run(id);
    }
    return getHabit(id);
  } catch (err) {
    logError('updateHabit', err);
    throw err;
  }
}

function deleteHabit(id) {
  try {
    const db = getDb();
    db.prepare('DELETE FROM habit_logs WHERE habit_id = ?').run(id);
    db.prepare('DELETE FROM habits WHERE id = ?').run(id);
    return true;
  } catch (err) {
    logError('deleteHabit', err);
    throw err;
  }
}

/**
 * Toggle check-in for a date (default today).
 * @returns enriched habit
 */
function toggleCheckin(habitId, date = dateKey()) {
  try {
    const db = getDb();
    const habit = db.prepare('SELECT id FROM habits WHERE id = ?').get(habitId);
    if (!habit) throw new Error('Habit not found');
    const existing = db
      .prepare('SELECT id, completed FROM habit_logs WHERE habit_id = ? AND date = ?')
      .get(habitId, date);
    if (existing) {
      const next = existing.completed ? 0 : 1;
      db.prepare('UPDATE habit_logs SET completed = ? WHERE id = ?').run(
        next,
        existing.id
      );
    } else {
      db.prepare(
        'INSERT INTO habit_logs (habit_id, date, completed) VALUES (?, ?, 1)'
      ).run(habitId, date);
    }
    return getHabit(habitId);
  } catch (err) {
    logError('toggleCheckin', err);
    throw err;
  }
}

/** Mark today completed (notification Done). */
function markCheckin(habitId, date = dateKey()) {
  try {
    const db = getDb();
    const existing = db
      .prepare('SELECT id FROM habit_logs WHERE habit_id = ? AND date = ?')
      .get(habitId, date);
    if (existing) {
      db.prepare('UPDATE habit_logs SET completed = 1 WHERE id = ?').run(existing.id);
    } else {
      db.prepare(
        'INSERT INTO habit_logs (habit_id, date, completed) VALUES (?, ?, 1)'
      ).run(habitId, date);
    }
    return getHabit(habitId);
  } catch (err) {
    logError('markCheckin', err);
    throw err;
  }
}

/**
 * Consecutive completed days ending at today (or yesterday if today open).
 */
function getStreak(habitId) {
  try {
    const logs = getDb()
      .prepare(
        `SELECT date, completed FROM habit_logs
         WHERE habit_id = ? AND completed = 1
         ORDER BY date DESC`
      )
      .all(habitId);
    if (!logs.length) return 0;
    const done = new Set(logs.map((l) => l.date));
    let cursor = new Date();
    // If today not done, start from yesterday
    if (!done.has(dateKey(cursor))) {
      cursor = addDays(cursor, -1);
    }
    let streak = 0;
    while (done.has(dateKey(cursor))) {
      streak += 1;
      cursor = addDays(cursor, -1);
    }
    return streak;
  } catch (err) {
    logError('getStreak', err);
    return 0;
  }
}

/** Habits whose nudge_time has arrived today and not yet nudged/completed. */
function listDueNudges() {
  try {
    const now = new Date();
    const today = dateKey(now);
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const nowHm = `${hh}:${mm}`;
    const rows = getDb()
      .prepare(
        `SELECT * FROM habits
         WHERE nudge_time IS NOT NULL
           AND (last_nudge_date IS NULL OR last_nudge_date < ?)
           AND (snooze_until IS NULL OR datetime(snooze_until) <= datetime('now'))`
      )
      .all(today);
    return rows
      .filter((h) => isDueOn(h, now) && h.nudge_time <= nowHm)
      .filter((h) => {
        const log = getDb()
          .prepare(
            'SELECT completed FROM habit_logs WHERE habit_id = ? AND date = ?'
          )
          .get(h.id, today);
        return !log?.completed;
      })
      .map((h) => ({ ...h, title: h.name }));
  } catch (err) {
    logError('listDueNudges', err);
    throw err;
  }
}

function markHabitNudged(id) {
  getDb()
    .prepare('UPDATE habits SET last_nudge_date = ? WHERE id = ?')
    .run(dateKey(), id);
}

/** X / ignore — skip nudge for today. */
function dismissHabitNudge(id) {
  try {
    markHabitNudged(id);
    return getHabit(id);
  } catch (err) {
    logError('dismissHabitNudge', err);
    throw err;
  }
}

function snoozeHabit(id, minutes = 10) {
  try {
    const until = new Date(Date.now() + Number(minutes) * 60 * 1000).toISOString();
    // Clear last_nudge so poll can re-fire after snooze
    getDb()
      .prepare(
        `UPDATE habits SET snooze_until = ?, last_nudge_date = NULL WHERE id = ?`
      )
      .run(until, id);
    return getHabit(id);
  } catch (err) {
    logError('snoozeHabit', err);
    throw err;
  }
}

module.exports = {
  createHabit,
  getHabit,
  listHabits,
  listHabitsDueToday,
  updateHabit,
  deleteHabit,
  toggleCheckin,
  markCheckin,
  getStreak,
  listDueNudges,
  markHabitNudged,
  dismissHabitNudge,
  snoozeHabit,
  dateKey,
  isDueOn,
  FREQUENCIES,
};
