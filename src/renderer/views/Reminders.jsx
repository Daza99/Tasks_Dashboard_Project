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
import DetailsPreview from '../components/DetailsPreview';
import NudgeCustomDialog from '../components/NudgeCustomDialog';
import { NudgePreview, NudgeRow, todayKey } from '../components/NudgeRow';
import { useScrollEditIntoView } from '../hooks/useScrollEditIntoView';
import { rowDblClick } from '../../utils/row-dblclick.js';

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

/** Local yyyy-MM-dd for the create-form scope. */
function createDueDate(scope, date) {
  if (scope === 'today') return todayKey();
  if (scope === 'tomorrow') return format(addDays(new Date(), 1), 'yyyy-MM-dd');
  return date;
}

/** ISO from local date + HH:mm. */
function localToIso(date, time) {
  const base = parseISO(`${date}T${time || '09:00'}:00`);
  return isValid(base) ? base.toISOString() : null;
}

/**
 * Focus view: list + create/edit with mandatory scope.
 * @param {{
 *   editId?: number|null,
 *   onEditConsumed?: () => void,
 *   seedDate?: string|null,
 *   onSeedConsumed?: () => void,
 * }} props
 */
export default function RemindersView({
  editId = null,
  onEditConsumed,
  seedDate = null,
  onSeedConsumed,
}) {
  const { refresh } = useBrief();
  const [rows, setRows] = useState([]);
  const [title, setTitle] = useState('');
  const [scope, setScope] = useState('today');
  const [time, setTime] = useState('09:00');
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [tagsInput, setTagsInput] = useState('');
  const [appointment, setAppointment] = useState(false);
  const [daily, setDaily] = useState(false);
  const [nudge, setNudge] = useState(false);
  const [nudgeMode, setNudgeMode] = useState('day_before');
  const [customDate, setCustomDate] = useState(() => todayKey());
  const [customTime, setCustomTime] = useState('09:00');
  const [customOpen, setCustomOpen] = useState(null); // 'create' | 'edit' | null
  const [details, setDetails] = useState('');
  const [error, setError] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editScope, setEditScope] = useState('today');
  const [editDue, setEditDue] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editAppointment, setEditAppointment] = useState(false);
  const [editDaily, setEditDaily] = useState(false);
  const [editNudge, setEditNudge] = useState(false);
  const [editNudgeMode, setEditNudgeMode] = useState('day_before');
  const [editCustomDate, setEditCustomDate] = useState(() => todayKey());
  const [editCustomTime, setEditCustomTime] = useState('09:00');
  const [editDetails, setEditDetails] = useState('');
  const [editError, setEditError] = useState('');
  const editRowRef = useScrollEditIntoView(editingId);

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

  useEffect(() => {
    if (!seedDate) return;
    setScope('dated');
    setDate(seedDate);
    setAppointment(true);
    onSeedConsumed?.();
  }, [seedDate]);

  const createDue = createDueDate(scope, date);
  const editDueDate = editDue ? editDue.slice(0, 10) : todayKey();
  const editDueTime = editDue && editDue.length >= 16 ? editDue.slice(11, 16) : '09:00';

  // Today reminders cannot use Day Before (would be yesterday).
  useEffect(() => {
    if (nudge && nudgeMode === 'day_before' && createDue === todayKey()) {
      setNudgeMode('custom');
      setCustomDate(createDue);
      setCustomTime(time);
    }
  }, [nudge, nudgeMode, createDue, time]);

  useEffect(() => {
    if (editNudge && editNudgeMode === 'day_before' && editDueDate === todayKey()) {
      setEditNudgeMode('custom');
      setEditCustomDate(editDueDate);
      setEditCustomTime(editDueTime);
    }
  }, [editNudge, editNudgeMode, editDueDate, editDueTime]);

  function applyNudgeOn(dueDate, dueTime, setOn, setMode, setCDate, setCTime) {
    setOn(true);
    if (dueDate === todayKey()) {
      setMode('custom');
      setCDate(dueDate);
      setCTime(dueTime);
    } else {
      setMode('day_before');
    }
  }

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
        nudge: scope !== 'open' && nudge,
        nudge_mode: scope !== 'open' && nudge ? nudgeMode : null,
        nudge_datetime:
          scope !== 'open' && nudge && nudgeMode === 'custom'
            ? localToIso(customDate, customTime)
            : null,
      });
      setTitle('');
      setTagsInput('');
      setAppointment(false);
      setDaily(false);
      setNudge(false);
      setNudgeMode('day_before');
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
    const hasNudge = Boolean(r.nudge_datetime);
    setEditNudge(hasNudge);
    setEditNudgeMode(r.nudge_mode === 'custom' ? 'custom' : 'day_before');
    if (r.nudge_mode === 'custom' && r.nudge_datetime) {
      const d = parseISO(r.nudge_datetime);
      if (isValid(d)) {
        setEditCustomDate(format(d, 'yyyy-MM-dd'));
        setEditCustomTime(format(d, 'HH:mm'));
      }
    } else {
      const due = toLocalInput(r.datetime);
      setEditCustomDate(due.slice(0, 10) || todayKey());
      setEditCustomTime(due.length >= 16 ? due.slice(11, 16) : '09:00');
    }
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
        nudge: editScope !== 'open' && editNudge,
        nudge_mode: editScope !== 'open' && editNudge ? editNudgeMode : null,
        nudge_datetime:
          editScope !== 'open' && editNudge && editNudgeMode === 'custom'
            ? localToIso(editCustomDate, editCustomTime)
            : null,
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
        />
        <div className="kind-toggle" role="group" aria-label="Reminder scope">
          {['today', 'tomorrow', 'dated', 'open'].map((s) => (
            <button
              key={s}
              type="button"
              className={scope === s ? 'active' : ''}
              onClick={() => {
                setScope(s);
                if (s === 'open') {
                  setDaily(false);
                  setNudge(false);
                }
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
              <NudgeRow
                nudge={nudge}
                mode={nudgeMode}
                dueDate={createDue}
                onNudgeChange={(on) => {
                  if (!on) {
                    setNudge(false);
                    return;
                  }
                  applyNudgeOn(
                    createDue,
                    time,
                    setNudge,
                    setNudgeMode,
                    setCustomDate,
                    setCustomTime
                  );
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
                dueDate={createDue}
                dueTime={time}
                customDate={customDate}
                customTime={customTime}
              />
            </div>
          )}
          <DetailsInline value={details} onChange={setDetails} />
        </div>
        <label className="edit-label">
          Tags (optional)
          <TagInput
            value={tagsInput}
            onChange={setTagsInput}
            placeholder="#errands, #food"
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
          <li
            key={r.id}
            ref={editingId === r.id ? editRowRef : null}
            className={`module-list__item glass-inset module-list__item--col${
              editingId === r.id ? ' module-list__item--editing' : ''
            }`}
          >
            {editingId === r.id ? (
              <form className="edit-form" onSubmit={saveEdit}>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
                <div className="kind-toggle" role="group" aria-label="Edit scope">
                  {['today', 'tomorrow', 'dated', 'open'].map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={editScope === s ? 'active' : ''}
                      onClick={() => {
                        setEditScope(s);
                        if (s === 'open') {
                          setEditDaily(false);
                          setEditNudge(false);
                        }
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
                      <NudgeRow
                        nudge={editNudge}
                        mode={editNudgeMode}
                        dueDate={editDueDate}
                        onNudgeChange={(on) => {
                          if (!on) {
                            setEditNudge(false);
                            return;
                          }
                          applyNudgeOn(
                            editDueDate,
                            editDueTime,
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
                        dueDate={editDueDate}
                        dueTime={editDueTime}
                        customDate={editCustomDate}
                        customTime={editCustomTime}
                      />
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
              <div
                className="module-list__row"
                onDoubleClick={rowDblClick(() => beginEdit(r))}
              >
                <div>
                  <strong>
                    {r.title}
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
                  <DetailsPreview text={r.description} />
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

      <NudgeCustomDialog
        open={Boolean(customOpen)}
        dueDate={customOpen === 'edit' ? editDueDate : createDue}
        time={customOpen === 'edit' ? editDueTime : time}
        initialDate={customOpen === 'edit' ? editCustomDate : customDate}
        onCancel={() => setCustomOpen(null)}
        onSave={(d, t) => {
          if (customOpen === 'edit') {
            setEditNudge(true);
            setEditNudgeMode('custom');
            setEditCustomDate(d);
            setEditCustomTime(t);
          } else {
            setNudge(true);
            setNudgeMode('custom');
            setCustomDate(d);
            setCustomTime(t);
          }
          setCustomOpen(null);
        }}
      />
    </div>
  );
}
