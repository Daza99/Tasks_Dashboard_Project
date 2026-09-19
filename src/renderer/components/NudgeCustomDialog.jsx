import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { addDays, format, parseISO } from 'date-fns';
import { useDateFormat } from '../hooks/useDateFormat';

/** Inclusive yyyy-MM-dd list from today through `endDate` (clamped to today if past). */
function datesThrough(endDate) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const end = !endDate || endDate < today ? today : endDate;
  const out = [];
  let d = parseISO(`${today}T00:00:00`);
  const last = parseISO(`${end}T00:00:00`);
  while (d.getTime() <= last.getTime()) {
    out.push(format(d, 'yyyy-MM-dd'));
    d = addDays(d, 1);
  }
  return out;
}

/**
 * Custom nudge: date dropdown (today → due date) + time.
 * `timeOnly` hides the date (habits: recurring clock time on due days).
 * @param {{
 *   open: boolean,
 *   dueDate: string,
 *   time: string,
 *   initialDate?: string,
 *   prompt?: string,
 *   timeOnly?: boolean,
 *   onSave: (date: string, time: string) => void,
 *   onCancel: () => void,
 * }} props
 */
export default function NudgeCustomDialog({
  open,
  dueDate,
  time,
  initialDate,
  prompt,
  timeOnly = false,
  onSave,
  onCancel,
}) {
  const { formatDate, methodHint } = useDateFormat();
  const options = useMemo(() => datesThrough(dueDate), [dueDate]);
  const [date, setDate] = useState(options[0] || '');
  const [clock, setClock] = useState(time || '09:00');

  useEffect(() => {
    if (!open) return;
    const nextDate =
      initialDate && options.includes(initialDate) ? initialDate : options[0] || '';
    setDate(nextDate);
    setClock(time || '09:00');
  }, [open, initialDate, options, time]);

  if (!open) return null;

  return createPortal(
    <div className="confirm-overlay" role="presentation" onClick={onCancel}>
      <div
        className="confirm-dialog glass-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="nudge-custom-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="nudge-custom-title">Custom nudge</h2>
        <p>
          {prompt ||
            (timeOnly
              ? 'Time of day for the check-in ping.'
              : `When to ping before the reminder (date method: ${methodHint}).`)}
        </p>
        <div className="nudge-custom-fields">
          {timeOnly ? null : (
            <label className="edit-label">
              Date
              <select value={date} onChange={(e) => setDate(e.target.value)}>
                {options.map((d) => (
                  <option key={d} value={d}>
                    {formatDate(d)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="edit-label">
            Time
            <input
              type="time"
              value={clock}
              onChange={(e) => setClock(e.target.value)}
            />
          </label>
        </div>
        <div className="confirm-dialog__actions">
          <button type="button" className="btn-nudge-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={timeOnly ? !clock : !date || !clock}
            onClick={() =>
              onSave(date || options[0] || format(new Date(), 'yyyy-MM-dd'), clock)
            }
          >
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
