/**
 * Remappable nav hotkeys. Stored as settings.hotkeys JSON.
 */

export const DEFAULT_HOTKEYS = {
  calendar: 'Ctrl+C',
  projects: 'Ctrl+P',
  habits: 'Ctrl+H',
  bills: 'Ctrl+B',
};

export const HOTKEY_ACTIONS = [
  { id: 'calendar', label: 'Calendar', view: 'calendar' },
  { id: 'projects', label: 'Projects', view: 'projects' },
  { id: 'habits', label: 'Habits', view: 'habits' },
  { id: 'bills', label: 'Bills', view: 'bills' },
];

/** Merge stored JSON with defaults. */
export function parseHotkeys(raw) {
  let obj = {};
  try {
    obj = typeof raw === 'string' ? JSON.parse(raw) : raw || {};
  } catch {
    obj = {};
  }
  const out = { ...DEFAULT_HOTKEYS };
  for (const { id } of HOTKEY_ACTIONS) {
    if (typeof obj[id] === 'string' && obj[id].trim()) out[id] = obj[id].trim();
  }
  return out;
}

/** Canonical combo from a keydown, e.g. Ctrl+Shift+C. Null if modifier-only. */
export function comboFromEvent(e) {
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null;
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  parts.push(key);
  return parts.join('+');
}

/** True if event matches a stored combo string. */
export function eventMatchesCombo(e, combo) {
  const got = comboFromEvent(e);
  return Boolean(got && combo && got === combo);
}
