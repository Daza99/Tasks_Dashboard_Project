/**
 * Lists filing cabinet — named todo/reminder folders + membership.
 */
const { getDb } = require('../../main/database');
const { logError } = require('../../main/logger');
const { getTask } = require('./tasks');
const { getReminder } = require('./reminders');

function assertType(type) {
  if (type !== 'todo' && type !== 'reminder') {
    throw new Error('list type must be todo or reminder');
  }
}

function itemTypeForList(type) {
  return type === 'todo' ? 'task' : 'reminder';
}

function enrichList(row) {
  if (!row) return null;
  const count = getDb()
    .prepare('SELECT COUNT(*) AS c FROM list_items WHERE list_id = ?')
    .get(row.id).c;
  return { ...row, item_count: count };
}

/** Create a list. type is todo | reminder. */
function createList({ name, type }) {
  try {
    if (!name?.trim()) throw new Error('Name required');
    assertType(type);
    const info = getDb()
      .prepare('INSERT INTO lists (name, type) VALUES (?, ?)')
      .run(name.trim(), type);
    return getList(Number(info.lastInsertRowid));
  } catch (err) {
    logError('createList', err);
    throw err;
  }
}

function getList(id) {
  const row = getDb().prepare('SELECT * FROM lists WHERE id = ?').get(id);
  return enrichList(row);
}

/**
 * Lists with optional type + created_date filter (yyyy-mm-dd).
 * @param {{ type?: 'todo'|'reminder'|'all', dateFrom?: string, dateTo?: string }} [opts]
 */
function listLists(opts = {}) {
  try {
    const type = opts.type && opts.type !== 'all' ? opts.type : null;
    const parts = [];
    const vals = [];
    if (type) {
      parts.push('type = ?');
      vals.push(type);
    }
    if (opts.dateFrom) {
      parts.push('date(created_date) >= date(?)');
      vals.push(opts.dateFrom);
    }
    if (opts.dateTo) {
      parts.push('date(created_date) <= date(?)');
      vals.push(opts.dateTo);
    }
    const where = parts.length ? `WHERE ${parts.join(' AND ')}` : '';
    const rows = getDb()
      .prepare(`SELECT * FROM lists ${where} ORDER BY created_date DESC, id DESC`)
      .all(...vals);
    return rows.map(enrichList);
  } catch (err) {
    logError('listLists', err);
    throw err;
  }
}

function renameList(id, name) {
  try {
    if (!name?.trim()) throw new Error('Name required');
    getDb().prepare('UPDATE lists SET name = ? WHERE id = ?').run(name.trim(), id);
    return getList(id);
  } catch (err) {
    logError('renameList', err);
    throw err;
  }
}

function deleteList(id) {
  try {
    const db = getDb();
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM list_items WHERE list_id = ?').run(id);
      db.prepare('DELETE FROM lists WHERE id = ?').run(id);
    });
    tx();
    return true;
  } catch (err) {
    logError('deleteList', err);
    throw err;
  }
}

/** Move all items from source → target, then delete source. Same type only. */
function mergeLists(sourceId, targetId) {
  try {
    if (Number(sourceId) === Number(targetId)) throw new Error('Cannot merge a list into itself');
    const src = getList(sourceId);
    const dst = getList(targetId);
    if (!src || !dst) throw new Error('List not found');
    if (src.type !== dst.type) throw new Error('Lists must be the same type');
    const db = getDb();
    const tx = db.transaction(() => {
      const items = db.prepare('SELECT * FROM list_items WHERE list_id = ?').all(sourceId);
      const exists = db.prepare(
        `SELECT id FROM list_items WHERE list_id = ? AND item_type = ? AND item_id = ?`
      );
      const insert = db.prepare(
        `INSERT INTO list_items (list_id, item_type, item_id) VALUES (?, ?, ?)`
      );
      for (const it of items) {
        if (!exists.get(targetId, it.item_type, it.item_id)) {
          insert.run(targetId, it.item_type, it.item_id);
        }
      }
      db.prepare('DELETE FROM list_items WHERE list_id = ?').run(sourceId);
      db.prepare('DELETE FROM lists WHERE id = ?').run(sourceId);
    });
    tx();
    return getList(targetId);
  } catch (err) {
    logError('mergeLists', err);
    throw err;
  }
}

function listItems(listId) {
  try {
    const list = getList(listId);
    if (!list) throw new Error('List not found');
    const rows = getDb()
      .prepare(
        `SELECT * FROM list_items WHERE list_id = ? ORDER BY added_date DESC, id DESC`
      )
      .all(listId);
    const items = [];
    for (const row of rows) {
      const item =
        row.item_type === 'task' ? getTask(row.item_id) : getReminder(row.item_id);
      if (!item) continue;
      items.push({
        membership_id: row.id,
        added_date: row.added_date,
        ...item,
      });
    }
    return { list, items };
  } catch (err) {
    logError('listItems', err);
    throw err;
  }
}

/**
 * Add a task/reminder to a list. Type must match list.
 * @param {number} listId
 * @param {'task'|'reminder'} itemType
 * @param {number} itemId
 */
function addListItem(listId, itemType, itemId) {
  try {
    const list = getList(listId);
    if (!list) throw new Error('List not found');
    const expected = itemTypeForList(list.type);
    if (itemType !== expected) {
      throw new Error(`This list only accepts ${expected}s`);
    }
    const item = itemType === 'task' ? getTask(itemId) : getReminder(itemId);
    if (!item) throw new Error('Item not found');
    const db = getDb();
    const exists = db
      .prepare(
        `SELECT id FROM list_items WHERE list_id = ? AND item_type = ? AND item_id = ?`
      )
      .get(listId, itemType, itemId);
    if (exists) return listItems(listId);
    db.prepare(
      `INSERT INTO list_items (list_id, item_type, item_id) VALUES (?, ?, ?)`
    ).run(listId, itemType, itemId);
    return listItems(listId);
  } catch (err) {
    logError('addListItem', err);
    throw err;
  }
}

function removeListItem(membershipId) {
  try {
    getDb().prepare('DELETE FROM list_items WHERE id = ?').run(membershipId);
    return true;
  } catch (err) {
    logError('removeListItem', err);
    throw err;
  }
}

/** Phase 5 stub. */
function exportList() {
  return { ok: false, deferred: true, message: 'Export is Phase 5.' };
}

module.exports = {
  createList,
  getList,
  listLists,
  renameList,
  deleteList,
  mergeLists,
  listItems,
  addListItem,
  removeListItem,
  exportList,
  itemTypeForList,
};
