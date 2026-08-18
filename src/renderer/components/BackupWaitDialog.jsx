import React from 'react';
import { createPortal } from 'react-dom';

/**
 * Non-dismissible splash while a snapshot runs.
 * Solid white / #111 — same contrast shell as .confirm-dialog.
 * @param {{ open: boolean }} props
 */
export default function BackupWaitDialog({ open }) {
  if (!open) return null;
  return createPortal(
    <div
      className="confirm-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="backup-wait-title"
    >
      <div className="confirm-dialog backup-wait-dialog">
        <h2 id="backup-wait-title">Please Wait Backing up...</h2>
      </div>
    </div>,
    document.body
  );
}
