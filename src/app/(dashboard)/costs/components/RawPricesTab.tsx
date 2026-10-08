'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { isSuspiciousPrice, type CostRawMaterial, type CostRecipe, type CostRow } from '@/lib/product-costs';
import { fmtDate } from '@/lib/finance-export';
import { C, StatCard, Th, Td, EmptyNote } from '../../finance/components/shared';

type Filter = 'used' | 'used_missing' | 'missing' | 'suspicious' | 'all';

const selectCls = 'px-3 py-1.5 text-sm rounded-lg border border-[#E8DED2] bg-white focus:outline-none focus:border-[#C9A46A]';

export default function RawPricesTab({ rawMaterials, recipes, rows, onPriceSaved }: {
  rawMaterials: CostRawMaterial[];
  recipes: CostRecipe[];
  rows: CostRow[];
  onPriceSaved: (id: string, price: number | null, updatedAt: string | null) => void;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('used');

  // material id → recipe names using it, and → cost rows that follow it.
  const usage = useMemo(() => {
    const recipesOf = new Map<string, string[]>();
    for (const r of recipes) {
      for (const i of r.רכיבי_מתכון) {
        const list = recipesOf.get(i.חומר_גלם_id) ?? [];
        if (!list.includes(r.שם_מתכון)) list.push(r.שם_מתכון);
        recipesOf.set(i.חומר_גלם_id, list);
      }
    }
    const recipeById = new Map(recipes.map(r => [r.id, r]));
    const productsOf = new Map<string, string[]>();
    for (const row of rows) {
      if (!row.חומרים_לפי_מתכון || !row.מתכון_id) continue;
      for (const i of recipeById.get(row.מתכון_id)?.רכיבי_מתכון ?? []) {
        const list = productsOf.get(i.חומר_גלם_id) ?? [];
        if (!list.includes(row.שם)) list.push(row.שם);
        productsOf.set(i.חומר_גלם_id, list);
      }
    }
    return { recipesOf, productsOf };
  }, [recipes, rows]);

  const hasPrice = (m: CostRawMaterial) => Number(m.מחיר_ליחידה) > 0;
  const isUsed = (m: CostRawMaterial) => usage.recipesOf.has(m.id);

  const stats = useMemo(() => ({
    total: rawMaterials.length,
    priced: rawMaterials.filter(hasPrice).length,
    usedMissing: rawMaterials.filter(m => isUsed(m) && !hasPrice(m)).length,
    suspicious: rawMaterials.filter(isSuspiciousPrice).length,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [rawMaterials, usage]);

  const visible = useMemo(() => {
    const q = search.trim();
    return rawMaterials.filter(m => {
      if (q && !m.שם_חומר_גלם.includes(q)) return false;
      if (filter === 'used') return isUsed(m);
      if (filter === 'used_missing') return isUsed(m) && !hasPrice(m);
      if (filter === 'missing') return !hasPrice(m);
      if (filter === 'suspicious') return isSuspiciousPrice(m);
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawMaterials, search, filter, usage]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="חומרי גלם" value={String(stats.total)} />
        <StatCard label="עם מחיר" value={String(stats.priced)} tone="green" />
        <StatCard label="בשימוש במתכונים וחסר מחיר" value={String(stats.usedMissing)} tone={stats.usedMissing ? 'amber' : undefined}
          sub={stats.usedMissing ? 'מוצרים לפי מתכון יחושבו חלקית' : undefined} />
      </div>

      {stats.suspicious > 0 && (
        <div className="rounded-xl px-4 py-3 text-sm flex flex-wrap items-center gap-2" style={{ backgroundColor: C.amberBg, color: C.amber }}>
          <span>{stats.suspicious} חומרי גלם רשומים ביחידה של גרם/מ״ל עם מחיר של ₪1 ומעלה ליחידה — כנראה הוזן מחיר לק״ג/ליטר. זה מנפח את עלות המתכונים פי 1000.</span>
          <button className="underline font-medium" onClick={() => setFilter('suspicious')}>להצגה</button>
        </div>
      )}

      <div className="text-xs" style={{ color: C.sub }}>
        המחיר הוא לפי יחידת המידה של חומר הגלם במלאי (למשל ₪ לק״ג). שינוי מחיר נשמר מיד ומעדכן את עלות כל המוצרים שמחושבים לפי מתכון.
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש חומר גלם…"
          className="px-3 py-1.5 text-sm rounded-lg border border-[#E8DED2] bg-white focus:outline-none focus:border-[#C9A46A] w-44"
        />
        <select className={selectCls} value={filter} onChange={e => setFilter(e.target.value as Filter)} aria-label="סינון">
          <option value="used">בשימוש במתכונים</option>
          <option value="used_missing">בשימוש במתכונים וחסר מחיר</option>
          <option value="missing">כל החסרים מחיר</option>
          <option value="suspicious">מחירים חשודים</option>
          <option value="all">כל חומרי הגלם</option>
        </select>
      </div>

      {visible.length === 0 ? (
        <EmptyNote>אין חומרי גלם שמתאימים לסינון.</EmptyNote>
      ) : (
        <div className="rounded-xl bg-white overflow-x-auto" style={{ border: `1px solid ${C.border}` }}>
          <table className="w-full">
            <thead style={{ backgroundColor: C.soft }}>
              <tr>
                <Th>חומר גלם</Th>
                <Th>מחיר ליחידה</Th>
                <Th>בשימוש ב</Th>
                <Th>עודכן</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map(m => {
                const recipeNames = usage.recipesOf.get(m.id) ?? [];
                const productNames = usage.productsOf.get(m.id) ?? [];
                return (
                  <tr key={m.id} className="border-t" style={{ borderColor: C.border }}>
                    <Td><span className="font-medium">{m.שם_חומר_גלם}</span></Td>
                    <Td><PriceCell material={m} onSaved={onPriceSaved} /></Td>
                    <Td>
                      {recipeNames.length ? (
                        <span title={recipeNames.join('\n')} className="text-xs" style={{ color: C.sub }}>
                          {recipeNames.length} מתכונים
                          {productNames.length > 0 && <> · משפיע על {productNames.length} מוצרים</>}
                        </span>
                      ) : <span className="text-xs" style={{ color: C.faint }}>—</span>}
                    </Td>
                    <Td><span className="text-xs" style={{ color: C.faint }}>{m.תאריך_עדכון ? fmtDate(m.תאריך_עדכון) : '—'}</span></Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PriceCell({ material, onSaved }: {
  material: CostRawMaterial;
  onSaved: (id: string, price: number | null, updatedAt: string | null) => void;
}) {
  const current = material.מחיר_ליחידה != null && Number(material.מחיר_ליחידה) > 0 ? String(material.מחיר_ליחידה) : '';
  const [value, setValue] = useState(current);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setValue(current); }, [current]);

  const save = async () => {
    if (value.trim() === current) return;
    const n = value.trim() === '' ? null : Number(value);
    if (n != null && (!Number.isFinite(n) || n < 0)) { toast.error('מחיר לא תקין'); setValue(current); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/costs/raw-materials/${material.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ מחיר_ליחידה: n }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'עדכון המחיר נכשל');
      onSaved(material.id, json.data?.מחיר_ליחידה ?? null, json.data?.תאריך_עדכון ?? null);
      toast.success(`המחיר של ${material.שם_חומר_גלם} עודכן`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'עדכון המחיר נכשל');
      setValue(current);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className="text-sm" style={{ color: C.sub }}>₪</span>
        <input
          type="number" min={0} step={0.01} value={value} disabled={saving}
          onChange={e => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setValue(current); }}
          placeholder="חסר"
          className="w-24 px-2 py-1 text-sm rounded-lg border bg-white focus:outline-none focus:border-[#C9A46A] tabular-nums disabled:opacity-50"
          style={{ borderColor: current ? '#E8DED2' : C.gold }}
          aria-label={`מחיר ${material.שם_חומר_גלם}`}
        />
        <span className="text-xs whitespace-nowrap" style={{ color: C.sub }}>ל{material.יחידת_מידה}</span>
      </div>
      {isSuspiciousPrice(material) && (
        <div className="text-xs mt-0.5 whitespace-normal max-w-xs" style={{ color: C.amber }}>
          נראה כמו מחיר לק״ג/ליטר. כדי שהחישוב יהיה נכון — יש לשנות במסך המלאי את יחידת המידה של החומר לק״ג/ליטר (ואת הכמות במלאי בהתאם).
        </div>
      )}
    </div>
  );
}
