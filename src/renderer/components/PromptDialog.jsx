import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Text prompt in the shared .confirm-dialog shell (solid #fff / #111).
 * @param {{
 *   open: boolean,
 *   title: string,
 *   message?: string,
 *   confirmLabel?: string,
 *   placeholder?: string,
 *   initialValue?: string,
 *   onConfirm: (value: string) => void,
 *   onCancel: () => void,
 * }} props
 */
export default function PromptDialog({
  open,
  title,
  message = '',
  confirmLabel = 'OK',
  placeholder = '',
  initialValue = '',
  onConfirm,
  onCancel,
}) {
  const [value, setValue] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setValue(initialValue || '');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, initialValue]);

  if (!open) return null;

  function submit(e) {
    e.preventDefault();
    const v = value.trim();
    if (!v) return;
    onConfirm(v);
  }

  return createPortal(
    <div className="confirm-overlay" role="presentation" onClick={onCancel}>
      <form
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h2 id="prompt-title">{title}</h2>
        {message ? <p>{message}</p> : null}
        <input
          ref={inputRef}
          type="text"
          className="confirm-dialog__input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          aria-label={title}
        />
        <div className="confirm-dialog__actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={!value.trim()}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
