import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  getCaretOffset,
  insertPrefixedNewline,
  seedEmpty,
  setCaretOffset,
} from '../../utils/bullet-lines.js';
import { registerDocFlusher } from './docFlush.js';

const MODES = [
  { id: 'mixed', label: 'Mixed' },
  { id: 'line', label: 'Line' },
  { id: 'dot', label: 'Dot' },
  { id: 'numbered', label: 'Numbered' },
];

const FONTS = [
  { id: 'outfit', label: 'Outfit', css: '"Outfit", "Segoe UI", sans-serif' },
  { id: 'serif', label: 'Source Serif 4', css: '"Source Serif 4", Georgia, serif' },
  { id: 'mono', label: 'IBM Plex Mono', css: '"IBM Plex Mono", Consolas, monospace' },
  { id: 'segoe', label: 'Segoe UI', css: '"Segoe UI", sans-serif' },
];

const SAVE_FLASH_MS = 2500;

function fontCss(id) {
  return FONTS.find((f) => f.id === id)?.css || FONTS[3].css;
}

/** True if the selection is a non-collapsed range inside el. */
function selectionIn(el) {
  const sel = window.getSelection();
  if (!el || !sel || sel.isCollapsed || sel.rangeCount === 0) return false;
  return el.contains(sel.anchorNode);
}

/**
 * Bullet notepad with MdPad-parity toolbar (Type of + Font + format tools).
 * Edit surface is contenteditable so undo/redo and format markers work.
 * @param {{
 *   list: { id: number, content?: string, style: object },
 *   onSaved: (list: object) => void,
 * }} props
 */
