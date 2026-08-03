import React from 'react';
import { useTheme } from '../context/ThemeContext';

/** Light / dark base toggle. */
export default function SettingsTheme() {
  const { themeBase, setThemeBase, theme } = useTheme();

  return (
    <div>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 0 }}>
        Active: {theme?.name || '—'}
      </p>
      <div className="theme-toggle" role="group" aria-label="Theme base">
        <button
          type="button"
          className={themeBase === 'dark' ? 'active' : ''}
          onClick={() => setThemeBase('dark')}
        >
          Dark glass
        </button>
        <button
          type="button"
          className={themeBase === 'light' ? 'active' : ''}
          onClick={() => setThemeBase('light')}
        >
          Light glass
        </button>
      </div>
    </div>
  );
}
