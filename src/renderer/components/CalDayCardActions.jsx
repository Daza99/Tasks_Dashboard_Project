import React, { useState } from 'react';
import { addDays, format, isValid, parseISO } from 'date-fns';
import LockButton from './LockButton';
import BillPayConfirm from './BillPayConfirm';
import BillPayDateDialog from './BillPayDateDialog';

const PAID_DATE_TITLE =
  'Paid late? Only use this when the biller moved the billing date.';

/** Next base due preview for Paid + date default. */
function advanceBasePreview(iso, recurrence, billingDay) {
  const d = parseISO(`${iso}T12:00:00`);
  if (!isValid(d) || !recurrence) return iso;
  if (recurrence === 'fortnight') return format(addDays(d, 14), 'yyyy-MM-dd');
  const months = recurrence === 'yearly' ? 12 : recurrence === 'quarterly' ? 3 : 1;
  const moved = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const last = new Date(moved.getFullYear(), moved.getMonth() + 1, 0).getDate();
  const day = Math.min(Number(billingDay) || d.getDate(), last);
  moved.setDate(day);
  return format(moved, 'yyyy-MM-dd');
}

/**
 * Day-list card actions matching each entity’s own screen.
 * @param {{
 *   ev: object,
 *   onEdit: () => void,
 *   onReload: () => Promise<void>,
 *   onError: (msg: string) => void,
 * }} props
 */
