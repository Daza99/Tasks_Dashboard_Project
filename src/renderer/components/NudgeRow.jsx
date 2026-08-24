import React from 'react';
import { addDays, format, isValid, parseISO } from 'date-fns';
import { formatNudgeLine } from './CalEntryLabel';
import { useDateFormat } from '../hooks/useDateFormat';

function todayKey() {
  return format(new Date(), 'yyyy-MM-dd');
}

/**
 * Nudge checkbox + Day Before / Custom buttons (Reminders + Bills).
 * @param {{
 *   nudge: boolean,
 *   mode: string,
 *   dueDate: string,
 *   onNudgeChange: (on: boolean) => void,
 *   onDayBefore: () => void,
 *   onCustom: () => void,
 *   dayBeforeTitle?: string,
 * }} props
 */
export function NudgeRow({
  nudge,
  mode,
  dueDate,
  onNudgeChange,
  onDayBefore,
  onCustom,
  dayBeforeTitle = 'Same time, one day before',
}) {
  const dayBeforeOff = dueDate === todayKey();
  const bright = Boolean(nudge);
  return (
    <div className="nudge-row">
      <label className="cal-appt-check">
        <input
          type="checkbox"
          checked={nudge}
          onChange={(e) => onNudgeChange(e.target.checked)}
        />
        Nudge
      </label>
      <button
        type="button"
        className={`btn-primary${bright && !dayBeforeOff ? '' : ' btn-primary--muted'}${
          bright && mode === 'day_before' && !dayBeforeOff ? ' active' : ''
        }`}
        disabled={dayBeforeOff}
        title={dayBeforeOff ? 'Due is today' : dayBeforeTitle}
        onClick={onDayBefore}
      >
        Day Before
      </button>
      <button
        type="button"
        className={`btn-primary${bright ? '' : ' btn-primary--muted'}${
          bright && mode === 'custom' ? ' active' : ''
        }`}
        onClick={onCustom}
      >
        Custom
      </button>
    </div>
  );
}

/**
 * Live “Nudge yyyy-MM-dd 11am” under the row; hidden when Nudge is off.
 * @param {{
 *   nudge: boolean,
 *   mode: string,
 *   dueDate: string,
 *   dueTime?: string,
 *   customDate: string,
 *   customTime: string,
 * }} props
 */
export function NudgePreview({
  nudge,
  mode,
  dueDate,
  dueTime = '09:00',
  customDate,
  customTime,
}) {
  const { dateFormat } = useDateFormat();
  if (!nudge) return null;
  let when = null;
  if (mode === 'custom') {
    when = parseISO(`${customDate}T${customTime || '09:00'}:00`);
  } else if (dueDate) {
    const due = parseISO(`${dueDate}T${dueTime || '09:00'}:00`);
    when = isValid(due) ? addDays(due, -1) : null;
  }
  const line = formatNudgeLine(when, dateFormat);
  if (!line) return null;
  return <div className="nudge-preview">{line}</div>;
}

export { todayKey };
