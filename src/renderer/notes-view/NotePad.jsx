import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  editHtmlToMd,
  mdToEditHtml,
  renderBasicMd,
} from '../../utils/basic-md.js';
import {
  parseLine,
  prefixFor,
  nextMarker,
} from '../../utils/bullet-lines.js';
import { registerDocFlusher } from '../lists-view/docFlush.js';

const FONTS = [
  { id: 'outfit', label: 'Outfit', css: '"Outfit", "Segoe UI", sans-serif' },
  { id: 'serif', label: 'Source Serif 4', css: '"Source Serif 4", Georgia, serif' },
  { id: 'mono', label: 'IBM Plex Mono', css: '"IBM Plex Mono", Consolas, monospace' },
  { id: 'segoe', label: 'Segoe UI', css: '"Segoe UI", sans-serif' },
];

const SAVE_FLASH_MS = 2500;
const DEFAULT_HL = '#ffff00';

function fontCss(id) {
  return FONTS.find((f) => f.id === id)?.css || FONTS[3].css;
}

/** Inline highlight on an element — ignore the CE canvas background. */
function styleIsHl(el) {
  if (!el || el.nodeType !== 1) return false;
  if (el.dataset?.mdHl) return true;
  const bg = el.style?.backgroundColor;
  if (!bg) return false;
  const v = String(bg).replace(/\s/g, '').toLowerCase();
  return v !== 'transparent' && v !== 'rgba(0,0,0,0)';
}

function findHlEl(node, root) {
  let n = node && node.nodeType === 3 ? node.parentElement : node;
  while (n && n !== root) {
    if (styleIsHl(n)) return n;
    n = n.parentElement;
  }
  return null;
}

