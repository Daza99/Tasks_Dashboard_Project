/**
 * Cleanup containers: 7+ Days Expired, Completed, Archive + padlock.
 */
const fs = require('fs');
const { getDb, getAllSettings } = require('../../main/database');
const { getDbPath } = require('../../main/portable-paths');
const { logError } = require('../../main/logger');
const { addTag, removeTag, hasTag } = require('./tags');
const {
  getTask,
  deleteTask,
  uncompleteTask,
} = require('./tasks');
const {
  getReminder,
  deleteReminder,
  uncompleteReminder,
} = require('./reminders');

const ACTIVE = `(container IS NULL OR container = 'active')`;

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function settings() {
  return getAllSettings();
}

function isLockedRow(row, itemType) {
  if (!row) return false;
  return Number(row.locked) === 1 || hasTag(itemType, row.id, 'locked');
}

function getRow(itemType, id) {
  if (itemType === 'task') return getTask(id);
  if (itemType === 'reminder') return getReminder(id);
  throw new Error('item_type must be task or reminder');
}

function assertType(itemType) {
  if (itemType !== 'task' && itemType !== 'reminder') {
    throw new Error('item_type must be task or reminder');
  }
}

function tableFor(itemType) {
  return itemType === 'task' ? 'tasks' : 'reminders';
}

/**
 * Toggle padlock. Locked items get #locked and skip bulk/auto delete.
 * @param {'task'|'reminder'} itemType
 * @param {number} id
 * @param {boolean} locked
 */
function setLocked(itemType, id, locked) {
  try {
    assertType(itemType);
    const on = Boolean(locked);
    const db = getDb();
    const tx = db.transaction(() => {
      db.prepare(`UPDATE ${tableFor(itemType)} SET locked = ? WHERE id = ?`).run(on ? 1 : 0, id);
      if (on) addTag(itemType, id, 'locked');
      else removeTag(itemType, id, 'locked');
    });
    tx();
    return getRow(itemType, id);
  } catch (err) {
    logError('setLocked', err);
    throw err;
  }
}

function listExpired7() {
  try {
    const db = getDb();
    const tasks = db
      .prepare(
        `SELECT * FROM tasks
         WHERE archived = 0 AND completed_at IS NULL AND container = 'expired7'
         ORDER BY due_datetime IS NULL, due_datetime ASC, created_at ASC`
      )
      .all()
      .map((r) => getTask(r.id));
    const reminders = db
      .prepare(
        `SELECT * FROM reminders
         WHERE archived = 0 AND completed_at IS NULL AND container = 'expired7'
         ORDER BY datetime ASC`
      )
      .all()
      .map((r) => getReminder(r.id));
    return [...tasks, ...reminders];
  } catch (err) {
    logError('listExpired7', err);
    throw err;
  }
}

/**
 * Completed tasks + reminders (not archived).
 * @param {{ type?: 'all'|'task'|'reminder', tag?: string, dateFrom?: string, dateTo?: string }} [opts]
 */
