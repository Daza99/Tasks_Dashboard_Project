/**
 * Notes CRUD — combined MD/bullet docs, categories, user tags.
 */
const { getDb } = require('../../main/database');
const { logError } = require('../../main/logger');
const { syncUserTags, getItemTagNames } = require('./tags');
const { userTagsOnly } = require('../../utils/tag-helpers.cjs');
const { uniqueTitleFor } = require('../../utils/unique-title.cjs');

const DEFAULT_STYLE = {
  fontFamily: 'segoe',
  fontSize: 16,
  fontColor: '#111111',
  bgColor: '#ffffff',
  highlightColor: '#ffff00',
};

/** Parse style_json; fill defaults. */
function parseStyle(raw) {
  try {
    const o = raw ? JSON.parse(raw) : {};
    return {
      fontFamily: typeof o.fontFamily === 'string' ? o.fontFamily : DEFAULT_STYLE.fontFamily,
      fontSize: Number.isFinite(Number(o.fontSize)) ? Number(o.fontSize) : DEFAULT_STYLE.fontSize,
      fontColor: typeof o.fontColor === 'string' ? o.fontColor : DEFAULT_STYLE.fontColor,
      bgColor: typeof o.bgColor === 'string' ? o.bgColor : DEFAULT_STYLE.bgColor,
      highlightColor:
        typeof o.highlightColor === 'string' ? o.highlightColor : DEFAULT_STYLE.highlightColor,
    };
  } catch {
    return { ...DEFAULT_STYLE };
  }
}

function normalizeCategory(raw) {
  const s = String(raw || '').trim();
  return s || null;
}

function enrich(row) {
  if (!row) return null;
  const tags = userTagsOnly(getItemTagNames('note', row.id));
  return {
    ...row,
    style: parseStyle(row.style_json),
    tags,
    item_type: 'note',
  };
}

function getNote(id) {
  const row = getDb().prepare('SELECT * FROM notes WHERE id = ?').get(id);
  return enrich(row);
}

/**
 * Create a note.
 * @param {{ title: string, tags?: string[]|string, category?: string|null }} payload
 */
function createNote({ title, tags = [], category = null }) {
  try {
    const noteTitle = uniqueTitleFor('note', title);
    const cat = normalizeCategory(category);
    const db = getDb();
    const info = db
      .prepare(
        `INSERT INTO notes (title, content, style_json, category)
         VALUES (?, '', ?, ?)`
      )
      .run(noteTitle, JSON.stringify(DEFAULT_STYLE), cat);
    const id = Number(info.lastInsertRowid);
    if (cat) createNoteCategory(cat);
    syncUserTags('note', id, tags);
    return getNote(id);
  } catch (err) {
    logError('createNote', err);
    throw err;
  }
}

/**
 * List notes, newest updated first.
 * @param {{ category?: string, query?: string }} [opts]
 *   category: omitted/all = no filter; '' / uncategorized = blank category
 */
function listNotes(opts = {}) {
  try {
    const parts = ['1=1'];
    const vals = [];
    const cat = opts.category;
    if (cat && cat !== 'all') {
      if (cat === 'uncategorized' || cat === '') {
        parts.push("(category IS NULL OR trim(category) = '')");
      } else {
        parts.push('category = ?');
        vals.push(cat);
      }
    }
    const q = String(opts.query || '').trim();
    if (q) {
      parts.push('(title LIKE ? OR IFNULL(content, \'\') LIKE ? OR IFNULL(category, \'\') LIKE ?)');
      const pat = `%${q.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
      vals.push(pat, pat, pat);
    }
    const rows = getDb()
      .prepare(
        `SELECT * FROM notes WHERE ${parts.join(' AND ')}
         ORDER BY updated_at DESC, id DESC`
      )
      .all(...vals);
    return rows.map(enrich);
  } catch (err) {
    logError('listNotes', err);
    throw err;
  }
}

/**
 * Update title / category / tags.
 * @param {number} id
 * @param {{ title?: string, category?: string|null, tags?: string[]|string }} fields
 */
function updateNote(id, fields = {}) {
  try {
    const cur = getNote(id);
    if (!cur) throw new Error('Note not found');
    const title =
      fields.title !== undefined
        ? uniqueTitleFor('note', fields.title, id)
        : cur.title;
    const category =
      fields.category !== undefined ? normalizeCategory(fields.category) : cur.category;
    if (category) createNoteCategory(category);
    getDb()
      .prepare(
        `UPDATE notes SET title = ?, category = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
      .run(title, category, id);
    if (fields.tags !== undefined) syncUserTags('note', id, fields.tags);
    return getNote(id);
  } catch (err) {
    logError('updateNote', err);
    throw err;
  }
}

/** Autosave content + style_json. */
function saveNoteDoc(id, payload = {}) {
  try {
    const cur = getNote(id);
    if (!cur) throw new Error('Note not found');
    const nextStyle = { ...parseStyle(cur.style_json), ...(payload.style || {}) };
    const content = payload.content !== undefined ? String(payload.content) : cur.content;
    getDb()
      .prepare(
        `UPDATE notes SET content = ?, style_json = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
      .run(content, JSON.stringify(nextStyle), id);
    return getNote(id);
  } catch (err) {
    logError('saveNoteDoc', err);
    throw err;
  }
}

function deleteNote(id) {
  try {
    const db = getDb();
    db.prepare(`DELETE FROM item_tags WHERE item_type = 'note' AND item_id = ?`).run(id);
    db.prepare('DELETE FROM notes WHERE id = ?').run(id);
    return { ok: true };
  } catch (err) {
    logError('deleteNote', err);
    throw err;
  }
}

/** Category names for dropdowns, A–Z. */
function listNoteCategories() {
  try {
    return getDb()
      .prepare('SELECT name FROM note_categories ORDER BY name COLLATE NOCASE ASC')
      .all()
      .map((r) => r.name);
  } catch (err) {
    logError('listNoteCategories', err);
    throw err;
  }
}

/**
 * Insert a category name if missing.
 * @param {string} name
 * @returns {string} trimmed name
 */
function createNoteCategory(name) {
  try {
    const trimmed = String(name || '').trim();
    if (!trimmed) throw new Error('Category name required');
    getDb()
      .prepare('INSERT OR IGNORE INTO note_categories (name) VALUES (?)')
      .run(trimmed);
    return trimmed;
  } catch (err) {
    logError('createNoteCategory', err);
    throw err;
  }
}

module.exports = {
  createNote,
  getNote,
  listNotes,
  updateNote,
  saveNoteDoc,
  deleteNote,
  listNoteCategories,
  createNoteCategory,
  parseStyle,
  DEFAULT_STYLE,
};
