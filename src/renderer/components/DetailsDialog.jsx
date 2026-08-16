import React, { useEffect, useState } from 'react';

const WORD_LIMIT = 300;

/** Word count; empty / whitespace-only is 0. */
export function countWords(text) {
  const t = String(text || '').trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

/** Keep the first `limit` words (paste-safe). */
export function clipToWordLimit(text, limit = WORD_LIMIT) {
  const raw = String(text || '');
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  const words = trimmed.split(/\s+/);
  if (words.length <= limit) return raw;
  const leading = raw.match(/^\s*/)?.[0] || '';
  return leading + words.slice(0, limit).join(' ');
}

/**
 * Optional notes modal. Renders nothing when closed.
 * @param {{
 *   open: boolean,
 *   value: string,
 *   onSave: (text: string) => void,
 *   onCancel: () => void,
 *   title?: string,
 * }} props
 */
export default function DetailsDialog({
  open,
  value,
  onSave,
  onCancel,
  title = 'Details',
}) {
  const [draft, setDraft] = useState(value || '');

  useEffect(() => {
    if (open) setDraft(value || '');
  }, [open, value]);

  if (!open) return null;

  const words = countWords(draft);

  function handleChange(e) {
    setDraft(clipToWordLimit(e.target.value));
  }

  return (
    <div className="confirm-overlay" role="presentation" onClick={onCancel}>
      <div
        className="confirm-dialog glass-panel details-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="details-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="details-title">{title}</h2>
        <p>Optional notes. {WORD_LIMIT} word limit.</p>
        <textarea
          className="details-dialog__textarea"
          value={draft}
          onChange={handleChange}
          rows={8}
          placeholder="Notes…"
          aria-label="Details"
        />
        <div className="details-dialog__count">
          {words} / {WORD_LIMIT} words
        </div>
        <div className="confirm-dialog__actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={() => onSave(draft)}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
