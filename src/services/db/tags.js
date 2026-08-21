/**
 * Tag helpers — system lifecycle tags on items via item_tags.
 * All writes normalize to bare lower-case names (no leading #).
 */
const { getDb } = require('../../main/database');
const { logError } = require('../../main/logger');
const {
  normalizeTagName,
  normalizeTagNames,
} = require('../../utils/tag-helpers.cjs');

/** Resolve tag id by name (creates non-system tags if missing). */
function getOrCreateTagId(name, { systemOnly = false } = {}) {
  const bare = normalizeTagName(name);
  if (!bare) throw new Error('Tag name required');
  const db = getDb();
  let row = db.prepare('SELECT id, is_system FROM tags WHERE name = ?').get(bare);
  if (row) return row.id;
  if (systemOnly) throw new Error(`Unknown system tag: ${bare}`);
  const info = db
    .prepare('INSERT INTO tags (name, is_system) VALUES (?, 0)')
    .run(bare);
  return Number(info.lastInsertRowid);
}

/** All tag names on an item (bare). */
function getItemTagNames(itemType, itemId) {
  return getDb()
    .prepare(
      `SELECT t.name FROM tags t
       JOIN item_tags it ON it.tag_id = t.id
       WHERE it.item_type = ? AND it.item_id = ?`
    )
    .all(itemType, itemId)
    .map((r) => r.name);
}

/** Attach a tag if not already present. */
function addTag(itemType, itemId, tagName) {
  const db = getDb();
  const tagId = getOrCreateTagId(tagName);
  const exists = db
    .prepare(
      'SELECT id FROM item_tags WHERE item_type = ? AND item_id = ? AND tag_id = ?'
    )
    .get(itemType, itemId, tagId);
  if (exists) return;
  db.prepare(
    'INSERT INTO item_tags (item_type, item_id, tag_id) VALUES (?, ?, ?)'
  ).run(itemType, itemId, tagId);
}

/** Remove one tag from an item. */
function removeTag(itemType, itemId, tagName) {
  const bare = normalizeTagName(tagName);
  if (!bare) return;
  const db = getDb();
  const tag = db.prepare('SELECT id FROM tags WHERE name = ?').get(bare);
  if (!tag) return;
  db.prepare(
    'DELETE FROM item_tags WHERE item_type = ? AND item_id = ? AND tag_id = ?'
  ).run(itemType, itemId, tag.id);
}

/**
 * Replace any of `fromTags` with `toTag` on the item.
 * @param {string} itemType
 * @param {number} itemId
 * @param {string[]} fromTags
 * @param {string} toTag
 */
function replaceTags(itemType, itemId, fromTags, toTag) {
  try {
    const db = getDb();
    const tx = db.transaction(() => {
      for (const name of fromTags) removeTag(itemType, itemId, name);
      addTag(itemType, itemId, toTag);
    });
    tx();
  } catch (err) {
    logError('replaceTags', err);
    throw err;
  }
}

/** True if item has tag. */
function hasTag(itemType, itemId, tagName) {
  const bare = normalizeTagName(tagName);
  return getItemTagNames(itemType, itemId).includes(bare);
}

/**
 * Sync user (non-system) tags on an item; leave is_system tags alone.
 * @param {string} itemType
 * @param {number} itemId
 * @param {string[]|string} tags
 */
function syncUserTags(itemType, itemId, tags) {
  const db = getDb();
  const isSystem = db.prepare('SELECT is_system FROM tags WHERE name = ?');
  const desired = new Set(
    normalizeTagNames(tags).filter((t) => {
      const row = isSystem.get(t);
      return !(row && row.is_system);
    })
  );
  const current = getItemTagNames(itemType, itemId);
  for (const t of current) {
    const row = isSystem.get(t);
    if (row && row.is_system) continue;
    if (!desired.has(t)) removeTag(itemType, itemId, t);
  }
  for (const t of desired) addTag(itemType, itemId, t);
}

/**
 * List tag names for autocomplete.
 * @param {{ userOnly?: boolean }} [opts]
 * @returns {string[]} bare names
 */
function listTags({ userOnly = true } = {}) {
  try {
    const sql = userOnly
      ? `SELECT name FROM tags WHERE is_system = 0 ORDER BY name COLLATE NOCASE ASC`
      : `SELECT name FROM tags ORDER BY name COLLATE NOCASE ASC`;
    return getDb()
      .prepare(sql)
      .all()
      .map((r) => r.name);
  } catch (err) {
    logError('listTags', err);
    throw err;
  }
}

/**
 * List items of type that carry a given system tag (not archived).
 * Joins back to tasks/reminders for caller convenience — returns ids only.
 */
function listItemIdsWithTag(itemType, tagName) {
  const bare = normalizeTagName(tagName);
  return getDb()
    .prepare(
      `SELECT it.item_id AS id FROM item_tags it
       JOIN tags t ON t.id = it.tag_id
       WHERE it.item_type = ? AND t.name = ?`
    )
    .all(itemType, bare)
    .map((r) => r.id);
}

