import React from 'react';
import { clipToWordLimit, countWords } from './DetailsDialog';

const WORD_LIMIT = 300;

/**
 * Inline notes field. Persists with the parent Create / Save.
 * @param {{
 *   value: string,
 *   onChange: (text: string) => void,
 *   ariaLabel?: string,
 *   placeholder?: string,
 * }} props
 */
export default function DetailsInline({
  value,
  onChange,
  ariaLabel = 'Details',
  placeholder = 'Details (optional)',
}) {
  const words = countWords(value);

  function handleChange(e) {
    onChange(clipToWordLimit(e.target.value));
  }

  return (
    <div className="details-inline">
      <textarea
        className="details-inline__textarea"
        value={value}
        onChange={handleChange}
        rows={4}
        placeholder={placeholder}
        aria-label={ariaLabel}
      />
      <div className="details-inline__bar">
        <span className="details-inline__count">
          {words} / {WORD_LIMIT}
        </span>
      </div>
    </div>
  );
}
