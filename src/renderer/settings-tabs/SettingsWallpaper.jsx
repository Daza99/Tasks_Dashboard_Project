import React, { useEffect, useState } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import PromptDialog from '../components/PromptDialog';

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
          <input
            id="wall-color"
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
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
