import React, { useState } from 'react';
import { useDatabase } from '../context/DatabaseContext';

/** Phase 1: color mode only — hex + native color input. */
export default function SettingsWallpaper() {
  const { settings, updateSetting } = useDatabase();
  const stored = settings?.wallpaper_color || '#0a1628';
  const [color, setColor] = useState(stored);

  // Keep local draft in sync if settings reload
  React.useEffect(() => {
    setColor(stored);
  }, [stored]);

  async function apply() {
    await updateSetting('wallpaper_mode', 'color');
    await updateSetting('wallpaper_color', color);
  }

  return (
    <div>
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
      <button type="button" className="btn-primary" onClick={apply}>
        Apply
      </button>
    </div>
  );
}
