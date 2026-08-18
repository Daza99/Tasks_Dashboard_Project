import React, { createContext, useContext, useEffect, useState } from 'react';

const DatabaseContext = createContext(null);

/** Loads settings once and exposes get/set helpers. */
export function DatabaseProvider({ children }) {
  const [settings, setSettings] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [backupBusy, setBackupBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await window.api.getSettings();
        if (!cancelled) {
          setSettings(s);
          setReady(true);
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto/manual backup in main — splash + last_backup_* for the status bar
  useEffect(() => {
    let cancelled = false;
    window.api.backupStatus?.()
      .then((s) => {
        if (!cancelled && s?.running) setBackupBusy(true);
      })
      .catch(() => {});
    const offStart = window.api.onBackupStarted?.(() => setBackupBusy(true));
    const offEnd = window.api.onBackupEnded?.(() => setBackupBusy(false));
    const offDid = window.api.onBackupDidRun?.(() => {
      setBackupBusy(false);
      window.api
        .getSettings()
        .then((s) => setSettings(s))
        .catch(() => {});
    });
    return () => {
      cancelled = true;
      offStart?.();
      offEnd?.();
      offDid?.();
    };
  }, []);

  /** Persist a setting key and refresh local cache. */
  async function updateSetting(key, value) {
    const next = await window.api.setSetting(key, value);
    setSettings(next);
    return next;
  }

  const value = { settings, ready, error, updateSetting, setSettings, backupBusy };
  return (
    <DatabaseContext.Provider value={value}>{children}</DatabaseContext.Provider>
  );
}

export function useDatabase() {
  const ctx = useContext(DatabaseContext);
  if (!ctx) throw new Error('useDatabase outside provider');
  return ctx;
}
