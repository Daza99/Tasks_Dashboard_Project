import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cssColorToHex, parseCssColor } from '../../utils/theme-color.js';
import { HABIT_SWATCH_COUNT, nextEmptySlot } from '../../utils/habit-color.js';

const POP_W = 232;
const HAS_EYEDROPPER = typeof window !== 'undefined' && typeof window.EyeDropper === 'function';

/**
 * RGB 0–255 → HSV (h 0–360, s/v 0–1).
 * @param {number} r
 * @param {number} g
 * @param {number} b
 */
function rgbToHsv(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

/**
 * HSV → RGB 0–255.
 * @param {number} h
 * @param {number} s
 * @param {number} v
 */
function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function rgbToHex(r, g, b) {
  const h = (n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

function colorToHsv(value) {
  const c = parseCssColor(cssColorToHex(value));
  if (!c) return { h: 0, s: 0, v: 0 };
  return rgbToHsv(c.r, c.g, c.b);
}

/**
 * Theme color popover: SV field, swatch name, RGB/HEX, OK.
 * Habits pass deferCommit + showCancel + savedColors (commit only on OK).
 * @param {{
 *   open: boolean,
 *   anchorRef: React.RefObject<HTMLElement | null>,
 *   label: string,
 *   value: string,
 *   onChange: (hex: string) => void,
 *   onCommit: () => void,
 *   onCancel: () => void,
 *   preferLeft?: boolean,
 *   deferCommit?: boolean,
 *   showCancel?: boolean,
 *   savedColors?: (string|null)[] | null,
 *   onSaveColor?: (hex: string) => void,
 *   onClearSavedColor?: (index: number) => void,
 * }} props
 */
export default function ColorPalettePopover({
  open,
  anchorRef,
  label,
  value,
  onChange,
  onCommit,
  onCancel,
  preferLeft = false,
  deferCommit = false,
  showCancel = false,
  savedColors = null,
  onSaveColor,
  onClearSavedColor,
}) {
  const rootRef = useRef(null);
  const svRef = useRef(null);
  const hueRef = useRef(null);
  const [pos, setPos] = useState({ top: 8, left: 8 });
  const [hsv, setHsv] = useState(() => colorToHsv(value));
  const [mode, setMode] = useState('rgb');
  const [hexDraft, setHexDraft] = useState('');
  const [saveOn, setSaveOn] = useState(false);
  const hsvRef = useRef(hsv);
  hsvRef.current = hsv;

  const showPalette = savedColors != null;
  const slots = useMemo(
    () =>
      Array.from({ length: HABIT_SWATCH_COUNT }, (_, i) =>
        Array.isArray(savedColors) ? savedColors[i] || null : null,
      ),
    [savedColors],
  );
  const paletteFull = nextEmptySlot(slots) < 0;

  const rgb = useMemo(() => hsvToRgb(hsv.h, hsv.s, hsv.v), [hsv]);
  const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
  const hueFill = `hsl(${hsv.h}, 100%, 50%)`;

  useEffect(() => {
    if (!open) return;
    const nextHsv = colorToHsv(value);
    hsvRef.current = nextHsv;
    setHsv(nextHsv);
    setHexDraft(cssColorToHex(value).slice(1));
    setSaveOn(false);
    // Snapshot on open only — live parent updates must not reset HSV mid-drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const el = anchorRef.current;
    const rect = el?.getBoundingClientRect();
    const popH = rootRef.current?.offsetHeight || 320;
    let left = preferLeft
      ? (rect?.left ?? POP_W) - POP_W - 8
      : (rect?.right ?? 8) + 8;
    let top = rect?.top ?? 8;
    if (left + POP_W > window.innerWidth - 8) {
      left = (rect?.left ?? POP_W) - POP_W - 8;
    }
    if (preferLeft && left < 8) {
      left = (rect?.right ?? 8) + 8;
    }
    if (top + popH > window.innerHeight - 8) {
      top = window.innerHeight - popH - 8;
    }
    setPos({
      left: Math.max(8, left),
      top: Math.max(8, top),
    });
  }, [open, anchorRef, preferLeft, showPalette, showCancel, slots]);

  const notify = useCallback(
    (nextHex) => {
      if (!deferCommit) onChange(nextHex);
    },
    [deferCommit, onChange],
  );

  const emit = useCallback(
    (next) => {
      const rgbNext = hsvToRgb(next.h, next.s, next.v);
      const nextHex = rgbToHex(rgbNext.r, rgbNext.g, rgbNext.b);
      setHexDraft(nextHex.slice(1));
      notify(nextHex);
    },
    [notify],
  );

  function applyPartial(partial) {
    const next = { ...hsvRef.current, ...partial };
    hsvRef.current = next;
    setHsv(next);
    emit(next);
  }

  function applyHex(nextHex) {
    const parsed = parseCssColor(nextHex);
    if (!parsed) return;
    const next = rgbToHsv(parsed.r, parsed.g, parsed.b);
    hsvRef.current = next;
    setHsv(next);
    const canon = rgbToHex(parsed.r, parsed.g, parsed.b);
    setHexDraft(canon.slice(1));
    notify(canon);
  }

  function onSvPointer(e) {
    const box = svRef.current;
    if (!box) return;
    const r = box.getBoundingClientRect();
    const s = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const v = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
    applyPartial({ s, v });
  }

  function onHuePointer(e) {
    const box = hueRef.current;
    if (!box) return;
    const r = box.getBoundingClientRect();
    const h = Math.max(0, Math.min(359.99, ((e.clientX - r.left) / r.width) * 360));
    applyPartial({ h });
  }

  function trackPointer(handler) {
    return (e) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      handler(e);
    };
  }

  function onRgbField(channel, raw) {
    const n = Math.max(0, Math.min(255, Number(raw) || 0));
    const nextRgb = { ...rgb, [channel]: n };
    const next = rgbToHsv(nextRgb.r, nextRgb.g, nextRgb.b);
    hsvRef.current = next;
    setHsv(next);
    const nextHex = rgbToHex(nextRgb.r, nextRgb.g, nextRgb.b);
    setHexDraft(nextHex.slice(1));
    notify(nextHex);
  }

  function onHexCommit(raw) {
    const t = raw.replace(/^#/, '').trim();
    const parsed = parseCssColor(`#${t}`);
    if (!parsed) return;
    applyHex(rgbToHex(parsed.r, parsed.g, parsed.b));
  }

  async function onEyedrop() {
    try {
      const result = await new window.EyeDropper().open();
      if (result?.sRGBHex) {
        applyHex(result.sRGBHex);
      }
    } catch {
      /* user cancelled eyedropper */
    }
  }

  function onCommitClick() {
    if (deferCommit) onChange(hex);
    onCommit();
  }

  function onSaveToggle(e) {
    const checked = e.target.checked;
    if (!checked) {
      setSaveOn(false);
      return;
    }
    if (paletteFull) return;
    onSaveColor?.(hex);
    setSaveOn(false);
  }

  function onSlotClick(slotHex) {
    if (!slotHex) return;
    applyHex(slotHex);
  }

  function onSlotContext(e, index, slotHex) {
    if (!slotHex) return;
    e.preventDefault();
    onClearSavedColor?.(index);
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === 'Escape') onCancel();
    }
    function onDown(e) {
      const t = e.target;
      if (rootRef.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      onCancel();
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open, onCancel, anchorRef]);

  if (!open) return null;

  return createPortal(
    <div
      ref={rootRef}
      className={`color-palette${showPalette ? ' color-palette--swatches' : ''}`}
      role="dialog"
      aria-label={label}
      style={{ top: pos.top, left: pos.left }}
    >
      <div
        ref={svRef}
        className="color-palette__sv"
        style={{ backgroundColor: hueFill }}
        onPointerDown={trackPointer(onSvPointer)}
        onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && onSvPointer(e)}
      >
        <span
          className="color-palette__sv-thumb"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
        />
      </div>

      <div className="color-palette__name">{label}</div>

      <div className={`color-palette__tools${showPalette ? ' color-palette__tools--save' : ''}`}>
        {HAS_EYEDROPPER ? (
          <button
            type="button"
            className="color-palette__eyedrop"
            aria-label="Pick color from screen"
            onClick={onEyedrop}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path
                fill="currentColor"
                d="M13.4 1.1a1.5 1.5 0 0 0-2.1 0L9.6 2.8l-.7-.7-.7.7.7.7-6.4 6.4c-.5.5-.7 1.2-.6 1.9l-1.1 1.1 1.4 1.4 1.1-1.1c.7.1 1.4-.1 1.9-.6l6.4-6.4.7.7.7-.7-.7-.7 1.7-1.7a1.5 1.5 0 0 0 0-2.1zM4.5 11.2 10 5.7l.7.7-5.5 5.5c-.2.2-.5.2-.7 0l-.7-.7c-.2-.2-.2-.5 0-.7z"
              />
            </svg>
          </button>
        ) : (
          <span className="color-palette__eyedrop color-palette__eyedrop--spacer" />
        )}
        <span className="color-palette__preview" style={{ background: hex }} />
        {showPalette ? (
          <label
            className="color-palette__save"
            title={paletteFull ? 'Palette full — right-click a swatch to clear' : 'Save color to palette'}
          >
            <input
              type="checkbox"
              checked={saveOn}
              disabled={paletteFull}
              onChange={onSaveToggle}
            />
            Save
          </label>
        ) : null}
        <div
          ref={hueRef}
          className="color-palette__hue"
          onPointerDown={trackPointer(onHuePointer)}
          onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && onHuePointer(e)}
        >
          <span
            className="color-palette__hue-thumb"
            style={{ left: `${(hsv.h / 360) * 100}%`, background: hueFill }}
          />
        </div>
      </div>

      {showPalette ? (
        <div className="color-palette__swatches" role="list" aria-label="Saved colors">
          {slots.map((slotHex, i) => (
            <button
              key={i}
              type="button"
              role="listitem"
              className={`color-palette__slot${slotHex ? '' : ' color-palette__slot--empty'}`}
              style={slotHex ? { background: slotHex } : undefined}
              title={slotHex || undefined}
              aria-label={slotHex ? slotHex : `Empty swatch ${i + 1}`}
              disabled={!slotHex}
              onClick={() => onSlotClick(slotHex)}
              onContextMenu={(e) => onSlotContext(e, i, slotHex)}
            />
          ))}
        </div>
      ) : null}

      {showPalette ? (
        <label className="color-palette__hex-row">
          <span>#</span>
          <input
            className="color-palette__hex-field"
            type="text"
            spellCheck={false}
            value={hexDraft}
            aria-label="Hex"
            onChange={(e) => setHexDraft(e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6))}
            onBlur={() => onHexCommit(hexDraft)}
            onKeyDown={(e) => e.key === 'Enter' && onHexCommit(hexDraft)}
          />
        </label>
      ) : null}

      <div className="color-palette__values">
        {mode === 'rgb' ? (
          <>
            <input
              className="color-palette__num"
              type="text"
              inputMode="numeric"
              value={rgb.r}
              aria-label="Red"
              onChange={(e) => onRgbField('r', e.target.value)}
            />
            <input
              className="color-palette__num"
              type="text"
              inputMode="numeric"
              value={rgb.g}
              aria-label="Green"
              onChange={(e) => onRgbField('g', e.target.value)}
            />
            <input
              className="color-palette__num"
              type="text"
              inputMode="numeric"
              value={rgb.b}
              aria-label="Blue"
              onChange={(e) => onRgbField('b', e.target.value)}
            />
          </>
        ) : (
          <input
            className="color-palette__hex"
            type="text"
            spellCheck={false}
            value={hexDraft}
            aria-label="Hex"
            onChange={(e) => setHexDraft(e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6))}
            onBlur={() => onHexCommit(hexDraft)}
            onKeyDown={(e) => e.key === 'Enter' && onHexCommit(hexDraft)}
          />
        )}
        {showCancel ? (
          <span className="color-palette__ok-spacer" />
        ) : (
          <button type="button" className="color-palette__ok" onClick={onCommitClick}>
            OK
          </button>
        )}
      </div>

      <div className="color-palette__captions">
        {mode === 'rgb' ? (
          <>
            <span>R</span>
            <span>G</span>
            <span>B</span>
          </>
        ) : (
          <span className="color-palette__captions-hex">HEX</span>
        )}
        <button
          type="button"
          className="color-palette__mode"
          aria-label="Toggle RGB and HEX"
          onClick={() => setMode((m) => (m === 'rgb' ? 'hex' : 'rgb'))}
        >
          <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true">
            <path fill="currentColor" d="M6 1 2 6h8L6 1zm0 12 4-5H2l4 5z" />
          </svg>
        </button>
      </div>

      {showCancel ? (
        <div className="color-palette__actions">
          <button type="button" className="color-palette__cancel" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="color-palette__ok color-palette__ok--wide" onClick={onCommitClick}>
            OK
          </button>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
