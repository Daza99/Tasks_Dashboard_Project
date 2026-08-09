import { useCallback, useEffect, useState } from 'react';

let cache = null;
let inflight = null;

/**
 * Shared user-tag catalog for autocomplete (bare names).
 * @returns {{ catalog: string[], refresh: () => Promise<void>, loading: boolean }}
 */
export function useTagCatalog() {
  const [catalog, setCatalog] = useState(() => cache || []);
  const [loading, setLoading] = useState(!cache);

  const refresh = useCallback(async () => {
    if (!window.api?.listTags) {
      setCatalog([]);
      setLoading(false);
      return;
    }
    if (!inflight) {
      inflight = window.api
        .listTags({ userOnly: true })
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
      setCatalog(names);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { catalog, refresh, loading };
}

/** Clear shared cache after creating tags so next focus sees them. */
export function invalidateTagCatalog() {
  cache = null;
}
