import React, { createContext, useContext, useEffect, useState } from 'react';
import { useDatabase } from './DatabaseContext';

const ThemeContext = createContext(null);

/** Apply theme CSS vars + wallpaper color onto :root. */
function applyThemeVars(vars, wallpaperColor) {
  const root = document.documentElement;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      if (k.startsWith('--')) root.style.setProperty(k, v);
    }
  }
  if (wallpaperColor) {
    root.style.setProperty('--wallpaper-color', wallpaperColor);
  }
}

export function ThemeProvider({ children }) {
  const { settings, ready, updateSetting } = useDatabase();
  const [theme, setTheme] = useState(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      const t = await window.api.getActiveTheme();
      if (cancelled) return;
      setTheme(t);
      applyThemeVars(t.vars, settings?.wallpaper_color || '#0a1628');
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, settings?.theme_base, settings?.active_theme_id]);

  // Wallpaper color can change independently of theme preset
  useEffect(() => {
    if (settings?.wallpaper_color) {
      document.documentElement.style.setProperty(
        '--wallpaper-color',
        settings.wallpaper_color
      );
    }
  }, [settings?.wallpaper_color]);

  /** Switch light | dark and persist. */
  async function setThemeBase(base) {
    const t = await window.api.setThemeBase(base);
    await updateSetting('theme_base', base);
    setTheme(t);
    applyThemeVars(t.vars, settings?.wallpaper_color);
    return t;
  }

  const value = {
    theme,
    themeBase: settings?.theme_base || 'dark',
    setThemeBase,
  };

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme outside provider');
  return ctx;
}
