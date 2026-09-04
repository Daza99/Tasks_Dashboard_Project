import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Light-shell date picker for “Paid + date” (new billing day after this payment).
 */
export default function BillPayDateDialog({
  open,
  initialDate,
  onConfirm,
  onCancel,
}) {
  const [value, setValue] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setValue(initialDate || '');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, initialDate]);

  if (!open) return null;

  function submit(e) {
    e.preventDefault();
    const v = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
    onConfirm(v);
  }

  return createPortal(
    <div className="confirm-overlay" role="presentation" onClick={onCancel}>
      <form
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bill-pay-date-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h2 id="bill-pay-date-title">New billing date</h2>
        <p>Records this payment and sets the next due date (yyyy-mm-dd).</p>
        <input
          ref={inputRef}
          type="date"
          className="confirm-dialog__input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required
          aria-label="New billing date"
        />
        <div className="confirm-dialog__actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={!value}>
            Pay + set date
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
