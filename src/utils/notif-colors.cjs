/**
 * Curated light notification palettes + matching rules.
 * Main-process CJS — used by notification-window.js.
 */

const NOTIF_TEXT = '#111111';
const FALLBACK_BORDER = '#3D3D3D';

/** Fixed theme when randomization is off (light enough for #111 text). */
const DEFAULT_NOTIF_THEME = {
  bg: '#F4F1EA',
  border: '#4A5A6A',
  text: NOTIF_TEXT,
};

/** Light pastel fills — all AAA vs #111. hueFamily is matching-only. */
const LIGHT_BACKGROUNDS = [
  { id: 'cream', hex: '#F7F0E4', hueFamily: 'warm-neutral' },
  { id: 'wheat', hex: '#F3E2C7', hueFamily: 'orange' },
  { id: 'peach', hex: '#FAD9C8', hueFamily: 'orange' },
  { id: 'blush', hex: '#F8D4D8', hueFamily: 'pink' },
  { id: 'rose', hex: '#F3C6D4', hueFamily: 'pink' },
  { id: 'lavender', hex: '#E6D5F2', hueFamily: 'purple' },
  { id: 'periwinkle', hex: '#D5D9F7', hueFamily: 'indigo' },
  { id: 'sky', hex: '#D4E8F8', hueFamily: 'blue' },
  { id: 'ice', hex: '#D4F0F5', hueFamily: 'teal' },
  { id: 'mint', hex: '#D5F0DC', hueFamily: 'green' },
  { id: 'sage', hex: '#DCE8D4', hueFamily: 'green' },
  { id: 'lemon', hex: '#F4F0C8', hueFamily: 'yellow' },
  { id: 'butter', hex: '#F7E8B0', hueFamily: 'yellow' },
  { id: 'linen', hex: '#EEE8E0', hueFamily: 'warm-neutral' },
  { id: 'fog', hex: '#E4E8EC', hueFamily: 'cool-neutral' },
  { id: 'lilac', hex: '#E8DCEF', hueFamily: 'purple' },
];

/** Darker/richer strokes — never used as fills. */
const BORDERS = [
  { id: 'rust', hex: '#B85C38', hueFamily: 'orange' },
  { id: 'terracotta', hex: '#C45C4A', hueFamily: 'orange' },
  { id: 'cranberry', hex: '#A33B5C', hueFamily: 'pink' },
  { id: 'wine', hex: '#8B3A4A', hueFamily: 'pink' },
  { id: 'plum', hex: '#7A3E8A', hueFamily: 'purple' },
  { id: 'indigo', hex: '#3F4FA0', hueFamily: 'indigo' },
  { id: 'cobalt', hex: '#3A5FBF', hueFamily: 'blue' },
  { id: 'steel', hex: '#2F5F8A', hueFamily: 'blue' },
  { id: 'teal', hex: '#2A7A78', hueFamily: 'teal' },
  { id: 'forest', hex: '#3D7A4A', hueFamily: 'green' },
  { id: 'olive', hex: '#6B7A32', hueFamily: 'yellow' },
  { id: 'gold', hex: '#B8860B', hueFamily: 'yellow' },
  { id: 'cocoa', hex: '#6B4F3A', hueFamily: 'warm-neutral' },
  { id: 'slate', hex: '#4A5A6A', hueFamily: 'cool-neutral' },
];

/** Chromatic wheel (neutrals handled separately). */
const WHEEL = ['pink', 'orange', 'yellow', 'green', 'teal', 'blue', 'indigo', 'purple'];

const COMPLEMENTS = {
  orange: ['blue'],
  blue: ['orange'],
  yellow: ['indigo'],
  indigo: ['yellow'],
  green: ['pink'],
  pink: ['green', 'teal'],
  teal: ['pink', 'orange'],
  purple: ['yellow', 'green'],
};

const NEUTRAL_ADJACENT = {
  'warm-neutral': ['orange', 'yellow'],
  'cool-neutral': ['blue', 'cool-neutral'],
};

function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return {
    r: parseInt(n.slice(0, 2), 16),
    g: parseInt(n.slice(2, 4), 16),
    b: parseInt(n.slice(4, 6), 16),
  };
}

function channelToLinear(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance 0–1. */
function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);
}

function contrastRatio(a, b) {
  const L1 = relativeLuminance(a);
  const L2 = relativeLuminance(b);
  const light = Math.max(L1, L2);
  const dark = Math.min(L1, L2);
  return (light + 0.05) / (dark + 0.05);
}

/** HSL lightness 0–100 (for ΔL edge check). */
function hslLightness(hex) {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  return ((max + min) / 2) * 100;
}

function wheelIndex(family) {
  return WHEEL.indexOf(family);
}

/** Same, adjacent-on-wheel, complementary, or listed neutral neighbors. */
function familiesCompatible(bgFamily, borderFamily) {
  if (bgFamily === borderFamily) return true;

  const bgAdj = NEUTRAL_ADJACENT[bgFamily];
  if (bgAdj && bgAdj.includes(borderFamily)) return true;
  const bdAdj = NEUTRAL_ADJACENT[borderFamily];
  if (bdAdj && bdAdj.includes(bgFamily)) return true;

  const i = wheelIndex(bgFamily);
  const j = wheelIndex(borderFamily);
  if (i >= 0 && j >= 0) {
    const dist = Math.min(Math.abs(i - j), WHEEL.length - Math.abs(i - j));
    if (dist === 1) return true;
  }

  const comps = COMPLEMENTS[bgFamily] || [];
  return comps.includes(borderFamily);
}

function normalizeHex(hex) {
  return String(hex).replace('#', '').toUpperCase();
}

/** True if border reads as a darker, hue-compatible stroke on bg. */
function isEligibleBorder(bg, border) {
  if (normalizeHex(bg.hex) === normalizeHex(border.hex)) return false;
  if (relativeLuminance(border.hex) >= relativeLuminance(bg.hex)) return false;
  if (hslLightness(bg.hex) - hslLightness(border.hex) < 20) return false;
  if (contrastRatio(bg.hex, border.hex) < 1.4) return false;
  return familiesCompatible(bg.hueFamily, border.hueFamily);
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Pick a notification color theme.
 * @param {boolean} randomize - if false, return the fixed default
 * @returns {{ bg: string, border: string, text: string }}
 */
function pickNotifTheme(randomize) {
  if (!randomize) {
    return { bg: DEFAULT_NOTIF_THEME.bg, border: DEFAULT_NOTIF_THEME.border, text: NOTIF_TEXT };
  }
  const bg = pickRandom(LIGHT_BACKGROUNDS);
  const eligible = BORDERS.filter((bd) => isEligibleBorder(bg, bd));
  const borderHex = eligible.length ? pickRandom(eligible).hex : FALLBACK_BORDER;
  return { bg: bg.hex, border: borderHex, text: NOTIF_TEXT };
}

module.exports = {
  NOTIF_TEXT,
  FALLBACK_BORDER,
  DEFAULT_NOTIF_THEME,
  LIGHT_BACKGROUNDS,
  BORDERS,
  pickNotifTheme,
  isEligibleBorder,
};
