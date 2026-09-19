/**
 * Canonical habit hex for main-process CRUD. Keep in sync with habit-color.js.
 */

const HEX_BODY = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Canonical `#rrggbb` or null if the value is not a hex color.
 * @param {unknown} value
 * @returns {string|null}
 */
function normalizeHex(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const m = HEX_BODY.exec(s);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return `#${h.toLowerCase()}`;
}

module.exports = { normalizeHex };
