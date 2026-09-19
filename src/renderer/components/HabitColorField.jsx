import React, { useEffect, useMemo, useRef, useState } from 'react';
import ColorPalettePopover from './ColorPalettePopover';
import { useDatabase } from '../context/DatabaseContext';
import {
  appendSavedColor,
  clearSavedColor,
  parseSavedColors,
  resolvedHabitColor,
} from '../../utils/habit-color.js';

/**
 * Tiny list/Today marker; title shows the hex.
 * @param {{ color?: string|null }} props
 */
export function HabitColorDot({ color }) {
  const hex = resolvedHabitColor(color);
  return (
    <span
      className="habit-color-dot"
      style={{ backgroundColor: hex }}
      title={hex}
      aria-hidden
    />
  );
}

/**
 * Custom label + 36px chip left of Details. OK commits; Cancel leaves value.
 * @param {{
 *   value: string|null,
 *   onChange: (hex: string) => void,
 *   id?: string,
 * }} props
 */
export default function HabitColorField({ value, onChange, id = 'habit-color' }) {
  const { settings, updateSetting } = useDatabase();
  const chipRef = useRef(null);
  const [open, setOpen] = useState(false);
  const hex = resolvedHabitColor(value);
  const fromSettings = useMemo(
    () => parseSavedColors(settings?.habit_saved_colors),
    [settings?.habit_saved_colors],
  );
  const [savedColors, setSavedColors] = useState(fromSettings);
  const slotsRef = useRef(savedColors);
  slotsRef.current = savedColors;

  useEffect(() => {
    setSavedColors(fromSettings);
  }, [fromSettings]);

  function openPalette() {
    if (open) return;
    setOpen(true);
  }

  /** Optimistic local slots so rapid Save ticks do not clobber. */
  async function persistSlots(next) {
    slotsRef.current = next;
    setSavedColors(next);
    await updateSetting('habit_saved_colors', JSON.stringify(next));
  }

  return (
    <div className="habit-color-field">
      <span className="habit-color-field__label">Custom</span>
      <button
        id={id}
        ref={chipRef}
        type="button"
        className="habit-color-field__chip"
        style={{ backgroundColor: hex }}
        aria-label="Custom habit color"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={openPalette}
      />
      <ColorPalettePopover
        open={open}
        anchorRef={chipRef}
        label="Custom"
        value={hex}
        deferCommit
        showCancel
        savedColors={savedColors}
        onChange={onChange}
        onCommit={() => setOpen(false)}
        onCancel={() => setOpen(false)}
        onSaveColor={(h) => persistSlots(appendSavedColor(slotsRef.current, h))}
        onClearSavedColor={(i) => persistSlots(clearSavedColor(slotsRef.current, i))}
      />
    </div>
  );
}
