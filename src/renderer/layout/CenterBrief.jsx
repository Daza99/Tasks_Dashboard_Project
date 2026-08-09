import React, { useState } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { useBrief } from '../context/BriefContext';
import { useDatabase } from '../context/DatabaseContext';
import { useLayout } from '../context/LayoutContext';
import { shouldShowTags } from '../../utils/feature-flags';
import QuickAddBar from '../components/QuickAddBar';
import HabitCheckinStrip from '../components/HabitCheckinStrip';
import MoneySnapshot from '../components/MoneySnapshot';
import BillPayConfirm from '../components/BillPayConfirm';

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

/**
 * Live Compact brief: tasks, reminders, bills, events, habits, money.
 * @param {{ onEditRequest?: (type: string, id: number) => void, onNavigate?: (id: string) => void }} props
 */
export default function CenterBrief({ onEditRequest, onNavigate }) {
  const { brief, loading, error, refresh } = useBrief();
  const { settings } = useDatabase();
  const { enterFocus } = useLayout();
  const showTags = shouldShowTags(settings);
  const [expiredOpen, setExpiredOpen] = useState(true);
  const [payingId, setPayingId] = useState(null);
  const [payActual, setPayActual] = useState('');

  function openModule(id) {
    onNavigate?.(id);
    enterFocus();
  }

  function tagsLine(item) {
    if (!showTags || !item?.tags?.length) return null;
    return <span className="item-row__tags">{item.tags.join(', ')}</span>;
  }

  async function completeTask(id) {
    await window.api.completeTask(id);
    await refresh();
  }

  async function deleteTask(id) {
    await window.api.deleteTask(id);
    await refresh();
  }

  async function completeRem(id) {
    await window.api.completeReminder(id);
    await refresh();
  }

  async function deleteRem(id) {
    await window.api.deleteReminder(id);
    await refresh();
  }

  /** Mark paid — no window.prompt (unsupported in Electron); inline actual for estimate/avg. */
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
      /* brief has no error surface; markPaid logs in main */
    }
  }

  async function toggleHabit(id) {
    await window.api.toggleCheckin(id);
    await refresh();
  }

  function taskActions(t) {
    return (
      <div className="item-row__actions">
        <button type="button" onClick={() => completeTask(t.id)}>
          Done
        </button>
        <button type="button" onClick={() => onEditRequest?.('task', t.id)}>
          Edit
        </button>
        <button type="button" className="danger" onClick={() => deleteTask(t.id)}>
          Del
        </button>
      </div>
    );
  }

  function remActions(r) {
    return (
      <div className="item-row__actions">
        <button type="button" onClick={() => completeRem(r.id)}>
          Done
        </button>
        <button type="button" onClick={() => onEditRequest?.('reminder', r.id)}>
          Edit
        </button>
        <button type="button" className="danger" onClick={() => deleteRem(r.id)}>
          Del
        </button>
      </div>
    );
  }

  return (
    <section className="center-panel glass-panel" aria-label="TASKS — Due today">
      <div className="center-panel__header">
        <h2 className="center-panel__title">TASKS — Due today</h2>
        <button type="button" className="btn-compact" onClick={refresh}>
          Refresh
        </button>
      </div>

      <QuickAddBar compact />

      <div className="center-panel__scroll">
        {loading && !brief && <p className="stub-empty">Loading brief…</p>}
        {error && (
          <p className="stub-empty" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        )}

        <HabitCheckinStrip
          habits={brief?.habitsToday || []}
          onToggle={toggleHabit}
          onOpen={() => openModule('habits')}
        />

        <MoneySnapshot
          today={brief?.moneyToday}
          mtd={brief?.moneyMtd}
          onOpen={() => openModule('spending')}
        />

        <div>
          {!brief?.tasksDueToday?.length && (
            <p className="stub-empty">No tasks due today — quick-add or open Tasks.</p>
          )}
          <ul className="reminder-list">
            {(brief?.tasksDueToday || []).map((t) => (
              <li key={t.id} className="reminder-item glass-inset item-row">
                <div className="item-row__main">
                  <span>
                    <span className="priority-badge" data-p={t.priority ?? 3}>
                      P{t.priority ?? 3}
                    </span>{' '}
                    {t.title}
                  </span>
                  <span className="reminder-item__when">{fmtWhen(t.due_datetime)}</span>
                </div>
                {taskActions(t)}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <button
            type="button"
            className="section-label section-toggle"
            onClick={() => setExpiredOpen((v) => !v)}
          >
            Expired ({brief?.expiredTasks?.length || 0}) {expiredOpen ? '▾' : '▸'}
          </button>
          {expiredOpen && (
            <ul className="reminder-list">
              {(brief?.expiredTasks || []).map((t) => (
                <li
                  key={t.id}
                  className="reminder-item glass-inset item-row item-row--expired"
                >
                  <div className="item-row__main">
                    <span>
                      <span className="priority-badge" data-p={t.priority ?? 3}>
                        P{t.priority ?? 3}
                      </span>{' '}
                      {t.title}
                    </span>
                    {tagsLine(t)}
                    <span className="reminder-item__when">expired</span>
                  </div>
                  {taskActions(t)}
                </li>
              ))}
              {!brief?.expiredTasks?.length && (
                <p className="stub-empty">No expired tasks.</p>
              )}
            </ul>
          )}
        </div>

        {(brief?.billsOverdue?.length > 0 || brief?.billsDueToday?.length > 0) && (
          <div>
            <p className="section-label">Bills</p>
            <ul className="reminder-list">
              {(brief?.billsOverdue || []).map((b) => (
                <li
                  key={`o-${b.id}`}
                  className="reminder-item glass-inset item-row item-row--expired"
                >
                  <div className="item-row__main">
                    <span>
                      {b.name} · ${Number(b.amount).toFixed(2)}
                      {b.amount_mode === 'estimate' && (
                        <span className="bill-amount-caption"> Estimate</span>
                      )}
                      {b.amount_mode === 'average' && (
                        <span className="bill-amount-caption"> Avg</span>
                      )}
                    </span>
                    <span className="reminder-item__when">overdue {b.due_date}</span>
                  </div>
                  <div className="item-row__actions">
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
                    <button type="button" onClick={() => onEditRequest?.('bill', b.id)}>
                      Edit
                    </button>
                  </div>
                </li>
              ))}
              {(brief?.billsDueToday || []).map((b) => (
                <li key={`d-${b.id}`} className="reminder-item glass-inset item-row">
                  <div className="item-row__main">
                    <span>
                      {b.name} · ${Number(b.amount).toFixed(2)}
                      {b.amount_mode === 'estimate' && (
                        <span className="bill-amount-caption"> Estimate</span>
                      )}
                      {b.amount_mode === 'average' && (
                        <span className="bill-amount-caption"> Avg</span>
                      )}
                    </span>
                    <span className="reminder-item__when">due today</span>
                  </div>
                  <div className="item-row__actions">
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
                    <button type="button" onClick={() => onEditRequest?.('bill', b.id)}>
                      Edit
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <p className="section-label">Events today</p>
          <ul className="reminder-list">
            {(brief?.eventsToday || []).map((ev) => (
              <li key={ev.id} className="reminder-item glass-inset item-row">
                <div className="item-row__main">
                  <span>{ev.title}</span>
                  <span className="reminder-item__when">{fmtWhen(ev.start_datetime)}</span>
                </div>
                <div className="item-row__actions">
                  <button type="button" onClick={() => onEditRequest?.('event', ev.id)}>
                    Edit
                  </button>
                </div>
              </li>
            ))}
            {!brief?.eventsToday?.length && (
              <p className="stub-empty">No events today.</p>
            )}
          </ul>
        </div>

        <div>
          <p className="section-label">Reminders · today</p>
          <ul className="reminder-list">
            {(brief?.remindersToday || []).map((r) => (
              <li key={r.id} className="reminder-item glass-inset item-row">
                <div className="item-row__main">
                  <span>{r.title}</span>
                  <span className="reminder-item__when">{fmtWhen(r.datetime)}</span>
                </div>
                {remActions(r)}
              </li>
            ))}
            {!brief?.remindersToday?.length && (
              <p className="stub-empty">None today.</p>
            )}
          </ul>
        </div>

        <div>
          <p className="section-label">Reminders · tomorrow</p>
          <ul className="reminder-list">
            {(brief?.remindersTomorrow || []).map((r) => (
              <li key={r.id} className="reminder-item glass-inset item-row">
                <div className="item-row__main">
                  <span>{r.title}</span>
                  <span className="reminder-item__when">{fmtWhen(r.datetime)}</span>
                </div>
                {remActions(r)}
              </li>
            ))}
            {!brief?.remindersTomorrow?.length && (
              <p className="stub-empty">None tomorrow.</p>
            )}
          </ul>
        </div>

        {brief?.ignoredReminders?.length > 0 && (
          <div>
            <p className="section-label">Ignored</p>
            <ul className="reminder-list">
              {brief.ignoredReminders.map((r) => (
                <li
                  key={r.id}
                  className="reminder-item glass-inset item-row item-row--expired"
                >
                  <div className="item-row__main">
                    <span>{r.title}</span>
                    {tagsLine(r)}
                    <span className="reminder-item__when">ignored</span>
                  </div>
                  <div className="item-row__actions">
                    <button type="button" onClick={() => completeRem(r.id)}>
                      Done
                    </button>
                    <button type="button" onClick={() => onEditRequest?.('reminder', r.id)}>
                      Edit
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
