import React, { useState } from 'react';
import SettingsGeneral from '../settings-tabs/SettingsGeneral';
import SettingsTheme from '../settings-tabs/SettingsTheme';
import SettingsWallpaper from '../settings-tabs/SettingsWallpaper';

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'theme', label: 'Theme' },
  { id: 'wallpaper', label: 'Wallpaper' },
];

/** Settings host with General / Theme / Wallpaper tabs. */
export default function SettingsView() {
  const [tab, setTab] = useState('general');

  return (
    <div className="settings">
      <h1>Settings</h1>
      <p style={{ marginBottom: 16 }}>Preferences persist in local SQLite.</p>
      <div className="settings__tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`settings__tab${tab === t.id ? ' settings__tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'general' && <SettingsGeneral />}
      {tab === 'theme' && <SettingsTheme />}
      {tab === 'wallpaper' && <SettingsWallpaper />}
    </div>
  );
}
