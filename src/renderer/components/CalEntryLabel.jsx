import React from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { formatDateKey } from '../../utils/date-format.js';
import { useDateFormat } from '../hooks/useDateFormat';

/**
 * Date-only calendar sources (synthetic 09:00). Do not add task / reminder / event.
 * New modules with a user clock time inherit the title suffix automatically.
 */
const DATE_ONLY_SOURCES = new Set(['bill', 'habit']);

/** Clock string from a Date — `11am` or `11:30 am`. */
function clockFromDate(d) {
  if (!d || !isValid(d)) return null;
  return d.getMinutes() === 0
    ? format(d, 'h a').replace(' ', '').toLowerCase()
    : format(d, 'h:mm a').toLowerCase();
}

/** Clock suffix or null when the source has no user-defined time. */
export function eventClockLabel(ev) {
  if (!ev?.start_datetime) return null;
  if (DATE_ONLY_SOURCES.has(ev.source_type)) return null;
  try {
    return clockFromDate(parseISO(ev.start_datetime));
  } catch {
    return null;
  }
}

/** "Nudge 2026-09-17 11am" or empty when iso is missing/invalid. */
export function formatNudgeLine(iso, dateFormat) {
  if (!iso) return '';
  try {
    const d = typeof iso === 'string' ? parseISO(iso) : iso;
    if (!isValid(d)) return '';
    const clock = clockFromDate(d);
    return clock ? `Nudge ${formatDateKey(d, dateFormat)} ${clock}` : '';
  } catch {
    return '';
  }
}

/** "Title, 11am" — time omitted when not defined. */
export function eventDisplayTitle(ev) {
  const clock = eventClockLabel(ev);
  const name = ev?.title || '';
  return clock ? `${name}, ${clock}` : name;
}

/** Black X (not complete) or tick (complete) — display-only, sized via CSS. */
function HabitStatusIcon({ completed }) {
  const label = completed ? 'Completed' : 'Not complete';
  return (
    <span className="cal-habit-status-wrap" title={label}>
      <svg className="cal-habit-status" viewBox="0 0 16 16" aria-hidden="true">
        {completed ? (
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 8.5 6.5 12 13 4.5"
          />
        ) : (
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            d="M4 4l8 8M12 4l-8 8"
          />
        )}
      </svg>
    </span>
  );
}

/**
 * Title (+ optional clock) with a hover shadow box for nudge and/or description.
 * Habit chips prefix a check-in X/tick locked to that occurrence's log.
 * @param {{ ev: object, className?: string }} props
 */
export default function CalEntryLabel({ ev, className }) {
  const { dateFormat } = useDateFormat();
  const notes = String(ev?.description || '').trim();
  const nudgeLine = formatNudgeLine(ev?.nudge_datetime, dateFormat);
  const showTip = Boolean(nudgeLine || notes);
  const isHabit = ev?.source_type === 'habit';
  return (
    <span className={`cal-entry-label${className ? ` ${className}` : ''}`}>
      {isHabit ? <HabitStatusIcon completed={Boolean(ev.habit_completed)} /> : null}
      <span className="cal-entry-label__title">{eventDisplayTitle(ev)}</span>
      {showTip ? (
        <span className="cal-entry-tip" role="tooltip">
          {nudgeLine ? (
            <span className="cal-entry-tip__nudge">{nudgeLine}</span>
          ) : null}
          {notes ? <span className="cal-entry-tip__notes">{notes}</span> : null}
        </span>
      ) : null}
    </span>
  );
}
