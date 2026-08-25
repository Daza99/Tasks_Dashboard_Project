import React, { useEffect, useMemo, useState } from 'react';
import {
  formatTagDisplay,
  formatTagsDisplay,
  matchTagPrefix,
  normalizeTagNames,
  parseCurrentTagToken,
} from '../../utils/tag-helpers.js';
import { useListHashtagWhitelist } from '../hooks/useListHashtagWhitelist';

/** True if both arrays hold the same bare names (order-insensitive). */
function sameTagSet(a, b) {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((t) => set.has(t));
}

/**
 * Multi-tag field + Add for an existing list.
 * Draft is local until Add/Enter; switching listId discards unsaved edits.
 * @param {{
 *   listId: number,
 *   tags: string[],
 *   onCommit: (listId: number, names: string[]) => void|Promise<void>,
 * }} props
 */
export default function ListHashtagEditor({ listId, tags = [], onCommit }) {
  const { whitelist, refresh } = useListHashtagWhitelist();
  const [draft, setDraft] = useState(() => formatTagsDisplay(tags));
  const [busy, setBusy] = useState(false);

  // Reset draft only on list switch (key also remounts). Ignore later tag reloads while typing.
  useEffect(() => {
    setDraft(formatTagsDisplay(tags));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tags captured at listId change
  }, [listId]);

  const saved = useMemo(() => normalizeTagNames(tags), [tags]);
  const next = useMemo(() => normalizeTagNames(draft), [draft]);
  const canAdd = next.length > 0 && !sameTagSet(next, saved) && !busy;

  const { before, token, bare } = useMemo(
    () => parseCurrentTagToken(draft),
    [draft]
  );

  const prediction = useMemo(() => {
    if (!bare) return null;
    return matchTagPrefix(bare, whitelist, {
      exclude: next.filter((t) => t !== bare),
    });
  }, [bare, whitelist, next]);

  const ghostSuffix = prediction ? prediction.slice(bare.length) : '';

  function acceptPrediction() {
    if (!prediction) return false;
    setDraft(`${before}${formatTagDisplay(prediction)} `);
    return true;
  }

  function handleKeyDown(e) {
    if ((e.key === ' ' || e.key === 'Tab') && prediction) {
      e.preventDefault();
      acceptPrediction();
    }
  }

  async function submit(e) {
    e?.preventDefault();
    if (!canAdd) return;
    setBusy(true);
    try {
      await onCommit(listId, next);
      setDraft(formatTagsDisplay(next));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="lists-hashtag-editor" onSubmit={submit}>
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
          type="text"
          className="tag-input__field"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => refresh()}
          placeholder="#list"
          aria-label="List hashtags"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <button type="submit" className="btn-primary" disabled={!canAdd}>
        Add
      </button>
    </form>
  );
}
