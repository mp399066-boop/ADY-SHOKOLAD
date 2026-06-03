'use client';

// שמות חלופיים לחומר גלם — הצגה, הוספה ומחיקה. עורך עצמאי שמושך/שומר
// דרך /api/inventory/aliases. לא נוגע בשורת המלאי עצמה.

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';

interface Alias {
  id: string;
  alias: string;
}

export function AliasEditor({ materialId }: { materialId: string }) {
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [loading, setLoading] = useState(true);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/inventory/aliases?material_id=${encodeURIComponent(materialId)}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setAliases(json.data ?? []); })
      .catch(() => { if (!cancelled) setAliases([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [materialId]);

  const add = async () => {
    const alias = value.trim();
    if (!alias || saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/inventory/aliases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_material_id: materialId, alias }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'שגיאה');
      setAliases(prev => [...prev, json.data]);
      setValue('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      const res = await fetch(`/api/inventory/aliases/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setAliases(prev => prev.filter(a => a.id !== id));
    } catch {
      toast.error('שגיאה במחיקה');
    }
  };

  return (
    <div className="rounded-lg border p-3" style={{ borderColor: '#E7D2A6', backgroundColor: '#FAF7F0' }}>
      <p className="text-xs font-semibold mb-2" style={{ color: '#2B1A10' }}>שמות חלופיים</p>

      {loading ? (
        <p className="text-xs" style={{ color: '#9B7A5A' }}>טוען…</p>
      ) : (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {aliases.length === 0 ? (
            <span className="text-xs" style={{ color: '#9B7A5A' }}>אין שמות חלופיים</span>
          ) : (
            aliases.map(a => (
              <span key={a.id} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: '#F4E3C9', color: '#6B4A2D' }}>
                {a.alias}
                <button type="button" onClick={() => remove(a.id)} className="hover:text-red-600" aria-label="מחק שם חלופי">✕</button>
              </span>
            ))
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="הוסיפי שם חלופי…"
          className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border bg-white focus:outline-none"
          style={{ borderColor: '#DDD0BC', color: '#2B1A10' }}
        />
        <button
          type="button"
          onClick={add}
          disabled={!value.trim() || saving}
          className="text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50"
          style={{ backgroundColor: '#8B5E34', color: '#FFF' }}
        >
          הוסיפי
        </button>
      </div>
    </div>
  );
}
