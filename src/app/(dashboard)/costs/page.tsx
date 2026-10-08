'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Tabs } from '@/components/ui/Tabs';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type { CostsData } from '@/lib/product-costs';
import { C, money } from '../finance/components/shared';
import ProductCostsTab from './components/ProductCostsTab';
import RawPricesTab from './components/RawPricesTab';

type TabKey = 'products' | 'raw';

export default function CostsPage() {
  const [role, setRole] = useState<string | null | undefined>(undefined);
  const [tab, setTab] = useState<TabKey>('products');
  const [data, setData] = useState<CostsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/me').then(r => (r.ok ? r.json() : null)).then(j => setRole(j?.role ?? null)).catch(() => setRole(null));
  }, []);
  const isAdmin = role === 'admin';

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/costs');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'שגיאה בטעינת העלויות');
      setData(json as CostsData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בטעינת העלויות');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const rawById = useMemo(() => new Map((data?.rawMaterials ?? []).map(m => [m.id, m])), [data?.rawMaterials]);
  const recipesById = useMemo(() => new Map((data?.recipes ?? []).map(r => [r.id, r])), [data?.recipes]);

  const usedMissingCount = useMemo(() => {
    if (!data) return 0;
    const used = new Set(data.recipes.flatMap(r => r.רכיבי_מתכון.map(i => i.חומר_גלם_id)));
    return data.rawMaterials.filter(m => used.has(m.id) && !(Number(m.מחיר_ליחידה) > 0)).length;
  }, [data]);

  // A price edit only touches one raw material — patch it locally so every
  // recipe-based cost recalculates instantly, without a reload.
  const onPriceSaved = useCallback((id: string, price: number | null, updatedAt: string | null) => {
    setData(d => d && ({
      ...d,
      rawMaterials: d.rawMaterials.map(m => (m.id === id ? { ...m, מחיר_ליחידה: price, תאריך_עדכון: updatedAt } : m)),
    }));
  }, []);

  if (role === undefined) {
    return <div className="flex justify-center py-20"><LoadingSpinner /></div>;
  }
  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center text-sm rounded-xl bg-white p-8" style={{ color: C.sub, border: `1px solid ${C.border}` }}>
        עמוד עלויות המוצרים זמין למנהלת המערכת בלבד.
      </div>
    );
  }

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: C.text }}>עלויות מוצרים</h1>
          <p className="text-sm mt-0.5" style={{ color: C.sub }}>
            עלות חומרים + זמן עבודה = עלות מוצר. עדכון מחיר חומר גלם מעדכן מיד כל מוצר שמחושב לפי מתכון.
          </p>
        </div>
        {data && <HourlyRateEditor rate={data.hourlyRate} onSaved={r => setData(d => d && ({ ...d, hourlyRate: r }))} />}
      </div>

      <Tabs
        tabs={[
          { key: 'products', label: 'עלות מוצרים', count: data?.tableReady ? data.rows.length : undefined },
          { key: 'raw', label: 'מחירי חומרי גלם', count: data ? usedMissingCount || undefined : undefined },
        ]}
        activeTab={tab}
        onChange={k => setTab(k as TabKey)}
      />

      {error ? (
        <div className="rounded-xl p-4 text-sm" style={{ backgroundColor: C.redBg, color: C.red }}>{error}</div>
      ) : loading || !data ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : tab === 'products' ? (
        <ProductCostsTab data={data} rawById={rawById} recipesById={recipesById} reload={() => load(true)} />
      ) : (
        <RawPricesTab rawMaterials={data.rawMaterials} recipes={data.recipes} rows={data.rows} onPriceSaved={onPriceSaved} />
      )}
    </div>
  );
}

function HourlyRateEditor({ rate, onSaved }: { rate: number | null; onSaved: (r: number | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const start = () => { setValue(rate != null ? String(rate) : ''); setEditing(true); };
  const save = async () => {
    const n = value.trim() === '' ? null : Number(value);
    if (n != null && (!Number.isFinite(n) || n < 0)) { toast.error('עלות שעת עבודה לא תקינה'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/costs/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ labor_hourly_rate: n }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'השמירה נכשלה');
      onSaved(json.hourlyRate ?? null);
      setEditing(false);
      toast.success('עלות שעת העבודה עודכנה — כל העלויות חושבו מחדש');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'השמירה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl bg-white px-4 py-2.5 flex items-center gap-3" style={{ border: `1px solid ${rate == null ? C.gold : C.border}` }}>
      <div>
        <div className="text-xs" style={{ color: C.sub }}>עלות שעת עבודה</div>
        {editing ? (
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-sm" style={{ color: C.sub }}>₪</span>
            <input
              autoFocus type="number" min={0} step={0.5} value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
              className="w-24 px-2 py-1 text-sm rounded-lg border border-[#E8DED2] focus:outline-none focus:border-[#C9A46A]"
              aria-label="עלות שעת עבודה בשקלים"
            />
            <span className="text-xs" style={{ color: C.sub }}>לשעה</span>
          </div>
        ) : (
          <div className="text-base font-semibold tabular-nums" style={{ color: rate == null ? C.amber : C.text }}>
            {rate == null ? 'לא הוגדרה' : `${money(rate)} לשעה`}
          </div>
        )}
      </div>
      {editing ? (
        <div className="flex gap-1.5">
          <button onClick={save} disabled={saving} className="px-3 py-1.5 text-xs font-medium rounded-lg text-white disabled:opacity-50" style={{ backgroundColor: C.brand }}>
            {saving ? 'שומר…' : 'שמירה'}
          </button>
          <button onClick={() => setEditing(false)} className="px-2 py-1.5 text-xs rounded-lg" style={{ color: C.sub }}>ביטול</button>
        </div>
      ) : (
        <button onClick={start} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white" style={{ border: `1px solid ${C.border}`, color: C.brand }}>
          {rate == null ? 'הגדרה' : 'שינוי'}
        </button>
      )}
    </div>
  );
}