export default function BulletPad({ list, onSaved }) {
  const style = list.style || {};
  const initialContent = list.content || seedEmpty(style.bulletMode || 'mixed');
  const [content, setContent] = useState(initialContent);
  const [preview, setPreview] = useState(false);
  const [mode, setMode] = useState(style.bulletMode || 'mixed');
  const [fontFamily, setFontFamily] = useState(style.fontFamily || 'segoe');
  const [fontSize, setFontSize] = useState(style.fontSize || 16);
  const [fontColor, setFontColor] = useState(style.fontColor || '#111111');
  const [bgColor, setBgColor] = useState(style.bgColor || '#ffffff');
  const [swatchOverride, setSwatchOverride] = useState(null);
  const [savingFlash, setSavingFlash] = useState(false);
  const timer = useRef(null);
  const dirty = useRef(false);
  const ceRef = useRef(null);
  const saveFlashTimer = useRef(null);
  const seenListId = useRef(list.id);
  const pending = useRef({
    content: initialContent,
    style: {
      bulletMode: style.bulletMode || 'mixed',
      fontFamily: style.fontFamily || 'segoe',
      fontSize: style.fontSize || 16,
      fontColor: style.fontColor || '#111111',
      bgColor: style.bgColor || '#ffffff',
    },
  });

  // Keep pending in sync before paint when switching lists.
  if (seenListId.current !== list.id) {
    seenListId.current = list.id;
    const seed = list.content || seedEmpty(style.bulletMode || 'mixed');
    pending.current = {
      content: seed,
      style: {
        bulletMode: style.bulletMode || 'mixed',
        fontFamily: style.fontFamily || 'segoe',
        fontSize: style.fontSize || 16,
        fontColor: style.fontColor || '#111111',
        bgColor: style.bgColor || '#ffffff',
      },
    };
    dirty.current = false;
  }

  async function flushNow() {
    clearTimeout(timer.current);
    timer.current = null;
    if (!dirty.current) return;
    dirty.current = false;
    const saved = await window.api.saveListDoc(list.id, pending.current);
    onSaved(saved);
  }

  useEffect(() => {
    const seed = list.content || seedEmpty(style.bulletMode || 'mixed');
    setContent(seed);
    setMode(style.bulletMode || 'mixed');
    setFontFamily(style.fontFamily || 'segoe');
    setFontSize(style.fontSize || 16);
    setFontColor(style.fontColor || '#111111');
    setBgColor(style.bgColor || '#ffffff');
    setPreview(false);
    setSwatchOverride(null);
  }, [list.id]);

  // Fill CE only on list switch or leaving Preview — never on each keystroke.
  useLayoutEffect(() => {
    if (preview) return;
    const el = ceRef.current;
    if (!el) return;
    el.textContent = pending.current.content;
  }, [list.id, preview]);

  useEffect(() => {
    const unsub = registerDocFlusher(flushNow);
    return () => {
      unsub();
      void flushNow();
      clearTimeout(saveFlashTimer.current);
    };
  }, [list.id]);

  useEffect(() => {
    if (preview) return undefined;
    function onSel() {
      if (!selectionIn(ceRef.current)) setSwatchOverride(null);
    }
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, [preview]);

  function persist(nextContent, nextStyle) {
    pending.current = { content: nextContent, style: nextStyle };
    dirty.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      flushNow();
    }, 400);
  }

  function currentStyle(partial = {}) {
    return {
      bulletMode: mode,
      fontFamily,
      fontSize,
      fontColor,
      bgColor,
      ...partial,
    };
  }

  function bump(partial) {
    if (partial.bulletMode) {
      setMode(partial.bulletMode);
      if (!String(content).trim()) {
        const seeded = seedEmpty(partial.bulletMode);
        setContent(seeded);
        if (ceRef.current && !preview) ceRef.current.textContent = seeded;
        persist(seeded, currentStyle(partial));
        return;
      }
    }
    if (partial.fontFamily) setFontFamily(partial.fontFamily);
    if (partial.fontSize != null) setFontSize(partial.fontSize);
    if (partial.fontColor) setFontColor(partial.fontColor);
    if (partial.bgColor) setBgColor(partial.bgColor);
    persist(content, currentStyle(partial));
  }

  /** Read CE → plain text state. */
  function syncFromCe() {
    const el = ceRef.current;
    if (!el) return;
    // Prefer innerText so newlines from <br>/blocks survive
    const text = el.innerText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    setContent(text);
    persist(text, currentStyle());
  }

  /** Wrap selection with MD-style markers via insertText (native-undoable). */
  function applyFormat(marker) {
    const el = ceRef.current;
    if (!el || preview) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel) return;
    const text = sel.toString();
    const mLen = marker.length;
    if (
      text.length >= mLen * 2 &&
      text.startsWith(marker) &&
      text.endsWith(marker)
    ) {
      document.execCommand('insertText', false, text.slice(mLen, text.length - mLen));
    } else if (text.length === 0) {
      document.execCommand('insertText', false, marker + marker);
      if (sel.rangeCount) {
        const r = sel.getRangeAt(0);
        const node = r.startContainer;
        const off = r.startOffset - mLen;
        if (node.nodeType === 3 && off >= 0) {
          r.setStart(node, off);
          r.collapse(true);
          sel.removeAllRanges();
          sel.addRange(r);
        }
      }
    } else {
      document.execCommand('insertText', false, marker + text + marker);
    }
    syncFromCe();
  }

  function keepSelection(e) {
    e.preventDefault();
  }

  function onFontColor(e) {
    const hex = e.target.value;
    const el = ceRef.current;
    if (!preview && selectionIn(el)) {
      el.focus();
      document.execCommand('styleWithCSS', false, true);
      document.execCommand('foreColor', false, hex);
      setSwatchOverride(hex);
      syncFromCe();
      return;
    }
    setSwatchOverride(null);
    bump({ fontColor: hex });
  }

  function onSelCheck() {
    if (!selectionIn(ceRef.current)) setSwatchOverride(null);
  }

  function onKeyDown(e) {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    const el = ceRef.current;
    if (!el) return;
    const caret = getCaretOffset(el);
    const text = el.innerText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const { text: next, caret: nextCaret } = insertPrefixedNewline(text, caret, mode);
    el.textContent = next;
    setCaretOffset(el, nextCaret);
    setContent(next);
    persist(next, currentStyle());
  }

  function onPaste(e) {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }

  function hist(cmd) {
    const el = ceRef.current;
    if (!el || preview) return;
    el.focus();
    document.execCommand(cmd);
    syncFromCe();
  }

  function onSaveClick() {
    setSavingFlash(true);
    clearTimeout(saveFlashTimer.current);
    saveFlashTimer.current = setTimeout(() => setSavingFlash(false), SAVE_FLASH_MS);
    void flushNow();
  }

  const canvasStyle = {
    fontFamily: fontCss(fontFamily),
    fontSize: `${fontSize}px`,
    color: fontColor,
    background: bgColor,
    whiteSpace: 'pre-wrap',
  };

  const swatchValue = swatchOverride || fontColor;

  return (
    <div className="list-pad">
      <div className="list-pad__bar">
        <label className="list-pad__field">
          Type of
          <select
            value={mode}
            onChange={(e) => bump({ bulletMode: e.target.value })}
          >
            {MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="list-pad__field">
          <span className="list-pad__caption list-pad__caption--font">Font</span>
          <select
            value={fontFamily}
            onChange={(e) => bump({ fontFamily: e.target.value })}
          >
            {FONTS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="list-pad__field list-pad__field--sm">
          Font size
          <input
            type="number"
            min={10}
            max={32}
            value={fontSize}
            onChange={(e) => bump({ fontSize: Number(e.target.value) || 16 })}
          />
        </label>
        <div className="list-pad__swatches">
          <label className="list-pad__field list-pad__field--swatch">
            <span className="list-pad__caption list-pad__caption--font-color">
              Font color
            </span>
            <input
              type="color"
              value={swatchValue}
              onMouseDown={keepSelection}
              onChange={onFontColor}
            />
          </label>
          <label className="list-pad__field list-pad__field--swatch">
            <span className="list-pad__caption">BG Color</span>
            <input
              type="color"
              value={bgColor}
              onChange={(e) => bump({ bgColor: e.target.value })}
            />
          </label>
        </div>
        <div className="list-pad__tools">
          <button
            type="button"
            className="list-pad__fmt"
            title="Bold"
            disabled={preview}
            onMouseDown={keepSelection}
            onClick={() => applyFormat('**')}
          >
            B
          </button>
          <button
            type="button"
            className="list-pad__fmt list-pad__fmt--italic"
            title="Italic"
            disabled={preview}
            onMouseDown={keepSelection}
            onClick={() => applyFormat('*')}
          >
            I
          </button>
          <button
            type="button"
            className="list-pad__fmt list-pad__fmt--strike"
            title="Strikethrough"
            disabled={preview}
            onMouseDown={keepSelection}
            onClick={() => applyFormat('~~')}
          >
            S
          </button>
          <div className="list-pad__save-col">
            <span
              className={`list-pad__saving${savingFlash ? ' list-pad__saving--visible' : ''}`}
            >
              Saving..
            </span>
            <button
              type="button"
              className="list-pad__save"
              title="Save"
              onClick={onSaveClick}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M6 3h10l5 5v13a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M8 3v6h8V3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M8 15h8v6H8z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              </svg>
            </button>
          </div>
          <button
            type="button"
            className="list-pad__hist"
            title="Undo"
            disabled={preview}
            onMouseDown={keepSelection}
            onClick={() => hist('undo')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M9 14 4 9l5-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            className="list-pad__hist"
            title="Redo"
            disabled={preview}
            onMouseDown={keepSelection}
            onClick={() => hist('redo')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M15 14l5-5-5-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5v0A5.5 5.5 0 0 0 9.5 20H13"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        <button
          type="button"
          className={`list-pad__toggle${preview ? ' list-pad__toggle--on' : ''}`}
          onClick={() => setPreview((p) => !p)}
        >
          {preview ? 'Edit' : 'Preview'}
        </button>
      </div>
      {preview ? (
        <div className="list-pad__canvas list-pad__preview" style={canvasStyle}>
          {content || '\u00a0'}
        </div>
      ) : (
        <div
          ref={ceRef}
          className={`list-pad__canvas list-pad__editor${content ? '' : ' list-pad__editor--empty'}`}
          style={canvasStyle}
          contentEditable
          suppressContentEditableWarning
          spellCheck
          data-placeholder="- line  * dot  1. numbered"
          onInput={syncFromCe}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onSelect={onSelCheck}
          onKeyUp={onSelCheck}
          onMouseUp={onSelCheck}
        />
      )}
    </div>
  );
}
