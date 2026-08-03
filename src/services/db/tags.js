/**
 * Tag helpers — system lifecycle tags on items via item_tags.
 */
const { getDb } = require('../../main/database');
const { logError } = require('../../main/logger');

/** Resolve tag id by name (creates non-system tags if missing). */
function getOrCreateTagId(name, { systemOnly = false } = {}) {
  const db = getDb();
  let row = db.prepare('SELECT id, is_system FROM tags WHERE name = ?').get(name);
  if (row) return row.id;
  if (systemOnly) throw new Error(`Unknown system tag: ${name}`);
  const info = db
    .prepare('INSERT INTO tags (name, is_system) VALUES (?, 0)')
    .run(name);
  return Number(info.lastInsertRowid);
}

/** All tag names on an item. */
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
  const db = getDb();
  const tag = db.prepare('SELECT id FROM tags WHERE name = ?').get(tagName);
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
  return getItemTagNames(itemType, itemId).includes(tagName);
}

/**
 * List items of type that carry a given system tag (not archived).
 * Joins back to tasks/reminders for caller convenience — returns ids only.
 */
function listItemIdsWithTag(itemType, tagName) {
  return getDb()
    .prepare(
      `SELECT it.item_id AS id FROM item_tags it
       JOIN tags t ON t.id = it.tag_id
       WHERE it.item_type = ? AND t.name = ?`
    )
    .all(itemType, tagName)
    .map((r) => r.id);
}

module.exports = {
  getOrCreateTagId,
  getItemTagNames,
  addTag,
  removeTag,
  replaceTags,
  hasTag,
  listItemIdsWithTag,
};
