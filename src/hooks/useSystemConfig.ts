'use client';

// useSystemConfig — read the safe system defaults (ברירות מחדל).
//
// Always returns usable values: starts from the hardcoded defaults and swaps
// in the DB-backed values once they load. On ANY failure (network error,
// table not migrated) it keeps the defaults, so forms never break.

import { useEffect, useState } from 'react';
import { configDefaultsMap } from '@/lib/system-config';

export function useSystemConfig(): {
  config: Record<string, string>;
  loading: boolean;
} {
  const [config, setConfig] = useState<Record<string, string>>(() => configDefaultsMap());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/system-config')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('fetch failed'))))
      .then((json) => {
        if (cancelled) return;
        if (json?.data && typeof json.data === 'object') {
          setConfig({ ...configDefaultsMap(), ...json.data });
        }
      })
      .catch(() => {
        /* keep defaults */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { config, loading };
}
