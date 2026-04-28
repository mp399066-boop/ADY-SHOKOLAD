'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import toast from 'react-hot-toast';

export default function NewCustomerPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    שם_פרטי: '',
    שם_משפחה: '',
    טלפון: '',
    אימייל: '',
    סוג_לקוח: 'פרטי',
    מקור_הגעה: '',
    אחוז_הנחה: 0,
    הערות: '',
  });

  const set = (field: string, value: string | number) => setForm(prev => ({ ...prev, [field]: value }));

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
          <Select label="סוג לקוח" value={form.סוג_לקוח} onChange={e => set('סוג_לקוח', e.target.value)}>
            {['פרטי', 'חוזר', 'VIP', 'מעצב אירועים'].map(t => <option key={t} value={t}>{t}</option>)}
          </Select>
          <Select label="מקור הגעה" value={form.מקור_הגעה} onChange={e => set('מקור_הגעה', e.target.value)}>
            <option value="">-</option>
            {['המלצה', 'אינסטגרם', 'פייסבוק', 'WhatsApp', 'גוגל', 'אחר'].map(s => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Input label="אחוז הנחה (%)" type="number" value={form.אחוז_הנחה} onChange={e => set('אחוז_הנחה', Number(e.target.value))} min={0} max={100} step={0.5} />
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
