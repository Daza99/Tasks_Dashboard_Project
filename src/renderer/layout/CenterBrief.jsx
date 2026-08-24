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
import LockButton from '../components/LockButton';
import { rowDblClick } from '../../utils/row-dblclick.js';

/** Compact week timestamps: yyyy-mm-dd · time. */
function fmtWhen(iso) {
  if (!iso || iso.startsWith('9999')) return 'Open';
  try {
    const d = typeof iso === 'string' ? parseISO(iso) : new Date(iso);
    if (!isValid(d)) return iso;
    return format(d, 'yyyy-MM-dd · h:mm a');
  } catch {
    return iso;
  }
}

/** Smallest section label + optional compact action (New / Log). */
function SectionHead({ label, action }) {
  return (
    <div className="brief-section-head">
      <p className="section-label">{label}</p>
      {action}
    </div>
  );
}

/**
 * Live Compact This Week brief: tasks, reminders, bills, habits, money.
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
        <LockButton itemType="task" id={t.id} locked={t.locked} onChanged={refresh} />
        <button type="button" onClick={() => completeTask(t.id)}>
          Done
        </button>
        <button type="button" onClick={() => onEditRequest?.('task', t.id)}>
          Edit
        </button>
        {!t.locked && (
          <button type="button" className="danger" onClick={() => deleteTask(t.id)}>
            Del
          </button>
        )}
      </div>
    );
  }

  function remActions(r) {
    return (
      <div className="item-row__actions">
        <LockButton itemType="reminder" id={r.id} locked={r.locked} onChanged={refresh} />
        <button type="button" onClick={() => completeRem(r.id)}>
          Done
        </button>
        <button type="button" onClick={() => onEditRequest?.('reminder', r.id)}>
          Edit
        </button>
        {!r.locked && (
          <button type="button" className="danger" onClick={() => deleteRem(r.id)}>
            Del
          </button>
        )}
      </div>
    );
  }

  function billCaption(b) {
    return (
      <>
        {b.name} · ${Number(b.amount).toFixed(2)}
        {b.amount_mode === 'estimate' && (
          <span className="bill-amount-caption"> Estimate</span>
        )}
        {b.amount_mode === 'average' && (
          <span className="bill-amount-caption"> Avg</span>
        )}
      </>
    );
  }

  function billActions(b) {
    return (
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
    );
  }

  const newBtn = (id, label) => (
    <button type="button" className="btn-compact" onClick={() => openModule(id)}>
      {label}
    </button>
  );

  return (
    <section className="center-panel glass-panel" aria-label="Compact This Week">
      <div className="center-panel__header">
        <h2 className="center-panel__title">Compact This Week</h2>
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

        <div>
          <SectionHead label="Tasks" />
          {!brief?.tasksThisWeek?.length && (
            <p className="stub-empty">No tasks due this week — quick-add or open Tasks.</p>
          )}
          <ul className="reminder-list">
            {(brief?.tasksThisWeek || []).map((t) => (
              <li
                key={t.id}
                className="reminder-item glass-inset item-row"
                onDoubleClick={rowDblClick(() => onEditRequest?.('task', t.id))}
              >
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

        <HabitCheckinStrip
          habits={brief?.habitsToday || []}
          onToggle={toggleHabit}
          onNew={() => openModule('habits')}
        />

        <MoneySnapshot
          today={brief?.moneyToday}
          mtd={brief?.moneyMtd}
          onOpen={() => openModule('spending')}
        />

        <div>
          <SectionHead label="Reminders" action={newBtn('reminders', 'New')} />
          <ul className="reminder-list">
            {(brief?.remindersThisWeek || []).map((r) => (
              <li
                key={r.id}
                className="reminder-item glass-inset item-row"
                onDoubleClick={rowDblClick(() => onEditRequest?.('reminder', r.id))}
              >
                <div className="item-row__main">
                  <span>{r.title}</span>
                  <span className="reminder-item__when">{fmtWhen(r.datetime)}</span>
                </div>
                {remActions(r)}
              </li>
            ))}
            {!brief?.remindersThisWeek?.length && (
              <p className="stub-empty">None this week.</p>
            )}
          </ul>
        </div>

        {(brief?.billsOverdue?.length > 0 || brief?.billsDueThisWeek?.length > 0) && (
          <div>
            <p className="section-label">Bills</p>
            <ul className="reminder-list">
              {(brief?.billsOverdue || []).map((b) => (
                <li
                  key={`o-${b.id}`}
                  className="reminder-item glass-inset item-row item-row--expired"
                  onDoubleClick={rowDblClick(() => onEditRequest?.('bill', b.id))}
                >
                  <div className="item-row__main">
                    <span>{billCaption(b)}</span>
                    <span className="reminder-item__when">overdue {b.due_date}</span>
                  </div>
                  {billActions(b)}
                </li>
              ))}
              {(brief?.billsDueThisWeek || []).map((b) => (
                <li
                  key={`d-${b.id}`}
                  className="reminder-item glass-inset item-row"
                  onDoubleClick={rowDblClick(() => onEditRequest?.('bill', b.id))}
                >
                  <div className="item-row__main">
                    <span>{billCaption(b)}</span>
                    <span className="reminder-item__when">due {b.due_date}</span>
                  </div>
                  {billActions(b)}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <button
            type="button"
            className="section-label section-toggle"
            onClick={() => setExpiredOpen((v) => !v)}
          >
            Expired ({brief?.expiredItems?.length || 0}) {expiredOpen ? '▾' : '▸'}
          </button>
          {expiredOpen && (
            <ul className="reminder-list">
              {(brief?.expiredItems || []).map((item) =>
                item.item_type === 'reminder' ? (
                  <li
                    key={`rem-${item.id}`}
                    className="reminder-item glass-inset item-row item-row--expired"
                    onDoubleClick={rowDblClick(() => onEditRequest?.('reminder', item.id))}
                  >
                    <div className="item-row__main">
                      <span>{item.title}</span>
                      {tagsLine(item)}
                      <span className="reminder-item__when">
                        ignored {fmtWhen(item.datetime)}
                      </span>
                    </div>
                    {remActions(item)}
                  </li>
                ) : (
                  <li
                    key={`task-${item.id}`}
                    className="reminder-item glass-inset item-row item-row--expired"
                    onDoubleClick={rowDblClick(() => onEditRequest?.('task', item.id))}
                  >
                    <div className="item-row__main">
                      <span>
                        <span className="priority-badge" data-p={item.priority ?? 3}>
                          P{item.priority ?? 3}
                        </span>{' '}
                        {item.title}
                      </span>
                      {tagsLine(item)}
                      <span className="reminder-item__when">
                        expired {fmtWhen(item.due_datetime)}
                      </span>
                    </div>
                    {taskActions(item)}
                  </li>
                )
              )}
              {!brief?.expiredItems?.length && (
                <p className="stub-empty">No expired items this week.</p>
              )}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
