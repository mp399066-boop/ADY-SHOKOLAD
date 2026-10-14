'use client';

// Full edit of one raw material, openable from any screen that shows raw
// materials (costs, suppliers, purchasing cart, inventory alerts) — so a unit,
// stock quantity or price can be fixed in place instead of going to /inventory.
// Loads the full row itself; saves through PATCH /api/inventory/[id].

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { useOptionList } from '@/hooks/useOptionList';
import { unitFactor } from '@/lib/product-costs';
import { BRAND } from '@/constants/theme';
import type { RawMaterial } from '@/types/database';

type Form = Partial<RawMaterial>;

const round = (n: number) => Math.round(n * 10000) / 10000;

export function RawMaterialEditModal({ materialId, onClose, onSaved }: {
  materialId: string | null;
  onClose: () => void;
  onSaved?: (row: RawMaterial) => void;
}) {
  const [form, setForm] = useState<Form | null>(null);
  // Unit the row had when it was loaded — basis for the convert offer.
  const [origUnit, setOrigUnit] = useState('');
  const [suppliers, setSuppliers] = useState<{ id: string; שם_ספק: string; פעיל?: boolean }[]>([]);
  const [saving, setSaving] = useState(false);
  const [showPurchase, setShowPurchase] = useState(false);
  // false when the loaded row has no תאריך_תפוגה column (migration 068 not run).
  const [hasExpiry, setHasExpiry] = useState(true);
  const { values: unitOptions } = useOptionList('units_of_measure', form?.יחידת_מידה ?? null);

  useEffect(() => {
    if (!materialId) { setForm(null); return; }
    let cancelled = false;
    setForm(null);
    setShowPurchase(false);
    fetch(`/api/inventory/${materialId}`)
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (cancelled) return;
        if (!ok || !j.data) { toast.error(j.error || 'טעינת חומר הגלם נכשלה'); onClose(); return; }
        setForm(j.data);
        setHasExpiry('תאריך_תפוגה' in j.data);
        setOrigUnit(j.data.יחידת_מידה || '');
      })
      .catch(() => { if (!cancelled) { toast.error('טעינת חומר הגלם נכשלה'); onClose(); } });
    return () => { cancelled = true; };
  }, [materialId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!materialId || suppliers.length) return;
    fetch('/api/suppliers').then(r => r.json()).then(j => setSuppliers(j.data || [])).catch(() => {});
  }, [materialId, suppliers.length]);

  const set = <K extends keyof RawMaterial>(k: K, v: RawMaterial[K] | null) => setForm(f => (f ? { ...f, [k]: v } : f));

  // Switching e.g. גרם → ק"ג leaves quantity/price in the old unit; offer to
  // convert them together so stock and recipe costs stay correct.
  const factor = form && origUnit && form.יחידת_מידה && form.יחידת_מידה !== origUnit
    ? unitFactor(origUnit, form.יחידת_מידה)
    : null;

  const convertValues = () => {
    if (!form || factor == null) return;
    setForm({
      ...form,
      כמות_במלאי: round(Number(form.כמות_במלאי || 0) * factor),
      סף_מלאי_נמוך: round(Number(form.סף_מלאי_נמוך || 0) * factor),
      סף_מלאי_קריטי: round(Number(form.סף_מלאי_קריטי || 0) * factor),
      כמות_מינימום: round(Number(form.כמות_מינימום || 0) * factor),
      מחיר_ליחידה: form.מחיר_ליחידה != null ? round(Number(form.מחיר_ליחידה) / factor) : null,
    });
    setOrigUnit(form.יחידת_מידה || '');
    toast.success('הכמות, הספים והמחיר הומרו ליחידה החדשה');
  };

  const handleSave = async () => {
    if (!form || !materialId) return;
    if (!form.שם_חומר_גלם?.trim()) { toast.error('שם חומר גלם הוא שדה חובה'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/inventory/${materialId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          שם_חומר_גלם:      form.שם_חומר_גלם.trim(),
          כמות_במלאי:       Number(form.כמות_במלאי) || 0,
          יחידת_מידה:       form.יחידת_מידה,
          סף_מלאי_נמוך:     Number(form.סף_מלאי_נמוך) || 0,
          סף_מלאי_קריטי:    Number(form.סף_מלאי_קריטי) || 0,
          מחיר_ליחידה:      form.מחיר_ליחידה == null || String(form.מחיר_ליחידה) === '' ? null : Number(form.מחיר_ליחידה),
          // Only when the column exists (the row came back with it) —
          // otherwise a database without תאריך_תפוגה (migration 068 not run)
          // would fail every save from this window.
          ...(hasExpiry ? { תאריך_תפוגה: form.תאריך_תפוגה || null } : {}),
          הערות:            form.הערות || null,
          ספק_מועדף_id:     form.ספק_מועדף_id || null,
          שם_מוצר_אצל_הספק: form.שם_מוצר_אצל_הספק || null,
          מקט_ספק:          form.מקט_ספק || null,
          כמות_מינימום:     Number(form.כמות_מינימום) || 0,
          כמות_להזמנה:      form.כמות_להזמנה == null || String(form.כמות_להזמנה) === '' ? null : Number(form.כמות_להזמנה),
          יחידת_קניה:       form.יחידת_קניה || null,
          הערות_רכש:        form.הערות_רכש || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'שגיאה בשמירה');
      toast.success('חומר הגלם עודכן');
      onSaved?.(json.data as RawMaterial);
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'שגיאה בשמירה');
    } finally { setSaving(false); }
  };

  const numInput = (label: string, key: keyof RawMaterial, nullable = false) => (
    <Input
      label={label}
      type="number"
      min={0}
      step={0.001}
      value={form?.[key] == null ? '' : String(form[key])}
      onChange={e => set(key, (e.target.value === '' ? (nullable ? null : 0) : Number(e.target.value)) as never)}
    />
  );

  return (
    <Modal open={!!materialId} onClose={onClose} title="עריכת חומר גלם" size="md">
      {!form ? (
        <div className="py-10 text-center text-sm" style={{ color: BRAND.textSecondary }}>טוען…</div>
      ) : (
        <div className="space-y-4">
          <Input label="שם חומר גלם" required value={form.שם_חומר_גלם || ''} onChange={e => set('שם_חומר_גלם', e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            {numInput('כמות במלאי', 'כמות_במלאי')}
            <Select label="יחידת מידה" value={form.יחידת_מידה || ''} onChange={e => set('יחידת_מידה', e.target.value)}>
              {unitOptions.map(u => <option key={u} value={u}>{u}</option>)}
            </Select>
          </div>

          {form.יחידת_מידה !== origUnit && (
            <div className="rounded-lg border p-3 text-xs space-y-2" style={{ borderColor: BRAND.goldLight, backgroundColor: '#FBF5E6', color: BRAND.warning }}>
              <p>
                היחידה שונתה מ־<strong>{origUnit}</strong> ל־<strong>{form.יחידת_מידה}</strong>. אם הכמות, הספים והמחיר רשומים לפי היחידה הקודמת — כדאי להמיר אותם. (אם המחיר כבר הוזן לפי היחידה החדשה, אפשר לשמור בלי להמיר.)
              </p>
              {factor != null ? (
                <button type="button" onClick={convertValues} className="px-2.5 py-1 rounded-lg font-semibold text-white" style={{ backgroundColor: BRAND.primary }}>
                  להמיר אותם ל{form.יחידת_מידה}
                </button>
              ) : (
                <p>אין המרה אוטומטית בין היחידות האלה — כדאי לעדכן את הכמות והמחיר ידנית.</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {numInput('סף מלאי נמוך', 'סף_מלאי_נמוך')}
            {numInput('סף מלאי קריטי', 'סף_מלאי_קריטי')}
            <Input
              label={`מחיר ל${form.יחידת_מידה || 'יחידה'} (₪)`}
              type="number" min={0} step={0.01}
              value={form.מחיר_ליחידה == null ? '' : String(form.מחיר_ליחידה)}
              onChange={e => set('מחיר_ליחידה', e.target.value === '' ? null : Number(e.target.value))}
            />
            {hasExpiry && (
              <Input label="תאריך תפוגה" type="date" value={form.תאריך_תפוגה || ''} onChange={e => set('תאריך_תפוגה', e.target.value || null)} />
            )}
          </div>
          <Textarea label="הערות" rows={2} value={form.הערות || ''} onChange={e => set('הערות', e.target.value)} />

          <div className="rounded-lg border" style={{ borderColor: BRAND.border }}>
            <button
              type="button"
              onClick={() => setShowPurchase(v => !v)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium"
              style={{ color: BRAND.textPrimary }}
            >
              <span>הגדרות רכש וספק</span>
              <span style={{ color: BRAND.textSecondary }}>{showPurchase ? '▲' : '▼'}</span>
            </button>
            {showPurchase && (
              <div className="grid grid-cols-2 gap-3 px-3 pb-3">
                <Select label="ספק מועדף" value={form.ספק_מועדף_id || ''} onChange={e => set('ספק_מועדף_id', e.target.value || null)}>
                  <option value="">— ללא ספק —</option>
                  {suppliers.filter(s => s.פעיל !== false || s.id === form.ספק_מועדף_id).map(s => (
                    <option key={s.id} value={s.id}>{s.שם_ספק}</option>
                  ))}
                </Select>
                <Input label="שם אצל הספק" value={form.שם_מוצר_אצל_הספק || ''} onChange={e => set('שם_מוצר_אצל_הספק', e.target.value)} />
                <Input label='מק"ט ספק' value={form.מקט_ספק || ''} onChange={e => set('מקט_ספק', e.target.value)} />
                <Input label="יחידת קניה" value={form.יחידת_קניה || ''} onChange={e => set('יחידת_קניה', e.target.value)} placeholder='ק"ג' />
                {numInput('כמות מינימום', 'כמות_מינימום')}
                {numInput('כמות להזמנה', 'כמות_להזמנה', true)}
                <div className="col-span-2">
                  <Textarea label="הערות רכש" rows={2} value={form.הערות_רכש || ''} onChange={e => set('הערות_רכש', e.target.value)} />
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 justify-end pt-1">
            <Button variant="outline" onClick={onClose}>ביטול</Button>
            <Button onClick={handleSave} loading={saving}>שמור</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
