/**
 * Windows-style unique titles + Untitled {Section} fallback.
 * CommonJS for Electron main / service layer.
 */

const ENTITY_TITLES = Object.freeze({
  note: { table: 'notes', column: 'title', untitled: 'Untitled Note' },
  task: { table: 'tasks', column: 'title', untitled: 'Untitled Task' },
  reminder: { table: 'reminders', column: 'title', untitled: 'Untitled Reminder' },
  habit: { table: 'habits', column: 'name', untitled: 'Untitled Habit' },
  tracker: { table: 'trackers', column: 'name', untitled: 'Untitled Tracker' },
  list: { table: 'lists', column: 'name', untitled: 'Untitled List' },
  event: { table: 'events', column: 'title', untitled: 'Untitled Event' },
  bill: { table: 'bills', column: 'name', untitled: 'Untitled Bill', unique: false },
});

/** Trailing " (n)" like Explorer copy: History Lesson (1) */
const WIN_SUFFIX = /^(.*) \((\d+)\)$/;

function keyOf(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase();
}

/**
 * Resolve a title like Windows Explorer: first collision gets " (1)", then (2)…
 * Blank proposed → untitledLabel. If proposed already ends in (n) and is taken, bump the stem.
 * @param {string} proposed
 * @param {string[]} existingNames
 * @param {string} untitledLabel
 * @returns {string}
 */
function resolveEntityTitle(proposed, existingNames, untitledLabel) {
  const untitled = String(untitledLabel || 'Untitled').trim() || 'Untitled';
  const base = String(proposed ?? '').trim() || untitled;
  const taken = new Set((existingNames || []).map(keyOf).filter(Boolean));
  if (!taken.has(keyOf(base))) return base;

  const m = base.match(WIN_SUFFIX);
  const stem = m ? m[1] : base;
  let n = m ? Number(m[2]) : 1;
  if (!Number.isFinite(n) || n < 1) n = 1;
  while (taken.has(keyOf(`${stem} (${n})`))) n += 1;
  return `${stem} (${n})`;
}

function specFor(kind) {
  const spec = ENTITY_TITLES[kind];
  if (!spec) throw new Error(`Unknown entity kind: ${kind}`);
  return spec;
}

/** Table/column come only from ENTITY_TITLES — never from user input. */
function listExistingNames(spec, excludeId) {
  const { getDb } = require('../main/database');
  const sql =
    excludeId != null
      ? `SELECT ${spec.column} AS name FROM ${spec.table} WHERE id != ?`
      : `SELECT ${spec.column} AS name FROM ${spec.table}`;
  const rows =
    excludeId != null ? getDb().prepare(sql).all(excludeId) : getDb().prepare(sql).all();
  return rows.map((r) => r.name);
}

/**
 * Untitled fallback + per-type unique suffix (bills: untitled only, no suffix).
 * @param {string} kind
 * @param {string} proposed
 * @param {number} [excludeId] — skip this row on rename so own name is not a collision
 * @returns {string}
 */
function uniqueTitleFor(kind, proposed, excludeId) {
  const spec = specFor(kind);
  if (spec.unique === false) {
    const base = String(proposed ?? '').trim();
    return base || spec.untitled;
  }
  return resolveEntityTitle(proposed, listExistingNames(spec, excludeId), spec.untitled);
}

module.exports = {
  ENTITY_TITLES,
  resolveEntityTitle,
  uniqueTitleFor,
};
