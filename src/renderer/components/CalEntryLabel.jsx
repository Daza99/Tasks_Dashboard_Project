import React from 'react';
import { format, parseISO, isValid } from 'date-fns';

/**
 * Date-only calendar sources (synthetic 09:00). Do not add task / reminder / event.
 * New modules with a user clock time inherit the title suffix automatically.
 */
const DATE_ONLY_SOURCES = new Set(['bill', 'habit']);

/** Clock suffix or null when the source has no user-defined time. */
export function eventClockLabel(ev) {
  if (!ev?.start_datetime) return null;
  if (DATE_ONLY_SOURCES.has(ev.source_type)) return null;
  try {
    const d = parseISO(ev.start_datetime);
    if (!isValid(d)) return null;
    return d.getMinutes() === 0
      ? format(d, 'h a').replace(' ', '').toLowerCase()
      : format(d, 'h:mm a').toLowerCase();
  } catch {
    return null;
  }
}

/** "Title, 11am" — time omitted when not defined. */
export function eventDisplayTitle(ev) {
  const clock = eventClockLabel(ev);
  const name = ev?.title || '';
  return clock ? `${name}, ${clock}` : name;
}

/**
 * Title (+ optional clock) with a hover shadow box when description is set.
 * @param {{ ev: object, className?: string }} props
 */
export default function CalEntryLabel({ ev, className }) {
  const notes = String(ev?.description || '').trim();
  return (
    <span className={`cal-entry-label${className ? ` ${className}` : ''}`}>
      {eventDisplayTitle(ev)}
      {notes ? (
        <span className="cal-entry-tip" role="tooltip">
          {notes}
        </span>
      ) : null}
    </span>
  );
}
