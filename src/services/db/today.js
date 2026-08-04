/**
 * Aggregate Today pane data for Compact CenterBrief.
 */
const { getDb } = require('../../main/database');
const { getItemTagNames } = require('./tags');
const { startOfDay, endOfDay, addDays } = require('./reminders');
const { listHabitsDueToday } = require('./habits');
const { listBillsForBrief } = require('./bills');
const { listEventsToday } = require('./events');
const { getMoneySnapshot } = require('./transactions');

function enrichTask(row) {
  return { ...row, tags: getItemTagNames('task', row.id), item_type: 'task' };
}

function enrichRem(row) {
  return { ...row, tags: getItemTagNames('reminder', row.id), item_type: 'reminder' };
}

/** Build Compact brief payload. */
function getTodayBrief() {
  const db = getDb();
  const todayStart = startOfDay().toISOString();
  const todayEnd = endOfDay().toISOString();
  const tomStart = startOfDay(addDays(new Date(), 1)).toISOString();
  const tomEnd = endOfDay(addDays(new Date(), 1)).toISOString();

  const dueTasks = db
    .prepare(
      `SELECT * FROM tasks
       WHERE archived = 0 AND completed_at IS NULL
         AND due_datetime IS NOT NULL
         AND datetime(due_datetime) >= datetime(?)
         AND datetime(due_datetime) <= datetime(?)
       ORDER BY COALESCE(priority, 3) ASC, due_datetime ASC`
    )
    .all(todayStart, todayEnd)
    .map(enrichTask);

  // Active todo_24 items (may be overdue until auditor retags expired)
  const todo24 = db
    .prepare(
      `SELECT DISTINCT t.* FROM tasks t
       JOIN item_tags it ON it.item_id = t.id AND it.item_type = 'task'
       JOIN tags g ON g.id = it.tag_id AND g.name = 'todo_24'
       WHERE t.archived = 0 AND t.completed_at IS NULL
       ORDER BY COALESCE(t.priority, 3) ASC, t.due_datetime IS NULL, t.due_datetime ASC`
    )
    .all()
    .map(enrichTask);

  const seen = new Set();
  const tasksUnique = [];
  for (const t of [...dueTasks, ...todo24]) {
    if (seen.has(t.id)) continue;
    if (t.tags.includes('todo_expired')) continue;
    const due = t.due_datetime ? new Date(t.due_datetime) : null;
    if (due && due > endOfDay()) continue;
    seen.add(t.id);
    tasksUnique.push(t);
  }
  tasksUnique.sort(
    (a, b) =>
      (a.priority ?? 3) - (b.priority ?? 3) ||
      String(a.due_datetime || '').localeCompare(String(b.due_datetime || ''))
  );

  const expiredTasks = db
    .prepare(
      `SELECT DISTINCT t.* FROM tasks t
       JOIN item_tags it ON it.item_id = t.id AND it.item_type = 'task'
       JOIN tags g ON g.id = it.tag_id AND g.name = 'todo_expired'
       WHERE t.archived = 0 AND t.completed_at IS NULL
       ORDER BY t.due_datetime ASC`
    )
    .all()
    .map(enrichTask);

  const remindersToday = db
    .prepare(
      `SELECT * FROM reminders
       WHERE archived = 0 AND completed_at IS NULL
         AND datetime < '9999-01-01'
         AND datetime(datetime) >= datetime(?)
         AND datetime(datetime) <= datetime(?)
       ORDER BY datetime ASC`
    )
    .all(todayStart, todayEnd)
    .map(enrichRem);

  const remindersTomorrow = db
    .prepare(
      `SELECT * FROM reminders
       WHERE archived = 0 AND completed_at IS NULL
         AND datetime < '9999-01-01'
         AND datetime(datetime) >= datetime(?)
         AND datetime(datetime) <= datetime(?)
       ORDER BY datetime ASC`
    )
    .all(tomStart, tomEnd)
    .map(enrichRem);

  const ignored = db
    .prepare(
      `SELECT DISTINCT r.* FROM reminders r
       JOIN item_tags it ON it.item_id = r.id AND it.item_type = 'reminder'
       JOIN tags g ON g.id = it.tag_id AND g.name = 'rem_ignored'
       WHERE r.archived = 0 AND r.completed_at IS NULL
       ORDER BY r.datetime ASC`
    )
    .all()
    .map(enrichRem);

  const { billsDueToday, billsOverdue } = listBillsForBrief();
  const { moneyToday, moneyMtd } = getMoneySnapshot();

  return {
    tasksDueToday: tasksUnique,
    expiredTasks,
    remindersToday,
    remindersTomorrow,
    ignoredReminders: ignored,
    habitsToday: listHabitsDueToday(),
    billsDueToday,
    billsOverdue,
    eventsToday: listEventsToday(),
    moneyToday,
    moneyMtd,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { getTodayBrief };
