import { useCallback, useEffect, useState } from 'react';

let cache = null;
let inflight = null;

/**
 * Shared list-hashtag whitelist for autocomplete (bare names).
 * @returns {{ whitelist: string[], refresh: () => Promise<void>, loading: boolean }}
 */
export function useListHashtagWhitelist() {
  const [whitelist, setWhitelist] = useState(() => cache || []);
  const [loading, setLoading] = useState(!cache);

  const refresh = useCallback(async () => {
    if (!window.api?.listHashtagWhitelist) {
      setWhitelist([]);
      setLoading(false);
      return;
    }
    if (!inflight) {
      inflight = window.api
        .listHashtagWhitelist()
        .then((names) => {
          cache = Array.isArray(names) ? names : [];
          return cache;
        })
        .finally(() => {
          inflight = null;
        });
    }
    setLoading(true);
    try {
      const names = await inflight;
      setWhitelist(names);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { whitelist, refresh, loading };
}

/** Clear cache after append so next focus sees new tags. */
export function invalidateListHashtagWhitelist() {
  cache = null;
}
