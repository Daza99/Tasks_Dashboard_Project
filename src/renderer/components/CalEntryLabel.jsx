import React from 'react';
import { format, parseISO, isValid } from 'date-fns';

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
export function formatNudgeLine(iso) {
  if (!iso) return '';
  try {
    const d = typeof iso === 'string' ? parseISO(iso) : iso;
    if (!isValid(d)) return '';
    const clock = clockFromDate(d);
    return clock ? `Nudge ${format(d, 'yyyy-MM-dd')} ${clock}` : '';
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

/**
 * Title (+ optional clock) with a hover shadow box for nudge and/or description.
 * @param {{ ev: object, className?: string }} props
 */
export default function CalEntryLabel({ ev, className }) {
  const notes = String(ev?.description || '').trim();
  const nudgeLine = formatNudgeLine(ev?.nudge_datetime);
  const showTip = Boolean(nudgeLine || notes);
  return (
    <span className={`cal-entry-label${className ? ` ${className}` : ''}`}>
      {eventDisplayTitle(ev)}
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
