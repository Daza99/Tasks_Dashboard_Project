import React, { useEffect, useState } from 'react';
import { format, parseISO, isValid, addDays, setHours, setMinutes } from 'date-fns';
import { useBrief } from '../context/BriefContext';
import TagInput from '../components/TagInput';
import LockButton from '../components/LockButton';
import { invalidateTagCatalog } from '../hooks/useTagCatalog';
import {
  formatTagsDisplay,
  normalizeUserTagNames,
  userTagsDisplay,
  userTagsOnly,
} from '../../utils/tag-helpers.js';
import DetailsInline from '../components/DetailsInline';

function fmt(iso) {
  if (!iso || String(iso).startsWith('9999')) return 'Open';
  try {
    const d = parseISO(iso);
    return isValid(d) ? format(d, 'MMM d · h:mm a') : iso;
  } catch {
    return iso;
  }
}

function toLocalInput(iso) {
  if (!iso || String(iso).startsWith('9999')) return '';
  try {
    const d = parseISO(iso);
    if (!isValid(d)) return '';
    return format(d, "yyyy-MM-dd'T'HH:mm");
  } catch {
    return '';
  }
}

function scopeFromTags(tags = []) {
  if (tags.includes('rem_tomorrow')) return 'tomorrow';
  if (tags.includes('rem_dated')) return 'dated';
  if (tags.includes('rem_open')) return 'open';
  return 'today';
}

/**
 * Focus view: list + create/edit with mandatory scope.
 * @param {{ editId?: number|null, onEditConsumed?: () => void }} props
 */
