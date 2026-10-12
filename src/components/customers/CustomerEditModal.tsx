'use client';

// Full edit of one customer, openable from any screen that shows a customer
// (customers list, orders list, deliveries…) so details can be fixed in place
// instead of going to /customers/[id]. Loads the row itself; saves through
// PATCH /api/customers/[id].

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { BRAND } from '@/constants/theme';
import type { Customer } from '@/types/database';

const CUSTOMER_TYPES = ['פרטי', 'חוזר', 'עסקי - קבוע', 'עסקי - כמות', 'בארטר'] as const;

export function CustomerEditModal({ customerId, onClose, onSaved }: {
  customerId: string | null;
  onClose: () => void;
  onSaved?: (row: Customer) => void;
}) {
  const [form, setForm] = useState<Partial<Customer> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!customerId) { setForm(null); return; }
    let cancelled = false;
    setForm(null);
    fetch(`/api/customers/${customerId}`)
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (cancelled) return;
        if (!ok || !j.data) { toast.error(j.error || 'טעינת הלקוח נכשלה'); onClose(); return; }
        setForm(j.data);
      })
      .catch(() => { if (!cancelled) { toast.error('טעינת הלקוח נכשלה'); onClose(); } });
    return () => { cancelled = true; };
  }, [customerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof Customer>(k: K, v: Customer[K]) => setForm(f => (f ? { ...f, [k]: v } : f));

  const handleSave = async () => {
    if (!form || !customerId) return;
    if (!form.שם_פרטי?.trim()) { toast.error('שם פרטי הוא שדה חובה'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          שם_פרטי:     form.שם_פרטי.trim(),
          שם_משפחה:    form.שם_משפחה?.trim() ?? '',
          טלפון:       form.טלפון?.trim() || null,
          אימייל:      form.אימייל?.trim() || null,
          מספר_זהות:   form.מספר_זהות?.trim() || null,
          סוג_לקוח:    form.סוג_לקוח || 'פרטי',
          מקור_הגעה:   form.מקור_הגעה?.trim() || null,
          אחוז_הנחה:   Number(form.אחוז_הנחה) || 0,
          פטור_ממעמ:   form.פטור_ממעמ === true,
          כתובת:       form.כתובת?.trim() || null,
          עיר:         form.עיר?.trim() || null,
          הערות_כתובת: form.הערות_כתובת?.trim() || null,
          הערות:       form.הערות?.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'שגיאה בשמירה');
      toast.success('פרטי הלקוח עודכנו');
      onSaved?.(json.data as Customer);
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'שגיאה בשמירה');
    } finally { setSaving(false); }
  };

  return (
    <Modal open={!!customerId} onClose={onClose} title="עריכת לקוח" size="md">
      {!form ? (
        <div className="py-10 text-center text-sm" style={{ color: BRAND.textSecondary }}>טוען…</div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="שם פרטי" required value={form.שם_פרטי || ''} onChange={e => set('שם_פרטי', e.target.value)} />
            <Input label="שם משפחה" value={form.שם_משפחה || ''} onChange={e => set('שם_משפחה', e.target.value)} />
            <Input label="טלפון" value={form.טלפון || ''} onChange={e => set('טלפון', e.target.value)} />
            <Input label="אימייל" value={form.אימייל || ''} onChange={e => set('אימייל', e.target.value)} />
            <Input label="מספר זהות" value={form.מספר_זהות || ''} onChange={e => set('מספר_זהות', e.target.value)} />
            <Select label="סוג לקוח" value={form.סוג_לקוח || 'פרטי'} onChange={e => set('סוג_לקוח', e.target.value as Customer['סוג_לקוח'])}>
              {CUSTOMER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              {form.סוג_לקוח && !(CUSTOMER_TYPES as readonly string[]).includes(form.סוג_לקוח) && <option value={form.סוג_לקוח}>{form.סוג_לקוח}</option>}
            </Select>
            <Input label="אחוז הנחה (%)" type="number" min={0} max={100} value={form.אחוז_הנחה ?? 0} onChange={e => set('אחוז_הנחה', Number(e.target.value))} />
            <Input label="מקור הגעה" value={form.מקור_הגעה || ''} onChange={e => set('מקור_הגעה', e.target.value)} />
            <Input label="עיר" value={form.עיר || ''} onChange={e => set('עיר', e.target.value)} />
            <Input label="הערות לכתובת" value={form.הערות_כתובת || ''} onChange={e => set('הערות_כתובת', e.target.value)} />
          </div>
          <Textarea label="כתובת" rows={2} value={form.כתובת || ''} onChange={e => set('כתובת', e.target.value)} />
          <Textarea label="הערות" rows={2} value={form.הערות || ''} onChange={e => set('הערות', e.target.value)} />
          <label className="flex items-start gap-2 cursor-pointer rounded-lg px-3 py-2.5" style={{ backgroundColor: '#FAF7F0', border: `1px solid ${BRAND.border}` }}>
            <input type="checkbox" checked={form.פטור_ממעמ === true} onChange={e => set('פטור_ממעמ', e.target.checked)} className="mt-0.5 h-4 w-4 cursor-pointer" style={{ accentColor: BRAND.primary }} />
            <span className="text-[13px] leading-5" style={{ color: BRAND.textPrimary }}>
              לקוח חו״ל — פטור ממע״מ
              <span className="block text-[11.5px]" style={{ color: BRAND.textSecondary }}>חשבוניות וקבלות ללקוח זה יופקו ללא מע״מ.</span>
            </span>
          </label>
          <div className="flex gap-3 justify-end pt-1">
            <Button variant="outline" onClick={onClose}>ביטול</Button>
            <Button onClick={handleSave} loading={saving}>שמור</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
