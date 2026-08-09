import React from 'react';

/**
 * Inline confirm when marking an estimate/avg bill paid.
 * @param {{ value: string, onChange: (v: string) => void, onConfirm: () => void, onCancel: () => void }} props
 */
export default function BillPayConfirm({ value, onChange, onConfirm, onCancel }) {
  return (
    <div className="bill-pay-confirm">
      <p className="bill-pay-confirm__hint">This bill had an estimated amount.</p>
      <div className="bill-pay-confirm__row">
        <input
          type="number"
          step="0.01"
          min="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="actual amount"
          aria-label="actual amount"
        />
        <button type="button" onClick={onConfirm}>
          Confirm
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
