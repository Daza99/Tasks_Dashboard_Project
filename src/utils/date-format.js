/**
 * Display-only date formatting. Storage stays yyyy-mm-dd / ISO.
 */

/** @param {string|null|undefined} raw */
export function resolveDateFormat(raw) {
  return raw === 'dmy' ? 'dmy' : 'ymd';
}

/** Hint text for module intros. */
export function dateMethodHint(fmt) {
  return resolveDateFormat(fmt) === 'dmy' ? 'dd-mm-yyyy' : 'yyyy-mm-dd';
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function joinYmd({ y, m, d }, fmt) {
  return resolveDateFormat(fmt) === 'dmy' ? `${d}-${m}-${y}` : `${y}-${m}-${d}`;
}

/**
 * Local calendar parts from a Date.
 * @param {Date} d
 */
function localParts(d) {
  return {
    y: String(d.getFullYear()),
    m: pad2(d.getMonth() + 1),
    d: pad2(d.getDate()),
  };
}

/**
 * yyyy-mm-dd prefix or local Date → { y, m, d }.
 * @param {string|Date|null|undefined} value
 */
function ymdParts(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return localParts(value);
  }
  if (value == null || value === '') return null;
  const s = String(value);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { y: m[1], m: m[2], d: m[3] };
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return localParts(d);
}

/**
 * Date-only display: 2026-08-20 or 20-08-2026.
 * @param {string|Date|null|undefined} value ISO or yyyy-mm-dd
 * @param {string} [fmt]
 */
export function formatDateKey(value, fmt) {
  const parts = ymdParts(value);
  if (!parts) return '';
  return joinYmd(parts, fmt);
}

/**
 * Local yyyy-mm-dd (or dd-mm-yyyy) HH:mm from an ISO timestamp.
 * @param {string|null|undefined} iso
 * @param {string} [fmt]
 */
export function formatLocalDateTime(iso, fmt) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const date = joinYmd(localParts(d), fmt);
  return `${date} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
