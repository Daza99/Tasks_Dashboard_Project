/**
 * Aggregate Today pane + Compact This Week data for CenterBrief / Today Focus.
 */
const { getDb } = require('../../main/database');
const { getItemTagNames } = require('./tags');
const { startOfDay, endOfDay, addDays } = require('./reminders');
const { listHabitsDueToday, dateKey } = require('./habits');
const { listBillsForBrief, listBillsForWeekBrief } = require('./bills');
const { getMoneySnapshot } = require('./transactions');

function enrichTask(row) {
  return { ...row, tags: getItemTagNames('task', row.id), item_type: 'task' };
}

function enrichRem(row) {
  return { ...row, tags: getItemTagNames('reminder', row.id), item_type: 'reminder' };
}

/** Local Monday 00:00 of the calendar week containing d. */
function startOfWeekMonday(d = new Date()) {
  const x = startOfDay(d);
  const day = x.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + offset);
  return x;
}

/** Local Sunday 23:59:59.999 of the calendar week containing d. */
function endOfWeekSunday(d = new Date()) {
  return endOfDay(addDays(startOfWeekMonday(d), 6));
}

/** Build Compact week brief + today-scoped fields for Today Focus. */
function getTodayBrief() {
  const db = getDb();
  const todayStart = startOfDay().toISOString();
  const todayEnd = endOfDay().toISOString();
  const weekStart = startOfWeekMonday();
  const weekEnd = endOfWeekSunday();
  const weekStartIso = weekStart.toISOString();
  const weekEndIso = weekEnd.toISOString();
  const weekStartKey = dateKey(weekStart);
  const weekEndKey = dateKey(weekEnd);

  const tasksThisWeek = db
    .prepare(
      `SELECT * FROM tasks t
       WHERE t.archived = 0 AND t.completed_at IS NULL
         AND (t.container IS NULL OR t.container = 'active')
         AND t.due_datetime IS NOT NULL
         AND datetime(t.due_datetime) >= datetime(?)
         AND datetime(t.due_datetime) <= datetime(?)
         AND NOT EXISTS (
           SELECT 1 FROM item_tags it
           JOIN tags g ON g.id = it.tag_id AND g.name = 'todo_expired'
           WHERE it.item_id = t.id AND it.item_type = 'task'
         )
       ORDER BY COALESCE(t.priority, 3) ASC, t.due_datetime ASC`
    )
    .all(weekStartIso, weekEndIso)
    .map(enrichTask);

  const remindersThisWeek = db
    .prepare(
      `SELECT * FROM reminders r
       WHERE r.archived = 0 AND r.completed_at IS NULL
         AND (r.container IS NULL OR r.container = 'active')
         AND r.datetime < '9999-01-01'
         AND datetime(r.datetime) >= datetime(?)
         AND datetime(r.datetime) <= datetime(?)
         AND NOT EXISTS (
           SELECT 1 FROM item_tags it
           JOIN tags g ON g.id = it.tag_id AND g.name = 'rem_ignored'
           WHERE it.item_id = r.id AND it.item_type = 'reminder'
         )
       ORDER BY r.datetime ASC`
    )
    .all(weekStartIso, weekEndIso)
    .map(enrichRem);

  const tasksToday = db
    .prepare(
      `SELECT * FROM tasks t
       WHERE t.archived = 0 AND t.completed_at IS NULL
         AND (t.container IS NULL OR t.container = 'active')
         AND t.due_datetime IS NOT NULL
         AND datetime(t.due_datetime) <= datetime(?)
         AND NOT EXISTS (
           SELECT 1 FROM item_tags it
           JOIN tags g ON g.id = it.tag_id AND g.name = 'todo_expired'
           WHERE it.item_id = t.id AND it.item_type = 'task'
         )
       ORDER BY datetime(t.due_datetime) ASC, COALESCE(t.priority, 3) ASC`
    )
    .all(todayEnd)
    .map(enrichTask);

  const remindersToday = db
    .prepare(
      `SELECT * FROM reminders
       WHERE archived = 0 AND completed_at IS NULL
         AND (container IS NULL OR container = 'active')
         AND datetime < '9999-01-01'
         AND datetime(datetime) >= datetime(?)
         AND datetime(datetime) <= datetime(?)
       ORDER BY datetime ASC`
    )
    .all(todayStart, todayEnd)
    .map(enrichRem);

  const expiredTasks = db
    .prepare(
      `SELECT DISTINCT t.* FROM tasks t
       JOIN item_tags it ON it.item_id = t.id AND it.item_type = 'task'
       JOIN tags g ON g.id = it.tag_id AND g.name = 'todo_expired'
       WHERE t.archived = 0 AND t.completed_at IS NULL
         AND (t.container IS NULL OR t.container = 'active')
         AND t.due_datetime IS NOT NULL
         AND datetime(t.due_datetime) >= datetime(?)
         AND datetime(t.due_datetime) <= datetime(?)
       ORDER BY t.due_datetime ASC`
    )
    .all(weekStartIso, weekEndIso)
    .map(enrichTask);

  const ignoredThisWeek = db
    .prepare(
      `SELECT DISTINCT r.* FROM reminders r
       JOIN item_tags it ON it.item_id = r.id AND it.item_type = 'reminder'
       JOIN tags g ON g.id = it.tag_id AND g.name = 'rem_ignored'
       WHERE r.archived = 0 AND r.completed_at IS NULL
         AND (r.container IS NULL OR r.container = 'active')
         AND datetime(r.datetime) >= datetime(?)
         AND datetime(r.datetime) <= datetime(?)
       ORDER BY r.datetime ASC`
    )
    .all(weekStartIso, weekEndIso)
    .map(enrichRem);

  const expiredItems = [...expiredTasks, ...ignoredThisWeek].sort((a, b) => {
    const aWhen = a.due_datetime || a.datetime || '';
    const bWhen = b.due_datetime || b.datetime || '';
    return String(aWhen).localeCompare(String(bWhen));
  });

  const { billsDueToday } = listBillsForBrief();
  const { billsDueThisWeek, billsOverdue } = listBillsForWeekBrief(
    weekStartKey,
    weekEndKey
  );
  const { moneyToday, moneyMtd } = getMoneySnapshot();

  return {
    tasksThisWeek,
    tasksToday,
    remindersThisWeek,
    remindersToday,
    expiredItems,
    habitsToday: listHabitsDueToday(),
    billsDueToday,
    billsDueThisWeek,
    billsOverdue,
    moneyToday,
    moneyMtd,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { getTodayBrief };
