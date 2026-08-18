import React, { useEffect, useRef, useState } from 'react';
import { renderBasicMd } from '../../utils/basic-md.js';
import { registerDocFlusher } from './docFlush.js';

const FONTS = [
  { id: 'outfit', label: 'Outfit', css: '"Outfit", "Segoe UI", sans-serif' },
  { id: 'serif', label: 'Source Serif 4', css: '"Source Serif 4", Georgia, serif' },
  { id: 'mono', label: 'IBM Plex Mono', css: '"IBM Plex Mono", Consolas, monospace' },
  { id: 'segoe', label: 'Segoe UI', css: '"Segoe UI", sans-serif' },
];

function fontCss(id) {
  return FONTS.find((f) => f.id === id)?.css || FONTS[3].css;
}

/**
 * Basic-markdown notepad. Same chrome as BulletPad minus Type of.
 * @param {{
 *   list: { id: number, content?: string, style: object },
 *   onSaved: (list: object) => void,
 * }} props
 */
export default function MdPad({ list, onSaved }) {
  const style = list.style || {};
  const [content, setContent] = useState(list.content || '');
  const [preview, setPreview] = useState(false);
  const [fontFamily, setFontFamily] = useState(style.fontFamily || 'segoe');
  const [fontSize, setFontSize] = useState(style.fontSize || 16);
  const [fontColor, setFontColor] = useState(style.fontColor || '#111111');
  const [bgColor, setBgColor] = useState(style.bgColor || '#ffffff');
  const timer = useRef(null);
  const dirty = useRef(false);
  const pending = useRef({
    content: list.content || '',
    style: {
      fontFamily: style.fontFamily || 'segoe',
      fontSize: style.fontSize || 16,
      fontColor: style.fontColor || '#111111',
      bgColor: style.bgColor || '#ffffff',
    },
  });

  async function flushNow() {
    clearTimeout(timer.current);
    timer.current = null;
    if (!dirty.current) return;
    dirty.current = false;
    const saved = await window.api.saveListDoc(list.id, pending.current);
    onSaved(saved);
  }

  useEffect(() => {
    setContent(list.content || '');
    setFontFamily(style.fontFamily || 'segoe');
    setFontSize(style.fontSize || 16);
    setFontColor(style.fontColor || '#111111');
    setBgColor(style.bgColor || '#ffffff');
    setPreview(false);
  }, [list.id]);

  useEffect(() => {
    const unsub = registerDocFlusher(flushNow);
    return () => {
      unsub();
      void flushNow();
    };
  }, [list.id]);

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
      ...partial,
    };
  }

  function bump(partial) {
    if (partial.fontFamily) setFontFamily(partial.fontFamily);
    if (partial.fontSize != null) setFontSize(partial.fontSize);
    if (partial.fontColor) setFontColor(partial.fontColor);
    if (partial.bgColor) setBgColor(partial.bgColor);
    persist(content, currentStyle(partial));
  }

  function onChange(e) {
    const v = e.target.value;
    setContent(v);
    persist(v, currentStyle());
  }

  const canvasStyle = {
    fontFamily: fontCss(fontFamily),
    fontSize: `${fontSize}px`,
    color: fontColor,
    background: bgColor,
  };

  return (
    <div className="list-pad">
      <div className="list-pad__bar">
        <label className="list-pad__field">
          Font
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
        <label className="list-pad__field list-pad__field--sm">
          Font color
          <input
            type="color"
            value={fontColor}
            onChange={(e) => bump({ fontColor: e.target.value })}
          />
        </label>
        <label className="list-pad__field list-pad__field--sm">
          BG Color
          <input
            type="color"
            value={bgColor}
            onChange={(e) => bump({ bgColor: e.target.value })}
          />
        </label>
        <button
          type="button"
          className={`list-pad__toggle${preview ? ' list-pad__toggle--on' : ''}`}
          onClick={() => setPreview((p) => !p)}
        >
          {preview ? 'Edit' : 'Preview'}
        </button>
      </div>
      {preview ? (
        <div
          className="list-pad__canvas list-pad__preview"
          style={canvasStyle}
          // Subset renderer escapes HTML first
          dangerouslySetInnerHTML={{ __html: renderBasicMd(content) || '<p></p>' }}
        />
      ) : (
        <textarea
          className="list-pad__canvas"
          value={content}
          onChange={onChange}
          spellCheck
          placeholder="# Heading&#10;**bold** *italic*&#10;- list"
          style={canvasStyle}
        />
      )}
    </div>
  );
}
