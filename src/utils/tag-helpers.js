/**
 * Shared tag name helpers — bare names in DB, # display in UI.
 * ESM for Vite renderer. Main process uses tag-helpers.cjs.
 */

/** Lifecycle / app-managed tags — excluded from user TagInput edit fields. */
export const SYSTEM_TAG_NAMES = new Set([
  'todo_24',
  'todo_open',
  'todo_completed',
  'todo_expired',
  'todo_alerted',
  'rem_today',
  'rem_tomorrow',
  'rem_dated',
  'rem_open',
  'rem_pending',
  'rem_fired',
  'rem_grace',
  'rem_ignored',
  'rem_completed',
  'rem_snoozed',
  'locked',
  'archived',
  'nudge',
]);

/** Strip leading #s, trim, lower-case → canonical bare name. */
export function normalizeTagName(raw) {
  return String(raw || '')
    .replace(/^#+/, '')
    .trim()
    .toLowerCase();
}

/**
 * Normalize a list or space/comma-separated string into unique bare names.
 * @param {string[]|string|null|undefined} tags
 * @returns {string[]}
 */
export function normalizeTagNames(tags) {
  if (tags == null) return [];
  const arr = Array.isArray(tags)
    ? tags
    : String(tags)
        .split(/[\s,]+/)
        .filter(Boolean);
  return [...new Set(arr.map(normalizeTagName).filter(Boolean))];
}

/** Display one tag with leading #. */
export function formatTagDisplay(name) {
  const bare = normalizeTagName(name);
  return bare ? `#${bare}` : '';
}

/** Join tags for UI: `#a #b`. */
export function formatTagsDisplay(names) {
  return (names || []).map(formatTagDisplay).filter(Boolean).join(' ');
}

/** User-editable tags only (exclude lifecycle / system). */
export function userTagsOnly(tags) {
  return (tags || []).filter((t) => !SYSTEM_TAG_NAMES.has(normalizeTagName(t)));
}

/** Normalize + drop system/lifecycle names (for create/edit forms). */
export function normalizeUserTagNames(tags) {
  return normalizeTagNames(tags).filter((t) => !SYSTEM_TAG_NAMES.has(t));
}

/** Display string for edit fields. */
export function userTagsDisplay(tags) {
  return formatTagsDisplay(userTagsOnly(tags));
}

/**
 * First catalog name starting with prefix (case-insensitive).
 * @param {string} prefix bare or with #
 * @param {string[]} catalog bare names
 * @param {{ exclude?: string[] }} [opts]
 */
export function matchTagPrefix(prefix, catalog, { exclude = [] } = {}) {
  const p = normalizeTagName(prefix);
  if (!p) return null;
  const skip = new Set((exclude || []).map(normalizeTagName));
  for (const name of catalog || []) {
    const n = normalizeTagName(name);
    if (!n || skip.has(n)) continue;
    if (n.startsWith(p) && n !== p) return n;
  }
  return null;
}

/**
 * Current token after last space/comma (for multi-tag inputs).
 * @returns {{ before: string, token: string, bare: string }}
 */
export function parseCurrentTagToken(value) {
  const s = String(value || '');
  const m = s.match(/^(.*?)([^\s,]*)$/);
  const before = m ? m[1] : '';
  const token = m ? m[2] : s;
  return { before, token, bare: normalizeTagName(token) };
}

/**
 * `#partial` token ending at caret in free-text (Quick Add).
 * @returns {{ start: number, end: number, bare: string, raw: string }|null}
 */
export function getHashTokenAt(text, caret) {
  const s = String(text || '');
  const pos = Math.max(0, Math.min(caret ?? s.length, s.length));
  const before = s.slice(0, pos);
  const m = before.match(/#([a-zA-Z0-9_-]*)$/);
  if (!m) return null;
  return {
    start: pos - m[0].length,
    end: pos,
    bare: m[1].toLowerCase(),
    raw: m[0],
  };
}
