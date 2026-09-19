/**
 * Per-habit color helpers: hex normalize, saved 12-slot palette, contrast ink.
 */

export const HABIT_SWATCH_COUNT = 12;
export const DEFAULT_HABIT_COLOR = '#ea580c';
export const INK_DARK = '#111111';
export const INK_LIGHT = '#f2f5f8';

const HEX_BODY = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Canonical `#rrggbb` or null if the value is not a hex color.
 * @param {unknown} value
 * @returns {string|null}
 */
export function normalizeHex(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const m = HEX_BODY.exec(s);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return `#${h.toLowerCase()}`;
}

/** Live theme `--cal-habit`, else factory orange. */
export function themeHabitColor() {
  if (typeof document === 'undefined') return DEFAULT_HABIT_COLOR;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue('--cal-habit')
    .trim();
  return normalizeHex(raw) || DEFAULT_HABIT_COLOR;
}

/**
 * Stored custom hex, or the theme habit marker.
 * @param {unknown} color
 */
export function resolvedHabitColor(color) {
  return normalizeHex(color) || themeHabitColor();
}

/**
 * Dark vs light ink for a filled chip.
 * @param {unknown} hex
 */
export function contrastInk(hex) {
  const n = normalizeHex(hex);
  if (!n) return INK_LIGHT;
  const r = parseInt(n.slice(1, 3), 16) / 255;
  const g = parseInt(n.slice(3, 5), 16) / 255;
  const b = parseInt(n.slice(5, 7), 16) / 255;
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.55 ? INK_DARK : INK_LIGHT;
}

/**
 * Inline fill+ink when a custom hex is set; undefined so CSS tokens apply.
 * @param {unknown} color
 * @returns {{ backgroundColor: string, color: string } | undefined}
 */
export function habitFillStyle(color) {
  const hex = normalizeHex(color);
  if (!hex) return undefined;
  return { backgroundColor: hex, color: contrastInk(hex) };
}

/**
 * Always 12 slots; missing/invalid entries are null.
 * @param {unknown} raw JSON string, array, or unset
 * @returns {(string|null)[]}
 */
export function parseSavedColors(raw) {
  let arr = [];
  if (Array.isArray(raw)) {
    arr = raw;
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) arr = parsed;
    } catch {
      arr = [];
    }
  }
  return Array.from({ length: HABIT_SWATCH_COUNT }, (_, i) => normalizeHex(arr[i]));
}

/** Index of the first empty slot, or -1 if full. */
export function nextEmptySlot(slots) {
  if (!Array.isArray(slots)) return -1;
  return slots.findIndex((c) => !c);
}

/**
 * Fill the next empty slot; skip duplicates and a full palette.
 * @param {(string|null)[]} slots
 * @param {unknown} hex
 */
export function appendSavedColor(slots, hex) {
  const color = normalizeHex(hex);
  const cur = parseSavedColors(slots);
  if (!color) return cur;
  if (cur.some((c) => c === color)) return cur;
  const i = nextEmptySlot(cur);
  if (i < 0) return cur;
  const next = cur.slice();
  next[i] = color;
  return next;
}

/**
 * Clear one saved slot.
 * @param {(string|null)[]} slots
 * @param {number} index
 */
export function clearSavedColor(slots, index) {
  const cur = parseSavedColors(slots);
  if (!Number.isInteger(index) || index < 0 || index >= HABIT_SWATCH_COUNT) {
    return cur;
  }
  const next = cur.slice();
  next[index] = null;
  return next;
}
