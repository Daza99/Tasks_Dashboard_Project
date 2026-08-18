import React, { useEffect, useRef, useState } from 'react';
import { insertPrefixedNewline, seedEmpty } from '../../utils/bullet-lines.js';
import { registerDocFlusher } from './docFlush.js';

const MODES = [
  { id: 'mixed', label: 'Mixed' },
  { id: 'line', label: 'Line' },
  { id: 'dot', label: 'Dot' },
  { id: 'numbered', label: 'Numbered' },
];

/**
 * Notepad for bullet lists. Enter continues marker; Mixed inherits last line.
 * @param {{
 *   list: { id: number, content?: string, style: object },
 *   onSaved: (list: object) => void,
 * }} props
 */
export default function BulletPad({ list, onSaved }) {
  const style = list.style || {};
  const [content, setContent] = useState(list.content || seedEmpty(style.bulletMode || 'mixed'));
  const [mode, setMode] = useState(style.bulletMode || 'mixed');
  const [fontSize, setFontSize] = useState(style.fontSize || 16);
  const [fontColor, setFontColor] = useState(style.fontColor || '#111111');
  const [bgColor, setBgColor] = useState(style.bgColor || '#ffffff');
  const timer = useRef(null);
  const dirty = useRef(false);
  const pending = useRef({
    content: list.content || seedEmpty(style.bulletMode || 'mixed'),
    style: {
      bulletMode: style.bulletMode || 'mixed',
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
    setContent(list.content || seedEmpty(style.bulletMode || 'mixed'));
    setMode(style.bulletMode || 'mixed');
    setFontSize(style.fontSize || 16);
    setFontColor(style.fontColor || '#111111');
    setBgColor(style.bgColor || '#ffffff');
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

  function bump(partial, nextContent = content) {
    const nextStyle = {
      bulletMode: mode,
      fontSize,
      fontColor,
      bgColor,
      ...partial,
    };
    if (partial.bulletMode) {
      setMode(partial.bulletMode);
      if (!String(nextContent).trim()) {
        nextContent = seedEmpty(partial.bulletMode);
        setContent(nextContent);
      }
    }
    if (partial.fontSize != null) setFontSize(partial.fontSize);
    if (partial.fontColor) setFontColor(partial.fontColor);
    if (partial.bgColor) setBgColor(partial.bgColor);
    persist(nextContent, nextStyle);
  }

  function onChange(e) {
    const v = e.target.value;
    setContent(v);
    persist(v, { bulletMode: mode, fontSize, fontColor, bgColor });
  }

  function onKeyDown(e) {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    const el = e.target;
    const { text, caret } = insertPrefixedNewline(content, el.selectionStart, mode);
    setContent(text);
    persist(text, { bulletMode: mode, fontSize, fontColor, bgColor });
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = caret;
    });
  }

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
      </div>
      <textarea
        className="list-pad__canvas"
        value={content}
        onChange={onChange}
        onKeyDown={onKeyDown}
        spellCheck
        style={{ fontSize: `${fontSize}px`, color: fontColor, background: bgColor }}
      />
    </div>
  );
}