/** Drop highlight span; unwrap if it has no remaining inline style. */
function unwrapHighlight(el) {
  el.style.removeProperty('background-color');
  if (el.dataset) delete el.dataset.mdHl;
  const style = el.getAttribute('style');
  if (style != null && !style.trim()) el.removeAttribute('style');
  const emptySpan =
    el.tagName === 'SPAN' &&
    !el.getAttribute('style') &&
    !el.dataset?.mdColor &&
    !el.dataset?.mdHl;
  if (!emptySpan) return;
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

function selFullyHighlighted(root) {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return false;
  const a = findHlEl(sel.anchorNode, root);
  const f = findHlEl(sel.focusNode, root);
  return !!(a && f && a === f);
}

/** True if the selection is a non-collapsed range inside el. */
function selectionIn(el) {
  const sel = window.getSelection();
  if (!el || !sel || sel.isCollapsed || sel.rangeCount === 0) return false;
  return el.contains(sel.anchorNode);
}

function closestBlock(node, root) {
  let n = node && node.nodeType === 3 ? node.parentElement : node;
  while (n && n !== root) {
    const tag = n.tagName;
    if (tag === 'DIV' || tag === 'P' || tag === 'LI') return n;
    n = n.parentElement;
  }
  return null;
}

/**
 * Text from the start of the visual line to the caret.
 * Uses the current DIV after native Enter; otherwise text after the last BR.
 */
function currentLineBeforeCaret(root) {
  const sel = window.getSelection();
  if (!root || !sel || !sel.rangeCount) return '';
  const caret = sel.getRangeAt(0);
  const block = closestBlock(caret.startContainer, root);
  const pre = document.createRange();
  if (block) {
    pre.selectNodeContents(block);
    pre.setEnd(caret.startContainer, caret.startOffset);
    return pre.toString().replace(/\u00a0/g, ' ');
  }
  pre.setStart(root, 0);
  pre.setEnd(caret.startContainer, caret.startOffset);
  const wrap = document.createElement('div');
  wrap.appendChild(pre.cloneContents());
  const chunks = wrap.innerHTML.split(/<br\s*\/?>/i);
  const last = chunks[chunks.length - 1] || '';
  const tmp = document.createElement('div');
  tmp.innerHTML = last;
  return (tmp.textContent || '').replace(/\u00a0/g, ' ');
}

/**
 * Combined MD + mixed-bullet notepad (Notes). Lists pads stay separate.
 * @param {{
 *   note: { id: number, content?: string, style: object },
 *   onSaved: (note: object) => void,
 *   popout?: boolean,
 * }} props
 */
export default function NotePad({ note, onSaved, popout = false }) {
  const style = note.style || {};
  const [content, setContent] = useState(note.content || '');
  const [preview, setPreview] = useState(false);
  const [fontFamily, setFontFamily] = useState(style.fontFamily || 'segoe');
  const [fontSize, setFontSize] = useState(style.fontSize || 16);
  const [fontColor, setFontColor] = useState(style.fontColor || '#111111');
  const [bgColor, setBgColor] = useState(style.bgColor || '#ffffff');
  const [highlightColor, setHighlightColor] = useState(style.highlightColor || DEFAULT_HL);
  const [hlArmed, setHlArmed] = useState(false);
  const [headingOpen, setHeadingOpen] = useState(false);
  const [swatchOverride, setSwatchOverride] = useState(null);
  const [savingFlash, setSavingFlash] = useState(false);
  const [exportChoice, setExportChoice] = useState('');
  const timer = useRef(null);
  const dirty = useRef(false);
  const ceRef = useRef(null);
  const headingWrapRef = useRef(null);
  const saveFlashTimer = useRef(null);
  const seenId = useRef(note.id);
  const pending = useRef({
    content: note.content || '',
    style: {
      fontFamily: style.fontFamily || 'segoe',
      fontSize: style.fontSize || 16,
      fontColor: style.fontColor || '#111111',
      bgColor: style.bgColor || '#ffffff',
      highlightColor: style.highlightColor || DEFAULT_HL,
    },
  });

  if (seenId.current !== note.id) {
    seenId.current = note.id;
    pending.current = {
      content: note.content || '',
      style: {
        fontFamily: style.fontFamily || 'segoe',
        fontSize: style.fontSize || 16,
        fontColor: style.fontColor || '#111111',
        bgColor: style.bgColor || '#ffffff',
        highlightColor: style.highlightColor || DEFAULT_HL,
      },
    };
    dirty.current = false;
  }

  async function flushNow() {
    clearTimeout(timer.current);
    timer.current = null;
    if (!dirty.current) return;
    dirty.current = false;
    const saved = await window.api.saveNoteDoc(note.id, pending.current);
    onSaved(saved);
  }

  useEffect(() => {
    const next = note.content || '';
    setContent(next);
    setFontFamily(style.fontFamily || 'segoe');
    setFontSize(style.fontSize || 16);
    setFontColor(style.fontColor || '#111111');
    setBgColor(style.bgColor || '#ffffff');
    setHighlightColor(style.highlightColor || DEFAULT_HL);
    setPreview(false);
    setHlArmed(false);
    setHeadingOpen(false);
    setSwatchOverride(null);
  }, [note.id]);

  useLayoutEffect(() => {
    if (preview) return;
    const el = ceRef.current;
    if (!el) return;
    el.innerHTML = mdToEditHtml(pending.current.content);
  }, [note.id, preview]);

  useEffect(() => {
    const unsub = registerDocFlusher(flushNow);
    return () => {
      unsub();
      void flushNow();
      clearTimeout(saveFlashTimer.current);
    };
  }, [note.id]);

  useEffect(() => {
    if (preview) return undefined;
    function onSel() {
      if (!selectionIn(ceRef.current)) setSwatchOverride(null);
    }
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, [preview]);

  // One-shot heading chooser: Escape / click-away closes without inserting
  useEffect(() => {
    if (!headingOpen) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') setHeadingOpen(false);
    }
    function onDown(e) {
      if (headingWrapRef.current && !headingWrapRef.current.contains(e.target)) {
        setHeadingOpen(false);
      }
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [headingOpen]);

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
      fontFamily,
      fontSize,
      fontColor,
      bgColor,
      highlightColor,
      ...partial,
    };
  }

  function bump(partial) {
    if (partial.fontFamily) setFontFamily(partial.fontFamily);
    if (partial.fontSize != null) setFontSize(partial.fontSize);
    if (partial.fontColor) setFontColor(partial.fontColor);
    if (partial.bgColor) setBgColor(partial.bgColor);
    if (partial.highlightColor) setHighlightColor(partial.highlightColor);
    persist(content, currentStyle(partial));
  }

  /** Read CE → markdown state (does not rewrite innerHTML). */
  function syncFromCe() {
    const el = ceRef.current;
    if (!el) return;
    const md = editHtmlToMd(el);
    setContent(md);
    persist(md, currentStyle());
  }

  /** Wrap selection with MD markers via insertText (native-undoable). */
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

  /** Prefix selection (or caret) with ATX heading; caret lands in the text slot. */
  function applyHeading(level) {
    const el = ceRef.current;
    if (!el || preview) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel) return;
    const prefix = `${'#'.repeat(level)} `;
    const text = sel.toString().replace(/^#{1,3}\s+/, '');
    document.execCommand('insertText', false, prefix + text);
    syncFromCe();
    setHeadingOpen(false);
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

  function onHighlightSwatch(e) {
    bump({ highlightColor: e.target.value });
  }

  /** Apply or clear hiliteColor on the current selection. */
  function paintSelection(remove) {
    const el = ceRef.current;
    if (!el) return;
    el.focus();
    document.execCommand('styleWithCSS', false, true);
    const color = remove ? 'transparent' : highlightColor;
    const ok = document.execCommand('hiliteColor', false, color);
    if (!ok) document.execCommand('backColor', false, color);
    syncFromCe();
  }

  function onHlButton() {
    if (preview) return;
    const el = ceRef.current;
    const selOn = selectionIn(el);
    if (hlArmed) {
      setHlArmed(false);
      return;
    }
    setHlArmed(true);
    if (selOn) paintSelection(selFullyHighlighted(el));
  }

  function onEditorMouseUp() {
    onSelCheck();
    if (!hlArmed || preview) return;
    const el = ceRef.current;
    if (!el) return;
    if (selectionIn(el)) {
      paintSelection(selFullyHighlighted(el));
      return;
    }
    const hlEl = findHlEl(window.getSelection()?.anchorNode, el);
    if (!hlEl) return;
    unwrapHighlight(hlEl);
    syncFromCe();
  }

  function onSelCheck() {
    if (!selectionIn(ceRef.current)) setSwatchOverride(null);
  }

  function onKeyDown(e) {
    if (e.key !== 'Enter') return;
    const el = ceRef.current;
    if (!el) return;
    const line = currentLineBeforeCaret(el);
    const prev = parseLine(line);
    const next = nextMarker('mixed', prev);
    const prefix = e.shiftKey ? '' : prefixFor(next.kind, next.n);
    if (!e.shiftKey && !prefix) return;
    e.preventDefault();
    if (e.shiftKey) {
      document.execCommand('insertLineBreak');
    } else {
      // Line break first; prefix only — do not insert extra '\n'
      const brOk = document.execCommand('insertLineBreak');
      if (!brOk) document.execCommand('insertText', false, '\n');
      document.execCommand('insertText', false, prefix);
    }
    syncFromCe();
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

  async function onPrint() {
    await flushNow();
    await window.api.printNote(note.id);
  }

  async function onExport(format) {
    setExportChoice('');
    if (!format) return;
    await flushNow();
    await window.api.exportNote(note.id, format);
  }

  async function onPopout() {
    await flushNow();
    await window.api.openNotePopout(note.id);
  }

  const canvasStyle = {
    fontFamily: fontCss(fontFamily),
    fontSize: `${fontSize}px`,
    color: fontColor,
    background: bgColor,
    caretColor: fontColor,
  };

  const swatchValue = swatchOverride || fontColor;

  return (
    <div className="list-pad">
      <div className="list-pad__bar">
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
          <div className="list-pad__heading" ref={headingWrapRef}>
            <button
              type="button"
              className={`list-pad__fmt${headingOpen ? ' list-pad__fmt--hl-on' : ''}`}
              title="Heading"
              aria-expanded={headingOpen}
              disabled={preview}
              onMouseDown={keepSelection}
              onClick={() => setHeadingOpen((o) => !o)}
            >
              H
            </button>
            {headingOpen && (
              <div className="list-pad__heading-menu" role="menu">
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className="list-pad__fmt"
                    role="menuitem"
                    title={`Heading ${n}`}
                    onMouseDown={keepSelection}
                    onClick={() => applyHeading(n)}
                  >
                    H{n}
                  </button>
                ))}
              </div>
            )}
          </div>
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
          <div className="list-pad__hl">
            <button
              type="button"
              className={`list-pad__fmt list-pad__fmt--hl${hlArmed ? ' list-pad__fmt--hl-on' : ''}`}
              title={hlArmed ? 'Turn highlight off' : 'Turn highlight on'}
              aria-pressed={hlArmed}
              disabled={preview}
              style={hlArmed ? { borderColor: highlightColor } : undefined}
              onMouseDown={keepSelection}
              onClick={onHlButton}
            >
              HL
            </button>
            <label className="list-pad__field list-pad__field--swatch" title="Highlight color">
              <input
                type="color"
                value={highlightColor}
                onMouseDown={keepSelection}
                onChange={onHighlightSwatch}
              />
            </label>
          </div>
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
          onClick={() => {
            const next = !preview;
            if (next) {
              setHlArmed(false);
              setHeadingOpen(false);
            }
            setPreview(next);
          }}
        >
          {preview ? 'Edit' : 'Preview'}
        </button>
        <button type="button" className="list-pad__toggle" onClick={onPrint}>
          Print
        </button>
        <label className="list-pad__field list-pad__field--sm">
          Export
          <select
            value={exportChoice}
            onChange={(e) => onExport(e.target.value)}
          >
            <option value="">…</option>
            <option value="md">.md</option>
            <option value="txt">.txt</option>
            <option value="pdf">.pdf</option>
          </select>
        </label>
        {!popout && (
          <button
            type="button"
            className="list-pad__toggle"
            title="Open in window"
            onClick={onPopout}
          >
            Popout
          </button>
        )}
      </div>
      {preview ? (
        <div
          className="list-pad__canvas list-pad__preview"
          style={canvasStyle}
          dangerouslySetInnerHTML={{ __html: renderBasicMd(content) || '<p></p>' }}
        />
      ) : (
        <div
          ref={ceRef}
          className={`list-pad__canvas list-pad__editor${content ? '' : ' list-pad__editor--empty'}`}
          style={canvasStyle}
          contentEditable
          suppressContentEditableWarning
          spellCheck
          data-placeholder="# Heading  **bold**  - or * or 1. lists"
          onInput={syncFromCe}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onSelect={onSelCheck}
          onKeyUp={onSelCheck}
          onMouseUp={onEditorMouseUp}
        />
      )}
    </div>
  );
}
