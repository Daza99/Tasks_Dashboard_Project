import React, { createContext, useContext, useMemo } from 'react';
import { useDatabase } from './DatabaseContext';

const LayoutContext = createContext(null);

/** Compact (glance) vs Focus (full editor) layout mode. */
export function LayoutProvider({ children }) {
  const { settings, ready, updateSetting } = useDatabase();

  const mode = settings?.layout_mode === 'focus' ? 'focus' : 'compact';

  async function setMode(next) {
    if (next !== 'compact' && next !== 'focus') return;
    await updateSetting('layout_mode', next);
  }

  async function enterFocus() {
    await setMode('focus');
  }

  async function enterCompact() {
    await setMode('compact');
  }

  const value = useMemo(
    () => ({
      mode,
      ready,
      setMode,
      enterFocus,
      enterCompact,
      isCompact: mode === 'compact',
      isFocus: mode === 'focus',
    }),
    [mode, ready]
  );

  return (
    <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>
  );
}

export function useLayout() {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error('useLayout outside provider');
  return ctx;
}
