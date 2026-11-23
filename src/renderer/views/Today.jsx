import React, { useState } from 'react';
import { format, parseISO, isValid, isBefore, startOfDay } from 'date-fns';
import { useBrief } from '../context/BriefContext';
import { useLayout } from '../context/LayoutContext';
import BillPayConfirm from '../components/BillPayConfirm';
import { useDateFormat } from '../hooks/useDateFormat';
import { rowDblClick } from '../../utils/row-dblclick.js';
import { HabitColorDot } from '../components/HabitColorField';

/**
 * Local calendar day. A bare yyyy-mm-dd stays that civil day.
 * ISO timestamps use the local day so a UTC Z value does not shift the label.
 * @param {string|Date|null|undefined} value
 * @returns {Date|null}
 */
function localDay(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return isValid(value) ? value : null;
  const s = String(value);
  if (s.startsWith('9999')) return null;
  const key = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (key) {
    const d = new Date(Number(key[1]), Number(key[2]) - 1, Number(key[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  try {
    const d = parseISO(s);
    return isValid(d) ? d : null;
  } catch {
    return null;
  }
}

/** 12-hour clock from stored Actual HH:mm. Blank when missing — no Note-time fallback. */
function clockFromActual(hhmm) {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(String(hhmm))) return '';
  const [hh, mm] = String(hhmm).split(':').map(Number);
  if (hh > 23 || mm > 59) return '';
  return format(new Date(2000, 0, 1, hh, mm), 'h:mm a');
}

/** Wall clock from a due ISO (tasks). */
function clockFromIso(iso) {
  const d = localDay(iso);
  if (!d) return '';
  return format(d, 'h:mm a');
}

/**
 * This Week stamp: weekday + settings date, then an optional clock.
 * @param {string|Date|null|undefined} value
 * @param {string} timeLabel
 * @param {(value: Date) => string} formatDate
 */
function weekStamp(value, timeLabel, formatDate) {
  const d = localDay(value);
  if (!d) return timeLabel || 'Open';
  const date = formatDate(d);
  if (!date) return timeLabel || 'Open';
  const head = `${format(d, 'EEEE')} ${date}`;
  return timeLabel ? `${head} · ${timeLabel}` : head;
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
 * Focus landing. mode "today" = due today; mode "week" = next 7 days from today.
 * Type: Outfit title + Habits, Sitka Tasks, Source Serif 4 Reminders, IBM Plex Mono Bills.
 * @param {{
 *   mode?: 'today' | 'week',
 *   onEditRequest?: (type: string, id: number) => void,
 *   onNavigate?: (viewId: string) => void
 * }} props
 */
export default function TodayView({ mode = 'today', onEditRequest, onNavigate }) {
  const { brief, loading, error, refresh } = useBrief();
  const { enterCompact } = useLayout();
  const { methodHint, formatDate } = useDateFormat();
  const [payingId, setPayingId] = useState(null);
  const [payActual, setPayActual] = useState('');
  const [payMode, setPayMode] = useState('paid');
  const isWeek = mode === 'week';
  const emptyLabel = isWeek ? 'None in the next 7 days.' : 'None today.';

  const tasks = (isWeek ? brief?.tasksNext7 : brief?.tasksToday) || [];
  const habits = (isWeek ? brief?.habitsNext7 : brief?.habitsToday) || [];
  const reminders = (isWeek ? brief?.remindersNext7 : brief?.remindersToday) || [];
  const bills = (isWeek ? brief?.billsDueNext7 : brief?.billsDueToday) || [];

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

  /** Paid / Paid Late — inline actual for estimate/average bills. */
  async function payBill(b, actualOverride, mode = 'paid') {
    const needsActual =
      b.amount_mode === 'estimate' || b.amount_mode === 'average';
    if (needsActual && actualOverride === undefined) {
      setPayingId(b.id);
      setPayMode(mode);
      setPayActual(String(b.amount));
      return;
    }
    const opts = {};
    if (needsActual) {
      const actual = Number(actualOverride);
      if (!Number.isFinite(actual)) return;
      opts.actual_amount = actual;
    }
    if (mode === 'late') opts.late = true;
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
        <h1 className="today-view__title">{isWeek ? 'This Week' : 'Today'}</h1>
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
        {isWeek
          ? `Next 7 days from today (date method: ${methodHint})`
          : `Due today only (date method: ${methodHint})`}
      </p>

      {loading && !brief && <p className="today-view__meta">Loading…</p>}
      {error && (
        <p className="today-view__meta" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}

      <section className="today-view__section">
        <div className="today-view__section-head">
          <h2 className="today-view__h today-view__h--mono">Bills</h2>
          <button type="button" onClick={() => onNavigate?.('bills')}>
            Add
          </button>
        </div>
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
                  <span className="today-view__when">
                    {isWeek
                      ? `due ${weekStamp(b.watch_date, '', formatDate)}`
                      : 'due today'}
                  </span>
                </div>
                <div className="today-view__actions">
                  {payingId === b.id ? (
                    <BillPayConfirm
                      value={payActual}
                      onChange={setPayActual}
                      onConfirm={() => payBill(b, payActual, payMode)}
                      onCancel={() => setPayingId(null)}
                    />
                  ) : (
                    <>
                      <button type="button" onClick={() => payBill(b, undefined, 'paid')}>
                        Paid
                      </button>
                      <button type="button" onClick={() => payBill(b, undefined, 'late')}>
                        Paid Late
                      </button>
                    </>
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
          <p className="today-view__meta">{emptyLabel}</p>
        )}
      </section>

      <section className="today-view__section">
        <div className="today-view__section-head">
          <h2 className="today-view__h today-view__h--serif">Reminders</h2>
          <button type="button" onClick={() => onNavigate?.('reminders')}>
            Add
          </button>
        </div>
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
                  <span className="today-view__when">
                    {isWeek
                      ? weekStamp(r.datetime, clockFromActual(r.actual_time), formatDate)
                      : clockFromActual(r.actual_time)}
                  </span>
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
          <p className="today-view__meta">{emptyLabel}</p>
        )}
      </section>

      <section className="today-view__section">
        <div className="today-view__section-head">
          <h2 className="today-view__h today-view__h--sitka">Tasks</h2>
          <button type="button" onClick={() => onNavigate?.('tasks')}>
            Add
          </button>
        </div>
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
                  <span className="today-view__when">
                    {isWeek
                      ? weekStamp(t.due_datetime, clockFromIso(t.due_datetime), formatDate)
                      : fmtTaskWhen(t.due_datetime)}
                  </span>
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
          <p className="today-view__meta">{emptyLabel}</p>
        )}
      </section>

      <section className="today-view__section">
        <div className="today-view__section-head">
          <h2 className="today-view__h today-view__h--outfit">Habits</h2>
          <button type="button" onClick={() => onNavigate?.('habits')}>
            Add
          </button>
        </div>
        {habits.length ? (
          <ul className="today-view__list">
            {habits.map((h) => (
              <li
                key={h.id}
                className={`today-view__row${
                  h.completed_today && (!isWeek || h.due_today) ? ' today-view__row--done' : ''
                }`}
                onDoubleClick={rowDblClick(() => onEditRequest?.('habit', h.id))}
              >
                <div className="today-view__main">
                  <span className="today-view__name">
                    <HabitColorDot color={h.color} />
                    {h.name}
                  </span>
                  {isWeek ? (
                    <span className="today-view__when">
                      {weekStamp(h.next_due_date, '', formatDate)}
                      {h.streak > 0 ? ` · ${h.streak} streak` : ''}
                    </span>
                  ) : (
                    h.streak > 0 && (
                      <span className="today-view__when">{h.streak} streak</span>
                    )
                  )}
                </div>
                <div className="today-view__actions">
                  {(!isWeek || h.due_today) && (
                    <>
                      <button
                        type="button"
                        disabled={h.completed_today}
                        onClick={() => toggleHabit(h.id)}
                      >
                        {h.completed_today ? 'Completed' : 'Not Completed'}
                      </button>
                      <button type="button" onClick={() => toggleHabit(h.id)}>
                        Undo
                      </button>
                    </>
                  )}
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
          <p className="today-view__meta">{emptyLabel}</p>
        )}
      </section>
    </div>
  );
}
