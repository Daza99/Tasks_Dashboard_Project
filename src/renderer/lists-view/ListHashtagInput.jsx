import React, { useMemo, useRef } from 'react';
import {
  formatTagDisplay,
  matchTagPrefix,
  normalizeTagName,
} from '../../utils/tag-helpers.js';
import { useListHashtagWhitelist } from '../hooks/useListHashtagWhitelist';

/**
 * Single hashtag field for Lists filter bar.
 * Ghost-completes against list-hashtags.txt whitelist.
 * Focus on default #list places caret after #.
 */
export default function ListHashtagInput({
  value,
  onChange,
  placeholder = '#list',
  disabled = false,
  'aria-label': ariaLabel = 'List hashtag',
}) {
  const inputRef = useRef(null);
  const { whitelist, refresh } = useListHashtagWhitelist();
  const q = String(value || '');
  const bare = normalizeTagName(q);

  const prediction = useMemo(() => {
    if (!bare) return null;
    return matchTagPrefix(bare, whitelist);
  }, [bare, whitelist]);

  const ghostSuffix = prediction ? prediction.slice(bare.length) : '';

  function acceptPrediction() {
    if (!prediction) return false;
    onChange(formatTagDisplay(prediction));
    return true;
  }

  function handleKeyDown(e) {
    if (e.key === 'Tab' && prediction) {
      e.preventDefault();
      acceptPrediction();
    }
  }

  function handleFocus() {
    refresh();
    // Default #list → caret after # so user can replace "list"
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      if (normalizeTagName(el.value) === 'list' && String(el.value).trim() === '#list') {
        el.setSelectionRange(1, 1);
      }
    });
  }

  return (
    <div className="tag-input tag-input--list-hashtag">
      <div className="tag-input__ghost" aria-hidden="true">
        <span className="tag-input__ghost-typed">{q}</span>
        {ghostSuffix ? (
          <span className="tag-input__ghost-rest">{ghostSuffix}</span>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="text"
        className="tag-input__field"
        value={q}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  );
}