export default function RemindersView({ editId = null, onEditConsumed }) {
  const { refresh } = useBrief();
  const [rows, setRows] = useState([]);
  const [title, setTitle] = useState('');
  const [scope, setScope] = useState('today');
  const [time, setTime] = useState('09:00');
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [tagsInput, setTagsInput] = useState('');
  const [appointment, setAppointment] = useState(false);
  const [daily, setDaily] = useState(false);
  const [details, setDetails] = useState('');
  const [error, setError] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editScope, setEditScope] = useState('today');
  const [editDue, setEditDue] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editAppointment, setEditAppointment] = useState(false);
  const [editDaily, setEditDaily] = useState(false);
  const [editDetails, setEditDetails] = useState('');
  const [editError, setEditError] = useState('');

  async function load() {
    setRows(await window.api.listReminders());
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (editId == null) return;
    const r = rows.find((x) => x.id === editId);
    if (!r) return;
    beginEdit(r);
    onEditConsumed?.();
  }, [editId, rows]);

  function buildDatetime() {
    const [hh, mm] = time.split(':').map(Number);
    if (scope === 'open') return null;
    if (scope === 'today') {
      return setMinutes(setHours(new Date(), hh), mm).toISOString();
    }
    if (scope === 'tomorrow') {
      return setMinutes(setHours(addDays(new Date(), 1), hh), mm).toISOString();
    }
    const base = parseISO(`${date}T${time}:00`);
    return base.toISOString();
  }

  async function create(e) {
    e.preventDefault();
    setError('');
    try {
      await window.api.createReminder({
        title,
        scope,
        datetime: buildDatetime(),
        tags: normalizeUserTagNames(tagsInput),
        is_appointment: scope !== 'open' && appointment,
        recurrence: scope !== 'open' && daily ? 'daily' : null,
        description: details.trim() || null,
      });
      setTitle('');
      setTagsInput('');
      setAppointment(false);
      setDaily(false);
      setDetails('');
      invalidateTagCatalog();
      await load();
      await refresh();
    } catch (err) {
      setError(err?.message || String(err));
    }
  }

  function beginEdit(r) {
    setEditingId(r.id);
    setEditTitle(r.title);
    setEditScope(scopeFromTags(r.tags));
    setEditDue(toLocalInput(r.datetime));
    setEditTags(userTagsDisplay(r.tags));
    setEditAppointment(Number(r.is_appointment) === 1);
    setEditDaily(r.recurrence === 'daily');
    setEditDetails(r.description || '');
    setEditError('');
  }

  async function saveEdit(e) {
    e.preventDefault();
    setEditError('');
    try {
      let datetime = null;
      if (editScope === 'open') {
        datetime = '9999-12-31T00:00:00.000Z';
      } else if (editDue) {
        datetime = new Date(editDue).toISOString();
      }
      await window.api.updateReminder(editingId, {
        title: editTitle,
        datetime,
        scope: editScope,
        tags: normalizeUserTagNames(editTags),
        is_appointment: editScope !== 'open' && editAppointment,
        recurrence: editScope !== 'open' && editDaily ? 'daily' : null,
        description: editDetails.trim() || null,
      });
      setEditingId(null);
      invalidateTagCatalog();
      await load();
      await refresh();
    } catch (err) {
      setEditError(err?.message || String(err));
    }
  }

  async function complete(id) {
    await window.api.completeReminder(id);
    await load();
    await refresh();
  }

  async function remove(id) {
    await window.api.deleteReminder(id);
    await load();
    await refresh();
  }

  return (
    <div className="module-view">
      <h1>Reminders</h1>
      <p className="module-view__hint">
        Scope required: Today / Tomorrow / Date / Open. Tick Appointment to put it on the calendar.
      </p>

      <form className="create-form glass-inset" onSubmit={create}>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Reminder title"
          required
        />
        <div className="kind-toggle" role="group" aria-label="Reminder scope">
          {['today', 'tomorrow', 'dated', 'open'].map((s) => (
            <button
              key={s}
              type="button"
              className={scope === s ? 'active' : ''}
              onClick={() => {
                setScope(s);
                if (s === 'open') setDaily(false);
              }}
            >
              {s}
            </button>
          ))}
        </div>
        <div
          className={`reminder-meta-row${scope === 'open' ? ' reminder-meta-row--open' : ''}`}
        >
          {scope !== 'open' && (
            <div className="reminder-meta-row__left">
              <div className="settings-row">
                {scope === 'dated' && (
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                )}
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
              <label className="cal-appt-check">
                <input
                  type="checkbox"
                  checked={appointment}
                  onChange={(e) => setAppointment(e.target.checked)}
                />
                Appointment (add to calendar)
              </label>
              <label className="cal-appt-check">
                <input
                  type="checkbox"
                  checked={daily}
                  onChange={(e) => setDaily(e.target.checked)}
                />
                Daily
              </label>
            </div>
          )}
          <DetailsInline value={details} onChange={setDetails} />
        </div>
        <label className="edit-label">
          Tags (optional)
          <TagInput
            value={tagsInput}
            onChange={setTagsInput}
            placeholder="#errands"
            aria-label="Reminder tags"
          />
        </label>
        <button type="submit" className="btn-primary">
          Create
        </button>
        {error && <span style={{ color: 'var(--danger)' }}>{error}</span>}
      </form>

      <ul className="module-list">
        {rows.map((r) => (
          <li key={r.id} className="module-list__item glass-inset module-list__item--col">
            {editingId === r.id ? (
              <form className="edit-form" onSubmit={saveEdit}>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                />
                <div className="kind-toggle" role="group" aria-label="Edit scope">
                  {['today', 'tomorrow', 'dated', 'open'].map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={editScope === s ? 'active' : ''}
                      onClick={() => {
                        setEditScope(s);
                        if (s === 'open') setEditDaily(false);
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <div
                  className={`reminder-meta-row${editScope === 'open' ? ' reminder-meta-row--open' : ''}`}
                >
                  {editScope !== 'open' && (
                    <div className="reminder-meta-row__left">
                      <label className="edit-label">
                        When
                        <input
                          type="datetime-local"
                          value={editDue}
                          onChange={(e) => setEditDue(e.target.value)}
                          required
                        />
                      </label>
                      <label className="cal-appt-check">
                        <input
                          type="checkbox"
                          checked={editAppointment}
                          onChange={(e) => setEditAppointment(e.target.checked)}
                        />
                        Appointment (add to calendar)
                      </label>
                      <label className="cal-appt-check">
                        <input
                          type="checkbox"
                          checked={editDaily}
                          onChange={(e) => setEditDaily(e.target.checked)}
                        />
                        Daily
                      </label>
                    </div>
                  )}
                  <DetailsInline value={editDetails} onChange={setEditDetails} />
                </div>
                <label className="edit-label">
                  Tags
                  <TagInput
                    value={editTags}
                    onChange={setEditTags}
                    placeholder="#tag"
                    aria-label="Edit reminder tags"
                  />
                </label>
                <div className="item-row__actions">
                  <button type="submit" className="btn-primary">
                    Save
                  </button>
                  <button type="button" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </div>
                {editError && <span style={{ color: 'var(--danger)' }}>{editError}</span>}
              </form>
            ) : (
              <div className="module-list__row">
                <div>
                  <strong>
                    {r.title}
                    {r.description?.trim() ? (
                      <span className="details-mark" title="Has details">
                        details
                      </span>
                    ) : null}
                  </strong>
                  <div className="module-list__meta">
                    {scopeFromTags(r.tags)}
                    {r.locked ? ' · locked' : ''}
                    {userTagsOnly(r.tags).length
                      ? ` · ${formatTagsDisplay(userTagsOnly(r.tags))}`
                      : ''}
                    {r.recurrence === 'daily' ? ' · daily' : ''}{' '}
                    · {fmt(r.datetime)}
                  </div>
                </div>
                <div className="item-row__actions">
                  <LockButton
                    itemType="reminder"
                    id={r.id}
                    locked={r.locked}
                    onChanged={async () => {
                      await load();
                      await refresh();
                    }}
                  />
                  <button type="button" onClick={() => complete(r.id)}>
                    Done
                  </button>
                  <button type="button" onClick={() => beginEdit(r)}>
                    Edit
                  </button>
                  {!r.locked && (
                    <button type="button" className="danger" onClick={() => remove(r.id)}>
                      Del
                    </button>
                  )}
                </div>
              </div>
            )}
          </li>
        ))}
        {!rows.length && <p className="stub-empty">No active reminders.</p>}
      </ul>
    </div>
  );
}
