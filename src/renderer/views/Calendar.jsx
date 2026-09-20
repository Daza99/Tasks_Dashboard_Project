import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  setMonth,
  setYear,
  isSameMonth,
  isSameDay,
  parseISO,
  isValid,
} from 'date-fns';
import { useBrief } from '../context/BriefContext';
import { useDatabase } from '../context/DatabaseContext';
import ConfirmDialog from '../components/ConfirmDialog';
import CalEntryLabel from '../components/CalEntryLabel';
import CalDayCardActions from '../components/CalDayCardActions';
import { calendarEntryState, isReminderDone } from '../../utils/calendar-entry-state.js';
import { useScrollEditIntoView } from '../hooks/useScrollEditIntoView';
import { rowDblClick } from '../../utils/row-dblclick.js';
import { habitFillStyle } from '../../utils/habit-color.js';

const CHIP_CAP = 3;

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

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

function isHabitEvent(ev) {
  return ev?.source_type === 'habit';
}

/** Habit on a local date strictly before today (yyyy-mm-dd). */
function isElapsedHabit(ev, todayKey) {
  if (!isHabitEvent(ev)) return false;
  const key = eventDayKey(ev);
  return Boolean(key && key < todayKey);
}

/** Survives Calendar unmount this process; launch hydrates from settings if persist is on. */
let sessionHideHabits = false;
let sessionHideElapsed = false;
let hideHabitsHydrated = false;

const CAL_CHIP_TYPES = new Set(['bill', 'reminder', 'task', 'habit']);

/** Type modifier for month-grid chips; manual events stay untyped. */
function chipTypeClass(ev) {
  const t = ev?.source_type;
  if (!CAL_CHIP_TYPES.has(t)) return '';
  const done = t === 'reminder' && isReminderDone(ev) ? ' cal-chip--done' : '';
  return ` cal-chip--${t}${done}`;
}

/** Place a fixed menu to the right of the pointer; flip/clamp at viewport edges. */
function clampMenuPos(clientX, clientY, w = 200, h = 130) {
  const pad = 8;
  const maxX = window.innerWidth - w - pad;
  const maxY = window.innerHeight - h - pad;
  let x = clientX + pad;
  if (x > maxX) x = clientX - w - pad;
  return {
    x: Math.max(pad, Math.min(x, maxX)),
    y: Math.max(pad, Math.min(clientY, maxY)),
  };
}

/**
 * Focus view: month grid + day event list.
 * Linked chips jump to the source item; Ctrl+click multi-selects.
 * @param {{
 *   editId?: number|null,
 *   onEditConsumed?: () => void,
   *   onEditRequest?: (type: string, id: number, opts?: { completed?: boolean, occurrenceDate?: string }) => void,
 *   onCreateRequest?: (type: string, date: string) => void,
 * }} props
 */
