import React, { useEffect, useState } from 'react';
import { useBrief } from '../context/BriefContext';

const FREQS = ['daily', 'weekdays', 'custom'];

/**
 * Focus view: habits CRUD + check-in + streak + optional nudge time.
 */
export default function HabitsView() {
  const { refresh } = useBrief();
  const [rows, setRows] = useState([]);
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState('daily');
  const [nudge, setNudge] = useState('');
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editFreq, setEditFreq] = useState('daily');
  const [editNudge, setEditNudge] = useState('');

  async function load() {
    setRows(await window.api.listHabits());
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e) {
    e.preventDefault();
    setError('');
    try {
      await window.api.createHabit({
        name,
        frequency,
        nudge_time: nudge || null,
      });
      setName('');
      setNudge('');
      await load();
      await refresh();
    } catch (err) {
      setError(err?.message || String(err));
    }
  }

  function beginEdit(h) {
    setEditingId(h.id);
    setEditName(h.name);
    setEditFreq(h.frequency);
    setEditNudge(h.nudge_time || '');
  }

  async function saveEdit(e) {
    e.preventDefault();
    try {
      await window.api.updateHabit(editingId, {
        name: editName,
        frequency: editFreq,
        nudge_time: editNudge || null,
      });
      setEditingId(null);
      await load();
      await refresh();
    } catch (err) {
      setError(err?.message || String(err));
    }
  }

  async function toggle(id) {
    await window.api.toggleCheckin(id);
    await load();
    await refresh();
  }

  async function remove(id) {
    await window.api.deleteHabit(id);
    await load();
    await refresh();
  }

  return (
    <div className="module-view">
      <h1>Habits</h1>
      <p className="module-view__hint">
        Daily / weekdays check-in. Optional nudge time fires a popup.
      </p>

      <form className="create-form glass-inset" onSubmit={create}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Habit name"
          required
        />
        <div className="kind-toggle" role="group" aria-label="Frequency">
          {FREQS.map((f) => (
            <button
              key={f}
              type="button"
              className={frequency === f ? 'active' : ''}
              onClick={() => setFrequency(f)}
            >
              {f}
            </button>
          ))}
        </div>
        <label className="edit-label">
          Nudge time (optional)
          <input type="time" value={nudge} onChange={(e) => setNudge(e.target.value)} />
        </label>
        <button type="submit" className="btn-primary">
          Create
        </button>
        {error && <span style={{ color: 'var(--danger)' }}>{error}</span>}
      </form>

      <ul className="module-list">
        {rows.map((h) => (
          <li key={h.id} className="module-list__item glass-inset module-list__item--col">
            {editingId === h.id ? (
              <form className="edit-form" onSubmit={saveEdit}>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
                <div className="kind-toggle">
                  {FREQS.map((f) => (
                    <button
                      key={f}
                      type="button"
                      className={editFreq === f ? 'active' : ''}
                      onClick={() => setEditFreq(f)}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <label className="edit-label">
                  Nudge
                  <input
                    type="time"
                    value={editNudge}
                    onChange={(e) => setEditNudge(e.target.value)}
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
              <>
                <div className="module-list__row">
                  <div>
                    <strong>{h.name}</strong>
                    <div className="module-list__meta">
                      {h.frequency}
                      {h.nudge_time ? ` · nudge ${h.nudge_time}` : ''}
                      {` · streak ${h.streak || 0}`}
                      {h.completed_today ? ' · done today' : ''}
                    </div>
                  </div>
                  <div className="item-row__actions">
                    <button type="button" onClick={() => toggle(h.id)}>
                      {h.completed_today ? 'Undo' : 'Check in'}
                    </button>
                    <button type="button" onClick={() => beginEdit(h)}>
                      Edit
                    </button>
                    <button type="button" className="danger" onClick={() => remove(h.id)}>
                      Del
                    </button>
                  </div>
                </div>
              </>
            )}
          </li>
        ))}
        {!rows.length && <p className="stub-empty">No habits yet.</p>}
      </ul>
    </div>
  );
}
