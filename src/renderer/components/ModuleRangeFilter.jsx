import React from 'react';

/**
 * Range select + created-date sort ticks + Lists-style Custom From/To.
 * Search stays in the parent so placeholder/aria-label stay view-specific.
 * @param {{
 *   range: string,
 *   onRange: (next: string) => void,
 *   options: Array<{ id: string, label: string }>,
 *   dateFrom: string,
 *   dateTo: string,
 *   onDateFrom: (next: string) => void,
 *   onDateTo: (next: string) => void,
 *   sortDir: 'asc'|'desc',
 *   onSortDir: (next: 'asc'|'desc') => void,
 *   afterRange?: React.ReactNode,
 * }} props
 */
export default function ModuleRangeFilter({
  range,
  onRange,
  options,
  dateFrom,
  dateTo,
  onDateFrom,
  onDateTo,
  sortDir,
  onSortDir,
  afterRange = null,
}) {
  return (
    <>
      <label className="module-filter-bar__field">
        Range
        <select
          value={range}
          onChange={(e) => onRange(e.target.value)}
          aria-label="Range filter"
        >
          {options.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      {afterRange}
      <div className="module-filter-bar__checks module-filter-bar__checks--sort">
        <label className="module-filter-bar__check">
          <input
            type="checkbox"
            checked={sortDir === 'desc'}
            onChange={() => onSortDir('desc')}
          />
          Descending
        </label>
        <label className="module-filter-bar__check">
          <input
            type="checkbox"
            checked={sortDir === 'asc'}
            onChange={() => onSortDir('asc')}
          />
          Ascending
        </label>
      </div>
      {range === 'custom' && (
        <>
          <label className="module-filter-bar__field">
            From
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => onDateFrom(e.target.value)}
            />
          </label>
          <label className="module-filter-bar__field">
            To
            <input
              type="date"
              value={dateTo}
              onChange={(e) => onDateTo(e.target.value)}
            />
          </label>
        </>
      )}
    </>
  );
}
