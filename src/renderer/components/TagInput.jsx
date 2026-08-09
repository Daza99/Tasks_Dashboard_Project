import React, { useMemo, useRef } from 'react';
import {
  formatTagDisplay,
  matchTagPrefix,
  normalizeTagNames,
  parseCurrentTagToken,
} from '../../utils/tag-helpers.js';
import { useTagCatalog } from '../hooks/useTagCatalog';

/**
 * Multi-tag input with grey ghost suffix; Space/Tab accepts prediction.
 * Value is display string (`#a #b`); parent normalizes on submit.
 */
export default function TagInput({
  value,
  onChange,
  placeholder = '#tag',
  disabled = false,
  'aria-label': ariaLabel = 'Tags',
  id,
}) {
  const inputRef = useRef(null);
  const { catalog, refresh } = useTagCatalog();

  const { before, token, bare } = useMemo(
    () => parseCurrentTagToken(value),
    [value]
  );

  const exclude = useMemo(() => normalizeTagNames(value), [value]);

  const prediction = useMemo(() => {
    if (!bare) return null;
    return matchTagPrefix(bare, catalog, {
      exclude: exclude.filter((t) => t !== bare),
    });
  }, [bare, catalog, exclude]);

  const ghostSuffix = prediction ? prediction.slice(bare.length) : '';

  function acceptPrediction() {
    if (!prediction) return false;
    const next = `${before}${formatTagDisplay(prediction)} `;
    onChange(next);
    return true;
  }

  function handleKeyDown(e) {
    if ((e.key === ' ' || e.key === 'Tab') && prediction) {
      e.preventDefault();
      acceptPrediction();
    }
  }

  function handleChange(e) {
    onChange(e.target.value);
  }

  function handleBlur() {
    // Refresh catalog after edits so new tags appear elsewhere
    refresh();
  }

  return (
    <div className="tag-input">
      <div className="tag-input__ghost" aria-hidden="true">
        <span className="tag-input__ghost-typed">
          {before}
          {token}
        </span>
        {ghostSuffix ? (
          <span className="tag-input__ghost-rest">{ghostSuffix}</span>
        ) : null}
      </div>
      <input
        ref={inputRef}
        id={id}
        type="text"
        className="tag-input__field"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => refresh()}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  );
}
