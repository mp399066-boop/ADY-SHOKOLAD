'use client';

// Full edit of a finished product or a petit-four type from the inventory
// screen — name, category, stock, thresholds, active, made-to-order — so the
// operator doesn't have to leave for /products. Saves through the same PATCH
// routes the products page uses.

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { useOptionList } from '@/hooks/useOptionList';
import { BRAND } from '@/constants/theme';
import type { Product, PetitFourType } from '@/types/database';

export type CatalogEditTarget =
  | { kind: 'product'; item: Product }
  | { kind: 'petitfour'; item: PetitFourType };

type Form = Record<string, string | number | boolean | null>;

function Check({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 cursor-pointer rounded-lg px-3 py-2.5" style={{ backgroundColor: '#FBF7F1', border: `1px solid ${BRAND.border}` }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 cursor-pointer" style={{ accentColor: BRAND.primary }} />
      <span className="text-[13px] leading-5" style={{ color: BRAND.textPrimary }}>
        {label}
        {hint && <span className="block text-[11.5px]" style={{ color: BRAND.textSecondary }}>{hint}</span>}
      </span>
    </label>
  );
}

export function CatalogItemEditModal({ target, onClose, onSaved }: {
  target: CatalogEditTarget | null;
  onClose: () => void;
  onSaved: (target: CatalogEditTarget) => void;
}) {
  const [form, setForm] = useState<Form>({});
  const [saving, setSaving] = useState(false);
  // Sale price = the product's active retail price-list row, else its base
  // price — the same price the order form and /costs show. Saved through the
  // costs sale-price route, which updates both.
  const [salePrice, setSalePrice] = useState<string>('');
  const [initialSalePrice, setInitialSalePrice] = useState<number | null>(null);
  const { values: categories } = useOptionList('product_categories', String(form.קטגוריית_מוצר || 'אחר'));

  useEffect(() => {
    if (!target) return;
    setForm({ ...(target.item as unknown as Form) });
    if (target.kind !== 'product') return;
    const base = target.item.מחיר == null ? null : Number(target.item.מחיר);
    setSalePrice(base == null ? '' : String(base));
    setInitialSalePrice(base);
    let cancelled = false;
    fetch('/api/prices')
      .then(r => (r.ok ? r.json() : null))
      .then((json: { data?: { מוצר_id: string | null; price_type: string; מחיר: unknown }[] } | null) => {
        if (cancelled || !json?.data) return;
        const row = json.data.find(p => p.מוצר_id === target.item.id && p.price_type === 'retail' && p.מחיר != null);
        if (!row) return;
        const retail = Number(row.מחיר);
        setSalePrice(String(retail));
        setInitialSalePrice(retail);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [target]);

  const set = (k: string, v: string | number | boolean | null) => setForm(f => ({ ...f, [k]: v }));
  const num = (k: string) => (form[k] == null ? '' : String(form[k]));
  const isProduct = target?.kind === 'product';

  const handleSave = async () => {
    if (!target) return;
    const nameKey = isProduct ? 'שם_מוצר' : 'שם_פטיפור';
    if (!String(form[nameKey] || '').trim()) { toast.error('שם הוא שדה חובה'); return; }
    const stock = {
      כמות_במלאי:    Number(form.כמות_במלאי) || 0,
      סף_מלאי_נמוך:  Number(form.סף_מלאי_נמוך) || 0,
      סף_מלאי_קריטי: Number(form.סף_מלאי_קריטי) || 0,
      בהזמנה_מראש:   form.בהזמנה_מראש === true,
      פעיל:          form.פעיל !== false,
    };
    const body = isProduct
      ? {
          ...stock,
          שם_מוצר:       String(form.שם_מוצר).trim(),
          קטגוריית_מוצר: form.קטגוריית_מוצר || null,
          sku:           form.sku ? String(form.sku).trim() : null,
          תיאור:         form.תיאור || null,
        }
      : {
          ...stock,
          שם_פטיפור: String(form.שם_פטיפור).trim(),
          הערות:     form.הערות || null,
        };
    const newSalePrice = salePrice.trim() === '' ? null : Number(salePrice);
    if (isProduct && (newSalePrice == null || !Number.isFinite(newSalePrice) || newSalePrice < 0)) {
      toast.error('מחיר מכירה לא תקין'); return;
    }
    const salePriceChanged = isProduct && newSalePrice !== initialSalePrice;
    setSaving(true);
    try {
      let savedPrice: { מחיר?: number } = {};
      if (salePriceChanged) {
        const priceRes = await fetch(`/api/costs/sale-price/${target.item.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ מחיר: newSalePrice }),
        });
        const priceJson = await priceRes.json().catch(() => ({}));
        if (!priceRes.ok) throw new Error(priceJson.error || 'עדכון מחיר המכירה נכשל');
        savedPrice = { מחיר: Number(priceJson.data?.price ?? newSalePrice) };
        setInitialSalePrice(savedPrice.מחיר ?? null);
      }
      const url = isProduct ? `/api/products/${target.item.id}` : `/api/petit-four-types/${target.item.id}`;
      const res = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'שגיאה בשמירה');
      toast.success('נשמר');
      onSaved(isProduct
        ? { kind: 'product', item: { ...(target.item as Product), ...json.data, ...savedPrice } }
        : { kind: 'petitfour', item: { ...(target.item as PetitFourType), ...json.data } });
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'שגיאה בשמירה');
    } finally { setSaving(false); }
  };

  return (
    <Modal open={!!target} onClose={onClose} title={isProduct ? 'עריכת מוצר' : 'עריכת פטיפור'} size="md">
      {target && (
        <div className="space-y-4">
          {isProduct ? (
            <>
              <Input label="שם מוצר" required value={String(form.שם_מוצר || '')} onChange={e => set('שם_מוצר', e.target.value)} />
              <div className="grid grid-cols-2 gap-3">
                <Select label="קטגוריה" value={String(form.קטגוריית_מוצר || 'אחר')} onChange={e => set('קטגוריית_מוצר', e.target.value)}>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </Select>
                <Input label='מק"ט' value={String(form.sku || '')} onChange={e => set('sku', e.target.value)} />
                <Input
                  label="מחיר מכירה (₪)" type="number" min={0} step={0.01}
                  value={salePrice} onChange={e => setSalePrice(e.target.value)}
                  hint="מתעדכן גם במחירון (לקוח פרטי) וגם במחיר הבסיס"
                />
              </div>
              <Textarea label="תיאור" rows={2} value={String(form.תיאור || '')} onChange={e => set('תיאור', e.target.value)} />
            </>
          ) : (
            <>
              <Input label="שם פטיפור" required value={String(form.שם_פטיפור || '')} onChange={e => set('שם_פטיפור', e.target.value)} />
              <Textarea label="הערות" rows={2} value={String(form.הערות || '')} onChange={e => set('הערות', e.target.value)} />
            </>
          )}

          <div className="grid grid-cols-3 gap-3">
            <Input label="כמות במלאי" type="number" min={0} value={num('כמות_במלאי')} onChange={e => set('כמות_במלאי', e.target.value === '' ? 0 : Number(e.target.value))} />
            <Input label="סף נמוך" type="number" min={0} value={num('סף_מלאי_נמוך')} onChange={e => set('סף_מלאי_נמוך', e.target.value === '' ? 0 : Number(e.target.value))} />
            <Input label="סף קריטי" type="number" min={0} value={num('סף_מלאי_קריטי')} onChange={e => set('סף_מלאי_קריטי', e.target.value === '' ? 0 : Number(e.target.value))} />
          </div>

          <Check label="פעיל" checked={form.פעיל !== false} onChange={v => set('פעיל', v)} />
          <Check
            label="בהזמנה מראש — לא נשמר במלאי"
            hint="הפריט מיוצר לפי הזמנה, ולכן חסימת ההזמנה במלאי חסר לא תחול עליו."
            checked={form.בהזמנה_מראש === true}
            onChange={v => set('בהזמנה_מראש', v)}
          />

          <div className="flex gap-3 justify-end pt-1">
            <Button variant="outline" onClick={onClose}>ביטול</Button>
            <Button onClick={handleSave} loading={saving}>שמור</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
