import React, { useEffect, useState } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import {
  DEFAULT_HOTKEYS,
  HOTKEY_ACTIONS,
  comboFromEvent,
  parseHotkeys,
} from '../../utils/hotkeys.js';

const FIXED = [
  { combo: 'Home', label: 'Compact (from Focus)' },
  { combo: 'Ctrl+K', label: 'Search' },
];

/** Remappable nav shortcuts + read-only built-ins. */
export default function SettingsHotkeys() {
  const { settings, updateSetting } = useDatabase();
  const [hotkeys, setHotkeys] = useState(() => parseHotkeys(settings?.hotkeys));
  const [capturing, setCapturing] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setHotkeys(parseHotkeys(settings?.hotkeys));
  }, [settings?.hotkeys]);

  useEffect(() => {
    if (!capturing) return undefined;
    function onKey(e) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setCapturing(null);
        setError('');
        return;
      }
      const combo = comboFromEvent(e);
      if (!combo) return;
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        setError('Include Ctrl, Alt, or Cmd');
        return;
      }
      const clash = HOTKEY_ACTIONS.find(
        (a) => a.id !== capturing && hotkeys[a.id] === combo
      );
      if (clash) {
        setError(`Already used by ${clash.label}`);
        return;
      }
      const next = { ...hotkeys, [capturing]: combo };
      setHotkeys(next);
      updateSetting('hotkeys', JSON.stringify(next));
      setCapturing(null);
      setError('');
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing, hotkeys, updateSetting]);

  function resetDefaults() {
    setHotkeys({ ...DEFAULT_HOTKEYS });
    updateSetting('hotkeys', JSON.stringify(DEFAULT_HOTKEYS));
    setCapturing(null);
    setError('');
  }

  return (
    <div>
      <p className="module-view__hint">
        Shortcuts are ignored while typing in a field. Click Change, then press a
        combo. Esc cancels.
      </p>
      {error && <p className="settings-hotkeys__error">{error}</p>}

      <ul className="settings-hotkeys">
        {HOTKEY_ACTIONS.map((a) => (
          <li key={a.id} className="settings-hotkeys__row">
            <span className="settings-hotkeys__label">{a.label}</span>
            <kbd className="settings-hotkeys__combo">
              {capturing === a.id ? 'Press keys…' : hotkeys[a.id]}
            </kbd>
            <button
              type="button"
              className="btn-cyan"
              onClick={() => {
                setError('');
                setCapturing(a.id);
              }}
            >
              Change
            </button>
          </li>
        ))}
      </ul>

      <h2 className="settings-subhead">Built-in</h2>
      <ul className="settings-hotkeys">
        {FIXED.map((f) => (
          <li key={f.combo} className="settings-hotkeys__row">
            <span className="settings-hotkeys__label">{f.label}</span>
            <kbd className="settings-hotkeys__combo">{f.combo}</kbd>
          </li>
        ))}
      </ul>

      <button type="button" className="btn-primary" onClick={resetDefaults}>
        Reset defaults
      </button>
    </div>
  );
}
