import React, { createContext, useContext, useEffect, useState } from 'react';
import { useDatabase } from './DatabaseContext';
import { applyGlassBrightness } from '../../utils/theme-color.js';

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

/** Tag <html> so CSS can invert native date-picker glyphs in dark mode. */
function applyThemeBaseAttr(theme, settings) {
  const light =
    settings?.theme_base === 'light' || theme?.name === 'Light Glass';
  document.documentElement.dataset.themeBase = light ? 'light' : 'dark';
}

/**
 * Brightness mix for built-in glass only. Confirmed custom presets skip the slider.
 * @param {object|null} t
 * @param {Record<string, string>|null} settings
 */
function varsForDisplay(t, settings) {
  if (!t?.vars) return {};
  if (t.builtin === false) return t.vars;
  const glass = t.name === 'Light Glass' ? 'light' : 'dark';
  const key = glass === 'light' ? 'theme_brightness_light' : 'theme_brightness_dark';
  return applyGlassBrightness(t.vars, Number(settings?.[key] ?? 50));
}

export function ThemeProvider({ children }) {
  const { settings, ready, updateSetting, setSettings } = useDatabase();
  const [theme, setTheme] = useState(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      const t = await window.api.getActiveTheme();
      if (cancelled) return;
      setTheme(t);
      applyThemeVars(varsForDisplay(t, settings), settings?.wallpaper_color || '#3e5679');
      applyThemeBaseAttr(t, settings);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    ready,
    settings?.theme_base,
    settings?.active_theme_id,
    settings?.theme_brightness_dark,
    settings?.theme_brightness_light,
  ]);

  // Wallpaper color can change independently of theme preset
  useEffect(() => {
    if (settings?.wallpaper_color) {
      document.documentElement.style.setProperty(
        '--wallpaper-color',
        settings.wallpaper_color
      );
    }
  }, [settings?.wallpaper_color]);

  /** Switch light | dark | custom and persist. */
  async function setThemeBase(base) {
    const t = await window.api.setThemeBase(base);
    await updateSetting('theme_base', base);
    const nextSettings = { ...settings, theme_base: base };
    setTheme(t);
    applyThemeVars(varsForDisplay(t, nextSettings), settings?.wallpaper_color);
    applyThemeBaseAttr(t, nextSettings);
    return t;
  }

  /** Persist a named custom preset and apply it globally. */
  async function confirmCustomTheme(payload) {
    const t = await window.api.saveCustomTheme(payload);
    await updateSetting('active_theme_id', String(t.id));
    setTheme(t);
    applyThemeVars(t.vars, settings?.wallpaper_color);
    applyThemeBaseAttr(t, settings);
    return t;
  }

  /** Restore Dark Glass + brightness 50; keep named custom presets. */
  async function resetThemeDefaults() {
    const t = await window.api.resetThemeDefaults();
    const s = await window.api.getSettings();
    setSettings(s);
    setTheme(t);
    applyThemeVars(varsForDisplay(t, s), s?.wallpaper_color);
    applyThemeBaseAttr(t, s);
    return t;
  }

  const value = {
    theme,
    themeBase: settings?.theme_base || 'dark',
    setThemeBase,
    confirmCustomTheme,
    resetThemeDefaults,
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
