import React from 'react';
import { createPortal } from 'react-dom';

/**
 * Modal confirm. Renders nothing when closed.
 * Portaled to body so nested focus-host backdrop-filter cannot wash contrast.
 * @param {{
 *   open: boolean,
 *   title: string,
 *   message: string,
 *   confirmLabel?: string,
 *   secondaryLabel?: string,
 *   danger?: boolean,
 *   onConfirm: () => void,
 *   onSecondary?: () => void,
 *   onCancel: () => void,
 * }} props
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'OK',
  secondaryLabel,
  danger = false,
  onConfirm,
  onSecondary,
  onCancel,
}) {
  if (!open) return null;
  return createPortal(
    <div className="confirm-overlay" role="presentation" onClick={onCancel}>
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title">{title}</h2>
        <p>{message}</p>
        <div className="confirm-dialog__actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          {secondaryLabel && (
            <button type="button" onClick={onSecondary}>
              {secondaryLabel}
            </button>
          )}
          <button
            type="button"
            className={danger ? 'danger' : 'btn-primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
