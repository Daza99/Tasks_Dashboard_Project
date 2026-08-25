/**
 * In-view list search: `#tag` is an exact tag match; otherwise substring
 * across the given text fields (name/title, details, category, …).
 * @param {object} row
 * @param {string} search
 * @param {{ textKeys?: string[], tagsKey?: string }} [opts]
 * @returns {boolean}
 */
export function matchesEntitySearch(row, search, opts = {}) {
  const q = String(search || '').trim().toLowerCase();
  if (!q) return true;
  const textKeys = opts.textKeys || ['name', 'title', 'description'];
  const tagsKey = opts.tagsKey || 'tags';
  if (q.startsWith('#')) {
    const tag = q.slice(1);
    return (row[tagsKey] || []).some((t) => String(t).toLowerCase() === tag);
  }
  return textKeys.some((k) => String(row[k] || '').toLowerCase().includes(q));
}
