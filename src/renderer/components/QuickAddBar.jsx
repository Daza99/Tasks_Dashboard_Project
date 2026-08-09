import React, { useMemo, useRef, useState } from 'react';
import { useBrief } from '../context/BriefContext';
import { useTagCatalog } from '../hooks/useTagCatalog';
import {
  formatTagDisplay,
  getHashTokenAt,
  matchTagPrefix,
} from '../../utils/tag-helpers.js';

/**
 * Always-visible quick add — routes via main-process parser.
 * Ghost-completes `#partial` tokens with Space/Tab.
 * @param {{ compact?: boolean }} props
 */
export default function QuickAddBar({ compact = false }) {
  const { refresh } = useBrief();
  const { catalog, refresh: refreshTags } = useTagCatalog();
  const [text, setText] = useState('');
  const [caret, setCaret] = useState(0);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  const hashTok = useMemo(() => getHashTokenAt(text, caret), [text, caret]);
  const prediction = useMemo(() => {
    if (!hashTok || !hashTok.bare) return null;
    return matchTagPrefix(hashTok.bare, catalog);
  }, [hashTok, catalog]);
  const ghostSuffix = prediction ? prediction.slice(hashTok.bare.length) : '';

  function syncCaret(el) {
    if (el) setCaret(el.selectionStart ?? el.value.length);
  }

  function acceptHashPrediction() {
    if (!hashTok || !prediction) return false;
    const full = formatTagDisplay(prediction);
    const next =
      text.slice(0, hashTok.start) + full + ' ' + text.slice(hashTok.end);
    setText(next);
    const pos = hashTok.start + full.length + 1;
    setCaret(pos);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(pos, pos);
      }
    });
    return true;
  }

  async function submit(e) {
    e?.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setStatus('');
    try {
      const result = await window.api.quickAdd(text.trim());
      setText('');
      setCaret(0);
      const label =
        result.type === 'task'
          ? result.item.title
          : result.type === 'reminder'
            ? result.item.title
            : result.type === 'habit'
              ? result.item.name
              : result.type === 'transaction'
                ? `$${Number(result.item.amount).toFixed(2)} ${result.item.category}`
                : result.type;
      setStatus(`${result.type} · ${label}`);
      await refresh();
      await refreshTags();
    } catch (err) {
      setStatus(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  function handleKeyDown(e) {
    if ((e.key === ' ' || e.key === 'Tab') && prediction) {
      e.preventDefault();
      acceptHashPrediction();
    }
  }

  const ghostTyped = hashTok ? text.slice(0, hashTok.end) : text;

  return (
    <form
      className={`quick-add${compact ? ' quick-add--compact' : ''}`}
      onSubmit={submit}
    >
      <div className="quick-add__field-wrap tag-input">
        <div className="tag-input__ghost" aria-hidden="true">
          <span className="tag-input__ghost-typed">{ghostTyped}</span>
          {ghostSuffix ? (
            <span className="tag-input__ghost-rest">{ghostSuffix}</span>
          ) : null}
        </div>
        <input
          ref={inputRef}
          type="text"
          className="tag-input__field"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            syncCaret(e.target);
          }}
          onKeyUp={(e) => syncCaret(e.target)}
          onClick={(e) => syncCaret(e.target)}
          onSelect={(e) => syncCaret(e.target)}
          onKeyDown={handleKeyDown}
          onFocus={() => refreshTags()}
          placeholder='Quick add — task, remind…, $12.50 coffee, habit stretch'
          aria-label="Quick add"
          disabled={busy}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <button type="submit" className="btn-primary" disabled={busy || !text.trim()}>
        Add
      </button>
      {status && <span className="quick-add__status">{status}</span>}
    </form>
  );
}