const TAGGED_TYPES = ['task', 'reminder', 'habit', 'transaction', 'tracker', 'list', 'note'];

/**
 * User tags with attachment counts (unused tags included as usage 0).
 * @returns {{ id: number, name: string, created_at: string, usage: number }[]}
 */
function listUserTagsWithCounts() {
  try {
    return getDb()
      .prepare(
        `SELECT t.id, t.name, t.created_at, COUNT(it.id) AS usage
         FROM tags t
         LEFT JOIN item_tags it ON it.tag_id = t.id
         WHERE IFNULL(t.is_system, 0) = 0
         GROUP BY t.id
         ORDER BY t.name COLLATE NOCASE ASC`
      )
      .all()
      .map((r) => ({
        id: r.id,
        name: r.name,
        created_at: r.created_at,
        usage: Number(r.usage) || 0,
      }));
  } catch (err) {
    logError('listUserTagsWithCounts', err);
    throw err;
  }
}

/** Lazy getters — tags.js is required by those modules. */
function hydrateTaggedItem(itemType, itemId) {
  if (itemType === 'task') return require('./tasks').getTask(itemId);
  if (itemType === 'reminder') return require('./reminders').getReminder(itemId);
  if (itemType === 'habit') return require('./habits').getHabit(itemId);
  if (itemType === 'transaction') return require('./transactions').getTransaction(itemId);
  if (itemType === 'tracker') return require('./trackers').getTracker(itemId);
  if (itemType === 'note') return require('./notes').getNote(itemId);
  return null;
}

/**
 * Items attached to a user tag, newest created_at first.
 * @param {string} tagName
 * @param {{ limit?: number, offset?: number }} [opts]
 * @returns {{ items: object[], total: number }}
 */
function listTagItems(tagName, { limit = 10, offset = 0 } = {}) {
  try {
    const bare = normalizeTagName(tagName);
    if (!bare) return { items: [], total: 0 };
    const db = getDb();
    const placeholders = TAGGED_TYPES.map(() => '?').join(', ');
    const totalRow = db
      .prepare(
        `SELECT COUNT(*) AS n FROM item_tags it
         JOIN tags t ON t.id = it.tag_id
         WHERE t.name = ? AND it.item_type IN (${placeholders})`
      )
      .get(bare, ...TAGGED_TYPES);
    const total = Number(totalRow?.n) || 0;
    const cap = Math.max(0, Number(limit) || 10);
    const skip = Math.max(0, Number(offset) || 0);
    const rows = db
      .prepare(
        `SELECT item_type, item_id FROM (
           SELECT 'task' AS item_type, t.id AS item_id, t.created_at AS created_at
           FROM tasks t
           JOIN item_tags it ON it.item_type = 'task' AND it.item_id = t.id
           JOIN tags tg ON tg.id = it.tag_id
           WHERE tg.name = ?
           UNION ALL
           SELECT 'reminder', r.id, r.created_at
           FROM reminders r
           JOIN item_tags it ON it.item_type = 'reminder' AND it.item_id = r.id
           JOIN tags tg ON tg.id = it.tag_id
           WHERE tg.name = ?
           UNION ALL
           SELECT 'habit', h.id, h.created_at
           FROM habits h
           JOIN item_tags it ON it.item_type = 'habit' AND it.item_id = h.id
           JOIN tags tg ON tg.id = it.tag_id
           WHERE tg.name = ?
           UNION ALL
           SELECT 'transaction', x.id, x.created_at
           FROM transactions x
           JOIN item_tags it ON it.item_type = 'transaction' AND it.item_id = x.id
           JOIN tags tg ON tg.id = it.tag_id
           WHERE tg.name = ?
           UNION ALL
           SELECT 'tracker', k.id, k.created_at
           FROM trackers k
           JOIN item_tags it ON it.item_type = 'tracker' AND it.item_id = k.id
           JOIN tags tg ON tg.id = it.tag_id
           WHERE tg.name = ?
           UNION ALL
           SELECT 'note', n.id, n.created_at
           FROM notes n
           JOIN item_tags it ON it.item_type = 'note' AND it.item_id = n.id
           JOIN tags tg ON tg.id = it.tag_id
           WHERE tg.name = ?
         ) attached
         ORDER BY attached.created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(bare, bare, bare, bare, bare, bare, cap, skip);
    const items = [];
    for (const row of rows) {
      const item = hydrateTaggedItem(row.item_type, row.item_id);
      if (item) items.push({ ...item, item_type: row.item_type });
    }
    return { items, total };
  } catch (err) {
    logError('listTagItems', err);
    throw err;
  }
}

module.exports = {
  getOrCreateTagId,
  getItemTagNames,
  addTag,
  removeTag,
  replaceTags,
  hasTag,
  syncUserTags,
  listTags,
  listItemIdsWithTag,
  listUserTagsWithCounts,
  listTagItems,
  normalizeTagName,
  normalizeTagNames,
};
