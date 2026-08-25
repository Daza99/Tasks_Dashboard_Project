import React, { useEffect, useMemo, useState } from 'react';
import { format, isValid, parseISO } from 'date-fns';
import { useBrief } from '../context/BriefContext';
import BillPayConfirm from '../components/BillPayConfirm';
import PrioritySelect from '../components/PrioritySelect';
import DetailsInline from '../components/DetailsInline';
import DetailsPreview from '../components/DetailsPreview';
import NudgeCustomDialog from '../components/NudgeCustomDialog';
import ConfirmDialog from '../components/ConfirmDialog';
import ListSelectToolbar from '../components/ListSelectToolbar';
import TagSearchInput from '../components/TagSearchInput';
import { NudgePreview, NudgeRow, todayKey } from '../components/NudgeRow';
import { DEFAULT_PRIORITY } from '../../utils/priority.js';
import { useScrollEditIntoView } from '../hooks/useScrollEditIntoView';
import { useSelectedCard } from '../hooks/useSelectedCard';
import { useVisibleSelection } from '../hooks/useVisibleSelection';
import { useDateFormat } from '../hooks/useDateFormat';
import { rowDblClick } from '../../utils/row-dblclick.js';
import { matchesEntitySearch } from '../../utils/entity-search.js';

const RECUR = [
  { id: '', label: 'once' },
  { id: 'monthly', label: 'monthly' },
  { id: 'fortnight', label: 'fortnight' },
  { id: 'quarterly', label: 'quarterly' },
  { id: 'yearly', label: 'yearly' },
];

/** ISO from local date + HH:mm (bills use 09:00 default). */
function localToIso(date, time) {
  const base = parseISO(`${date}T${time || '09:00'}:00`);
  return isValid(base) ? base.toISOString() : null;
}

/** Local HH:mm from stored nudge ISO. */
function timeFromIso(iso) {
  if (!iso) return '09:00';
  try {
    const d = parseISO(iso);
    return isValid(d) ? format(d, 'HH:mm') : '09:00';
  } catch {
    return '09:00';
  }
}

/** Local yyyy-MM-dd from stored nudge ISO. */
function dateFromIso(iso) {
  if (!iso) return todayKey();
  try {
    const d = parseISO(iso);
    return isValid(d) ? format(d, 'yyyy-MM-dd') : todayKey();
  } catch {
    return todayKey();
  }
}

