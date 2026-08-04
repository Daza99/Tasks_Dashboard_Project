import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { useBrief } from '../context/BriefContext';

const RECUR = [
  { id: '', label: 'once' },
  { id: 'monthly', label: 'monthly' },
  { id: 'quarterly', label: 'quarterly' },
  { id: 'yearly', label: 'yearly' },
];

/** Caption under amount when not a fixed bill. */
function amountModeLabel(mode) {
  if (mode === 'estimate') return 'Estimate';
  if (mode === 'average') return 'Avg';
  return null;
}

/**
 * Focus view: bills CRUD + mark paid (advances recurrence).
 * @param {{ editId?: number|null, onEditConsumed?: () => void }} props
 */
export default function BillsView({ editId = null, onEditConsumed }) {
  const { refresh } = useBrief();
  const [rows, setRows] = useState([]);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [due, setDue] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [recurrence, setRecurrence] = useState('');
  const [category, setCategory] = useState('');
  const [amountMode, setAmountMode] = useState('fixed');
  const [stats, setStats] = useState({ count: 0, average: null, canAverage: false });
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [edit, setEdit] = useState({});
  const [editStats, setEditStats] = useState({
    count: 0,
    average: null,
    canAverage: false,
  });

  async function load() {
    setRows(await window.api.listBills());
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (editId == null) return;
    const b = rows.find((x) => x.id === editId);
    if (!b) return;
    beginEdit(b);
    onEditConsumed?.();
  }, [editId, rows]);

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
      });
      setName('');
      setAmount('');
      setCategory('');
      setAmountMode('fixed');
      await load();
      await refresh();
    } catch (err) {
      setError(err?.message || String(err));
    }
  }

  function beginEdit(b) {
    setEditingId(b.id);
    setEdit({
      name: b.name,
      amount: String(b.amount),
      due_date: b.due_date,
      recurrence: b.recurrence || '',
      category: b.category || '',
      amount_mode: b.amount_mode || 'fixed',
    });
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
      });
      setEditingId(null);
      await load();
      await refresh();
    } catch (err) {
      setError(err?.message || String(err));
    }
  }

  /** Prompt for actual when amount is estimate/avg; fixed uses standing amount. */
  async function paid(b) {
    setError('');
    let opts;
    if (b.amount_mode === 'estimate' || b.amount_mode === 'average') {
      const raw = window.prompt(
        `Actual amount paid for "${b.name}"`,
        String(b.amount)
      );
      if (raw === null) return;
      const actual = Number(raw);
      if (!Number.isFinite(actual)) {
        setError('Invalid actual amount');
        return;
      }
      opts = { actual_amount: actual };
    }
    await window.api.markBillPaid(b.id, opts);
    await load();
    await refresh();
  }

  async function remove(id) {
    await window.api.deleteBill(id);
    await load();
    await refresh();
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
      <h1>Bills</h1>
      <p className="module-view__hint">
        Due dates + recurrence. Estimate or Calc Average for variable bills. Paid
        advances recurring bills and logs actuals.
      </p>

      <form className="create-form glass-inset" onSubmit={create}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Bill name"
          required
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
        </div>
        <input
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Category (optional)"
        />
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
        </div>
        <button type="submit" className="btn-primary">
          Create
        </button>
        {error && <span style={{ color: 'var(--danger)' }}>{error}</span>}
      </form>

      <ul className="module-list">
        {rows.map((b) => (
          <li key={b.id} className="module-list__item glass-inset module-list__item--col">
            {editingId === b.id ? (
              <form className="edit-form" onSubmit={saveEdit}>
                <input
                  type="text"
                  value={edit.name}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                  required
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
                </div>
                <input
                  type="text"
                  value={edit.category}
                  onChange={(e) => setEdit({ ...edit, category: e.target.value })}
                  placeholder="Category"
                />
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
                <div className="item-row__actions">
                  <button type="submit">Save</button>
                  <button type="button" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="module-list__row">
                <div>
                  <strong>{b.name}</strong>
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
                </div>
                <div className="item-row__actions">
                  {b.paid_status !== 'paid' && (
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
      </ul>
    </div>
  );
}
