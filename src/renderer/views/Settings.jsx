import React, { useEffect, useState } from 'react';
import SettingsGeneral from '../settings-tabs/SettingsGeneral';
import SettingsTheme from '../settings-tabs/SettingsTheme';
import SettingsWallpaper from '../settings-tabs/SettingsWallpaper';
import SettingsHotkeys from '../settings-tabs/SettingsHotkeys';
import SettingsData from '../settings-tabs/SettingsData';
import SettingsGuide from '../settings-tabs/SettingsGuide';

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'data', label: 'Data' },
  { id: 'hotkeys', label: 'Hotkeys' },
  { id: 'theme', label: 'Theme' },
  { id: 'wallpaper', label: 'Wallpaper' },
  { id: 'guide', label: 'Guide' },
];

const WIDE_TABS = new Set(['theme', 'guide']);

/**
 * Settings host with General / Data / Hotkeys / Theme / Wallpaper / Guide tabs.
 * @param {{ initialTab?: string|null, onInitialTabConsumed?: () => void }} props
 */
export default function SettingsView({ initialTab = null, onInitialTabConsumed }) {
  const [tab, setTab] = useState(initialTab || 'general');

  // Help → Guide, including when Settings is already open on another tab.
  useEffect(() => {
    if (!initialTab) return;
    setTab(initialTab);
    onInitialTabConsumed?.();
  }, [initialTab, onInitialTabConsumed]);

  return (
    <div className={`settings${WIDE_TABS.has(tab) ? ' settings--wide' : ''}`}>
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
      {tab === 'data' && <SettingsData />}
      {tab === 'hotkeys' && <SettingsHotkeys />}
      {tab === 'theme' && <SettingsTheme />}
      {tab === 'wallpaper' && <SettingsWallpaper />}
      {tab === 'guide' && <SettingsGuide />}
    </div>
  );
}
