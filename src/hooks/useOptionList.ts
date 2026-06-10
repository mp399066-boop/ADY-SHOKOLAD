'use client';

// useOptionList — read a managed list (רשימות ניהול) for use in a <select>.
//
// Always returns usable values: it starts from the hardcoded defaults and
// swaps in the DB-backed active values once they load. On ANY failure (network
// error, table not yet migrated, empty list) it keeps the defaults, so existing
// forms never break.
//
// `ensure` lets an edit form guarantee a currently-saved value stays selectable
// even if it was later disabled or removed from the list.

import { useEffect, useState } from 'react';
import { getDefaultValues, type OptionListRow } from '@/lib/option-lists';

export function useOptionList(listKey: string, ensure?: string | null): {
  values: string[];
  loading: boolean;
} {
  const [values, setValues] = useState<string[]>(() => getDefaultValues(listKey));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/admin/option-lists?list_key=${encodeURIComponent(listKey)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('fetch failed'))))
      .then((json) => {
        if (cancelled) return;
        const active = ((json.data as OptionListRow[]) || [])
          .filter((row) => row.is_active)
          .map((row) => row.value);
        if (active.length) setValues(active);
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
  }, [listKey]);

  // Make sure the current saved value is always selectable.
  const withEnsured =
    ensure && ensure.trim() && !values.includes(ensure) ? [...values, ensure] : values;

  return { values: withEnsured, loading };
}
