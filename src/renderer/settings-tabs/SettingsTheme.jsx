import React, { useEffect, useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useDatabase } from '../context/DatabaseContext';
import PromptDialog from '../components/PromptDialog';
import ColorPalettePopover from '../components/ColorPalettePopover';
import {
  CLOCK_FONTS,
  alphaOf,
  cssColorToHex,
  draftToStyle,
  hexToRgba,
} from '../../utils/theme-color.js';

const NEW_ID = 'new';

/**
 * Theme color chip. Only the 36px square opens the palette.
 * Snapshot hex+dirty on open; OK keeps preview, click-away/Esc restores.
 * @param {{
 *   label: string,
 *   value: string,
 *   onChange: (hex: string) => void,
 *   dirty: boolean,
 *   setDirty: (v: boolean) => void,
 * }} props
 */
function ColorSwatch({ label, value, onChange, dirty, setDirty }) {
  const chipRef = useRef(null);
  const snapRef = useRef({ hex: '', dirty: false });
  const [open, setOpen] = useState(false);
  const hex = cssColorToHex(value);

  function openPalette() {
    if (open) return;
    snapRef.current = { hex, dirty };
    setOpen(true);
  }

  function onCommit() {
    setOpen(false);
  }

  function onCancel() {
    onChange(snapRef.current.hex);
    setDirty(snapRef.current.dirty);
    setOpen(false);
  }

  return (
    <div className="theme-swatch">
      <span className="theme-swatch__label">{label}</span>
      <button
        ref={chipRef}
        type="button"
        className="theme-swatch__chip"
        style={{ backgroundColor: hex }}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={openPalette}
      />
      <ColorPalettePopover
        open={open}
        anchorRef={chipRef}
        preferLeft
        label={label}
        value={hex}
        onChange={onChange}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    </div>
  );
}

