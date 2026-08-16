/**
 * Global priority: P1 High, P2 Medium, P3 Low. CJS for main process.
 */

const DEFAULT_PRIORITY = 3;

const PRIORITY_LEVELS = [
  { value: 1, label: 'P1 High' },
  { value: 2, label: 'P2 Medium' },
  { value: 3, label: 'P3 Low' },
];

/** Clamp to 1–3 (1 = highest). Values above 3 become Low. */
function clampPriority(value, fallback = DEFAULT_PRIORITY) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(3, Math.max(1, Math.round(n)));
}

module.exports = { DEFAULT_PRIORITY, PRIORITY_LEVELS, clampPriority };
