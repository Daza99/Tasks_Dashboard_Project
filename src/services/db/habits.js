/**
 * Habits CRUD, daily check-ins, streaks, nudge alerts, tags, archive.
 */
const { getDb } = require('../../main/database');
const { logError } = require('../../main/logger');
const { addDays } = require('./reminders');
const {
  addTag,
  removeTag,
  getItemTagNames,
  hasTag,
  syncUserTags: syncItemUserTags,
  normalizeTagNames,
} = require('./tags');
const { clampPriority, DEFAULT_PRIORITY } = require('../../utils/priority.cjs');
const { uniqueTitleFor } = require('../../utils/unique-title.cjs');
const { normalizeHex } = require('../../utils/habit-color.cjs');

const FREQUENCIES = ['daily', '3day', 'weekly', 'fortnightly', 'monthly'];
const FREQ_ERROR =
  'frequency must be daily, 3day, weekly, fortnightly, or monthly';
/** System-managed habit tags — UI / exports. */
const HABIT_SYSTEM_TAGS = new Set(['nudge', 'archived']);

/** Local YYYY-MM-DD for a Date. */
function dateKey(d = new Date()) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Sync nudge system tag from nudge_time presence. */
function syncNudgeTag(habitId, nudgeTime) {
  if (nudgeTime) addTag('habit', habitId, 'nudge');
  else removeTag('habit', habitId, 'nudge');
}

/** Replace user tags; leave system tags (nudge/archived) alone. */
function syncUserTags(habitId, tags) {
  syncItemUserTags('habit', habitId, tags);
}

/** Local calendar day as UTC ms (date-only compare). */
function localDayMs(d) {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

/** created_at as a local Date at midnight; fallback to `d`. */
function createdLocalDate(habit, d = new Date()) {
  const created = habit.created_at ? new Date(habit.created_at) : d;
  if (Number.isNaN(created.getTime())) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  return new Date(created.getFullYear(), created.getMonth(), created.getDate());
}

/** True if habit is due on the given local date. */
function isDueOn(habit, d = new Date()) {
  const freq = habit.frequency || 'daily';
  if (freq === 'daily') return true;
  // every 3 / 14 calendar days from created_at’s local date
  if (freq === '3day' || freq === 'fortnightly') {
    const start = createdLocalDate(habit, d);
    const step = freq === 'fortnightly' ? 14 : 3;
    const diff = Math.floor((localDayMs(d) - localDayMs(start)) / 86400000);
    return diff >= 0 && diff % step === 0;
  }
  // weekly ≈ former weekdays (Mon–Fri)
  if (freq === 'weekly' || freq === 'weekdays') {
    const day = d.getDay();
    return day >= 1 && day <= 5;
  }
  // monthly: anniversary of created_at day-of-month (clamp short months)
  if (freq === 'monthly' || freq === 'custom') {
    const created = habit.created_at ? new Date(habit.created_at) : null;
    const dom =
      created && !Number.isNaN(created.getTime()) ? created.getDate() : 1;
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return d.getDate() === Math.min(dom, last);
  }
  return true;
}

/** HH:mm or null. */
function normalizeNudgeTime(value) {
  return value && /^\d{2}:\d{2}$/.test(value) ? value : null;
}

/** Recurring ping: custom = due day; day_before = calendar day before due. */
function normalizeNudgeMode(mode, nudgeTime) {
  if (!nudgeTime) return null;
  return mode === 'day_before' ? 'day_before' : 'custom';
}

/** Trimmed category or null (Uncategorized). */
function normalizeCategory(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

/** Previous due local date strictly before `d`, or null before created_at. */
function prevDueDate(habit, d) {
  const start = createdLocalDate(habit, d);
  let c = addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -1);
  while (localDayMs(c) >= localDayMs(start) && !isDueOn(habit, c)) {
    c = addDays(c, -1);
  }
  return localDayMs(c) >= localDayMs(start) ? c : null;
}

/** Next due local Date on or after `d` (inclusive if due that day). */
function nextDueDate(habit, d = new Date()) {
  const start = createdLocalDate(habit, d);
  let c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (localDayMs(c) < localDayMs(start)) c = new Date(start);
  for (let i = 0; i < 400; i += 1) {
    if (isDueOn(habit, c)) return c;
    c = addDays(c, 1);
  }
  return c;
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
    tags: getItemTagNames('habit', row.id),
    completed_today: Boolean(log?.completed),
    streak: getStreak(row.id),
    show_on_calendar: Number(row.show_on_calendar) !== 0 ? 1 : 0,
    next_due_date: dateKey(nextDueDate(row)),
    nudge_mode: row.nudge_time
      ? row.nudge_mode === 'day_before'
        ? 'day_before'
        : 'custom'
      : null,
  };
}

