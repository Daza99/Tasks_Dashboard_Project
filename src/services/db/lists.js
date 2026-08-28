/**
 * Lists — todo checklists + bullet notepad docs (list-local).
 */
const { getDb } = require('../../main/database');
const { logError } = require('../../main/logger');
const { addTag, getItemTagNames, syncUserTags } = require('./tags');
const { appendHashtag } = require('../list-hashtags');
const {
  normalizeTagName,
  normalizeTagNames,
  userTagsOnly,
} = require('../../utils/tag-helpers.cjs');
const { uniqueTitleFor } = require('../../utils/unique-title.cjs');

const LIST_TYPES = new Set(['todo', 'bullet']);

const DEFAULT_STYLE = {
  bulletMode: 'mixed',
  fontFamily: 'segoe',
  fontSize: 16,
  fontColor: '#111111',
  bgColor: '#ffffff',
};

function assertType(type) {
  if (!LIST_TYPES.has(type)) {
    throw new Error('list type must be todo or bullet');
  }
}

/** Parse style_json; fill defaults. */
function parseStyle(raw) {
  try {
    const o = raw ? JSON.parse(raw) : {};
    return {
      bulletMode: ['mixed', 'line', 'dot', 'numbered'].includes(o.bulletMode)
        ? o.bulletMode
        : DEFAULT_STYLE.bulletMode,
      fontFamily: typeof o.fontFamily === 'string' ? o.fontFamily : DEFAULT_STYLE.fontFamily,
      fontSize: Number.isFinite(Number(o.fontSize)) ? Number(o.fontSize) : DEFAULT_STYLE.fontSize,
      fontColor: typeof o.fontColor === 'string' ? o.fontColor : DEFAULT_STYLE.fontColor,
      bgColor: typeof o.bgColor === 'string' ? o.bgColor : DEFAULT_STYLE.bgColor,
    };
  } catch {
    return { ...DEFAULT_STYLE };
  }
}

function lineCount(content) {
  if (!content || !String(content).trim()) return 0;
  return String(content).split('\n').length;
}

function enrichList(row) {
  if (!row) return null;
  const db = getDb();
  const item_count =
    row.type === 'todo'
      ? db.prepare('SELECT COUNT(*) AS c FROM list_items WHERE list_id = ?').get(row.id).c
      : lineCount(row.content);
  const tags = userTagsOnly(getItemTagNames('list', row.id));
  return { ...row, item_count, style: parseStyle(row.style_json), tags };
}

/**
 * Create a list. type is todo | bullet.
 * Optional tag (bare or #prefixed) is attached via item_tags + whitelist file.
 */