export default function CalendarView({
  editId = null,
  onEditConsumed,
  onEditRequest,
  onCreateRequest,
}) {
  const { refresh } = useBrief();
  const { settings, ready, updateSetting } = useDatabase();
  const [hideHabits, setHideHabits] = useState(sessionHideHabits);
  const [hideElapsed, setHideElapsed] = useState(sessionHideElapsed);
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => new Date());
  const [yearOptions, setYearOptions] = useState(() => {
    const y = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, i) => y + i);
  });
  const [monthEvents, setMonthEvents] = useState([]);
  const [dayEvents, setDayEvents] = useState([]);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const editRowRef = useScrollEditIntoView(editingId);
  const [editTitle, setEditTitle] = useState('');
  const [editStart, setEditStart] = useState('');
  const [picked, setPicked] = useState(() => new Set());
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Chip RMB Delete confirm — separate from Del-key 3-way dialog
  const [entityDeleteEv, setEntityDeleteEv] = useState(null);
  const [menu, setMenu] = useState(null); // { x, y, date } | { x, y, event }
  const menuRef = useRef(null);
  const dayListRef = useRef(null);

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

  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const visibleMonthEvents = useMemo(() => {
    if (hideHabits) return monthEvents.filter((ev) => !isHabitEvent(ev));
    if (hideElapsed) return monthEvents.filter((ev) => !isElapsedHabit(ev, todayKey));
    return monthEvents;
  }, [monthEvents, hideHabits, hideElapsed, todayKey]);
  const visibleDayEvents = useMemo(() => {
    if (hideHabits) return dayEvents.filter((ev) => !isHabitEvent(ev));
    if (hideElapsed) return dayEvents.filter((ev) => !isElapsedHabit(ev, todayKey));
    return dayEvents;
  }, [dayEvents, hideHabits, hideElapsed, todayKey]);

  const eventsByDay = useMemo(() => {
    const map = new Map();
    for (const ev of visibleMonthEvents) {
      const key = eventDayKey(ev);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(ev);
    }
    return map;
  }, [visibleMonthEvents]);

  const pickedEvents = useMemo(
    () => monthEvents.filter((ev) => picked.has(ev.id)),
    [monthEvents, picked]
  );
  const pickedHasLinked = pickedEvents.some(isLinked);

  const yearsShown = useMemo(() => {
    const y = cursor.getFullYear();
    if (yearOptions.includes(y)) return yearOptions;
    return [...yearOptions, y].sort((a, b) => a - b);
  }, [yearOptions, cursor.getFullYear()]);

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
    (async () => {
      const years = await window.api.listCalendarYearOptions(cursor.getFullYear());
      setYearOptions(years);
    })();
  }, [cursor.getFullYear()]);

  useEffect(() => {
    loadDay(selected);
  }, [selected]);

  // Once per process: restore hide ticks only when Settings persist is on.
  useEffect(() => {
    if (!ready || hideHabitsHydrated) return;
    hideHabitsHydrated = true;
    const persist = settings?.calendar_hide_habits_persist === 'true';
    let hideAll = persist && settings?.calendar_hide_habits === 'true';
    let elapsed = persist && settings?.calendar_hide_elapsed_habits === 'true';
    if (hideAll && elapsed) {
      elapsed = false;
      updateSetting('calendar_hide_elapsed_habits', 'false');
    }
    sessionHideHabits = hideAll;
    sessionHideElapsed = elapsed;
    setHideHabits(hideAll);
    setHideElapsed(elapsed);
  }, [ready, settings]);

  // Hidden habits must not stay in the multi-select set.
  useEffect(() => {
    if (!hideHabits && !hideElapsed) return;
    const hiddenIds = new Set(
      [...monthEvents, ...dayEvents]
        .filter((ev) => {
          if (!isHabitEvent(ev)) return false;
          if (hideHabits) return true;
          return isElapsedHabit(ev, todayKey);
        })
        .map((ev) => ev.id)
    );
    if (editingId != null && hiddenIds.has(editingId)) setEditingId(null);
    setPicked((prev) => {
      if (!prev.size) return prev;
      let changed = false;
      const next = new Set();
      for (const id of prev) {
        if (hiddenIds.has(id)) changed = true;
        else next.add(id);
      }
      return changed ? next : prev;
    });
  }, [hideHabits, hideElapsed, todayKey, monthEvents, dayEvents, editingId]);

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

  useEffect(() => {
    if (!menu) return;
    function onDown(e) {
      if (menuRef.current?.contains(e.target)) return;
      setMenu(null);
    }
    function onKey(e) {
      if (e.key === 'Escape') setMenu(null);
    }
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  function togglePick(id, additive) {
    setPicked((prev) => {
      const next = additive ? new Set(prev) : new Set();
      if (additive && prev.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openDayMenu(e, day) {
    e.preventDefault();
    setSelected(day);
    const pos = clampMenuPos(e.clientX, e.clientY);
    setMenu({ ...pos, date: format(day, 'yyyy-MM-dd') });
  }

  /** Chip / day-list row RMB — do not bubble into the day-cell create menu. */
  function openChipMenu(e, ev) {
    e.preventDefault();
    e.stopPropagation();
    const pos = clampMenuPos(e.clientX, e.clientY, 220, 90);
    setMenu({ ...pos, event: ev });
  }

  function pickCreate(type) {
    if (!menu?.date) return;
    onCreateRequest?.(type, menu.date);
    setMenu(null);
  }

  /** Hide this occurrence; linked source stays in its module. */
  function removeFromCalendar(ev) {
    setMenu(null);
    applyDelete(false, [ev.id]);
  }

  /** Open y/n confirm to cascade-delete the source entity. */
  function requestEntityDelete(ev) {
    setMenu(null);
    setEntityDeleteEv(ev);
  }

  /** Jump the grid to a month in the current year; clamp day-of-month. */
  function jumpMonth(monthIndex) {
    setCursor((c) => setMonth(c, monthIndex));
    setSelected((s) => setMonth(s, monthIndex));
  }

  /** Jump the grid to a year; clamp day-of-month (e.g. Feb 29). */
  function jumpYear(year) {
    setCursor((c) => setYear(c, year));
    setSelected((s) => setYear(s, year));
  }

  /** Inline calendar title+time — manuals only. Linked cards jump to the module. */
  function beginEdit(ev) {
    setEditingId(ev.id);
    setEditTitle(ev.title);
    setEditStart(toLocalInput(ev.start_datetime));
  }

  /** Linked → jump to the module; completed reminders → Completed. */
  function openSource(ev) {
    if (isLinked(ev) && onEditRequest) {
      if (ev.source_type === 'reminder' && ev.reminder_completed_at) {
        onEditRequest('reminder', ev.source_id, { completed: true });
        return;
      }
      onEditRequest(ev.source_type, ev.source_id, {
        occurrenceDate: ev.occurrence_date,
      });
      return;
    }
    beginEdit(ev);
  }

  function onChipClick(e, ev, day) {
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      togglePick(ev.id, true);
      return;
    }
    setPicked(new Set());
    setSelected(day);
    openSource(ev);
  }

  async function reloadAfterAction() {
    setError('');
    await reload();
  }

  /** Hide-all filter — mutex with elapsed; does not change Add to Calendar. */
  async function onHideHabitsChange(checked) {
    sessionHideHabits = checked;
    setHideHabits(checked);
    if (checked) {
      sessionHideElapsed = false;
      setHideElapsed(false);
      await updateSetting('calendar_hide_elapsed_habits', 'false');
    }
    await updateSetting('calendar_hide_habits', checked ? 'true' : 'false');
  }

  /** Hide habits before today — mutex with hide-all. */
  async function onHideElapsedChange(checked) {
    sessionHideElapsed = checked;
    setHideElapsed(checked);
    if (checked) {
      sessionHideHabits = false;
      setHideHabits(false);
      await updateSetting('calendar_hide_habits', 'false');
    }
    await updateSetting('calendar_hide_elapsed_habits', checked ? 'true' : 'false');
  }

  /** Nearest overflow-y scroller — Calendar sits in .focus-host, not .center-panel__scroll. */
  function nearestScrollY(el) {
    let node = el?.parentElement;
    while (node && node !== document.documentElement) {
      const oy = getComputedStyle(node).overflowY;
      if (oy === 'auto' || oy === 'scroll') return node;
      node = node.parentElement;
    }
    return null;
  }

  /** Pin the day-list top to the inner edge of the focus scroller (not the last card). */
  function scrollDayListToTop() {
    const list = dayListRef.current;
    const scroller = nearestScrollY(list);
    if (!list || !scroller) return;
    const pad = parseFloat(getComputedStyle(scroller).paddingTop) || 0;
    const delta =
      list.getBoundingClientRect().top -
      (scroller.getBoundingClientRect().top + pad);
    scroller.scrollTo({ top: scroller.scrollTop + delta, behavior: 'smooth' });
  }

  /** +N: select that day and pan to its card list. */
  function onMoreClick(e, day) {
    e.stopPropagation();
    setSelected(day);
    requestAnimationFrame(() => scrollDayListToTop());
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
    setEntityDeleteEv(null);
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
            className={`cal-chip${chipTypeClass(ev)}${
              picked.has(ev.id) ? ' cal-chip--selected' : ''
            }${isLinked(ev) ? ' cal-chip--linked' : ''}`}
            style={ev.source_type === 'habit' ? habitFillStyle(ev.habit_color) : undefined}
            onClick={(e) => onChipClick(e, ev, day)}
            onContextMenu={(e) => openChipMenu(e, ev)}
          >
            <CalEntryLabel ev={ev} />
          </button>
        ))}
        {extra > 0 && (
          <button
            type="button"
            className="cal-chip-more"
            onClick={(e) => onMoreClick(e, day)}
          >
            +{extra}
          </button>
        )}
      </>
    );
  }

  return (
    <div className="module-view module-view--calendar">
      <h1>Calendar</h1>
      <p className="module-view__hint">
        Month grid · click a linked entry to open it · Ctrl+click to select · RMB a day to add a task, reminder, bill, or habit · RMB a chip to remove from calendar or delete.
      </p>

      <div className="cal-nav">
        <button type="button" className="btn-compact" onClick={() => setCursor(subMonths(cursor, 1))}>
          ‹
        </button>
        <div className="cal-nav__pickers">
          <select
            className="cal-nav__select"
            aria-label="Month"
            value={cursor.getMonth()}
            onChange={(e) => jumpMonth(Number(e.target.value))}
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={name} value={i}>
                {name}
              </option>
            ))}
          </select>
          <select
            className="cal-nav__select"
            aria-label="Year"
            value={cursor.getFullYear()}
            onChange={(e) => jumpYear(Number(e.target.value))}
          >
            {yearsShown.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
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
          <button type="button" onClick={() => setPicked(new Set())}>
            Cancel
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
              onContextMenu={(e) => openDayMenu(e, d)}
            >
              <span className="cal-grid__day-num">{format(d, 'd')}</span>
              {renderChips(d)}
            </div>
          );
        })}
      </div>

      <div className="cal-day-head">
        <h2 className="cal-day-title">{format(selected, 'EEEE d MMM')}</h2>
        <div className="cal-day-head__filters">
          <label className="cal-appt-check">
            <input
              type="checkbox"
              checked={hideElapsed}
              onChange={(e) => onHideElapsedChange(e.target.checked)}
            />
            Hide Elapsed Habits
          </label>
          <label className="cal-appt-check">
            <input
              type="checkbox"
              checked={hideHabits}
              onChange={(e) => onHideHabitsChange(e.target.checked)}
            />
            Hide All Habits Entries
          </label>
        </div>
      </div>

      {error && <p className="cal-day-error">{error}</p>}

      <ul className="module-list" ref={dayListRef}>
        {visibleDayEvents.map((ev) => {
          const entryState = calendarEntryState(ev);
          const remDone = ev.source_type === 'reminder' && isReminderDone(ev);
          const doneLabel = remDone ? (entryState === 'expired' ? 'done' : 'Done') : null;
          const editing = editingId === ev.id;
          return (
            <li
              key={ev.id}
              ref={editing ? editRowRef : null}
              className={`module-list__item glass-inset module-list__item--col cal-day-card${chipTypeClass(ev)}${
                picked.has(ev.id) ? ' cal-row--selected' : ''
              }${editing ? ' module-list__item--editing' : ''}`}
              style={
                editing || ev.source_type !== 'habit'
                  ? undefined
                  : habitFillStyle(ev.habit_color)
              }
            >
            {editingId === ev.id ? (
              <form className="edit-form" onSubmit={saveEdit}>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
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
              <div
                className="module-list__row"
                onDoubleClick={rowDblClick(() => openSource(ev))}
                onContextMenu={(e) => openChipMenu(e, ev)}
              >
                <button
                  type="button"
                  className="cal-row-title"
                  onClick={(e) => onChipClick(e, ev, selected)}
                >
                  <strong className="cal-row-title__line">
                    <CalEntryLabel ev={ev} />
                    {entryState ? (
                      <span className="cal-entry-state"> ({entryState})</span>
                    ) : null}
                    {doneLabel ? (
                      <span className="cal-entry-state"> ({doneLabel})</span>
                    ) : null}
                  </strong>
                  <div className="module-list__meta">
                    {isLinked(ev) ? ev.source_type : ''}
                  </div>
                </button>
                {isLinked(ev) && CAL_CHIP_TYPES.has(ev.source_type) ? (
                  <CalDayCardActions
                    ev={ev}
                    onEdit={() => openSource(ev)}
                    onReload={reloadAfterAction}
                    onError={(msg) => setError(msg)}
                  />
                ) : (
                  <div className="item-row__actions">
                    <button type="button" onClick={() => beginEdit(ev)}>
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
                )}
              </div>
            )}
          </li>
          );
        })}
        {!visibleDayEvents.length && <p className="stub-empty">No events this day.</p>}
      </ul>

      {menu &&
        createPortal(
          <div
            ref={menuRef}
            className="lists-menu glass-panel"
            style={{ top: menu.y, left: menu.x }}
            role="menu"
            onContextMenu={(e) => e.preventDefault()}
          >
            {menu.event ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => removeFromCalendar(menu.event)}
                >
                  Remove from Calendar
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="danger"
                  onClick={() => requestEntityDelete(menu.event)}
                >
                  Delete
                </button>
              </>
            ) : (
              <>
                <button type="button" role="menuitem" onClick={() => pickCreate('task')}>
                  Add a Task
                </button>
                <button type="button" role="menuitem" onClick={() => pickCreate('reminder')}>
                  Add a Reminder
                </button>
                <button type="button" role="menuitem" onClick={() => pickCreate('bill')}>
                  Add a Bill
                </button>
                <button type="button" role="menuitem" onClick={() => pickCreate('habit')}>
                  Add a Habit
                </button>
              </>
            )}
          </div>,
          document.body
        )}

      <ConfirmDialog
        open={deleteOpen}
        title="Remove from calendar?"
        message="Also delete the linked item? Calendar-only keeps the bill, habit, reminder, or task."
        confirmLabel="Delete linked item too"
        secondaryLabel="Calendar only"
        danger
        onConfirm={() => applyDelete(true)}
        onSecondary={() => applyDelete(false)}
        onCancel={() => setDeleteOpen(false)}
      />
      <ConfirmDialog
        open={Boolean(entityDeleteEv)}
        title="Delete this item?"
        message={
          isLinked(entityDeleteEv)
            ? `This permanently deletes the linked ${entityDeleteEv.source_type} from the database and everywhere in the app. It cannot be undone.`
            : 'This permanently deletes this calendar event from the database. It cannot be undone.'
        }
        confirmLabel="Delete"
        danger
        onConfirm={() => applyDelete(true, entityDeleteEv ? [entityDeleteEv.id] : [])}
        onCancel={() => setEntityDeleteEv(null)}
      />
    </div>
  );
}
