import React, { useMemo } from 'react';
import {
  formatTagDisplay,
  matchTagPrefix,
  normalizeTagName,
} from '../../utils/tag-helpers.js';
import { useTagCatalog } from '../hooks/useTagCatalog';

/**
 * Search field with tag ghost when query is `#…` (or starts with #).
 * Non-tag queries behave as a normal search input.
 */
export default function TagSearchInput({
  value,
  onChange,
  placeholder = 'Name or #tag',
  disabled = false,
  onFocus,
  onBlur,
  onKeyDown: onKeyDownProp,
  inputRef,
  className,
  'aria-label': ariaLabel = 'Search',
}) {
  const { catalog, refresh } = useTagCatalog();
  const q = String(value || '');
  const tagMode = q.trimStart().startsWith('#');
  const bare = tagMode ? normalizeTagName(q.trim()) : '';

  const prediction = useMemo(() => {
    if (!tagMode || !bare) return null;
    return matchTagPrefix(bare, catalog);
  }, [tagMode, bare, catalog]);

  const ghostSuffix = prediction ? prediction.slice(bare.length) : '';

  function acceptPrediction() {
    if (!prediction) return false;
    onChange(formatTagDisplay(prediction));
    return true;
  }

  function handleKeyDown(e) {
    if ((e.key === 'Tab' || e.key === 'Enter') && prediction) {
      // Tab accept; Enter accepts then lets form/filter use value
      if (e.key === 'Tab') e.preventDefault();
      if (e.key === 'Enter') {
        e.preventDefault();
        acceptPrediction();
        onKeyDownProp?.(e);
        return;
      }
      acceptPrediction();
    }
    onKeyDownProp?.(e);
  }

  return (
    <div className={`tag-input tag-input--search${className ? ` ${className}` : ''}`}>
      <div className="tag-input__ghost" aria-hidden="true">
        <span className="tag-input__ghost-typed">{q}</span>
        {ghostSuffix ? (
          <span className="tag-input__ghost-rest">{ghostSuffix}</span>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="search"
        className="tag-input__field"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={(e) => {
          refresh();
          onFocus?.(e);
        }}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  );
}