export default function CalDayCardActions({ ev, onEdit, onReload, onError }) {
  const [payingId, setPayingId] = useState(null);
  const [payActual, setPayActual] = useState('');
  const [payMode, setPayMode] = useState('paid');
  const [payDateOpts, setPayDateOpts] = useState(null);
  const [payNewDate, setPayNewDate] = useState('');

  async function run(fn) {
    try {
      await fn();
      await onReload();
    } catch (err) {
      onError(err?.message || String(err));
    }
  }

  /** Paid / Paid Late / Paid + date — estimate/avg asks for actual first. */
  async function payBill(actualOverride, mode = 'paid') {
    const needsActual =
      ev.bill_amount_mode === 'estimate' || ev.bill_amount_mode === 'average';
    if (needsActual && actualOverride === undefined) {
      setPayingId(ev.source_id);
      setPayMode(mode);
      setPayActual(String(ev.bill_amount ?? ''));
      return;
    }
    const opts = {};
    if (needsActual) {
      const actual = Number(actualOverride);
      if (!Number.isFinite(actual)) {
        onError('Invalid actual amount');
        return;
      }
      opts.actual_amount = actual;
    }
    if (mode === 'late') opts.late = true;
    if (mode === 'change') {
      setPayDateOpts(opts);
      setPayNewDate(
        advanceBasePreview(ev.bill_due_date, ev.bill_recurrence, ev.bill_billing_day)
      );
      setPayingId(null);
      return;
    }
    await run(async () => {
      await window.api.markBillPaid(ev.source_id, opts);
      setPayingId(null);
    });
  }

  async function confirmPayDate(date) {
    const opts = { ...(payDateOpts || {}), new_due_date: date };
    setPayDateOpts(null);
    await run(() => window.api.markBillPaid(ev.source_id, opts));
  }

  const type = ev.source_type;
  const id = ev.source_id;
  const billPaid =
    ev.bill_paid_status === 'paid' || Boolean(ev.bill_cycle_paid);

  return (
    <>
      <div
        className="item-row__actions"
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {type === 'task' && (
          <>
            <LockButton
              itemType="task"
              id={id}
              locked={ev.task_locked}
              onChanged={onReload}
            />
            <button
              type="button"
              className={`progress-chip${
                !ev.task_completed_at && !ev.task_started && !ev.task_half_done
                  ? ' is-on'
                  : ''
              }`}
              aria-pressed={
                !ev.task_completed_at && !ev.task_started && !ev.task_half_done
                  ? 'true'
                  : 'false'
              }
              disabled={Boolean(ev.task_completed_at)}
              onClick={() => run(() => window.api.setTaskProgress(id, 'not_started', true))}
            >
              Not Started
            </button>
            <button
              type="button"
              className={`progress-chip${
                !ev.task_completed_at && ev.task_started ? ' is-on' : ''
              }`}
              aria-pressed={
                !ev.task_completed_at && ev.task_started ? 'true' : 'false'
              }
              disabled={Boolean(ev.task_completed_at)}
              onClick={() => run(() => window.api.setTaskProgress(id, 'todo_started', true))}
            >
              Started
            </button>
            <button
              type="button"
              className={`progress-chip${
                !ev.task_completed_at && ev.task_half_done ? ' is-on' : ''
              }`}
              aria-pressed={
                !ev.task_completed_at && ev.task_half_done ? 'true' : 'false'
              }
              disabled={Boolean(ev.task_completed_at)}
              onClick={() =>
                run(() => window.api.setTaskProgress(id, 'todo_half_done', true))
              }
            >
              Half done
            </button>
            {!ev.task_completed_at && (
              <button type="button" onClick={() => run(() => window.api.completeTask(id))}>
                Done
              </button>
            )}
            <button type="button" onClick={() => run(() => window.api.resetTask(id))}>
              Reset
            </button>
            <button type="button" onClick={onEdit}>
              Edit
            </button>
            {!ev.task_locked && (
              <button
                type="button"
                className="danger"
                onClick={() => run(() => window.api.deleteTask(id))}
              >
                Del
              </button>
            )}
          </>
        )}

        {type === 'habit' && (
          <>
            <button
              type="button"
              disabled={ev.habit_completed}
              onClick={() =>
                run(() => window.api.toggleCheckin(id, ev.occurrence_date))
              }
            >
              {ev.habit_completed ? 'Completed' : 'Not Completed'}
            </button>
            <button
              type="button"
              onClick={() =>
                run(() => window.api.toggleCheckin(id, ev.occurrence_date))
              }
            >
              Undo
            </button>
            <button
              type="button"
              title="Shelve this habit (hidden from the active list, nudges, and calendar until you Activate it)"
              aria-label="Shelve this habit (hidden from the active list, nudges, and calendar until you Activate it)"
              onClick={() => run(() => window.api.archiveHabit(id))}
            >
              Archive
            </button>
            <button type="button" onClick={onEdit}>
              Edit
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => run(() => window.api.deleteHabit(id))}
            >
              Del
            </button>
          </>
        )}

        {type === 'reminder' && (
          <>
            <LockButton
              itemType="reminder"
              id={id}
              locked={ev.reminder_locked}
              onChanged={onReload}
            />
            <button
              type="button"
              onClick={() => run(() => window.api.completeReminder(id))}
            >
              Done
            </button>
            <button type="button" onClick={onEdit}>
              Edit
            </button>
            {!ev.reminder_locked && (
              <button
                type="button"
                className="danger"
                onClick={() => run(() => window.api.deleteReminder(id))}
              >
                Del
              </button>
            )}
          </>
        )}

        {type === 'bill' && (
          <>
            {!billPaid && payingId === id && (
              <BillPayConfirm
                value={payActual}
                onChange={setPayActual}
                onConfirm={() => payBill(payActual, payMode)}
                onCancel={() => setPayingId(null)}
              />
            )}
            {!billPaid && payingId !== id && (
              <>
                <button type="button" onClick={() => payBill(undefined, 'paid')}>
                  Paid
                </button>
                <button type="button" onClick={() => payBill(undefined, 'late')}>
                  Paid Late
                </button>
                {ev.bill_recurrence ? (
                  <button
                    type="button"
                    title={PAID_DATE_TITLE}
                    onClick={() => payBill(undefined, 'change')}
                  >
                    Paid + date
                  </button>
                ) : null}
              </>
            )}
            <button type="button" onClick={onEdit}>
              Edit
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => run(() => window.api.deleteBill(id))}
            >
              Del
            </button>
          </>
        )}
      </div>
      {type === 'bill' && (
        <BillPayDateDialog
          open={Boolean(payDateOpts)}
          initialDate={payNewDate}
          onConfirm={confirmPayDate}
          onCancel={() => setPayDateOpts(null)}
        />
      )}
    </>
  );
}
