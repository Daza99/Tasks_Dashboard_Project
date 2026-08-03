import React, { useState } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { useBrief } from '../context/BriefContext';
import { useDatabase } from '../context/DatabaseContext';
import { shouldShowTags } from '../../utils/feature-flags';
import QuickAddBar from '../components/QuickAddBar';

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
 * Live Compact brief: due tasks, expired, reminders today/tomorrow.
 * @param {{ onEditRequest?: (type: 'task'|'reminder', id: number) => void }} props
 */
export default function CenterBrief({ onEditRequest }) {
  const { brief, loading, error, refresh } = useBrief();
  const { settings } = useDatabase();
  const showTags = shouldShowTags(settings);
  const [expiredOpen, setExpiredOpen] = useState(true);

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
    <section className="center-panel glass-panel" aria-label="Due Today">
      <div className="center-panel__header">
        <h2 className="center-panel__title">Due Today</h2>
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
          <p className="section-label">Tasks due</p>
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

        <div>
          <p className="section-label">Priority trackers & timers</p>
          <p className="stub-empty">Timers ship Phase 3.</p>
        </div>
      </div>
    </section>
  );
}
