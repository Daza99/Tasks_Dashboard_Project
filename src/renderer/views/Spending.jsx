import React, { useEffect, useMemo, useState } from 'react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { useBrief } from '../context/BriefContext';
import TagInput from '../components/TagInput';
import TagSearchInput from '../components/TagSearchInput';
import DetailsInline from '../components/DetailsInline';
import DetailsPreview from '../components/DetailsPreview';
import { invalidateTagCatalog } from '../hooks/useTagCatalog';
import { formatTagsDisplay, normalizeUserTagNames, userTagsDisplay } from '../../utils/tag-helpers.js';
import { useScrollEditIntoView } from '../hooks/useScrollEditIntoView';
import { rowDblClick } from '../../utils/row-dblclick.js';

const FILTER_OPTS = [
  { value: 'all', label: 'All' },
  { value: 'highest', label: 'Highest' },
  { value: 'lowest', label: 'Lowest' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
];

/** yyyy-MM-dd bounds for a calendar month containing `ref`. */
function monthBounds(ref) {
  return {
    from: format(startOfMonth(ref), 'yyyy-MM-dd'),
    to: format(endOfMonth(ref), 'yyyy-MM-dd'),
  };
}

/**
 * Focus view: spending / transactions entry + recent list.
 * Filter bar: amount/month presets + name/#tag/date search + From/To range.
 * @param {{ editId?: number|null, onEditConsumed?: () => void }} props
 */
export default function SpendingView({ editId = null, onEditConsumed }) {
  const { refresh } = useBrief();
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [details, setDetails] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const editRowRef = useScrollEditIntoView(editingId);
  const [edit, setEdit] = useState({});
  const [listFilter, setListFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  async function load() {
    // Higher limit so month/range filters are not truncated at default 100
    setRows(await window.api.listTransactions({ limit: 5000 }));
    setCategories(await window.api.listCategories());
  }

  useEffect(() => {
    load();
  }, []);

  function beginEdit(tx) {
    setEditingId(tx.id);
    setEdit({
      amount: String(tx.amount),
      category: tx.category,
      description: tx.description || '',
      date: tx.date,
      tagsInput: userTagsDisplay(tx.tags),
    });
  }

  useEffect(() => {
    if (editId == null) return;
    setListFilter('all');
    setSearch('');
    setDateFrom('');
    setDateTo('');
    const tx = rows.find((x) => x.id === editId);
    if (!tx) return;
    beginEdit(tx);
    onEditConsumed?.();
  }, [editId, rows]);

  /** Dropdown + From/To + text search (AND), then sort. */
  const filtered = useMemo(() => {
    const now = new Date();
    let monthFrom = null;
    let monthTo = null;
    if (listFilter === 'this_month') {
      ({ from: monthFrom, to: monthTo } = monthBounds(now));
    } else if (listFilter === 'last_month') {
      ({ from: monthFrom, to: monthTo } = monthBounds(subMonths(now, 1)));
    }

    const q = search.trim().toLowerCase();
    const tagQuery = q.startsWith('#') ? q.slice(1) : null;
    const isFullDate = /^\d{4}-\d{2}-\d{2}$/.test(q);
    const isMonthPrefix = /^\d{4}-\d{2}$/.test(q);

    const list = rows.filter((tx) => {
      const d = String(tx.date || '');
      if (monthFrom && d < monthFrom) return false;
      if (monthTo && d > monthTo) return false;
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;

      if (!q) return true;
      if (tagQuery != null) {
        return (tx.tags || []).some((t) => t.toLowerCase() === tagQuery);
      }
      if (isFullDate) return d === q;
      if (isMonthPrefix) return d.startsWith(q);
      const cat = String(tx.category || '').toLowerCase();
      const desc = String(tx.description || '').toLowerCase();
      return cat.includes(q) || desc.includes(q);
    });

    if (listFilter === 'highest') {
      list.sort((a, b) => Number(b.amount) - Number(a.amount));
    } else if (listFilter === 'lowest') {
      list.sort((a, b) => Number(a.amount) - Number(b.amount));
    } else {
      list.sort((a, b) => {
        const byDate = String(b.date || '').localeCompare(String(a.date || ''));
        if (byDate !== 0) return byDate;
        return String(b.created_at || '').localeCompare(String(a.created_at || ''));
      });
    }
    return list;
  }, [rows, listFilter, search, dateFrom, dateTo]);

  async function create(e) {
    e.preventDefault();
    setError('');
    try {
      await window.api.createTransaction({
        amount: Number(amount),
        category: category || 'misc',
        description: details.trim() || null,
        date,
        tags: normalizeUserTagNames(tagsInput),
      });
      setAmount('');
      setDetails('');
      setTagsInput('');
      invalidateTagCatalog();
      await load();
      await refresh();
    } catch (err) {
      setError(err?.message || String(err));
    }
  }

  async function saveEdit(e) {
    e.preventDefault();
    try {
      await window.api.updateTransaction(editingId, {
        amount: Number(edit.amount),
        category: edit.category,
        description: (edit.description || '').trim() || null,
        date: edit.date,
        tags: normalizeUserTagNames(edit.tagsInput || ''),
      });
      setEditingId(null);
      invalidateTagCatalog();
      await load();
      await refresh();
    } catch (err) {
      setError(err?.message || String(err));
    }
  }

  async function remove(id) {
    await window.api.deleteTransaction(id);
    await load();
    await refresh();
  }

  return (
    <div className="module-view">
      <h1>Spending</h1>
      <p className="module-view__hint">
        Manual expenditure log. Quick Add: <code>$12.50 coffee</code>
      </p>

      <form className="create-form glass-inset" onSubmit={create}>
        <div className="settings-row">
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
            required
          />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="reminder-meta-row reminder-meta-row--third">
          <div className="reminder-meta-row__left">
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Category"
              list="tx-categories"
              required
            />
            <datalist id="tx-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <DetailsInline
            value={details}
            onChange={setDetails}
            placeholder="Optional details"
            ariaLabel="Optional details"
          />
        </div>
        <label className="edit-label">
          Tags (optional)
          <TagInput
            value={tagsInput}
            onChange={setTagsInput}
            placeholder="#groceries, #coffee"
            aria-label="Transaction tags"
          />
        </label>
        <button type="submit" className="btn-primary">
          Add
        </button>
        {error && <span style={{ color: 'var(--danger)' }}>{error}</span>}
      </form>

      <div className="module-filter-bar glass-inset">
        <label className="module-filter-bar__field">
          Filter
          <select
            value={listFilter}
            onChange={(e) => setListFilter(e.target.value)}
            aria-label="Spending list filter"
          >
            {FILTER_OPTS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="module-filter-bar__field module-filter-bar__field--grow">
          Search
          <TagSearchInput
            value={search}
            onChange={setSearch}
            placeholder="Category, #tag, or date"
            aria-label="Search transactions by category, tag, or date"
          />
        </label>
        <label className="module-filter-bar__field">
          From
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            aria-label="Filter from date"
          />
        </label>
        <label className="module-filter-bar__field">
          To
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            aria-label="Filter to date"
          />
        </label>
      </div>

      <ul className="module-list">
        {filtered.map((tx) => (
          <li
            key={tx.id}
            ref={editingId === tx.id ? editRowRef : null}
            className={`module-list__item glass-inset module-list__item--col${
              editingId === tx.id ? ' module-list__item--editing' : ''
            }`}
          >
            {editingId === tx.id ? (
              <form className="edit-form" onSubmit={saveEdit}>
                <div className="settings-row">
                  <input
                    type="number"
                    step="0.01"
                    value={edit.amount}
                    onChange={(e) => setEdit({ ...edit, amount: e.target.value })}
                    required
                  />
                  <input
                    type="date"
                    value={edit.date}
                    onChange={(e) => setEdit({ ...edit, date: e.target.value })}
                    required
                  />
                </div>
                <div className="reminder-meta-row reminder-meta-row--third">
                  <div className="reminder-meta-row__left">
                    <input
                      type="text"
                      value={edit.category}
                      onChange={(e) => setEdit({ ...edit, category: e.target.value })}
                      placeholder="Category"
                      required
                    />
                  </div>
                  <DetailsInline
                    value={edit.description || ''}
                    onChange={(v) => setEdit({ ...edit, description: v })}
                    placeholder="Optional details"
                    ariaLabel="Optional details"
                  />
                </div>
                <label className="edit-label">
                  Tags
                  <TagInput
                    value={edit.tagsInput || ''}
                    onChange={(v) => setEdit({ ...edit, tagsInput: v })}
                    placeholder="#tag"
                    aria-label="Edit transaction tags"
                  />
                </label>
                <div className="item-row__actions">
                  <button type="submit">Save</button>
                  <button type="button" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div
                className="module-list__row"
                onDoubleClick={rowDblClick(() => beginEdit(tx))}
              >
                <div>
                  <strong>
                    ${Number(tx.amount).toFixed(2)} · {tx.category}
                  </strong>
                  <div className="module-list__meta">
                    {tx.date}
                    {tx.tags?.length ? ` · ${formatTagsDisplay(tx.tags)}` : ''}
                  </div>
                  <DetailsPreview text={tx.description} />
                </div>
                <div className="item-row__actions">
                  <button type="button" onClick={() => beginEdit(tx)}>
                    Edit
                  </button>
                  <button type="button" className="danger" onClick={() => remove(tx.id)}>
                    Del
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
        {!rows.length && <p className="stub-empty">No transactions yet.</p>}
        {!!rows.length && !filtered.length && (
          <p className="stub-empty">No transactions match these filters.</p>
        )}
      </ul>
    </div>
  );
}
