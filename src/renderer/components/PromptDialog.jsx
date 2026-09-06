import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * First catalog name with a case-insensitive prefix longer than `typed`.
 * @param {string} typed
 * @param {{ name: string }[]} suggestions
 * @returns {string|null}
 */
function matchNamePrefix(typed, suggestions) {
  const p = String(typed || '');
  if (!p) return null;
  const lower = p.toLowerCase();
  for (const s of suggestions || []) {
    const n = String(s?.name || '');
    if (n.length > p.length && n.toLowerCase().startsWith(lower)) return n;
  }
  return null;
}

/**
 * Text prompt in the shared .confirm-dialog shell (solid #fff / #111).
 * Optional suggestions: ghost suffix + chevron list. `onConfirm(value, picked)` —
 * `picked` is the suggestion object if chosen from the list and not edited since.
 * @param {{
 *   open: boolean,
 *   title: string,
 *   message?: string,
 *   confirmLabel?: string,
 *   placeholder?: string,
 *   initialValue?: string,
 *   suggestions?: { id: number, name: string }[],
 *   initialPicked?: { id: number, name: string }|null,
 *   onConfirm: (value: string, picked: { id: number, name: string }|null) => void,
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
  suggestions,
  initialPicked = null,
  onConfirm,
  onCancel,
}) {
  const [value, setValue] = useState('');
  const [picked, setPicked] = useState(null);
  const [listOpen, setListOpen] = useState(false);
  const inputRef = useRef(null);
  const comboRef = useRef(null);
  const hasSuggestions = Array.isArray(suggestions);
  const names = hasSuggestions ? suggestions : [];

  useEffect(() => {
    if (!open) return;
    setValue(initialValue || '');
    setPicked(initialPicked || null);
    setListOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open, initialValue, initialPicked]);

  // Esc closes the suggestion list first (does not cancel the dialog).
  useEffect(() => {
    if (!open || !listOpen) return undefined;
    function onKey(e) {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      setListOpen(false);
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, listOpen]);

  useEffect(() => {
    if (!listOpen) return undefined;
    function onDoc(e) {
      if (comboRef.current && !comboRef.current.contains(e.target)) {
        setListOpen(false);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [listOpen]);

  const prediction = useMemo(
    () => (hasSuggestions ? matchNamePrefix(value, names) : null),
    [hasSuggestions, value, names]
  );
  const ghostSuffix = prediction ? prediction.slice(value.length) : '';

  if (!open) return null;

  function onTyped(next) {
    setValue(next);
    setPicked(null);
  }

  function acceptPrediction() {
    if (!prediction) return false;
    setValue(prediction);
    setPicked(null);
    return true;
  }

  function pickSuggestion(s) {
    setValue(s.name);
    setPicked(s);
    setListOpen(false);
    inputRef.current?.focus();
  }

  function submit(e) {
    e.preventDefault();
    const v = value.trim();
    if (!v) return;
    onConfirm(v, picked);
  }

  function handleKeyDown(e) {
    if (e.key === 'Tab' && prediction) {
      e.preventDefault();
      acceptPrediction();
    }
  }

  const field = hasSuggestions ? (
    <div className="confirm-dialog__combo" ref={comboRef}>
      <div className="confirm-dialog__combo-field">
        <div className="confirm-dialog__ghost" aria-hidden="true">
          <span className="confirm-dialog__ghost-typed">{value}</span>
          {ghostSuffix ? (
            <span className="confirm-dialog__ghost-rest">{ghostSuffix}</span>
          ) : null}
        </div>
        <input
          ref={inputRef}
          type="text"
          className="confirm-dialog__combo-input"
          value={value}
          onChange={(e) => onTyped(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label={title}
          aria-autocomplete="list"
          aria-expanded={listOpen}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <button
        type="button"
        className="confirm-dialog__combo-arrow"
        aria-label="Previous names"
        aria-haspopup="listbox"
        aria-expanded={listOpen}
        disabled={names.length === 0}
        onClick={() => setListOpen((o) => !o)}
      >
        ▾
      </button>
      {listOpen && names.length > 0 ? (
        <ul className="confirm-dialog__combo-list" role="listbox">
          {names.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                role="option"
                aria-selected={picked?.id === s.id}
                onClick={() => pickSuggestion(s)}
              >
                {s.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  ) : (
    <input
      ref={inputRef}
      type="text"
      className="confirm-dialog__input"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder={placeholder}
      aria-label={title}
    />
  );

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
        {field}
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