function createList({ name, type, tag, description }) {
  try {
    const listName = uniqueTitleFor('list', name);
    assertType(type);
    const details = description != null ? String(description).trim() || null : null;
    const info = getDb()
      .prepare('INSERT INTO lists (name, type, description) VALUES (?, ?, ?)')
      .run(listName, type, details);
    const id = Number(info.lastInsertRowid);
    const bare = normalizeTagName(tag);
    if (bare) {
      addTag('list', id, bare);
      appendHashtag(bare);
    }
    return getList(id);
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
 * Lists with optional type + created_date filter (yyyy-mm-dd) + tag.
 * @param {{ type?: 'todo'|'bullet'|'all', dateFrom?: string, dateTo?: string, tag?: string }} [opts]
 */
function listLists(opts = {}) {
  try {
    const type = opts.type && opts.type !== 'all' ? opts.type : null;
    if (type) assertType(type);
    const bareTag = normalizeTagName(opts.tag);
    // Empty/invalid tag → no matches (filter bar always sends a tag)
    if (!bareTag) return [];

    const parts = [
      `EXISTS (
        SELECT 1 FROM item_tags it
        JOIN tags t ON t.id = it.tag_id
        WHERE it.item_type = 'list' AND it.item_id = lists.id AND t.name = ?
      )`,
    ];
    const vals = [bareTag];
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
    const where = `WHERE ${parts.join(' AND ')}`;
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
  return updateList(id, { name });
}

/**
 * Patch list name and/or details. Empty details stores null.
 * @param {number} id
 * @param {{ name?: string, description?: string|null }} fields
 */
function updateList(id, fields = {}) {
  try {
    const row = getDb().prepare('SELECT id FROM lists WHERE id = ?').get(id);
    if (!row) throw new Error('List not found');
    if (fields.name !== undefined) {
      const listName = uniqueTitleFor('list', fields.name, id);
      getDb().prepare('UPDATE lists SET name = ? WHERE id = ?').run(listName, id);
    }
    if (fields.description !== undefined) {
      const details = fields.description != null ? String(fields.description).trim() || null : null;
      getDb().prepare('UPDATE lists SET description = ? WHERE id = ?').run(details, id);
    }
    return getList(id);
  } catch (err) {
    logError('updateList', err);
    throw err;
  }
}

/**
 * Replace user hashtags on a list. Empty set is a no-op (do not wipe all tags).
 * New names are appended to the list-hashtags.txt whitelist.
 * @param {number} id
 * @param {string[]|string} tags
 */
function setListTags(id, tags) {
  try {
    const list = getList(id);
    if (!list) throw new Error('List not found');
    const names = userTagsOnly(normalizeTagNames(tags));
    if (!names.length) return list;
    syncUserTags('list', id, names);
    for (const n of names) appendHashtag(n);
    return getList(id);
  } catch (err) {
    logError('setListTags', err);
    throw err;
  }
}

function deleteList(id) {
  try {
    const db = getDb();
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM list_items WHERE list_id = ?').run(id);
      db.prepare(
        `DELETE FROM item_tags WHERE item_type = 'list' AND item_id = ?`
      ).run(id);
      db.prepare('DELETE FROM lists WHERE id = ?').run(id);
    });
    tx();
    return true;
  } catch (err) {
    logError('deleteList', err);
    throw err;
  }
}

function uniqPositiveIds(ids) {
  return [...new Set((ids || []).map(Number).filter((n) => Number.isFinite(n) && n > 0))];
}

/**
 * Bulk-delete lists (items + list tags) in one transaction.
 * @param {number[]} ids
 * @returns {number} how many were deleted
 */
function deleteLists(ids) {
  try {
    const list = uniqPositiveIds(ids);
    if (!list.length) return 0;
    const db = getDb();
    const delItems = db.prepare('DELETE FROM list_items WHERE list_id = ?');
    const delTags = db.prepare(
      `DELETE FROM item_tags WHERE item_type = 'list' AND item_id = ?`
    );
    const delRow = db.prepare('DELETE FROM lists WHERE id = ?');
    const run = db.transaction((idList) => {
      let n = 0;
      for (const id of idList) {
        delItems.run(id);
        delTags.run(id);
        const r = delRow.run(id);
        if (r.changes) n += 1;
      }
      return n;
    });
    return run(list);
  } catch (err) {
    logError('deleteLists', err);
    throw err;
  }
}

/** Move source into target, then delete source. Same type only. */
function mergeLists(sourceId, targetId) {
  try {
    if (Number(sourceId) === Number(targetId)) throw new Error('Cannot merge a list into itself');
    const src = getList(sourceId);
    const dst = getList(targetId);
    if (!src || !dst) throw new Error('List not found');
    if (src.type !== dst.type) throw new Error('Lists must be the same type');
    const db = getDb();
    const tx = db.transaction(() => {
      if (src.type === 'todo') {
        const items = db.prepare('SELECT * FROM list_items WHERE list_id = ?').all(sourceId);
        const maxOrder = db
          .prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM list_items WHERE list_id = ?')
          .get(targetId).m;
        const insert = db.prepare(
          `INSERT INTO list_items (list_id, title, done, sort_order) VALUES (?, ?, ?, ?)`
        );
        items.forEach((it, i) => {
          insert.run(targetId, it.title, it.done, maxOrder + i + 1);
        });
        db.prepare('DELETE FROM list_items WHERE list_id = ?').run(sourceId);
      } else {
        const a = src.content || '';
        const b = dst.content || '';
        const merged = [b.trimEnd(), a.trim()].filter(Boolean).join('\n\n');
        db.prepare('UPDATE lists SET content = ? WHERE id = ?').run(merged, targetId);
      }
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
    const items =
      list.type === 'todo'
        ? getDb()
            .prepare(
              `SELECT * FROM list_items WHERE list_id = ? ORDER BY sort_order ASC, id ASC`
            )
            .all(listId)
        : [];
    return { list, items };
  } catch (err) {
    logError('listItems', err);
    throw err;
  }
}

/** Append a checklist line. Todo lists only. */
function addListEntry(listId, title) {
  try {
    const list = getList(listId);
    if (!list) throw new Error('List not found');
    if (list.type !== 'todo') throw new Error('Only to-do lists accept checklist lines');
    if (!title?.trim()) throw new Error('Title required');
    const db = getDb();
    const maxOrder = db
      .prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM list_items WHERE list_id = ?')
      .get(listId).m;
    db.prepare(
      `INSERT INTO list_items (list_id, title, done, sort_order) VALUES (?, ?, 0, ?)`
    ).run(listId, title.trim(), maxOrder + 1);
    return listItems(listId);
  } catch (err) {
    logError('addListEntry', err);
    throw err;
  }
}

function toggleListEntry(id, done) {
  try {
    getDb()
      .prepare('UPDATE list_items SET done = ? WHERE id = ?')
      .run(done ? 1 : 0, id);
    const row = getDb().prepare('SELECT list_id FROM list_items WHERE id = ?').get(id);
    if (!row) throw new Error('Entry not found');
    return listItems(row.list_id);
  } catch (err) {
    logError('toggleListEntry', err);
    throw err;
  }
}

function renameListEntry(id, title) {
  try {
    if (!title?.trim()) throw new Error('Title required');
    getDb().prepare('UPDATE list_items SET title = ? WHERE id = ?').run(title.trim(), id);
    const row = getDb().prepare('SELECT list_id FROM list_items WHERE id = ?').get(id);
    if (!row) throw new Error('Entry not found');
    return listItems(row.list_id);
  } catch (err) {
    logError('renameListEntry', err);
    throw err;
  }
}

function removeListEntry(id) {
  try {
    const row = getDb().prepare('SELECT list_id FROM list_items WHERE id = ?').get(id);
    if (!row) return true;
    getDb().prepare('DELETE FROM list_items WHERE id = ?').run(id);
    return listItems(row.list_id);
  } catch (err) {
    logError('removeListEntry', err);
    throw err;
  }
}

/**
 * Save bullet notepad body + style.
 * @param {number} id
 * @param {{ content?: string, style?: object }} payload
 */
function saveListDoc(id, payload = {}) {
  try {
    const list = getList(id);
    if (!list) throw new Error('List not found');
    if (list.type === 'todo') throw new Error('To-do lists use checklist entries');
    const nextStyle = { ...parseStyle(list.style_json), ...(payload.style || {}) };
    const content = payload.content !== undefined ? String(payload.content) : list.content;
    getDb()
      .prepare('UPDATE lists SET content = ?, style_json = ? WHERE id = ?')
      .run(content, JSON.stringify(nextStyle), id);
    return getList(id);
  } catch (err) {
    logError('saveListDoc', err);
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
  updateList,
  setListTags,
  deleteList,
  deleteLists,
  mergeLists,
  listItems,
  addListEntry,
  toggleListEntry,
  renameListEntry,
  removeListEntry,
  saveListDoc,
  exportList,
  parseStyle,
  DEFAULT_STYLE,
};
