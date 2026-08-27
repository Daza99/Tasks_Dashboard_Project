import React, { useEffect, useRef, useState } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import PromptDialog from '../components/PromptDialog';
import ColorPalettePopover from '../components/ColorPalettePopover';
import { cssColorToHex, parseCssColor } from '../../utils/theme-color.js';

const NEW_ID = 'new';
const DEFAULT_COLOR = '#3e5679';

/** Color wallpaper with named presets (New + Apply-to-save). */
export default function SettingsWallpaper() {
  const { settings, setSettings } = useDatabase();

  const [presets, setPresets] = useState([]);
  const [selectedId, setSelectedId] = useState(NEW_ID);
  const [color, setColor] = useState(settings?.wallpaper_color || DEFAULT_COLOR);
  const [nameOpen, setNameOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [error, setError] = useState('');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const paletteBtnRef = useRef(null);
  const paletteSnapRef = useRef('');

  const paletteHex = parseCssColor(color) ? cssColorToHex(color) : DEFAULT_COLOR;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await window.api.listWallpaperColors();
        if (cancelled) return;
        setPresets(list);
        const cid = Number(settings?.wallpaper_color_id);
        const match = list.find((p) => p.id === cid);
        if (match) {
          setSelectedId(String(match.id));
          setColor(match.color);
        } else {
          setSelectedId(NEW_ID);
          setColor(settings?.wallpaper_color || DEFAULT_COLOR);
        }
        setError('');
      } catch (err) {
        if (!cancelled) setError(err?.message || String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
    // Init once when the Wallpaper tab mounts — do not wipe a draft on settings ticks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onSelectPreset(e) {
    const v = e.target.value;
    setSelectedId(v);
    setError('');
    if (v === NEW_ID) {
      setColor(DEFAULT_COLOR);
    } else {
      const p = presets.find((x) => String(x.id) === v);
      if (p) setColor(p.color);
    }
  }

  async function persist(payload) {
    const row = await window.api.saveWallpaperColor(payload);
    const s = await window.api.getSettings();
    setSettings(s);
    setSelectedId(String(row.id));
    setColor(row.color);
    setNameOpen(false);
    setRenameOpen(false);
    setPresets(await window.api.listWallpaperColors());
    setError('');
    return row;
  }

  function onApply() {
    if (selectedId === NEW_ID) {
      setNameOpen(true);
      return;
    }
    persist({ id: Number(selectedId), color }).catch((err) => {
      setError(err?.message || String(err));
    });
  }

  function onNameSave(name) {
    persist({ name, color }).catch((err) => {
      setError(err?.message || String(err));
    });
  }

  function onRenameSave(name) {
    persist({ id: Number(selectedId), color, name }).catch((err) => {
      setError(err?.message || String(err));
    });
  }

  function openPalette() {
    if (paletteOpen) return;
    paletteSnapRef.current = paletteHex;
    setPaletteOpen(true);
  }

  function onPaletteCommit() {
    setPaletteOpen(false);
  }

  function onPaletteCancel() {
    setColor(paletteSnapRef.current);
    setPaletteOpen(false);
  }

  /** Factory color; named presets stay in the dropdown. */
  async function onReset() {
    setError('');
    try {
      await window.api.resetWallpaperDefaults();
      const s = await window.api.getSettings();
      setSettings(s);
      setSelectedId(NEW_ID);
      setColor(DEFAULT_COLOR);
    } catch (err) {
      setError(err?.message || String(err));
    }
  }

  return (
    <div>
      <div className="settings-field">
        <label htmlFor="wall-preset">Saved colors</label>
        <div className="settings-row">
          <select
            id="wall-preset"
            className="theme-font-select"
            value={selectedId}
            onChange={onSelectPreset}
            style={{ flex: 1 }}
          >
            <option value={NEW_ID}>New</option>
            {presets.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-light"
            disabled={selectedId === NEW_ID}
            onClick={() => setRenameOpen(true)}
          >
            Rename
          </button>
        </div>
      </div>

      <div className="settings-field">
        <label htmlFor="wall-color">Background color</label>
        <div className="settings-row">
          <button
            id="wall-color"
            ref={paletteBtnRef}
            type="button"
            className="wallpaper-palette-btn"
            aria-label="Background color palette"
            aria-expanded={paletteOpen}
            aria-haspopup="dialog"
            onClick={openPalette}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c1.4 0 2.2-1.1 2.2-2.2 0-.6-.2-1.1-.6-1.5-.3-.3-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4c2.6 0 4.5-2.1 4.5-4.8C22 6.2 17.5 2 12 2z"
              />
              <circle cx="7.2" cy="11.2" r="1.45" fill={paletteHex} stroke="#111" strokeWidth="0.6" />
              <circle cx="10.2" cy="7.2" r="1.45" fill={paletteHex} stroke="#111" strokeWidth="0.6" />
              <circle cx="14.6" cy="7.6" r="1.45" fill={paletteHex} stroke="#111" strokeWidth="0.6" />
              <circle cx="16.8" cy="11.4" r="1.45" fill={paletteHex} stroke="#111" strokeWidth="0.6" />
            </svg>
          </button>
          <ColorPalettePopover
            open={paletteOpen}
            anchorRef={paletteBtnRef}
            label="Background color"
            value={paletteHex}
            onChange={setColor}
            onCommit={onPaletteCommit}
            onCancel={onPaletteCancel}
          />
          <input
            type="text"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            pattern="^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$"
            style={{ flex: 1 }}
          />
        </div>
      </div>
      <div
        className="glass-inset"
        style={{
          height: 64,
          marginBottom: 14,
          background: color,
          borderRadius: 10,
        }}
        aria-label="Live preview"
      />
      {error ? (
        <p style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</p>
      ) : null}
      <div className="settings-row">
        <button type="button" className="btn-primary" onClick={onApply}>
          Apply
        </button>
        <button type="button" className="btn-primary theme-reset" onClick={onReset}>
          Reset
        </button>
      </div>

      <PromptDialog
        open={nameOpen}
        title="Save wallpaper color"
        message="Name this wallpaper. It will appear in the dropdown."
        confirmLabel="Save"
        placeholder="e.g. Deep Navy"
        onConfirm={onNameSave}
        onCancel={() => setNameOpen(false)}
      />
      <PromptDialog
        open={renameOpen}
        title="Rename wallpaper color"
        confirmLabel="Save"
        placeholder="e.g. Deep Navy"
        initialValue={presets.find((p) => String(p.id) === selectedId)?.name || ''}
        onConfirm={onRenameSave}
        onCancel={() => setRenameOpen(false)}
      />
    </div>
  );
}
