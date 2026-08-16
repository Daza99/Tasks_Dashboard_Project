import React, { useEffect, useMemo, useState } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  parseISO,
  isValid,
} from 'date-fns';
import { useBrief } from '../context/BriefContext';
import ConfirmDialog from '../components/ConfirmDialog';

const CHIP_CAP = 3;

function toLocalInput(iso) {
  if (!iso) return '';
  try {
    const d = parseISO(iso);
    return isValid(d) ? format(d, "yyyy-MM-dd'T'HH:mm") : '';
  } catch {
    return '';
  }
}

function eventDayKey(ev) {
  try {
    const d = parseISO(ev.start_datetime);
    return isValid(d) ? format(d, 'yyyy-MM-dd') : null;
  } catch {
    return null;
  }
}

function isLinked(ev) {
  return Boolean(ev?.source_type && ev.source_id != null);
}

/**
 * Focus view: month grid + day event list/create.
 * Linked chips jump to the source item; Ctrl+click multi-selects.
 * @param {{
 *   editId?: number|null,
 *   onEditConsumed?: () => void,
 *   onEditRequest?: (type: string, id: number) => void,
 * }} props
 */
export default function CalendarView({
  editId = null,
  onEditConsumed,
  onEditRequest,
}) {
  const { refresh } = useBrief();
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => new Date());
  const [monthEvents, setMonthEvents] = useState([]);
  const [dayEvents, setDayEvents] = useState([]);
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editStart, setEditStart] = useState('');
  const [picked, setPicked] = useState(() => new Set());
  const [deleteOpen, setDeleteOpen] = useState(false);

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);

  const days = useMemo(() => {
    const startD = startOfWeek(monthStart, { weekStartsOn: 1 });
    const end = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const out = [];
    let d = startD;
    while (d <= end) {
      out.push(d);
      d = addDays(d, 1);
    }
    return out;
  }, [monthStart.getTime(), monthEnd.getTime()]);

  const eventsByDay = useMemo(() => {
    const map = new Map();
    for (const ev of monthEvents) {
      const key = eventDayKey(ev);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(ev);
    }
    return map;
  }, [monthEvents]);

  const pickedEvents = useMemo(
    () => monthEvents.filter((ev) => picked.has(ev.id)),
    [monthEvents, picked]
  );
  const pickedHasLinked = pickedEvents.some(isLinked);

  async function loadMonth() {
    const startIso = startOfWeek(monthStart, { weekStartsOn: 1 }).toISOString();
    const endIso = endOfWeek(monthEnd, { weekStartsOn: 1 }).toISOString();
    setMonthEvents(await window.api.listEventsRange(startIso, endIso));
  }

  async function loadDay(d = selected) {
    const key = format(d, 'yyyy-MM-dd');
    setDayEvents(await window.api.listEventsDay(key));
  }

  async function reload() {
    await loadMonth();
    await loadDay();
    await refresh();
  }

  useEffect(() => {
    (async () => {
      await window.api.syncCalendarMonth(cursor.getFullYear(), cursor.getMonth());
      await loadMonth();
    })();
  }, [cursor.getMonth(), cursor.getFullYear()]);

  useEffect(() => {
    loadDay(selected);
    setStart(`${format(selected, 'yyyy-MM-dd')}T09:00`);
  }, [selected]);

  useEffect(() => {
    if (editId == null) return;
    (async () => {
      const ev = await window.api.getEvent(editId);
      if (!ev) return;
      const d = parseISO(ev.start_datetime);
      if (isValid(d)) {
        setCursor(d);
        setSelected(d);
      }
      setEditingId(ev.id);
      setEditTitle(ev.title);
      setEditStart(toLocalInput(ev.start_datetime));
      onEditConsumed?.();
    })();
  }, [editId]);

  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (!picked.size) return;
      e.preventDefault();
      requestDelete();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picked, pickedHasLinked]);

  function togglePick(id, additive) {
    setPicked((prev) => {
      const next = additive ? new Set(prev) : new Set();
      if (additive && prev.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onChipClick(e, ev, day) {
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      togglePick(ev.id, true);
      return;
    }
    setPicked(new Set());
    setSelected(day);
    if (isLinked(ev) && onEditRequest) {
      onEditRequest(ev.source_type, ev.source_id);
      return;
    }
    setEditingId(ev.id);
    setEditTitle(ev.title);
    setEditStart(toLocalInput(ev.start_datetime));
  }

  async function create(e) {
    e.preventDefault();
    setError('');
    try {
      await window.api.createEvent({
        title,
        start_datetime: new Date(start).toISOString(),
      });
      setTitle('');
      await reload();
    } catch (err) {
      setError(err?.message || String(err));
    }
  }

  async function saveEdit(e) {
    e.preventDefault();
    try {
      await window.api.updateEvent(editingId, {
        title: editTitle,
        start_datetime: new Date(editStart).toISOString(),
      });
      setEditingId(null);
      await reload();
    } catch (err) {
      setError(err?.message || String(err));
    }
  }

  function requestDelete(ids) {
    const set = ids ? new Set(ids) : picked;
    if (!set.size) return;
    setPicked(set);
    const seen = new Set();
    const all = [...monthEvents, ...dayEvents].filter((ev) => {
      if (!set.has(ev.id) || seen.has(ev.id)) return false;
      seen.add(ev.id);
      return true;
    });
    if (all.some(isLinked)) setDeleteOpen(true);
    else applyDelete(false, [...set]);
  }

  async function applyDelete(deleteSources, idsArg) {
    setDeleteOpen(false);
    const ids = idsArg || [...picked];
    if (!ids.length) return;
    try {
      const result = await window.api.removeCalendarSelection(ids, { deleteSources });
      setPicked(new Set());
      setEditingId(null);
      await reload();
      if (result?.skippedLocked?.length) {
        setError(`Locked, skipped: ${result.skippedLocked.join(', ')}`);
      }
    } catch (err) {
      setError(err?.message || String(err));
    }
  }

  function renderChips(day) {
    const key = format(day, 'yyyy-MM-dd');
    const list = eventsByDay.get(key) || [];
    const shown = list.slice(0, CHIP_CAP);
    const extra = list.length - shown.length;
    return (
      <>
        {shown.map((ev) => (
          <button
            key={ev.id}
            type="button"
            className={`cal-chip${picked.has(ev.id) ? ' cal-chip--selected' : ''}${
              isLinked(ev) ? ' cal-chip--linked' : ''
            }`}
            title={ev.title}
            onClick={(e) => onChipClick(e, ev, day)}
          >
            {ev.title}
          </button>
        ))}
        {extra > 0 && (
          <span className="cal-chip-more">+{extra}</span>
        )}
      </>
    );
  }

  return (
    <div className="module-view">
      <h1>Calendar</h1>
      <p className="module-view__hint">
        Month grid · click a linked entry to open it · Ctrl+click to select.
      </p>

      <div className="cal-nav">
        <button type="button" className="btn-compact" onClick={() => setCursor(subMonths(cursor, 1))}>
          ‹
        </button>
        <strong>{format(cursor, 'MMMM yyyy')}</strong>
        <button type="button" className="btn-compact" onClick={() => setCursor(addMonths(cursor, 1))}>
          ›
        </button>
      </div>

      {picked.size > 0 && (
        <div className="cal-select-bar">
          <span>{picked.size} selected</span>
          <button type="button" className="danger" onClick={() => requestDelete()}>
            Delete
          </button>
          <button type="button" onClick={() => setPicked(new Set())}>
            Clear
          </button>
        </div>
      )}

      <div className="cal-grid" role="grid" aria-label="Month">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="cal-grid__dow">
            {d}
          </div>
        ))}
        {days.map((d) => {
          const key = format(d, 'yyyy-MM-dd');
          const inMonth = isSameMonth(d, cursor);
          const sel = isSameDay(d, selected);
          return (
            <div
              key={key}
              role="gridcell"
              className={`cal-grid__day${inMonth ? '' : ' cal-grid__day--muted'}${
                sel ? ' cal-grid__day--selected' : ''
              }`}
              onClick={() => setSelected(d)}
            >
              <span className="cal-grid__day-num">{format(d, 'd')}</span>
              {renderChips(d)}
            </div>
          );
        })}
      </div>

      <h2 className="cal-day-title">{format(selected, 'EEEE d MMM')}</h2>

      <form className="create-form glass-inset" onSubmit={create}>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Event title"
          required
        />
        <input
          type="datetime-local"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          required
        />
        <button type="submit" className="btn-primary">
          Add event
        </button>
        {error && <span style={{ color: 'var(--danger)' }}>{error}</span>}
      </form>

      <ul className="module-list">
        {dayEvents.map((ev) => (
          <li
            key={ev.id}
            className={`module-list__item glass-inset module-list__item--col${
              picked.has(ev.id) ? ' cal-row--selected' : ''
            }`}
          >
            {editingId === ev.id ? (
              <form className="edit-form" onSubmit={saveEdit}>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                />
                <input
                  type="datetime-local"
                  value={editStart}
                  onChange={(e) => setEditStart(e.target.value)}
                  required
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
                <button
                  type="button"
                  className="cal-row-title"
                  onClick={(e) => onChipClick(e, ev, selected)}
                >
                  <strong>{ev.title}</strong>
                  <div className="module-list__meta">
                    {format(parseISO(ev.start_datetime), 'h:mm a')}
                    {isLinked(ev) ? ` · ${ev.source_type}` : ''}
                  </div>
                </button>
                <div className="item-row__actions">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(ev.id);
                      setEditTitle(ev.title);
                      setEditStart(toLocalInput(ev.start_datetime));
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => requestDelete([ev.id])}
                  >
                    Del
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
        {!dayEvents.length && <p className="stub-empty">No events this day.</p>}
      </ul>

      <ConfirmDialog
        open={deleteOpen}
        title="Remove from calendar?"
        message="Also delete the linked item? Calendar-only keeps the bill, habit, or reminder."
        confirmLabel="Delete linked item too"
        secondaryLabel="Calendar only"
        danger
        onConfirm={() => applyDelete(true)}
        onSecondary={() => applyDelete(false)}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
