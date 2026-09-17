'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { useOptionList } from '@/hooks/useOptionList';
import { useSystemConfig } from '@/hooks/useSystemConfig';
import toast from 'react-hot-toast';

export default function NewCustomerPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const { values: customerSources } = useOptionList('customer_sources');
  const { config, loading: configLoading } = useSystemConfig();
  const [form, setForm] = useState({
    שם_פרטי: '',
    שם_משפחה: '',
    טלפון: '',
    אימייל: '',
    מספר_זהות: '',
    סוג_לקוח: 'פרטי',
    // לקוח חו"ל — documents are issued VAT-free (migration 054).
    פטור_ממעמ: false,
    מקור_הגעה: '',
    אחוז_הנחה: 0,
    הערות: '',
    // Saved address — optional. When set, future delivery orders for this
    // customer will autofill recipient address/city/instructions.
    כתובת: '',
    עיר: '',
    הערות_כתובת: '',
  });

  // Apply the configured default customer source once, only if the user hasn't
  // already picked one. Falls back silently to empty if config is unavailable.
  const defaultSourceApplied = useRef(false);
  useEffect(() => {
    if (defaultSourceApplied.current || configLoading) return;
    defaultSourceApplied.current = true;
    const def = config.default_customer_source;
    if (def) setForm(prev => (prev.מקור_הגעה ? prev : { ...prev, מקור_הגעה: def }));
  }, [configLoading, config]);

  const set = (field: string, value: string | number | boolean) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.שם_פרטי) { toast.error('שם פרטי הוא שדה חובה'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success('לקוח נוצר בהצלחה');
      router.push(`/customers/${json.data.id}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-5">
      <Card>
        <CardHeader><CardTitle>לקוח חדש</CardTitle></CardHeader>
        <div className="grid grid-cols-2 gap-4">
          <Input label="שם פרטי *" value={form.שם_פרטי} onChange={e => set('שם_פרטי', e.target.value)} required />
          <Input label="שם משפחה" value={form.שם_משפחה} onChange={e => set('שם_משפחה', e.target.value)} />
          <Input label="טלפון" type="tel" value={form.טלפון} onChange={e => set('טלפון', e.target.value)} />
          <Input label="אימייל" type="email" value={form.אימייל} onChange={e => set('אימייל', e.target.value)} />
          <Input label="מספר זהות" value={form.מספר_זהות} onChange={e => set('מספר_זהות', e.target.value)} />
          <Select label="סוג לקוח" value={form.סוג_לקוח} onChange={e => set('סוג_לקוח', e.target.value)}>
            {['פרטי', 'חוזר', 'עסקי - קבוע', 'עסקי - כמות', 'בארטר'].map(t => <option key={t} value={t}>{t}</option>)}
          </Select>
          <Select label="מקור הגעה" value={form.מקור_הגעה} onChange={e => set('מקור_הגעה', e.target.value)}>
            <option value="">-</option>
            {customerSources.map(s => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Input label="אחוז הנחה (%)" type="number" value={form.אחוז_הנחה} onChange={e => set('אחוז_הנחה', Number(e.target.value))} min={0} max={100} step={0.5} />
          <Input label="עיר" value={form.עיר} onChange={e => set('עיר', e.target.value)} />
          <label className="col-span-2 flex items-start gap-2 cursor-pointer rounded-lg px-3 py-2.5"
            style={{ backgroundColor: form.פטור_ממעמ ? '#FFF7ED' : '#FBF7F1', border: `1px solid ${form.פטור_ממעמ ? '#FCD9A8' : '#EDE0CE'}` }}>
            <input
              type="checkbox"
              checked={form.פטור_ממעמ}
              onChange={e => set('פטור_ממעמ', e.target.checked)}
              className="mt-0.5 h-4 w-4 cursor-pointer"
            />
            <span className="text-[13px] leading-5" style={{ color: '#2B1A10' }}>
              לקוח חו״ל — פטור ממע״מ
              <span className="block text-[11.5px]" style={{ color: '#9B7A5A' }}>
                חשבוניות וקבלות ללקוח זה יופקו ללא מע״מ כלל. סכום ההזמנה נשאר כפי שנרשם.
              </span>
            </span>
          </label>
          <div className="col-span-2">
            <Textarea label="כתובת" value={form.כתובת} onChange={e => set('כתובת', e.target.value)} rows={2} />
          </div>
          <div className="col-span-2">
            <Input label="הערות לכתובת (קומה, דלת, קוד שער…)" value={form.הערות_כתובת} onChange={e => set('הערות_כתובת', e.target.value)} />
          </div>
          <div className="col-span-2">
            <Textarea label="הערות" value={form.הערות} onChange={e => set('הערות', e.target.value)} rows={3} />
          </div>
        </div>
      </Card>
      <div className="flex gap-3 justify-end">
        <Button type="button" variant="outline" onClick={() => router.back()}>ביטול</Button>
        <Button type="submit" loading={loading}>שמור לקוח</Button>
      </div>
    </form>
  );
}
