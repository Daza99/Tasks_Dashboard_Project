/**
 * Theme color parse / mix helpers. Pure — no DOM, no IPC.
 */

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const RGB = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/;

const GLASS_FILL_KEYS = ['--panel-bg', '--sidebar-bg', '--topbar-bg', '--input-bg'];

/** Curated clock faces for Settings > Theme. */
export const CLOCK_FONTS = [
  { label: 'Cascadia Mono', value: '"Cascadia Mono", "Consolas", "Courier New", monospace' },
  { label: 'Consolas', value: 'Consolas, "Courier New", monospace' },
  { label: 'Courier New', value: '"Courier New", Courier, monospace' },
  { label: 'Segoe UI', value: '"Segoe UI", sans-serif' },
  { label: 'Candara', value: 'Candara, "Trebuchet MS", sans-serif' },
  { label: 'Trebuchet MS', value: '"Trebuchet MS", sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
];

/**
 * Parse hex / rgb / rgba into channels.
 * @param {string} value
 * @returns {{ r: number, g: number, b: number, a: number } | null}
 */
export function parseCssColor(value) {
  if (!value || typeof value !== 'string') return null;
  const s = value.trim();
  const hex = HEX.exec(s);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: 1,
    };
  }
  const rgb = RGB.exec(s);
  if (rgb) {
    return {
      r: Math.round(Number(rgb[1])),
      g: Math.round(Number(rgb[2])),
      b: Math.round(Number(rgb[3])),
      a: rgb[4] != null ? Number(rgb[4]) : 1,
    };
  }
  return null;
}

/**
 * Opaque hex for <input type="color">.
 * @param {string} value
 */
export function cssColorToHex(value) {
  const c = parseCssColor(value);
  if (!c) return '#000000';
  const h = (n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

/**
 * Hex → rgba() with the given alpha.
 * @param {string} hex
 * @param {number} alpha
 */
export function hexToRgba(hex, alpha) {
  const c = parseCssColor(hex);
  const a = Number.isFinite(alpha) ? alpha : 1;
  if (!c) return `rgba(0, 0, 0, ${a})`;
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`;
}

/**
 * Alpha channel of a CSS color, or fallback.
 * @param {string} value
 * @param {number} fallback
 */
export function alphaOf(value, fallback) {
  const c = parseCssColor(value);
  return c && Number.isFinite(c.a) ? c.a : fallback;
}

/**
 * Mix RGB toward black (slider < 50) or white (> 50). Keeps alpha.
 * @param {string} colorStr
 * @param {number} slider 0–100, 50 = unchanged
 */
export function mixBrightness(colorStr, slider) {
  const c = parseCssColor(colorStr);
  if (!c) return colorStr;
  const n = Number(slider);
  const t = ((Number.isFinite(n) ? n : 50) - 50) / 50;
  const mix = (ch) => {
    const v = t < 0 ? ch * (1 + t) : ch + (255 - ch) * t;
    return Math.max(0, Math.min(255, Math.round(v)));
  };
  return `rgba(${mix(c.r)}, ${mix(c.g)}, ${mix(c.b)}, ${c.a})`;
}

/**
 * Brightness-mix glass fills only. Does not mutate `vars`.
 * @param {Record<string, string>} vars
 * @param {number} slider
 */
export function applyGlassBrightness(vars, slider) {
  const n = Number(slider);
  const clamped = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 50;
  if (clamped === 50) return vars;
  const out = { ...vars };
  for (const key of GLASS_FILL_KEYS) {
    if (out[key]) out[key] = mixBrightness(out[key], clamped);
  }
  return out;
}

/**
 * Draft CSS variables as a React style object (scoped preview).
 * @param {Record<string, string>|null} draft
 */
export function draftToStyle(draft) {
  const style = {};
  if (!draft) return style;
  for (const [k, v] of Object.entries(draft)) {
    if (k.startsWith('--') && v != null) style[k] = v;
  }
  return style;
}
