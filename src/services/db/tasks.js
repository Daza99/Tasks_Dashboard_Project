/**
 * Tasks CRUD + lifecycle tags (todo_24 / todo_open / completed / expired).
 */
const { getDb } = require('../../main/database');
const { logError } = require('../../main/logger');
const {
  addTag,
  removeTag,
  replaceTags,
  getItemTagNames,
  hasTag,
} = require('./tags');
const { clampPriority } = require('../../utils/priority.cjs');
const { uniqueTitleFor } = require('../../utils/unique-title.cjs');

const TASK_LIFECYCLE = [
  'todo_24',
  'todo_open',
  'todo_completed',
  'todo_expired',
];

function enrich(row) {
  if (!row) return null;
  const tags = getItemTagNames('task', row.id);
  return {
    ...row,
    tags,
    item_type: 'task',
    locked: Number(row.locked) === 1 || tags.includes('locked'),
  };
}

/** Create task. kind must be todo_24 | todo_open. */
function createTask({ title, description = null, priority = 3, kind, due_datetime = null }) {
  try {
    const taskTitle = uniqueTitleFor('task', title);
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
      .run(taskTitle, description, prio, due);
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
           AND (container IS NULL OR container = 'active')
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
    const next = { ...fields };
    if (next.title !== undefined) next.title = uniqueTitleFor('task', next.title, id);
    const allowed = ['title', 'description', 'priority', 'due_datetime'];
    const sets = [];
    const vals = [];
    for (const key of allowed) {
      if (next[key] !== undefined) {
        sets.push(`${key} = ?`);
        vals.push(key === 'priority' ? clampPriority(next[key]) : next[key]);
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
      // Reschedule due → allow popup again; revive expired to todo_24
      if (fields.due_datetime !== undefined) {
        removeTag('task', id, 'todo_alerted');
        if (hasTag('task', id, 'todo_expired')) {
          replaceTags('task', id, TASK_LIFECYCLE, 'todo_24');
        }
      }
      if (fields.tags !== undefined) {
        const { syncUserTags } = require('./tags');
        syncUserTags('task', id, fields.tags);
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
        `UPDATE tasks SET completed_at = CURRENT_TIMESTAMP, container = 'active', archived = 0
         WHERE id = ?`
      )
      .run(id);
    replaceTags('task', id, TASK_LIFECYCLE, 'todo_completed');
    removeTag('task', id, 'archived');
    return getTask(id);
  } catch (err) {
    logError('completeTask', err);
    throw err;
  }
}

/** Un-complete → active todo_open (restore from Completed). */
function uncompleteTask(id) {
  try {
    getDb()
      .prepare(`UPDATE tasks SET completed_at = NULL, container = 'active' WHERE id = ?`)
      .run(id);
    replaceTags('task', id, TASK_LIFECYCLE, 'todo_open');
    return getTask(id);
  } catch (err) {
    logError('uncompleteTask', err);
    throw err;
  }
}

function deleteTask(id) {
  try {
    const row = getDb().prepare('SELECT locked FROM tasks WHERE id = ?').get(id);
    if (row && Number(row.locked) === 1) throw new Error('Task is locked');
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

/** Mark todo_24 items past due as todo_expired. Returns {id, title}[]. */
function expireStaleTodo24() {
  try {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT t.id, t.title FROM tasks t
         JOIN item_tags it ON it.item_id = t.id AND it.item_type = 'task'
         JOIN tags g ON g.id = it.tag_id AND g.name = 'todo_24'
         WHERE t.completed_at IS NULL AND t.archived = 0
           AND (t.container IS NULL OR t.container = 'active')
           AND t.due_datetime IS NOT NULL
           AND datetime(t.due_datetime) <= datetime('now')
         GROUP BY t.id`
      )
      .all();
    for (const row of rows) {
      replaceTags('task', row.id, TASK_LIFECYCLE, 'todo_expired');
    }
    return rows;
  } catch (err) {
    logError('expireStaleTodo24', err);
    throw err;
  }
}

/**
 * Active todo_24 tasks whose due time has arrived and not yet alerted.
 * Polled before expireStaleTodo24 so popup can fire first.
 */
function listDueTasksForAlert() {
  return getDb()
    .prepare(
      `SELECT t.* FROM tasks t
       JOIN item_tags it ON it.item_id = t.id AND it.item_type = 'task'
       JOIN tags g ON g.id = it.tag_id AND g.name = 'todo_24'
       WHERE t.completed_at IS NULL AND t.archived = 0
         AND (t.container IS NULL OR t.container = 'active')
         AND t.due_datetime IS NOT NULL
         AND datetime(t.due_datetime) <= datetime('now')
         AND NOT EXISTS (
           SELECT 1 FROM item_tags it2
           JOIN tags g2 ON g2.id = it2.tag_id AND g2.name = 'todo_alerted'
           WHERE it2.item_type = 'task' AND it2.item_id = t.id
         )`
    )
    .all()
    .map(enrich);
}

/** Persist that the due popup was shown (blocks re-fire until due reschedule). */
function markTaskAlerted(id) {
  addTag('task', id, 'todo_alerted');
  return getTask(id);
}

/** X/close on task popup → expire + keep alerted so it does not re-fire. */
function ignoreTaskAlert(id) {
  try {
    addTag('task', id, 'todo_alerted');
    replaceTags('task', id, TASK_LIFECYCLE, 'todo_expired');
    return getTask(id);
  } catch (err) {
    logError('ignoreTaskAlert', err);
    throw err;
  }
}

/**
 * Snooze task alert: push due_datetime forward, clear alerted, stay/revive todo_24.
 * @param {number} id
 * @param {number} [minutes]
 */
function snoozeTask(id, minutes) {
  try {
    const settingsMins = Number(
      getDb()
        .prepare(`SELECT value FROM settings WHERE key = 'notif_default_snooze_minutes'`)
        .get()?.value || 10
    );
    const mins = Number(minutes);
    const useMins = Number.isFinite(mins) && mins > 0 ? mins : settingsMins;
    const until = new Date(Date.now() + useMins * 60 * 1000).toISOString();
    const db = getDb();
    const tx = db.transaction(() => {
      db.prepare(`UPDATE tasks SET due_datetime = ? WHERE id = ?`).run(until, id);
      removeTag('task', id, 'todo_alerted');
      replaceTags('task', id, TASK_LIFECYCLE, 'todo_24');
    });
    tx();
    return getTask(id);
  } catch (err) {
    logError('snoozeTask', err);
    throw err;
  }
}

module.exports = {
  createTask,
  getTask,
  listTasks,
  updateTask,
  completeTask,
  uncompleteTask,
  deleteTask,
  expireStaleTodo24,
  listDueTasksForAlert,
  markTaskAlerted,
  ignoreTaskAlert,
  snoozeTask,
  clampPriority,
  TASK_LIFECYCLE,
};
