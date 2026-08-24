import React, { useState } from 'react';
import { format, parseISO, isValid, isBefore, startOfDay } from 'date-fns';
import { useBrief } from '../context/BriefContext';
import { useLayout } from '../context/LayoutContext';
import BillPayConfirm from '../components/BillPayConfirm';
import { useDateFormat } from '../hooks/useDateFormat';
import { rowDblClick } from '../../utils/row-dblclick.js';

function fmtWhen(iso) {
  if (!iso || iso.startsWith('9999')) return 'Open';
  try {
    const d = typeof iso === 'string' ? parseISO(iso) : new Date(iso);
    if (!isValid(d)) return iso;
    return format(d, 'h:mm a');
  } catch {
    return iso;
  }
}

/** Task due time, or overdue if the due datetime is before local midnight. */
function fmtTaskWhen(iso) {
  if (!iso || iso.startsWith('9999')) return 'Open';
  try {
    const d = typeof iso === 'string' ? parseISO(iso) : new Date(iso);
    if (!isValid(d)) return iso;
    if (isBefore(d, startOfDay(new Date()))) return 'overdue';
    return format(d, 'h:mm a');
  } catch {
    return iso;
  }
}

/**
 * Focus landing: items due today (tasks, reminders, bills, habits) plus overdue tasks.
 * Type: Outfit title + Habits, Sitka Tasks, Source Serif 4 Reminders, IBM Plex Mono Bills.
 * @param {{
 *   onEditRequest?: (type: string, id: number) => void
 * }} props
 */
export default function TodayView({ onEditRequest }) {
  const { brief, loading, error, refresh } = useBrief();
  const { enterCompact } = useLayout();
  const { methodHint } = useDateFormat();
  const [payingId, setPayingId] = useState(null);
  const [payActual, setPayActual] = useState('');

  const tasks = brief?.tasksToday || [];
  const habits = brief?.habitsToday || [];
  const reminders = brief?.remindersToday || [];
  const bills = brief?.billsDueToday || [];

  async function completeTask(id) {
    await window.api.completeTask(id);
    await refresh();
  }

  async function completeRem(id) {
    await window.api.completeReminder(id);
    await refresh();
  }

  async function toggleHabit(id) {
    await window.api.toggleCheckin(id);
    await refresh();
  }

  /** Paid — inline actual for estimate/average bills. */
  async function payBill(b, actualOverride) {
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
      if (!Number.isFinite(actual)) return;
      opts = { actual_amount: actual };
    }
    try {
      await window.api.markBillPaid(b.id, opts);
      setPayingId(null);
      await refresh();
    } catch (_err) {
      /* markPaid logs in main */
    }
  }

  return (
    <div className="today-view">
      <div className="today-view__head">
        <h1 className="today-view__title">Today</h1>
        <button
          type="button"
          className="btn-focus-back today-view__back"
          onClick={enterCompact}
          aria-label="Back to Compact"
          title="Compact (Home)"
        >
          ←
        </button>
      </div>
      <p className="today-view__meta">
        Due today only (date method: {methodHint})
      </p>

      {loading && !brief && <p className="today-view__meta">Loading…</p>}
      {error && (
        <p className="today-view__meta" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}

      <section className="today-view__section">
        <h2 className="today-view__h today-view__h--sitka">Tasks</h2>
        {tasks.length ? (
          <ul className="today-view__list">
            {tasks.map((t) => (
              <li
                key={t.id}
                className="today-view__row"
                onDoubleClick={rowDblClick(() => onEditRequest?.('task', t.id))}
              >
                <div className="today-view__main">
                  <span className="today-view__name">{t.title}</span>
                  <span className="today-view__when">{fmtTaskWhen(t.due_datetime)}</span>
                </div>
                <div className="today-view__actions">
                  <button type="button" onClick={() => completeTask(t.id)}>
                    Done
                  </button>
                  <button
                    type="button"
                    onClick={() => onEditRequest?.('task', t.id)}
                  >
                    Edit
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="today-view__meta">None today.</p>
        )}
      </section>

      <section className="today-view__section">
        <h2 className="today-view__h today-view__h--outfit">Habits</h2>
        {habits.length ? (
          <ul className="today-view__list">
            {habits.map((h) => (
              <li
                key={h.id}
                className={`today-view__row${h.completed_today ? ' today-view__row--done' : ''}`}
                onDoubleClick={rowDblClick(() => onEditRequest?.('habit', h.id))}
              >
                <div className="today-view__main">
                  <span className="today-view__name">{h.name}</span>
                  {h.streak > 0 && (
                    <span className="today-view__when">{h.streak} streak</span>
                  )}
                </div>
                <div className="today-view__actions">
                  <button type="button" onClick={() => toggleHabit(h.id)}>
                    {h.completed_today ? 'Undo' : 'Check'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onEditRequest?.('habit', h.id)}
                  >
                    Edit
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="today-view__meta">None today.</p>
        )}
      </section>

      <section className="today-view__section">
        <h2 className="today-view__h today-view__h--serif">Reminders</h2>
        {reminders.length ? (
          <ul className="today-view__list">
            {reminders.map((r) => (
              <li
                key={r.id}
                className="today-view__row"
                onDoubleClick={rowDblClick(() => onEditRequest?.('reminder', r.id))}
              >
                <div className="today-view__main">
                  <span className="today-view__name">{r.title}</span>
                  <span className="today-view__when">{fmtWhen(r.datetime)}</span>
                </div>
                <div className="today-view__actions">
                  <button type="button" onClick={() => completeRem(r.id)}>
                    Done
                  </button>
                  <button
                    type="button"
                    onClick={() => onEditRequest?.('reminder', r.id)}
                  >
                    Edit
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="today-view__meta">None today.</p>
        )}
      </section>

      <section className="today-view__section">
        <h2 className="today-view__h today-view__h--mono">Bills</h2>
        {bills.length ? (
          <ul className="today-view__list">
            {bills.map((b) => (
              <li
                key={b.id}
                className="today-view__row"
                onDoubleClick={rowDblClick(() => onEditRequest?.('bill', b.id))}
              >
                <div className="today-view__main">
                  <span className="today-view__name">
                    {b.name} · ${Number(b.amount).toFixed(2)}
                    {b.amount_mode === 'estimate' && ' estimate'}
                    {b.amount_mode === 'average' && ' avg'}
                  </span>
                  <span className="today-view__when">due today</span>
                </div>
                <div className="today-view__actions">
                  {payingId === b.id ? (
                    <BillPayConfirm
                      value={payActual}
                      onChange={setPayActual}
                      onConfirm={() => payBill(b, payActual)}
                      onCancel={() => setPayingId(null)}
                    />
                  ) : (
                    <button type="button" onClick={() => payBill(b)}>
                      Paid
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onEditRequest?.('bill', b.id)}
                  >
                    Edit
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="today-view__meta">None today.</p>
        )}
      </section>
    </div>
  );
}