function listCompleted(opts = {}) {
  try {
    const type = opts.type || 'all';
    const tag = String(opts.tag || '').trim().toLowerCase().replace(/^#/, '');
    const dateFrom = opts.dateFrom || '';
    const dateTo = opts.dateTo || '';
    const db = getDb();

    const dateClause = (col) => {
      const parts = [];
      const vals = [];
      if (dateFrom) {
        parts.push(`date(${col}) >= date(?)`);
        vals.push(dateFrom);
      }
      if (dateTo) {
        parts.push(`date(${col}) <= date(?)`);
        vals.push(dateTo);
      }
      return { sql: parts.length ? ` AND ${parts.join(' AND ')}` : '', vals };
    };

    const out = [];
    if (type === 'all' || type === 'task') {
      const d = dateClause('completed_at');
      const rows = db
        .prepare(
          `SELECT * FROM tasks
           WHERE archived = 0 AND completed_at IS NOT NULL AND ${ACTIVE}
           ${d.sql}
           ORDER BY completed_at DESC`
        )
        .all(...d.vals)
        .map((r) => getTask(r.id));
      out.push(...rows);
    }
    if (type === 'all' || type === 'reminder') {
      const d = dateClause('completed_at');
      const rows = db
        .prepare(
          `SELECT * FROM reminders
           WHERE archived = 0 AND completed_at IS NOT NULL AND ${ACTIVE}
           ${d.sql}
           ORDER BY completed_at DESC`
        )
        .all(...d.vals)
        .map((r) => getReminder(r.id));
      out.push(...rows);
    }
    const filtered = tag
      ? out.filter((row) => (row.tags || []).some((t) => t.toLowerCase().includes(tag)))
      : out;
    filtered.sort((a, b) => String(b.completed_at || '').localeCompare(String(a.completed_at || '')));
    return filtered;
  } catch (err) {
    logError('listCompleted', err);
    throw err;
  }
}

function listArchive() {
  try {
    const db = getDb();
    const tasks = db
      .prepare(
        `SELECT * FROM tasks
         WHERE archived = 1 OR container = 'archive'
         ORDER BY archived_date DESC, created_at DESC`
      )
      .all()
      .map((r) => getTask(r.id));
    const reminders = db
      .prepare(
        `SELECT * FROM reminders
         WHERE archived = 1 OR container = 'archive'
         ORDER BY archived_date DESC, created_at DESC`
      )
      .all()
      .map((r) => getReminder(r.id));
    const all = [...tasks, ...reminders];
    all.sort((a, b) =>
      String(b.archived_date || '').localeCompare(String(a.archived_date || ''))
    );
    return all;
  } catch (err) {
    logError('listArchive', err);
    throw err;
  }
}

/** Counts for rail + nav badges. */
function getContainerCounts() {
  try {
    const db = getDb();
    const expired7 =
      db.prepare(
        `SELECT COUNT(*) AS c FROM tasks WHERE archived = 0 AND completed_at IS NULL AND container = 'expired7'`
      ).get().c +
      db.prepare(
        `SELECT COUNT(*) AS c FROM reminders WHERE archived = 0 AND completed_at IS NULL AND container = 'expired7'`
      ).get().c;
    const completed =
      db.prepare(
        `SELECT COUNT(*) AS c FROM tasks WHERE archived = 0 AND completed_at IS NOT NULL AND ${ACTIVE}`
      ).get().c +
      db.prepare(
        `SELECT COUNT(*) AS c FROM reminders WHERE archived = 0 AND completed_at IS NOT NULL AND ${ACTIVE}`
      ).get().c;
    const archive =
      db.prepare(
        `SELECT COUNT(*) AS c FROM tasks WHERE archived = 1 OR container = 'archive'`
      ).get().c +
      db.prepare(
        `SELECT COUNT(*) AS c FROM reminders WHERE archived = 1 OR container = 'archive'`
      ).get().c;
    return { expired7, completed, archive, size: getArchiveSizeInfo() };
  } catch (err) {
    logError('getContainerCounts', err);
    throw err;
  }
}

/** DB filesize vs settings threshold (whole dashboard.db, not archive rows only). */
function getArchiveSizeInfo() {
  try {
    const limitMb = clampInt(settings().archive_filesize_limit_mb, 1, 100000, 500);
    const dbPath = getDbPath();
    let bytes = 0;
    for (const p of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      try {
        if (fs.existsSync(p)) bytes += fs.statSync(p).size;
      } catch {
        /* ignore missing sidecar */
      }
    }
    const mb = bytes / (1024 * 1024);
    return {
      bytes,
      mb: Math.round(mb * 10) / 10,
      limitMb,
      overLimit: mb >= limitMb,
    };
  } catch (err) {
    logError('getArchiveSizeInfo', err);
    return { bytes: 0, mb: 0, limitMb: 500, overLimit: false };
  }
}

/**
 * Move item to Archive (trash). Locked items are skipped.
 * @param {'task'|'reminder'} itemType
 * @param {number} id
 */
function archiveItem(itemType, id) {
  try {
    assertType(itemType);
    const row = getRow(itemType, id);
    if (!row) throw new Error('Item not found');
    if (isLockedRow(row, itemType)) {
      return { ok: false, skippedLocked: true, item: row };
    }
    const db = getDb();
    const tx = db.transaction(() => {
      db.prepare(
        `UPDATE ${tableFor(itemType)}
         SET archived = 1, archived_date = CURRENT_TIMESTAMP, container = 'archive'
         WHERE id = ?`
      ).run(id);
      addTag(itemType, id, 'archived');
    });
    tx();
    return { ok: true, skippedLocked: false, item: getRow(itemType, id) };
  } catch (err) {
    logError('archiveItem', err);
    throw err;
  }
}

/**
 * Restore from a container.
 * @param {'task'|'reminder'} itemType
 * @param {number} id
 * @param {'expired7'|'completed'|'archive'} from
 */
function restoreItem(itemType, id, from) {
  try {
    assertType(itemType);
    const db = getDb();
    if (from === 'expired7') {
      db.prepare(
        `UPDATE ${tableFor(itemType)} SET container = 'active' WHERE id = ?`
      ).run(id);
      return getRow(itemType, id);
    }
    if (from === 'completed') {
      return itemType === 'task' ? uncompleteTask(id) : uncompleteReminder(id);
    }
    if (from === 'archive') {
      const row = getRow(itemType, id);
      if (!row) throw new Error('Item not found');
      const tx = db.transaction(() => {
        db.prepare(
          `UPDATE ${tableFor(itemType)}
           SET archived = 0, archived_date = NULL, container = 'active'
           WHERE id = ?`
        ).run(id);
        removeTag(itemType, id, 'archived');
      });
      tx();
      return getRow(itemType, id);
    }
    throw new Error('from must be expired7|completed|archive');
  } catch (err) {
    logError('restoreItem', err);
    throw err;
  }
}

/**
 * Permanent delete. Locked items are skipped (not thrown) for bulk safety.
 * @param {'task'|'reminder'} itemType
 * @param {number} id
 */
function deleteItem(itemType, id) {
  try {
    assertType(itemType);
    const row = getRow(itemType, id);
    if (!row) return { ok: false, skippedLocked: false };
    if (isLockedRow(row, itemType)) {
      return { ok: false, skippedLocked: true };
    }
    if (itemType === 'task') deleteTask(id);
    else deleteReminder(id);
    return { ok: true, skippedLocked: false };
  } catch (err) {
    logError('deleteItem', err);
    throw err;
  }
}

function normalizeItems(items) {
  return (items || []).map((it) => ({
    item_type: it.item_type || it.itemType,
    id: Number(it.id),
  }));
}

/** @param {{ items: {item_type:string,id:number}[] }} payload */
function bulkArchive(payload) {
  const items = normalizeItems(payload?.items);
  let archived = 0;
  let skippedLocked = 0;
  for (const it of items) {
    const res = archiveItem(it.item_type, it.id);
    if (res.skippedLocked) skippedLocked += 1;
    else if (res.ok) archived += 1;
  }
  return { archived, skippedLocked };
}

/** @param {{ items: {item_type:string,id:number}[], from: string }} payload */
function bulkRestore(payload) {
  const items = normalizeItems(payload?.items);
  const from = payload?.from;
  let restored = 0;
  for (const it of items) {
    restoreItem(it.item_type, it.id, from);
    restored += 1;
  }
  return { restored };
}

/** @param {{ items: {item_type:string,id:number}[] }} payload */
function bulkDelete(payload) {
  const items = normalizeItems(payload?.items);
  let deleted = 0;
  let skippedLocked = 0;
  for (const it of items) {
    const res = deleteItem(it.item_type, it.id);
    if (res.skippedLocked) skippedLocked += 1;
    else if (res.ok) deleted += 1;
  }
  return { deleted, skippedLocked };
}

/**
 * File items onto a named list. Optionally lift out of expired7.
 * @param {{ items: {item_type:string,id:number}[], listId: number, from?: string }} payload
 */
function moveToList(payload) {
  try {
    const { addListItem } = require('./lists');
    const listId = Number(payload?.listId);
    if (!listId) return { ok: false, message: 'listId required' };
    const items = normalizeItems(payload?.items);
    let moved = 0;
    for (const it of items) {
      addListItem(listId, it.item_type, it.id);
      if (payload?.from === 'expired7') {
        restoreItem(it.item_type, it.id, 'expired7');
      }
      moved += 1;
    }
    return { ok: true, moved };
  } catch (err) {
    logError('moveToList', err);
    throw err;
  }
}

function retentionDays() {
  return clampInt(settings().retention_days_expired, 1, 30, 7);
}

/**
 * Auto-move todo_expired (and rem_ignored) past retention into expired7.
 * @returns {{ moved: number, deletedExpired7: number, deletedArchive: number }}
 */
function sweepContainers() {
  try {
    const db = getDb();
    const days = retentionDays();
    const s = settings();

    const expiredTaskIds = db
      .prepare(
        `SELECT t.id FROM tasks t
         JOIN item_tags it ON it.item_id = t.id AND it.item_type = 'task'
         JOIN tags g ON g.id = it.tag_id AND g.name = 'todo_expired'
         WHERE t.archived = 0 AND t.completed_at IS NULL
           AND (t.container IS NULL OR t.container = 'active')
           AND datetime(COALESCE(t.due_datetime, t.created_at)) <= datetime('now', ?)`
      )
      .all(`-${days} days`);

    const ignoredRemIds = db
      .prepare(
        `SELECT r.id FROM reminders r
         JOIN item_tags it ON it.item_id = r.id AND it.item_type = 'reminder'
         JOIN tags g ON g.id = it.tag_id AND g.name = 'rem_ignored'
         WHERE r.archived = 0 AND r.completed_at IS NULL
           AND (r.container IS NULL OR r.container = 'active')
           AND datetime(COALESCE(r.datetime, r.created_at)) <= datetime('now', ?)
           AND r.datetime < '9999-01-01'`
      )
      .all(`-${days} days`);

    const moveTask = db.prepare(`UPDATE tasks SET container = 'expired7' WHERE id = ?`);
    const moveRem = db.prepare(`UPDATE reminders SET container = 'expired7' WHERE id = ?`);
    const tx = db.transaction(() => {
      for (const row of expiredTaskIds) moveTask.run(row.id);
      for (const row of ignoredRemIds) moveRem.run(row.id);
    });
    tx();

    let deletedExpired7 = 0;
    let deletedArchive = 0;
    if (s.auto_delete_expired7 === 'true') {
      const keepDays = clampInt(s.auto_delete_expired7_days, 1, 3650, 30);
      deletedExpired7 = autoDeleteExpired7(keepDays);
    }
    if (s.auto_delete_archive === 'true') {
      const years = clampInt(s.archive_retention_years, 1, 50, 3);
      deletedArchive = autoDeleteArchive(years);
    }

    return {
      moved: expiredTaskIds.length + ignoredRemIds.length,
      deletedExpired7,
      deletedArchive,
    };
  } catch (err) {
    logError('sweepContainers', err);
    throw err;
  }
}

function autoDeleteExpired7(keepDays) {
  const db = getDb();
  const tasks = db
    .prepare(
      `SELECT id FROM tasks
       WHERE container = 'expired7' AND archived = 0 AND locked = 0
         AND datetime(COALESCE(due_datetime, created_at)) <= datetime('now', ?)`
    )
    .all(`-${keepDays} days`);
  const rems = db
    .prepare(
      `SELECT id FROM reminders
       WHERE container = 'expired7' AND archived = 0 AND locked = 0
         AND datetime(COALESCE(datetime, created_at)) <= datetime('now', ?)`
    )
    .all(`-${keepDays} days`);
  let n = 0;
  for (const row of tasks) {
    if (deleteItem('task', row.id).ok) n += 1;
  }
  for (const row of rems) {
    if (deleteItem('reminder', row.id).ok) n += 1;
  }
  return n;
}

function autoDeleteArchive(years) {
  const db = getDb();
  const tasks = db
    .prepare(
      `SELECT id FROM tasks
       WHERE (archived = 1 OR container = 'archive') AND locked = 0
         AND datetime(COALESCE(archived_date, created_at)) <= datetime('now', ?)`
    )
    .all(`-${years} years`);
  const rems = db
    .prepare(
      `SELECT id FROM reminders
       WHERE (archived = 1 OR container = 'archive') AND locked = 0
         AND datetime(COALESCE(archived_date, created_at)) <= datetime('now', ?)`
    )
    .all(`-${years} years`);
  let n = 0;
  for (const row of tasks) {
    if (deleteItem('task', row.id).ok) n += 1;
  }
  for (const row of rems) {
    if (deleteItem('reminder', row.id).ok) n += 1;
  }
  return n;
}

module.exports = {
  setLocked,
  listExpired7,
  listCompleted,
  listArchive,
  getContainerCounts,
  getArchiveSizeInfo,
  archiveItem,
  restoreItem,
  deleteItem,
  bulkArchive,
  bulkRestore,
  bulkDelete,
  moveToList,
  sweepContainers,
  retentionDays,
};
