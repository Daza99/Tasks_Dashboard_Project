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

function toLocalInput(iso) {
  if (!iso) return '';
  try {
    const d = parseISO(iso);
    return isValid(d) ? format(d, "yyyy-MM-dd'T'HH:mm") : '';
  } catch {
    return '';
  }
}

/**
 * Focus view: month grid + day event list/create.
 * @param {{ editId?: number|null, onEditConsumed?: () => void }} props
 */
export default function CalendarView({ editId = null, onEditConsumed }) {
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

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);

  const days = useMemo(() => {
    const start = startOfWeek(monthStart, { weekStartsOn: 1 });
    const end = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const out = [];
    let d = start;
    while (d <= end) {
      out.push(d);
      d = addDays(d, 1);
    }
    return out;
  }, [monthStart.getTime(), monthEnd.getTime()]);

  const eventDays = useMemo(() => {
    const set = new Set();
    for (const ev of monthEvents) {
      try {
        const d = parseISO(ev.start_datetime);
        if (isValid(d)) set.add(format(d, 'yyyy-MM-dd'));
      } catch {
        /* skip */
      }
    }
    return set;
  }, [monthEvents]);

  async function loadMonth() {
    const startIso = startOfWeek(monthStart, { weekStartsOn: 1 }).toISOString();
    const endIso = endOfWeek(monthEnd, { weekStartsOn: 1 }).toISOString();
    setMonthEvents(await window.api.listEventsRange(startIso, endIso));
  }

  async function loadDay(d = selected) {
    const key = format(d, 'yyyy-MM-dd');
    setDayEvents(await window.api.listEventsDay(key));
  }

  useEffect(() => {
    loadMonth();
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

  async function create(e) {
    e.preventDefault();
    setError('');
    try {
      await window.api.createEvent({
        title,
        start_datetime: new Date(start).toISOString(),
      });
      setTitle('');
      await loadMonth();
      await loadDay();
      await refresh();
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
      await loadMonth();
      await loadDay();
      await refresh();
    } catch (err) {
      setError(err?.message || String(err));
    }
  }

  async function remove(id) {
    await window.api.deleteEvent(id);
    await loadMonth();
    await loadDay();
    await refresh();
  }

  return (
    <div className="module-view">
      <h1>Calendar</h1>
      <p className="module-view__hint">Month grid · click a day to add events.</p>

      <div className="cal-nav">
        <button type="button" className="btn-compact" onClick={() => setCursor(subMonths(cursor, 1))}>
          ‹
        </button>
        <strong>{format(cursor, 'MMMM yyyy')}</strong>
        <button type="button" className="btn-compact" onClick={() => setCursor(addMonths(cursor, 1))}>
          ›
        </button>
      </div>

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
          const has = eventDays.has(key);
          return (
            <button
              key={key}
              type="button"
              className={`cal-grid__day${inMonth ? '' : ' cal-grid__day--muted'}${
                sel ? ' cal-grid__day--selected' : ''
              }${has ? ' cal-grid__day--dot' : ''}`}
              onClick={() => setSelected(d)}
            >
              {format(d, 'd')}
            </button>
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
          <li key={ev.id} className="module-list__item glass-inset module-list__item--col">
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
                <div>
                  <strong>{ev.title}</strong>
                  <div className="module-list__meta">
                    {format(parseISO(ev.start_datetime), 'h:mm a')}
                  </div>
                </div>
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
                  <button type="button" className="danger" onClick={() => remove(ev.id)}>
                    Del
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
        {!dayEvents.length && <p className="stub-empty">No events this day.</p>}
      </ul>
    </div>
  );
}
