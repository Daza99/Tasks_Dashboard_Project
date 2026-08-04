import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { useBrief } from '../context/BriefContext';

/**
 * Focus view: spending / transactions entry + recent list.
 */
export default function SpendingView() {
  const { refresh } = useBrief();
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [edit, setEdit] = useState({});

  async function load() {
    setRows(await window.api.listTransactions());
    setCategories(await window.api.listCategories());
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e) {
    e.preventDefault();
    setError('');
    try {
      await window.api.createTransaction({
        amount: Number(amount),
        category: category || 'misc',
        description: description || null,
        date,
      });
      setAmount('');
      setDescription('');
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
        description: edit.description || null,
        date: edit.date,
      });
      setEditingId(null);
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
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
        />
        <button type="submit" className="btn-primary">
          Add
        </button>
        {error && <span style={{ color: 'var(--danger)' }}>{error}</span>}
      </form>

      <ul className="module-list">
        {rows.map((tx) => (
          <li key={tx.id} className="module-list__item glass-inset module-list__item--col">
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
                <input
                  type="text"
                  value={edit.category}
                  onChange={(e) => setEdit({ ...edit, category: e.target.value })}
                  required
                />
                <input
                  type="text"
                  value={edit.description || ''}
                  onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                  placeholder="Description"
                />
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
                  <strong>
                    ${Number(tx.amount).toFixed(2)} · {tx.category}
                  </strong>
                  <div className="module-list__meta">
                    {tx.date}
                    {tx.description ? ` · ${tx.description}` : ''}
                  </div>
                </div>
                <div className="item-row__actions">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(tx.id);
                      setEdit({
                        amount: String(tx.amount),
                        category: tx.category,
                        description: tx.description || '',
                        date: tx.date,
                      });
                    }}
                  >
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
      </ul>
    </div>
  );
}
