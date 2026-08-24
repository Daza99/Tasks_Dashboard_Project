import React from 'react';

const MONTHS = [
  { id: 'all', label: 'All' },
  { id: '1', label: 'January' },
  { id: '2', label: 'February' },
  { id: '3', label: 'March' },
  { id: '4', label: 'April' },
  { id: '5', label: 'May' },
  { id: '6', label: 'June' },
  { id: '7', label: 'July' },
  { id: '8', label: 'August' },
  { id: '9', label: 'September' },
  { id: '10', label: 'October' },
  { id: '11', label: 'November' },
  { id: '12', label: 'December' },
];

const REPEAT = [
  { id: 'all', label: 'All' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'fortnight', label: 'Fortnight' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'quarterly', label: 'Quarterly' },
  { id: 'yearly', label: 'Yearly' },
  { id: 'once', label: 'Once' },
];

const STATUS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'expired', label: 'Expired' },
  { id: 'completed', label: 'Completed' },
  { id: 'archived', label: 'Archived' },
];

const MODULES = [
  { id: 'all', label: 'All' },
  { id: 'task', label: 'Tasks' },
  { id: 'reminder', label: 'Reminders' },
  { id: 'bill', label: 'Bills' },
  { id: 'habit', label: 'Habits' },
  { id: 'event', label: 'Events' },
  { id: 'transaction', label: 'Spending' },
  { id: 'list', label: 'Lists' },
  { id: 'note', label: 'Notes' },
];

/**
 * Search popover filter row. Native <select> — option text forced black in CSS.
 * @param {{
 *   filters: object,
 *   years: number[],
 *   show: { module?: boolean, repeat?: boolean, status?: boolean, locked?: boolean, priority?: boolean, paid?: boolean, snoozed?: boolean },
 *   onChange: (next: object) => void
 * }} props
 */
export default function SearchFilters({ filters, years, noteCategories = [], show, onChange }) {
  function set(key, value) {
    onChange({ ...filters, [key]: value });
  }

  const yearOpts = years.length ? years : [new Date().getFullYear()];

  return (
    <div className="search-filters">
      <label className="search-filters__field">
        Year
        <select value={filters.year} onChange={(e) => set('year', e.target.value)}>
          <option value="all">All</option>
          {yearOpts.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>
      </label>

      <label className="search-filters__field">
        Month
        <select value={filters.month} onChange={(e) => set('month', e.target.value)}>
          {MONTHS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      {show.repeat && (
        <label className="search-filters__field">
          Repeat
          <select value={filters.repeat} onChange={(e) => set('repeat', e.target.value)}>
            {REPEAT.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {show.status && (
        <label className="search-filters__field">
          Status
          <select value={filters.status} onChange={(e) => set('status', e.target.value)}>
            {STATUS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {show.module && (
        <label className="search-filters__field">
          Module
          <select value={filters.module} onChange={(e) => set('module', e.target.value)}>
            {MODULES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {show.locked && (
        <label className="search-filters__field">
          Locked
          <select value={filters.locked} onChange={(e) => set('locked', e.target.value)}>
            <option value="all">All</option>
            <option value="locked">Locked</option>
            <option value="unlocked">Unlocked</option>
          </select>
        </label>
      )}

      {show.priority && (
        <label className="search-filters__field">
          Priority
          <select value={filters.priority} onChange={(e) => set('priority', e.target.value)}>
            <option value="all">All</option>
            <option value="1">P1 High</option>
            <option value="2">P2 Medium</option>
            <option value="3">P3 Low</option>
          </select>
        </label>
      )}

      {show.paid && (
        <label className="search-filters__field">
          Paid
          <select value={filters.paid} onChange={(e) => set('paid', e.target.value)}>
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
          </select>
        </label>
      )}

      {show.snoozed && (
        <label className="search-filters__field">
          Snoozed
          <select value={filters.snoozed} onChange={(e) => set('snoozed', e.target.value)}>
            <option value="all">All</option>
            <option value="snoozed">Snoozed</option>
          </select>
        </label>
      )}

      {show.category && (
        <label className="search-filters__field">
          Category
          <select
            value={filters.category || 'all'}
            onChange={(e) => set('category', e.target.value)}
          >
            <option value="all">All</option>
            <option value="uncategorized">Uncategorized</option>
            {noteCategories.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
