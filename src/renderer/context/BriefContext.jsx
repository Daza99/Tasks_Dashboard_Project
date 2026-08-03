import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

const BriefContext = createContext(null);

/** Shared Today brief + refresh for Compact and after mutations. */
export function BriefProvider({ children }) {
  const [brief, setBrief] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const data = await window.api.getTodayBrief();
      setBrief(data);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  const value = { brief, loading, error, refresh };
  return <BriefContext.Provider value={value}>{children}</BriefContext.Provider>;
}

export function useBrief() {
  const ctx = useContext(BriefContext);
  if (!ctx) throw new Error('useBrief outside provider');
  return ctx;
}