const MONTHS = [
  { id: 'ALL', label: 'ALL' },
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

/** Caption under amount when not a fixed bill. */
function amountModeLabel(mode) {
  if (mode === 'estimate') return 'Estimate';
  if (mode === 'average') return 'Avg';
  return null;
}

/** Short paid_at for list meta (SQLite ISO / datetime). */
function formatPaidAt(paidAt) {
  if (!paidAt) return '';
  const s = String(paidAt);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

/**
 * Focus view: bills CRUD + mark paid (advances recurrence).
 * History mode lists bill_payments with year/month/name/sort filters.
 * @param {{
 *   editId?: number|null,
 *   onEditConsumed?: () => void,
 *   seedDate?: string|null,
 *   onSeedConsumed?: () => void,
 * }} props
 */
export default function BillsView({
  editId = null,
  onEditConsumed,
  seedDate = null,
  onSeedConsumed,
}) {
  const { refresh } = useBrief();
  const { methodHint } = useDateFormat();
  const [mode, setMode] = useState('edit'); // edit | history
  const [rows, setRows] = useState([]);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [due, setDue] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [recurrence, setRecurrence] = useState('');
  const [category, setCategory] = useState('');
  const [amountMode, setAmountMode] = useState('fixed');
  const [priority, setPriority] = useState(DEFAULT_PRIORITY);
  const [details, setDetails] = useState('');
  const [showOnCalendar, setShowOnCalendar] = useState(true);
  const [nudge, setNudge] = useState(false);
  const [nudgeMode, setNudgeMode] = useState('day_before');
  const [customDate, setCustomDate] = useState(() => todayKey());
  const [customTime, setCustomTime] = useState('09:00');
  const [customOpen, setCustomOpen] = useState(null); // 'create' | 'edit' | null
  const [stats, setStats] = useState({ count: 0, average: null, canAverage: false });
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const editRowRef = useScrollEditIntoView(editingId);
  const { selectedId, setSelectedId, listRef } = useSelectedCard();
  const [edit, setEdit] = useState({});
  const [editNudge, setEditNudge] = useState(false);
  const [editNudgeMode, setEditNudgeMode] = useState('day_before');
  const [editCustomDate, setEditCustomDate] = useState(() => todayKey());
  const [editCustomTime, setEditCustomTime] = useState('09:00');
  const [payingId, setPayingId] = useState(null);
  const [payActual, setPayActual] = useState('');
  const [editStats, setEditStats] = useState({
    count: 0,
    average: null,
    canAverage: false,
  });

  // History filters — bill name is the payment tag key
  const [histYear, setHistYear] = useState(() => new Date().getFullYear());
  const [histMonth, setHistMonth] = useState('ALL');
  const [histName, setHistName] = useState('ALL');
  const [histSort, setHistSort] = useState('dateDesc');
  const [filterYears, setFilterYears] = useState([new Date().getFullYear()]);
  const [filterNames, setFilterNames] = useState([]);
  const [payments, setPayments] = useState([]);
  const [search, setSearch] = useState('');
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  async function load() {
    setRows(await window.api.listBills());
  }

  useEffect(() => {
    load();
  }, []);

  // Load filter option lists once when entering history
  useEffect(() => {
    if (mode !== 'history') return;
    let cancelled = false;
    (async () => {
      const opts = await window.api.listBillPaymentFilterOptions();
      if (cancelled) return;
      const years = opts.years?.length ? opts.years : [new Date().getFullYear()];
      setFilterYears(years);
      setFilterNames(opts.names || []);
      if (!years.includes(histYear)) setHistYear(years[0]);
    })();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  // Reload payments whenever history filters change
  useEffect(() => {
    if (mode !== 'history') return;
    let cancelled = false;
    (async () => {
      const list = await window.api.listBillPayments({
        year: histYear,
        month: histMonth,
        billName: histName,
        sort: histSort,
      });
      if (!cancelled) setPayments(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, histYear, histMonth, histName, histSort]);

  useEffect(() => {
    if (editId == null) return;
    setMode('edit');
    setSearch('');
    const b = rows.find((x) => x.id === editId);
    if (!b) return;
    beginEdit(b);
    onEditConsumed?.();
  }, [editId, rows]);

  useEffect(() => {
    if (!seedDate) return;
    setMode('edit');
    setDue(seedDate);
    setShowOnCalendar(true);
    onSeedConsumed?.();
  }, [seedDate]);

  // Today bills cannot use Day Before (would be yesterday).
  useEffect(() => {
    if (nudge && nudgeMode === 'day_before' && due === todayKey()) {
      setNudgeMode('custom');
      setCustomDate(due);
      setCustomTime('09:00');
    }
  }, [nudge, nudgeMode, due]);

  useEffect(() => {
    if (!editNudge || editNudgeMode !== 'day_before') return;
    const editDue = edit.due_date || todayKey();
    if (editDue === todayKey()) {
      setEditNudgeMode('custom');
      setEditCustomDate(editDue);
      setEditCustomTime('09:00');
    }
  }, [editNudge, editNudgeMode, edit.due_date]);

  function applyNudgeOn(dueDate, setOn, setMode, setCDate, setCTime) {
    setOn(true);
    if (dueDate === todayKey()) {
      setMode('custom');
      setCDate(dueDate);
      setCTime('09:00');
    } else {
      setMode('day_before');
    }
  }

  // Refresh name-based payment stats for create form
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!name.trim()) {
        if (!cancelled) {
          setStats({ count: 0, average: null, canAverage: false });
          setAmountMode((m) => (m === 'average' ? 'fixed' : m));
        }
        return;
      }
      const s = await window.api.getBillAmountStats(name);
      if (cancelled) return;
      setStats(s);
      if (!s.canAverage) setAmountMode((m) => (m === 'average' ? 'fixed' : m));
    })();
    return () => {
      cancelled = true;
    };
  }, [name]);

  // Stats for edit form name
  useEffect(() => {
    if (editingId == null) return;
    let cancelled = false;
    (async () => {
      const n = edit.name || '';
      if (!String(n).trim()) {
        if (!cancelled) {
          setEditStats({ count: 0, average: null, canAverage: false });
          setEdit((prev) =>
            prev.amount_mode === 'average' ? { ...prev, amount_mode: 'fixed' } : prev
          );
        }
        return;
      }
      const s = await window.api.getBillAmountStats(n);
      if (cancelled) return;
      setEditStats(s);
      if (!s.canAverage) {
        setEdit((prev) =>
          prev.amount_mode === 'average' ? { ...prev, amount_mode: 'fixed' } : prev
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editingId, edit.name]);

  async function create(e) {
    e.preventDefault();
    setError('');
    try {
      await window.api.createBill({
        name,
        amount: Number(amount),
        due_date: due,
        recurrence: recurrence || null,
        category: category || null,
        amount_mode: amountMode,
        priority,
        description: details.trim() || null,
        show_on_calendar: showOnCalendar,
        nudge,
        nudge_mode: nudge ? nudgeMode : null,
        nudge_datetime:
          nudge && nudgeMode === 'custom' ? localToIso(customDate, customTime) : null,
      });
      setName('');
      setAmount('');
      setCategory('');
      setAmountMode('fixed');
      setPriority(DEFAULT_PRIORITY);
      setDetails('');
      setShowOnCalendar(true);
      setNudge(false);
      setNudgeMode('day_before');
      setCustomDate(todayKey());
      setCustomTime('09:00');
      await load();
      await refresh();
    } catch (err) {
      setError(err?.message || String(err));
    }
  }

  function beginEdit(b) {
    setEditingId(b.id);
    setSelectedId(b.id);
    setEdit({
      name: b.name,
      amount: String(b.amount),
      due_date: b.due_date,
      recurrence: b.recurrence || '',
      category: b.category || '',
      amount_mode: b.amount_mode || 'fixed',
      priority: b.priority ?? DEFAULT_PRIORITY,
      description: b.description || '',
      show_on_calendar: Number(b.show_on_calendar) !== 0,
    });
    const hasNudge = Boolean(b.nudge_datetime);
    setEditNudge(hasNudge);
    setEditNudgeMode(b.nudge_mode === 'custom' ? 'custom' : 'day_before');
    if (b.nudge_mode === 'custom' && b.nudge_datetime) {
      setEditCustomDate(dateFromIso(b.nudge_datetime));
      setEditCustomTime(timeFromIso(b.nudge_datetime));
    } else {
      setEditCustomDate(b.due_date || todayKey());
      setEditCustomTime('09:00');
    }
  }

  async function saveEdit(e) {
    e.preventDefault();
    try {
      await window.api.updateBill(editingId, {
        name: edit.name,
        amount: Number(edit.amount),
        due_date: edit.due_date,
        recurrence: edit.recurrence || null,
        category: edit.category || null,
        amount_mode: edit.amount_mode || 'fixed',
        priority: edit.priority ?? DEFAULT_PRIORITY,
        description: (edit.description || '').trim() || null,
        show_on_calendar: Boolean(edit.show_on_calendar),
        nudge: editNudge,
        nudge_mode: editNudge ? editNudgeMode : null,
        nudge_datetime:
          editNudge && editNudgeMode === 'custom'
            ? localToIso(editCustomDate, editCustomTime)
            : null,
      });
      setEditingId(null);
      await load();
      await refresh();
    } catch (err) {
      setError(err?.message || String(err));
    }
  }

  /** Mark paid — Electron has no window.prompt; estimate/avg uses inline actual. */
  async function paid(b, actualOverride) {
    setError('');
    const needsActual =
      b.amount_mode === 'estimate' || b.amount_mode === 'average';
    if (needsActual && actualOverride === undefined) {
      setPayingId(b.id);
      setPayActual(String(b.amount));
      return;
    }
    let opts;
    if (needsActual) {
      const actual = Number(actualOverride);
      if (!Number.isFinite(actual)) {
        setError('Invalid actual amount');
        return;
      }
      opts = { actual_amount: actual };
    }
    try {
      await window.api.markBillPaid(b.id, opts);
      setPayingId(null);
      await load();
      await refresh();
    } catch (err) {
      setError(err?.message || String(err));
    }
  }

  async function remove(id) {
    await window.api.deleteBill(id);
    await load();
    await refresh();
  }

  async function removePayment(id) {
    setError('');
    try {
      await window.api.deleteBillPayment(id);
      const list = await window.api.listBillPayments({
        year: histYear,
        month: histMonth,
        billName: histName,
        sort: histSort,
      });
      setPayments(list);
    } catch (err) {
      setError(err?.message || String(err));
    }
  }

  const isHistory = mode === 'history';
  const filteredBills = useMemo(
    () =>
      rows.filter((b) =>
        matchesEntitySearch(b, search, {
          textKeys: ['name', 'description', 'category'],
        })
      ),
    [rows, search]
  );
  const billVisibleIds = useMemo(
    () => (isHistory ? [] : filteredBills.map((b) => b.id)),
    [isHistory, filteredBills]
  );
  const payVisibleIds = useMemo(
    () => (isHistory ? payments.map((p) => p.id) : []),
    [isHistory, payments]
  );
  const billSel = useVisibleSelection(billVisibleIds);
  const paySel = useVisibleSelection(payVisibleIds);
  const sel = isHistory ? paySel : billSel;

  async function removeSelected() {
    const ids = sel.selectedList();
    if (!ids.length) {
      setBulkDeleteOpen(false);
      return;
    }
    if (isHistory) {
      await window.api.deleteBillPayments(ids);
      const list = await window.api.listBillPayments({
        year: histYear,
        month: histMonth,
        billName: histName,
        sort: histSort,
      });
      setPayments(list);
    } else {
      await window.api.deleteBills(ids);
      await load();
      await refresh();
    }
    sel.clear();
    setBulkDeleteOpen(false);
  }

  function setCreateEstimate(checked) {
    if (checked) {
      setAmountMode('estimate');
    } else if (amountMode === 'estimate') {
      setAmountMode('fixed');
    }
  }

  function setCreateAverage(checked) {
    if (!stats.canAverage) return;
    if (checked) {
      setAmountMode('average');
      if (stats.average != null) setAmount(String(Number(stats.average.toFixed(2))));
    } else if (amountMode === 'average') {
      setAmountMode('fixed');
    }
  }

  function setEditEstimate(checked) {
    if (checked) {
      setEdit({ ...edit, amount_mode: 'estimate' });
    } else if (edit.amount_mode === 'estimate') {
      setEdit({ ...edit, amount_mode: 'fixed' });
    }
  }

  function setEditAverage(checked) {
    if (!editStats.canAverage) return;
    if (checked) {
      const next = { ...edit, amount_mode: 'average' };
      if (editStats.average != null) {
        next.amount = String(Number(editStats.average.toFixed(2)));
      }
      setEdit(next);
    } else if (edit.amount_mode === 'average') {
      setEdit({ ...edit, amount_mode: 'fixed' });
    }
  }

  return (
    <div className="module-view">
      <h1>{isHistory ? 'Bills (History)' : 'Bills (Edit mode)'}</h1>
      <p className="module-view__hint">
        {isHistory
          ? 'Filter paid history by year, month, and bill name. Highest/Lowest sort by amount.'
          : `Due dates + recurrence. Estimate or Calc Average for variable bills. Paid advances recurring bills and logs actuals (date method: ${methodHint}).`}
      </p>

      {isHistory ? (
        <div className="create-form glass-inset bills-history-filters">
          <div className="bills-history-filters__row">
            <label className="bills-history-filters__field">
              <span>Year</span>
              <select
                value={histYear}
                onChange={(e) => setHistYear(Number(e.target.value))}
                aria-label="Filter year"
              >
                {filterYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <label className="bills-history-filters__field">
              <span>Month</span>
              <select
                value={histMonth}
                onChange={(e) => setHistMonth(e.target.value)}
                aria-label="Filter month"
              >
                {MONTHS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="bills-history-filters__field bills-history-filters__field--grow">
              <span>Bill name</span>
              <select
                value={histName}
                onChange={(e) => setHistName(e.target.value)}
                aria-label="Filter bill name"
              >
                <option value="ALL">ALL</option>
                {filterNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="kind-toggle" role="group" aria-label="Sort order">
            <button
              type="button"
              className={histSort === 'dateAsc' ? 'active' : ''}
              onClick={() => setHistSort('dateAsc')}
            >
              Ascending
            </button>
            <button
              type="button"
              className={histSort === 'dateDesc' ? 'active' : ''}
              onClick={() => setHistSort('dateDesc')}
            >
              Descending
            </button>
            <button
              type="button"
              className={histSort === 'amountHigh' ? 'active' : ''}
              onClick={() => setHistSort('amountHigh')}
            >
              Highest
            </button>
            <button
              type="button"
              className={histSort === 'amountLow' ? 'active' : ''}
              onClick={() => setHistSort('amountLow')}
            >
              Lowest
            </button>
          </div>
          <button type="button" className="btn-primary" onClick={() => setMode('edit')}>
            Create
          </button>
          {error && <span style={{ color: 'var(--danger)' }}>{error}</span>}
        </div>
      ) : (
        <form className="create-form glass-inset" onSubmit={create}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Bill name"
          />
          <div className="settings-row bill-amount-row">
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount"
              required
              disabled={amountMode === 'average'}
            />
            <label
              className={`bill-check ${amountMode === 'average' ? 'bill-check--muted' : ''}`}
            >
              <input
                type="checkbox"
                checked={amountMode === 'estimate'}
                disabled={amountMode === 'average'}
                onChange={(e) => setCreateEstimate(e.target.checked)}
              />
              Estimate
            </label>
            <label
              className={`bill-check ${!stats.canAverage ? 'bill-check--muted' : ''}`}
              title={
                stats.canAverage
                  ? `Average of ${stats.count} payments`
                  : `Needs ${6 - stats.count} more payment(s) for this name`
              }
            >
              <input
                type="checkbox"
                checked={amountMode === 'average'}
                disabled={!stats.canAverage}
                onChange={(e) => setCreateAverage(e.target.checked)}
              />
              Calc Average
            </label>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} required />
            <label className="bill-check">
              <input
                type="checkbox"
                checked={showOnCalendar}
                onChange={(e) => setShowOnCalendar(e.target.checked)}
              />
              Calendar
            </label>
          </div>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Category (optional)"
          />
          <div className="reminder-meta-row">
            <div className="reminder-meta-row__left">
              <div className="kind-toggle" role="group" aria-label="Recurrence">
                {RECUR.map((r) => (
                  <button
                    key={r.id || 'once'}
                    type="button"
                    className={recurrence === r.id ? 'active' : ''}
                    onClick={() => setRecurrence(r.id)}
                  >
                    {r.label}
                  </button>
                ))}
                <button type="button" onClick={() => setMode('history')}>
                  HISTORY
                </button>
              </div>
              <PrioritySelect id="bill-priority" value={priority} onChange={setPriority} />
              <NudgeRow
                nudge={nudge}
                mode={nudgeMode}
                dueDate={due}
                dayBeforeTitle="09:00, one day before due"
                onNudgeChange={(on) => {
                  if (!on) {
                    setNudge(false);
                    return;
                  }
                  applyNudgeOn(due, setNudge, setNudgeMode, setCustomDate, setCustomTime);
                }}
                onDayBefore={() => {
                  setNudge(true);
                  setNudgeMode('day_before');
                }}
                onCustom={() => {
                  setNudge(true);
                  setCustomOpen('create');
                }}
              />
              <NudgePreview
                nudge={nudge}
                mode={nudgeMode}
                dueDate={due}
                dueTime="09:00"
                customDate={customDate}
                customTime={customTime}
              />
            </div>
            <DetailsInline
              value={details}
              onChange={setDetails}
              placeholder="Optional notes"
              ariaLabel="Optional notes"
              compact
            />
          </div>
          <button type="submit" className="btn-primary">
            Create
          </button>
          {error && <span style={{ color: 'var(--danger)' }}>{error}</span>}
        </form>
      )}

      {!isHistory && (
        <div className="module-filter-bar glass-inset">
          <label className="module-filter-bar__field module-filter-bar__field--grow">
            Search
            <TagSearchInput
              value={search}
              onChange={setSearch}
              placeholder="Name, details, or category"
              aria-label="Search bills by name, details, or category"
            />
          </label>
        </div>
      )}

      <ListSelectToolbar
        selectAllRef={sel.selectAllRef}
        allVisibleSelected={sel.allVisibleSelected}
        selectableCount={sel.selectableCount}
        selectedCount={sel.selectedVisibleCount}
        onSelectAllChange={sel.onSelectAllChange}
        onDelete={() => setBulkDeleteOpen(true)}
        selectAllAriaLabel={
          isHistory ? 'Select all visible payments' : 'Select all visible bills'
        }
      />

      <NudgeCustomDialog
        open={customOpen === 'create'}
        dueDate={due}
        time={customTime}
        initialDate={customDate}
        prompt={`When to ping before the bill is due (date method: ${methodHint}).`}
        onCancel={() => setCustomOpen(null)}
        onSave={(d, t) => {
          setCustomDate(d);
          setCustomTime(t);
          setNudgeMode('custom');
          setNudge(true);
          setCustomOpen(null);
        }}
      />
      <NudgeCustomDialog
        open={customOpen === 'edit'}
        dueDate={edit.due_date || todayKey()}
        time={editCustomTime}
        initialDate={editCustomDate}
        prompt={`When to ping before the bill is due (date method: ${methodHint}).`}
        onCancel={() => setCustomOpen(null)}
        onSave={(d, t) => {
          setEditCustomDate(d);
          setEditCustomTime(t);
          setEditNudgeMode('custom');
          setEditNudge(true);
          setCustomOpen(null);
        }}
      />

      {isHistory ? (
        <ul className="module-list">
          {payments.map((p) => (
            <li key={p.id} className="module-list__item glass-inset">
              <div className="module-list__row">
                <div className="tracker-list__main">
                  <label className="bill-check tracker-list__check">
                    <input
                      type="checkbox"
                      checked={paySel.selected.has(p.id)}
                      onChange={() => paySel.toggle(p.id)}
                      aria-label={`Select payment ${p.bill_name}`}
                    />
                  </label>
                  <div>
                    <strong>{p.bill_name}</strong>
                    <div className="module-list__meta">
                      ${Number(p.amount).toFixed(2)}
                      {p.due_date ? ` · due ${p.due_date}` : ''}
                      {' · '}paid {formatPaidAt(p.paid_at)}
                    </div>
                  </div>
                </div>
                <div className="item-row__actions">
                  <button
                    type="button"
                    className="danger"
                    onClick={() => removePayment(p.id)}
                  >
                    Del
                  </button>
                </div>
              </div>
            </li>
          ))}
          {!payments.length && <p className="stub-empty">No paid bills for these filters.</p>}
        </ul>
      ) : (
        <ul className="module-list" ref={listRef}>
          {filteredBills.map((b) => (
            <li
              key={b.id}
              ref={editingId === b.id ? editRowRef : null}
              onClick={() => setSelectedId(b.id)}
              className={`module-list__item glass-inset module-list__item--col${
                editingId === b.id ? ' module-list__item--editing' : ''
              }${selectedId === b.id || editingId === b.id ? ' module-list__item--selected' : ''}`}
            >
              {editingId === b.id ? (
                <form className="edit-form" onSubmit={saveEdit}>
                  <input
                    type="text"
                    value={edit.name}
                    onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                  />
                  <div className="settings-row bill-amount-row">
                    <input
                      type="number"
                      step="0.01"
                      value={edit.amount}
                      onChange={(e) => setEdit({ ...edit, amount: e.target.value })}
                      required
                      disabled={edit.amount_mode === 'average'}
                    />
                    <label
                      className={`bill-check ${
                        edit.amount_mode === 'average' ? 'bill-check--muted' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={edit.amount_mode === 'estimate'}
                        disabled={edit.amount_mode === 'average'}
                        onChange={(e) => setEditEstimate(e.target.checked)}
                      />
                      Estimate
                    </label>
                    <label
                      className={`bill-check ${!editStats.canAverage ? 'bill-check--muted' : ''}`}
                      title={
                        editStats.canAverage
                          ? `Average of ${editStats.count} payments`
                          : `Needs ${6 - editStats.count} more payment(s) for this name`
                      }
                    >
                      <input
                        type="checkbox"
                        checked={edit.amount_mode === 'average'}
                        disabled={!editStats.canAverage}
                        onChange={(e) => setEditAverage(e.target.checked)}
                      />
                      Calc Average
                    </label>
                    <input
                      type="date"
                      value={edit.due_date}
                      onChange={(e) => setEdit({ ...edit, due_date: e.target.value })}
                      required
                    />
                    <label className="bill-check">
                      <input
                        type="checkbox"
                        checked={Boolean(edit.show_on_calendar)}
                        onChange={(e) =>
                          setEdit({ ...edit, show_on_calendar: e.target.checked })
                        }
                      />
                      Calendar
                    </label>
                  </div>
                  <input
                    type="text"
                    value={edit.category}
                    onChange={(e) => setEdit({ ...edit, category: e.target.value })}
                    placeholder="Category"
                  />
                  <div className="reminder-meta-row">
                    <div className="reminder-meta-row__left">
                      <div className="kind-toggle">
                        {RECUR.map((r) => (
                          <button
                            key={r.id || 'once'}
                            type="button"
                            className={edit.recurrence === r.id ? 'active' : ''}
                            onClick={() => setEdit({ ...edit, recurrence: r.id })}
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>
                      <PrioritySelect
                        id={`edit-bill-priority-${b.id}`}
                        value={edit.priority ?? DEFAULT_PRIORITY}
                        onChange={(n) => setEdit({ ...edit, priority: n })}
                      />
                      <NudgeRow
                        nudge={editNudge}
                        mode={editNudgeMode}
                        dueDate={edit.due_date || todayKey()}
                        dayBeforeTitle="09:00, one day before due"
                        onNudgeChange={(on) => {
                          if (!on) {
                            setEditNudge(false);
                            return;
                          }
                          applyNudgeOn(
                            edit.due_date || todayKey(),
                            setEditNudge,
                            setEditNudgeMode,
                            setEditCustomDate,
                            setEditCustomTime
                          );
                        }}
                        onDayBefore={() => {
                          setEditNudge(true);
                          setEditNudgeMode('day_before');
                        }}
                        onCustom={() => {
                          setEditNudge(true);
                          setCustomOpen('edit');
                        }}
                      />
                      <NudgePreview
                        nudge={editNudge}
                        mode={editNudgeMode}
                        dueDate={edit.due_date || todayKey()}
                        dueTime="09:00"
                        customDate={editCustomDate}
                        customTime={editCustomTime}
                      />
                    </div>
                    <DetailsInline
                      value={edit.description || ''}
                      onChange={(text) => setEdit({ ...edit, description: text })}
                      placeholder="Optional notes"
                      ariaLabel="Optional notes"
                      compact
                    />
                  </div>
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
                  onDoubleClick={rowDblClick(() => beginEdit(b))}
                >
                  <div className="tracker-list__main">
                    <label className="bill-check tracker-list__check">
                      <input
                        type="checkbox"
                        checked={billSel.selected.has(b.id)}
                        onChange={() => billSel.toggle(b.id)}
                        aria-label={`Select ${b.name}`}
                      />
                    </label>
                    <div>
                      <strong>
                        <span className="priority-badge" data-p={b.priority ?? DEFAULT_PRIORITY}>
                          P{b.priority ?? DEFAULT_PRIORITY}
                        </span>{' '}
                        {b.name}
                      </strong>
                      <div className="module-list__meta">
                        ${Number(b.amount).toFixed(2)}
                        {amountModeLabel(b.amount_mode) && (
                          <span className="bill-amount-caption">
                            {' '}
                            {amountModeLabel(b.amount_mode)}
                          </span>
                        )}
                        {' · '}due {b.due_date} · {b.paid_status}
                        {b.recurrence ? ` · ${b.recurrence}` : ''}
                        {b.category ? ` · ${b.category}` : ''}
                      </div>
                      <DetailsPreview text={b.description} />
                    </div>
                  </div>
                  <div className="item-row__actions">
                    {b.paid_status !== 'paid' && payingId === b.id && (
                      <BillPayConfirm
                        value={payActual}
                        onChange={setPayActual}
                        onConfirm={() => paid(b, payActual)}
                        onCancel={() => setPayingId(null)}
                      />
                    )}
                    {b.paid_status !== 'paid' && payingId !== b.id && (
                      <button type="button" onClick={() => paid(b)}>
                        Paid
                      </button>
                    )}
                    <button type="button" onClick={() => beginEdit(b)}>
                      Edit
                    </button>
                    <button type="button" className="danger" onClick={() => remove(b.id)}>
                      Del
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
          {!rows.length && <p className="stub-empty">No bills yet.</p>}
          {!!rows.length && !filteredBills.length && (
            <p className="stub-empty">No bills match these filters.</p>
          )}
        </ul>
      )}

      <ConfirmDialog
        open={bulkDeleteOpen}
        title={
          isHistory
            ? `Delete ${sel.selectedVisibleCount} payment${sel.selectedVisibleCount === 1 ? '' : 's'}?`
            : `Delete ${sel.selectedVisibleCount} bill${sel.selectedVisibleCount === 1 ? '' : 's'}?`
        }
        message={
          isHistory
            ? 'Removes the selected payment history rows. This cannot be undone.'
            : 'Removes the selected bills. This cannot be undone.'
        }
        confirmLabel="Delete"
        danger
        onConfirm={removeSelected}
        onCancel={() => setBulkDeleteOpen(false)}
      />
    </div>
  );
}