/**
 * Create habit.
 * @param {{ name: string, frequency?: string, color?: string|null, nudge_time?: string|null, nudge_mode?: string|null, category?: string|null, tags?: string[]|string, description?: string|null, priority?: number, show_on_calendar?: boolean|number }} data
 */
function createHabit({
  name,
  frequency = 'daily',
  color = null,
  nudge_time = null,
  nudge_mode = null,
  category = null,
  tags = undefined,
  description = null,
  priority = DEFAULT_PRIORITY,
  show_on_calendar = 0,
}) {
  try {
    const habitName = uniqueTitleFor('habit', name);
    if (!FREQUENCIES.includes(frequency)) {
      throw new Error(FREQ_ERROR);
    }
    const nudge = normalizeNudgeTime(nudge_time);
    const mode = normalizeNudgeMode(nudge_mode, nudge);
    const cat = normalizeCategory(category);
    if (cat) createHabitCategory(cat);
    const details = description != null ? String(description).trim() || null : null;
    const prio = clampPriority(priority);
    const onCal = show_on_calendar ? 1 : 0;
    const colorHex = normalizeHex(color); // invalid/empty → theme orange fallback
    const info = getDb()
      .prepare(
        `INSERT INTO habits (name, frequency, color, nudge_time, nudge_mode, category,
           description, priority, show_on_calendar)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(habitName, frequency, colorHex, nudge, mode, cat, details, prio, onCal);
    const id = Number(info.lastInsertRowid);
    syncNudgeTag(id, nudge);
    if (tags !== undefined) syncUserTags(id, tags);
    const row = getHabit(id);
    require('./calendar-sync').syncHabit(row);
    return row;
  } catch (err) {
    logError('createHabit', err);
    throw err;
  }
}

function getHabit(id) {
  const row = getDb().prepare('SELECT * FROM habits WHERE id = ?').get(id);
  return enrich(row);
}

/**
 * List habits with today's check-in + streak + tags.
 * @param {{ archived?: boolean }} opts — false = active only; true = archived only
 */
function listHabits({ archived = false } = {}) {
  try {
    const rows = getDb()
      .prepare(
        `SELECT * FROM habits
         ORDER BY COALESCE(priority, 3) ASC, name COLLATE NOCASE ASC`
      )
      .all();
    return rows
      .map((r) => enrich(r))
      .filter((h) => {
        const isArch = (h.tags || []).includes('archived');
        return archived ? isArch : !isArch;
      });
  } catch (err) {
    logError('listHabits', err);
    throw err;
  }
}

/** Habits due today (for brief strip) — active only. */
function listHabitsDueToday() {
  try {
    const today = new Date();
    return listHabits({ archived: false }).filter((h) => isDueOn(h, today));
  } catch (err) {
    logError('listHabitsDueToday', err);
    throw err;
  }
}

function updateHabit(id, fields) {
  try {
    const cur = getDb().prepare('SELECT * FROM habits WHERE id = ?').get(id);
    if (!cur) throw new Error('Habit not found');
    const name =
      fields.name !== undefined
        ? uniqueTitleFor('habit', fields.name, id)
        : cur.name;
    const frequency =
      fields.frequency !== undefined ? fields.frequency : cur.frequency;
    if (!FREQUENCIES.includes(frequency)) {
      throw new Error(FREQ_ERROR);
    }
    const color =
      fields.color !== undefined ? normalizeHex(fields.color) : cur.color;
    let nudge = cur.nudge_time;
    if (fields.nudge_time !== undefined) {
      nudge = normalizeNudgeTime(fields.nudge_time);
    }
    let mode = cur.nudge_mode;
    if (fields.nudge_mode !== undefined || fields.nudge_time !== undefined) {
      const rawMode =
        fields.nudge_mode !== undefined ? fields.nudge_mode : cur.nudge_mode;
      mode = normalizeNudgeMode(rawMode, nudge);
    } else {
      mode = normalizeNudgeMode(cur.nudge_mode, nudge);
    }
    let category = cur.category;
    if (fields.category !== undefined) {
      category = normalizeCategory(fields.category);
      if (category) createHabitCategory(category);
    }
    const description =
      fields.description !== undefined
        ? String(fields.description || '').trim() || null
        : cur.description;
    const priority =
      fields.priority !== undefined
        ? clampPriority(fields.priority)
        : clampPriority(cur.priority);
    const show_on_calendar =
      fields.show_on_calendar !== undefined
        ? fields.show_on_calendar
          ? 1
          : 0
        : Number(cur.show_on_calendar) !== 0
          ? 1
          : 0;
    getDb()
      .prepare(
        `UPDATE habits SET name = ?, frequency = ?, color = ?, nudge_time = ?,
         nudge_mode = ?, category = ?, description = ?, priority = ?, show_on_calendar = ?
         WHERE id = ?`
      )
      .run(
        name,
        frequency,
        color,
        nudge,
        mode,
        category,
        description,
        priority,
        show_on_calendar,
        id
      );
    // Reschedule nudge if time or mode changed
    if (fields.nudge_time !== undefined || fields.nudge_mode !== undefined) {
      getDb()
        .prepare(
          'UPDATE habits SET last_nudge_date = NULL, snooze_until = NULL WHERE id = ?'
        )
        .run(id);
    }
    syncNudgeTag(id, nudge);
    if (fields.tags !== undefined) syncUserTags(id, fields.tags);
    const row = getHabit(id);
    require('./calendar-sync').syncHabit(row);
    return row;
  } catch (err) {
    logError('updateHabit', err);
    throw err;
  }
}

function deleteHabit(id) {
  try {
    require('./calendar-sync').deleteEventsForSource('habit', id);
    const db = getDb();
    db.prepare(
      `DELETE FROM item_tags WHERE item_type = 'habit' AND item_id = ?`
    ).run(id);
    db.prepare('DELETE FROM habit_logs WHERE habit_id = ?').run(id);
    db.prepare('DELETE FROM habits WHERE id = ?').run(id);
    return true;
  } catch (err) {
    logError('deleteHabit', err);
    throw err;
  }
}

function uniqPositiveIds(ids) {
  return [...new Set((ids || []).map(Number).filter((n) => Number.isFinite(n) && n > 0))];
}

/**
 * Bulk-delete habits (tags, logs, calendar events) in one transaction.
 * @param {number[]} ids
 * @returns {number} how many were deleted
 */
function deleteHabits(ids) {
  try {
    const list = uniqPositiveIds(ids);
    if (!list.length) return 0;
    const db = getDb();
    const delTags = db.prepare(
      `DELETE FROM item_tags WHERE item_type = 'habit' AND item_id = ?`
    );
    const delLogs = db.prepare('DELETE FROM habit_logs WHERE habit_id = ?');
    const delRow = db.prepare('DELETE FROM habits WHERE id = ?');
    const run = db.transaction((idList) => {
      let n = 0;
      for (const id of idList) {
        require('./calendar-sync').deleteEventsForSource('habit', id);
        delTags.run(id);
        delLogs.run(id);
        const r = delRow.run(id);
        if (r.changes) n += 1;
      }
      return n;
    });
    return run(list);
  } catch (err) {
    logError('deleteHabits', err);
    throw err;
  }
}

/** Shelve habit — adds #archived; excluded from active list / nudges. */
function archiveHabit(id) {
  try {
    const found = getDb().prepare('SELECT id FROM habits WHERE id = ?').get(id);
    if (!found) throw new Error('Habit not found');
    addTag('habit', id, 'archived');
    const row = getHabit(id);
    require('./calendar-sync').syncHabit(row);
    return row;
  } catch (err) {
    logError('archiveHabit', err);
    throw err;
  }
}

/** Restore habit — removes #archived. */
function activateHabit(id) {
  try {
    const found = getDb().prepare('SELECT id FROM habits WHERE id = ?').get(id);
    if (!found) throw new Error('Habit not found');
    removeTag('habit', id, 'archived');
    const row = getHabit(id);
    require('./calendar-sync').syncHabit(row);
    return row;
  } catch (err) {
    logError('activateHabit', err);
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
      .prepare(
        'SELECT id, completed FROM habit_logs WHERE habit_id = ? AND date = ?'
      )
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
      db.prepare('UPDATE habit_logs SET completed = 1 WHERE id = ?').run(
        existing.id
      );
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
    const habit = getDb().prepare('SELECT * FROM habits WHERE id = ?').get(habitId);
    if (!habit) return 0;
    const logs = getDb()
      .prepare(
        `SELECT date, completed FROM habit_logs
         WHERE habit_id = ? AND completed = 1
         ORDER BY date DESC`
      )
      .all(habitId);
    if (!logs.length) return 0;
    const done = new Set(logs.map((l) => l.date));
    // 3-day / fortnightly: consecutive due occurrences, not every calendar day
    if (habit.frequency === '3day' || habit.frequency === 'fortnightly') {
      const startMs = localDayMs(createdLocalDate(habit));
      const today = new Date();
      let due = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      while (localDayMs(due) >= startMs && !isDueOn(habit, due)) {
        due = addDays(due, -1);
      }
      if (localDayMs(due) < startMs) return 0;
      if (!done.has(dateKey(due))) {
        due = prevDueDate(habit, due);
        if (!due) return 0;
      }
      let streak = 0;
      while (due && done.has(dateKey(due))) {
        streak += 1;
        due = prevDueDate(habit, due);
      }
      return streak;
    }
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
    const tomorrow = addDays(
      new Date(now.getFullYear(), now.getMonth(), now.getDate()),
      1
    );
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
      .filter((h) => !hasTag('habit', h.id, 'archived'))
      .filter((h) => h.nudge_time <= nowHm)
      .filter((h) => {
        const mode = h.nudge_mode === 'day_before' ? 'day_before' : 'custom';
        if (mode === 'day_before') return isDueOn(h, tomorrow);
        if (!isDueOn(h, now)) return false;
        const log = getDb()
          .prepare(
            'SELECT completed FROM habit_logs WHERE habit_id = ? AND date = ?'
          )
          .get(h.id, today);
        return !log?.completed;
      })
      .map((h) => ({
        ...h,
        title: h.name,
        tags: getItemTagNames('habit', h.id),
      }));
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
    const until = new Date(
      Date.now() + Number(minutes) * 60 * 1000
    ).toISOString();
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

/** Category names for dropdowns, A–Z. */
function listHabitCategories() {
  try {
    return getDb()
      .prepare('SELECT name FROM habit_categories ORDER BY name COLLATE NOCASE ASC')
      .all()
      .map((r) => r.name);
  } catch (err) {
    logError('listHabitCategories', err);
    throw err;
  }
}

/**
 * Insert a category name if missing.
 * @param {string} name
 * @returns {string} trimmed name
 */
function createHabitCategory(name) {
  try {
    const trimmed = String(name || '').trim();
    if (!trimmed) throw new Error('Category name required');
    getDb()
      .prepare('INSERT OR IGNORE INTO habit_categories (name) VALUES (?)')
      .run(trimmed);
    return trimmed;
  } catch (err) {
    logError('createHabitCategory', err);
    throw err;
  }
}

/** Exact-name row from the catalog, or null. */
function getHabitCategoryExact(db, name) {
  return db.prepare('SELECT name FROM habit_categories WHERE name = ?').get(name) || null;
}

/**
 * How many habits use this exact category string.
 * @param {string} name
 * @returns {number}
 */
function countHabitsWithCategory(name) {
  try {
    const src = String(name || '').trim();
    if (!src) return 0;
    const row = getDb()
      .prepare('SELECT COUNT(*) AS n FROM habits WHERE category = ?')
      .get(src);
    return Number(row?.n) || 0;
  } catch (err) {
    logError('countHabitsWithCategory', err);
    throw err;
  }
}

/**
 * Rename a catalog row and retag matching habits. NOCASE collision → use Merge.
 * @param {string} from
 * @param {string} to
 * @returns {{ from: string, to: string, renamed: number }}
 */
function renameHabitCategory(from, to) {
  try {
    const src = String(from || '').trim();
    const dest = String(to || '').trim();
    if (!src || !dest) throw new Error('Category name required');
    const db = getDb();
    if (!getHabitCategoryExact(db, src)) throw new Error('Category not found');
    if (dest === src) return { from: src, to: dest, renamed: 0 };

    const clash = db
      .prepare(
        'SELECT name FROM habit_categories WHERE name = ? COLLATE NOCASE AND name != ?'
      )
      .get(dest, src);
    if (clash) {
      throw new Error(`A category named "${clash.name}" already exists. Use Merge.`);
    }

    const run = db.transaction(() => {
      const habits = db
        .prepare('UPDATE habits SET category = ? WHERE category = ?')
        .run(dest, src);
      db.prepare('UPDATE habit_categories SET name = ? WHERE name = ?').run(dest, src);
      return habits.changes;
    });
    return { from: src, to: dest, renamed: run() };
  } catch (err) {
    logError('renameHabitCategory', err);
    throw err;
  }
}

/**
 * Drop a catalog row; habits using it become Uncategorized.
 * @param {string} name
 * @returns {{ name: string, uncategorized: number }}
 */
function deleteHabitCategory(name) {
  try {
    const src = String(name || '').trim();
    if (!src) throw new Error('Category name required');
    const db = getDb();
    if (!getHabitCategoryExact(db, src)) throw new Error('Category not found');

    const run = db.transaction(() => {
      const habits = db
        .prepare('UPDATE habits SET category = NULL WHERE category = ?')
        .run(src);
      db.prepare('DELETE FROM habit_categories WHERE name = ?').run(src);
      return habits.changes;
    });
    return { name: src, uncategorized: run() };
  } catch (err) {
    logError('deleteHabitCategory', err);
    throw err;
  }
}

/**
 * Move habits from mergeAway onto keep, then delete mergeAway from the catalog.
 * @param {string} keep
 * @param {string} mergeAway
 * @returns {{ keep: string, mergeAway: string, moved: number }}
 */
function mergeHabitCategories(keep, mergeAway) {
  try {
    const keepName = String(keep || '').trim();
    const awayName = String(mergeAway || '').trim();
    if (!keepName || !awayName) throw new Error('Keep and Merge away are required');
    if (keepName === awayName) throw new Error('Keep and Merge away must differ');
    const db = getDb();
    if (!getHabitCategoryExact(db, keepName)) throw new Error('Keep category not found');
    if (!getHabitCategoryExact(db, awayName)) {
      throw new Error('Merge away category not found');
    }

    const run = db.transaction(() => {
      const habits = db
        .prepare('UPDATE habits SET category = ? WHERE category = ?')
        .run(keepName, awayName);
      db.prepare('DELETE FROM habit_categories WHERE name = ?').run(awayName);
      return habits.changes;
    });
    return { keep: keepName, mergeAway: awayName, moved: run() };
  } catch (err) {
    logError('mergeHabitCategories', err);
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
  deleteHabits,
  archiveHabit,
  activateHabit,
  toggleCheckin,
  markCheckin,
  getStreak,
  listDueNudges,
  markHabitNudged,
  dismissHabitNudge,
  snoozeHabit,
  dateKey,
  isDueOn,
  nextDueDate,
  normalizeTagNames,
  listHabitCategories,
  createHabitCategory,
  countHabitsWithCategory,
  renameHabitCategory,
  deleteHabitCategory,
  mergeHabitCategories,
  FREQUENCIES,
  HABIT_SYSTEM_TAGS,
};
