import { format, startOfMonth, startOfYear, subDays } from 'date-fns';

/**
 * Local yyyy-mm-dd from SQLite/ISO created_at (space or T separator).
 * @param {string|null|undefined} iso
 * @returns {string}
 */
export function createdDateKey(iso) {
  if (!iso) return '';
  const raw = String(iso).trim();
  if (!raw) return '';
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) {
    const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : '';
  }
  return format(d, 'yyyy-MM-dd');
}

/**
 * Lists-style created-date window (week/month/year/custom). Empty = no bound.
 * @param {string} range
 * @param {string} [dateFrom]
 * @param {string} [dateTo]
 * @param {Date} [today]
 * @returns {{ dateFrom?: string, dateTo?: string }}
 */
export function listsRangeBounds(range, dateFrom, dateTo, today = new Date()) {
  if (range === 'week') {
    return {
      dateFrom: format(subDays(today, 6), 'yyyy-MM-dd'),
      dateTo: format(today, 'yyyy-MM-dd'),
    };
  }
  if (range === 'month') {
    return {
      dateFrom: format(startOfMonth(today), 'yyyy-MM-dd'),
      dateTo: format(today, 'yyyy-MM-dd'),
    };
  }
  if (range === 'year') {
    return {
      dateFrom: format(startOfYear(today), 'yyyy-MM-dd'),
      dateTo: format(today, 'yyyy-MM-dd'),
    };
  }
  if (range === 'custom') {
    return {
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    };
  }
  return {};
}

/**
 * Inclusive created-date check. Missing From/To = unbounded on that side.
 * @param {string|null|undefined} iso
 * @param {string} [from]
 * @param {string} [to]
 */
export function matchesCreatedRange(iso, from, to) {
  if (!from && !to) return true;
  const key = createdDateKey(iso);
  if (!key) return false;
  if (from && key < from) return false;
  if (to && key > to) return false;
  return true;
}

/** Epoch ms from SQLite/ISO created_at; missing/invalid → 0. */
function createdStamp(iso) {
  if (!iso) return 0;
  const raw = String(iso).trim();
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

/**
 * Sort by created_at. dir 'desc' = newest first (default).
 * @param {Array<{ id?: number, created_at?: string }>} rows
 * @param {'asc'|'desc'} [dir]
 */
export function sortByCreated(rows, dir = 'desc') {
  const mul = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const at = createdStamp(a.created_at);
    const bt = createdStamp(b.created_at);
    if (at !== bt) return (at - bt) * mul;
    return ((a.id || 0) - (b.id || 0)) * mul;
  });
}