/** Light / dark / custom theme editor. */
export default function SettingsTheme() {
  const { themeBase, setThemeBase, theme, confirmCustomTheme, resetThemeDefaults } = useTheme();
  const { settings, updateSetting } = useDatabase();

  const [presets, setPresets] = useState([]);
  const [selectedId, setSelectedId] = useState(NEW_ID);
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [error, setError] = useState('');

  const brightKey =
    themeBase === 'light' ? 'theme_brightness_light' : 'theme_brightness_dark';
  const brightness = Number(settings?.[brightKey] ?? 50);

  useEffect(() => {
    if (themeBase !== 'custom') return;
    let cancelled = false;
    (async () => {
      try {
        const list = await window.api.listCustomThemes();
        if (cancelled) return;
        setPresets(list);
        const defs = await window.api.getThemeDefaults('neutral');
        if (cancelled) return;
        setSelectedId(NEW_ID);
        setDraft(defs);
        setDirty(false);
        setError('');
      } catch (err) {
        if (!cancelled) setError(err?.message || String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
    // Re-init when entering Custom, not on every settings tick (would wipe a dirty draft).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeBase]);

  function patchDraft(partial) {
    setDraft((d) => ({ ...d, ...partial }));
    setDirty(true);
  }

  function onBg(hex) {
    if (!draft) return;
    patchDraft({
      '--panel-bg': hexToRgba(hex, alphaOf(draft['--panel-bg'], 0.72)),
      '--sidebar-bg': hexToRgba(hex, alphaOf(draft['--sidebar-bg'], 0.78)),
      '--topbar-bg': hexToRgba(hex, alphaOf(draft['--topbar-bg'], 0.65)),
    });
  }

  function onButtonBg(hex) {
    patchDraft({
      '--button-bg': hex,
      '--accent-dim': hexToRgba(hex, 0.25),
    });
  }

  function onButtonText(hex) {
    patchDraft({
      '--button-text': hex,
      '--accent': hex,
      '--sidebar-active-text': hex,
      '--progress-fill': hex,
    });
  }

  async function onSelectPreset(e) {
    const v = e.target.value;
    setSelectedId(v);
    setError('');
    if (v === NEW_ID) {
      const defs = await window.api.getThemeDefaults('neutral');
      setDraft(defs);
    } else {
      const p = presets.find((x) => String(x.id) === v);
      if (p) setDraft({ ...p.vars });
    }
    setDirty(false);
  }

  async function persist(payload) {
    const t = await confirmCustomTheme(payload);
    setDirty(false);
    setSelectedId(String(t.id));
    setNameOpen(false);
    setRenameOpen(false);
    setPresets(await window.api.listCustomThemes());
    setError('');
    return t;
  }

  function onConfirm() {
    if (!draft) return;
    if (selectedId === NEW_ID) {
      setNameOpen(true);
      return;
    }
    persist({ id: Number(selectedId), vars: draft }).catch((err) => {
      setError(err?.message || String(err));
    });
  }

  function onNameSave(name) {
    persist({ name, vars: draft }).catch((err) => {
      setError(err?.message || String(err));
    });
  }

  function onRenameSave(name) {
    persist({ id: Number(selectedId), vars: draft, name }).catch((err) => {
      setError(err?.message || String(err));
    });
  }

  async function onReset() {
    setError('');
    try {
      await resetThemeDefaults();
      setDraft(null);
      setSelectedId(NEW_ID);
      setDirty(false);
    } catch (err) {
      setError(err?.message || String(err));
    }
  }

  const fontValue = draft?.['--font-clock'] || CLOCK_FONTS[0].value;
  const fontKnown = CLOCK_FONTS.some((f) => f.value === fontValue);

  return (
    <div>
      <div className="theme-toggle-row">
        <div className="theme-toggle" role="group" aria-label="Theme base">
          <div className="theme-toggle__cell">
            <p className="theme-active">Active: {theme?.name || '—'}</p>
            <button
              type="button"
              className={themeBase === 'dark' ? 'active' : ''}
              onClick={() => setThemeBase('dark')}
            >
              Dark glass
            </button>
          </div>
          <button
            type="button"
            className={themeBase === 'light' ? 'active' : ''}
            onClick={() => setThemeBase('light')}
          >
            Light glass
          </button>
          <button
            type="button"
            className={themeBase === 'custom' ? 'active' : ''}
            onClick={() => setThemeBase('custom')}
          >
            Custom
          </button>
        </div>
        <button type="button" className="btn-primary theme-reset" onClick={onReset}>
          Reset
        </button>
      </div>

      {error ? (
        <p style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</p>
      ) : null}

      {(themeBase === 'dark' || themeBase === 'light') && (
        <div className="settings-field theme-brightness">
          <label htmlFor="theme-bright">
            Background brightness ({brightness})
          </label>
          <input
            id="theme-bright"
            type="range"
            min="0"
            max="100"
            value={brightness}
            onChange={(e) => updateSetting(brightKey, e.target.value)}
          />
        </div>
      )}

      {themeBase === 'custom' && draft && (
        <>
          <div className="settings-field">
            <label htmlFor="theme-preset">Saved colors</label>
            <div className="settings-row">
              <select
                id="theme-preset"
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

          <div className="theme-custom-layout">
            <div className="theme-custom-layout__preview">
              <div className="settings-field">
                <label htmlFor="theme-clock-font">Clock font</label>
                <select
                  id="theme-clock-font"
                  className="theme-font-select"
                  value={fontValue}
                  onChange={(e) => patchDraft({ '--font-clock': e.target.value })}
                >
                  {!fontKnown && <option value={fontValue}>Current</option>}
                  {CLOCK_FONTS.map((f) => (
                    <option key={f.label} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="theme-preview" style={draftToStyle(draft)} aria-hidden="true">
                <div className="theme-preview__glass">
                  <span className="theme-preview__clock">14:32:01</span>
                  <div className="theme-preview__row">
                    <button type="button" className="btn-primary" tabIndex={-1}>
                      Primary
                    </button>
                    <div className="item-row__actions">
                      <button type="button" tabIndex={-1}>
                        Done
                      </button>
                      <button type="button" tabIndex={-1}>
                        Edit
                      </button>
                      <button type="button" className="danger" tabIndex={-1}>
                        Del
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="button"
                className={`theme-confirm${dirty ? ' is-dirty' : ''}`}
                onClick={onConfirm}
              >
                Confirm
              </button>
            </div>

            <div className="theme-swatches">
              <ColorSwatch
                label="Bg"
                value={draft['--panel-bg']}
                onChange={onBg}
                dirty={dirty}
                setDirty={setDirty}
              />
              <ColorSwatch
                label="Button bg"
                value={draft['--button-bg']}
                onChange={onButtonBg}
                dirty={dirty}
                setDirty={setDirty}
              />
              <ColorSwatch
                label="Button label"
                value={draft['--button-text']}
                onChange={onButtonText}
                dirty={dirty}
                setDirty={setDirty}
              />
              <ColorSwatch
                label="Row actions (Done / Edit)"
                value={draft['--action-text']}
                onChange={(h) => patchDraft({ '--action-text': h })}
                dirty={dirty}
                setDirty={setDirty}
              />
              <ColorSwatch
                label="Delete"
                value={draft['--danger']}
                onChange={(h) => patchDraft({ '--danger': h })}
                dirty={dirty}
                setDirty={setDirty}
              />
              <ColorSwatch
                label="Clock"
                value={draft['--clock-color']}
                onChange={(h) => patchDraft({ '--clock-color': h })}
                dirty={dirty}
                setDirty={setDirty}
              />
            </div>
          </div>
        </>
      )}

      <PromptDialog
        open={nameOpen}
        title="Save custom colors"
        message="Name this color set. It will appear in the dropdown."
        confirmLabel="Save"
        placeholder="e.g. Orange Wow"
        onConfirm={onNameSave}
        onCancel={() => setNameOpen(false)}
      />
      <PromptDialog
        open={renameOpen}
        title="Rename custom colors"
        confirmLabel="Save"
        placeholder="e.g. Orange Wow"
        initialValue={presets.find((p) => String(p.id) === selectedId)?.name || ''}
        onConfirm={onRenameSave}
        onCancel={() => setRenameOpen(false)}
      />
    </div>
  );
}
