import React, { useLayoutEffect, useRef } from 'react';
import { clipToWordLimit, countWords } from './DetailsDialog';
import { continueBulletOnEnter } from '../../utils/bullet-lines.js';

const DEFAULT_WORD_LIMIT = 300;

/**
 * Inline notes field. Persists with the parent Create / Save.
 * @param {{
 *   value: string,
 *   onChange: (text: string) => void,
 *   ariaLabel?: string,
 *   placeholder?: string,
 *   compact?: boolean,
 *   wordLimit?: number,
 *   continueBullets?: boolean,
 * }} props
 */
export default function DetailsInline({
  value,
  onChange,
  ariaLabel = 'Details',
  placeholder = 'Details (optional)',
  compact = false,
  wordLimit = DEFAULT_WORD_LIMIT,
  continueBullets = false,
}) {
  const taRef = useRef(null);
  const pendingCaret = useRef(null);
  const words = countWords(value);

  useLayoutEffect(() => {
    if (pendingCaret.current == null || !taRef.current) return;
    const pos = pendingCaret.current;
    pendingCaret.current = null;
    taRef.current.selectionStart = taRef.current.selectionEnd = pos;
  }, [value]);

  function handleChange(e) {
    onChange(clipToWordLimit(e.target.value, wordLimit));
  }

  function handleKeyDown(e) {
    if (!continueBullets || e.key !== 'Enter' || e.shiftKey) return;
    const el = e.target;
    if (el.selectionStart !== el.selectionEnd) return;
    const next = continueBulletOnEnter(el.value, el.selectionStart);
    if (!next) return;
    e.preventDefault();
    pendingCaret.current = next.caret;
    onChange(clipToWordLimit(next.text, wordLimit));
  }

  return (
    <div className={`details-inline${compact ? ' details-inline--compact' : ''}`}>
      <textarea
        ref={taRef}
        className="details-inline__textarea"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        rows={compact ? 3 : 4}
        placeholder={placeholder}
        aria-label={ariaLabel}
      />
      <div className="details-inline__bar">
        <span className="details-inline__count">
          {words} / {wordLimit}
        </span>
      </div>
    </div>
  );
}
