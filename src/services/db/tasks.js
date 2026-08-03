/**
 * Tasks CRUD + lifecycle tags (todo_24 / todo_open / completed / expired).
 */
const { getDb } = require('../../main/database');
const { logError } = require('../../main/logger');
const {
  addTag,
  replaceTags,
  getItemTagNames,
  hasTag,
} = require('./tags');

const TASK_LIFECYCLE = [
  'todo_24',
  'todo_open',
  'todo_completed',
  'todo_expired',
];

/** Clamp priority to blueprint range 1–5 (1 = highest). */
function clampPriority(value, fallback = 3) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(5, Math.max(1, Math.round(n)));
}

function enrich(row) {
  if (!row) return null;
  return { ...row, tags: getItemTagNames('task', row.id) };
}

/** Create task. kind must be todo_24 | todo_open. */
function createTask({ title, description = null, priority = 3, kind, due_datetime = null }) {
  try {
    if (!title?.trim()) throw new Error('Title required');
    if (kind !== 'todo_24' && kind !== 'todo_open') {
      throw new Error('kind must be todo_24 or todo_open');
    }
    const prio = clampPriority(priority);
    const db = getDb();
    let due = due_datetime;
    if (kind === 'todo_24' && !due) {
      due = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    }
    const info = db
      .prepare(
        `INSERT INTO tasks (title, description, priority, due_datetime)
         VALUES (?, ?, ?, ?)`
      )
      .run(title.trim(), description, prio, due);
    const id = Number(info.lastInsertRowid);
    addTag('task', id, kind);
    return getTask(id);
  } catch (err) {
    logError('createTask', err);
    throw err;
  }
}

function getTask(id) {
  const row = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  return enrich(row);
}

/** Active (non-archived, non-completed) tasks. Priority 1 = highest. */
function listTasks({ includeCompleted = false } = {}) {
  try {
    const rows = getDb()
      .prepare(
        `SELECT * FROM tasks
         WHERE archived = 0
         ${includeCompleted ? '' : 'AND completed_at IS NULL'}
         ORDER BY COALESCE(priority, 3) ASC,
                  due_datetime IS NULL, due_datetime ASC, created_at DESC`
      )
      .all();
    return rows.map(enrich);
  } catch (err) {
    logError('listTasks', err);
    throw err;
  }
}

function updateTask(id, fields) {
  try {
    const allowed = ['title', 'description', 'priority', 'due_datetime'];
    const sets = [];
    const vals = [];
    for (const key of allowed) {
      if (fields[key] !== undefined) {
        sets.push(`${key} = ?`);
        vals.push(key === 'priority' ? clampPriority(fields[key]) : fields[key]);
      }
    }
    const db = getDb();
    const tx = db.transaction(() => {
      if (sets.length) {
        vals.push(id);
        db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
      }
      // Optional kind swap among active lifecycle tags (not completed/expired)
      if (fields.kind === 'todo_24' || fields.kind === 'todo_open') {
        replaceTags('task', id, ['todo_24', 'todo_open', 'todo_expired'], fields.kind);
        if (fields.kind === 'todo_24' && fields.due_datetime === undefined) {
          const row = db.prepare('SELECT due_datetime FROM tasks WHERE id = ?').get(id);
          if (!row?.due_datetime) {
            const due = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
            db.prepare('UPDATE tasks SET due_datetime = ? WHERE id = ?').run(due, id);
          }
        }
      }
    });
    tx();
    return getTask(id);
  } catch (err) {
    logError('updateTask', err);
    throw err;
  }
}

function completeTask(id) {
  try {
    getDb()
      .prepare(
        `UPDATE tasks SET completed_at = CURRENT_TIMESTAMP WHERE id = ?`
      )
      .run(id);
    replaceTags('task', id, TASK_LIFECYCLE, 'todo_completed');
    return getTask(id);
  } catch (err) {
    logError('completeTask', err);
    throw err;
  }
}

function deleteTask(id) {
  try {
    if (hasTag('task', id, 'locked')) {
      throw new Error('Task is locked');
    }
    const db = getDb();
    const tx = db.transaction(() => {
      db.prepare(
        `DELETE FROM item_tags WHERE item_type = 'task' AND item_id = ?`
      ).run(id);
      db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    });
    tx();
    return true;
  } catch (err) {
    logError('deleteTask', err);
    throw err;
  }
}

/** Mark todo_24 items past due as todo_expired. Returns count. */
function expireStaleTodo24() {
  try {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT t.id FROM tasks t
         JOIN item_tags it ON it.item_id = t.id AND it.item_type = 'task'
         JOIN tags g ON g.id = it.tag_id AND g.name = 'todo_24'
         WHERE t.completed_at IS NULL AND t.archived = 0
           AND t.due_datetime IS NOT NULL
           AND datetime(t.due_datetime) <= datetime('now')`
      )
      .all();
    for (const row of rows) {
      replaceTags('task', row.id, TASK_LIFECYCLE, 'todo_expired');
    }
    return rows.length;
  } catch (err) {
    logError('expireStaleTodo24', err);
    throw err;
  }
}

module.exports = {
  createTask,
  getTask,
  listTasks,
  updateTask,
  completeTask,
  deleteTask,
  expireStaleTodo24,
  clampPriority,
  TASK_LIFECYCLE,
};
