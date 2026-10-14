'use client';

import { useMemo, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { PUBLIC_C as C } from '@/components/public/public-colors';
import { formatCurrency } from '@/lib/utils';
import type { PublicProduct, PublicPackage } from '@/lib/order-form-server';

type Qty = Record<string, number>;

const field = 'mt-1 w-full h-11 rounded-xl px-3 text-base border bg-white focus:outline-none focus:border-[#C9A46A]';

export default function OrderForm({ token, products, packages, today }: {
  token: string;
  products: PublicProduct[];
  packages: PublicPackage[];
  today: string;
}) {
  const [startedAt] = useState(() => Date.now());
  const [qty, setQty] = useState<Qty>({});
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    שם_מלא: '', טלפון: '', אימייל: '', סוג_אספקה: 'איסוף עצמי' as 'משלוח' | 'איסוף עצמי', תאריך_אספקה: '',
    שם_מקבל: '', טלפון_מקבל: '', כתובת: '', עיר: '', ברכה: '', הערות: '', website: '',
  });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));
  const change = (key: string, delta: number) => setQty(q => ({ ...q, [key]: Math.max(0, Math.min(500, (q[key] ?? 0) + delta)) }));

  const total = useMemo(() =>
    products.reduce((s, p) => s + (qty[`p:${p.id}`] ?? 0) * p.price, 0)
    + packages.reduce((s, p) => s + (qty[`k:${p.id}`] ?? 0) * p.price, 0),
  [qty, products, packages]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const items = [
      ...products.filter(p => qty[`p:${p.id}`]).map(p => ({ סוג: 'מוצר', id: p.id, כמות: qty[`p:${p.id}`], הערה: itemNotes[`p:${p.id}`] || undefined })),
      ...packages.filter(p => qty[`k:${p.id}`]).map(p => ({ סוג: 'מארז', id: p.id, כמות: qty[`k:${p.id}`], הערה: itemNotes[`k:${p.id}`] || undefined })),
    ];
    if (items.length === 0) { setError('יש לבחור לפחות מוצר אחד'); return; }
    setSending(true);
    try {
      const res = await fetch(`/api/public/order-form/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, פריטים: items, startedAt }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'השליחה נכשלה, אפשר לנסות שוב');
      setDone(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'השליחה נכשלה, אפשר לנסות שוב');
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: C.greenBg, color: C.green }}>
        <p className="text-lg font-semibold">הבקשה התקבלה. תודה!</p>
        <p className="text-sm mt-1">ניצור קשר בהקדם לאישור ההזמנה והתשלום.</p>
      </div>
    );
  }

  const isDelivery = form.סוג_אספקה === 'משלוח';

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Card title="מה תרצו להזמין?">
        {packages.length > 0 && (
          <>
            <GroupTitle>מארזים</GroupTitle>
            {packages.map(p => (
              <ItemRow key={p.id} name={p.name} price={p.price} qty={qty[`k:${p.id}`] ?? 0} onChange={d => change(`k:${p.id}`, d)}
                note={itemNotes[`k:${p.id}`] ?? ''} notePlaceholder="אילו טעמים? (לא חובה)"
                onNote={v => setItemNotes(n => ({ ...n, [`k:${p.id}`]: v }))} />
            ))}
          </>
        )}
        {products.length > 0 && (
          <>
            <GroupTitle>מוצרים</GroupTitle>
            {products.map(p => (
              <ItemRow key={p.id} name={p.name} price={p.price} qty={qty[`p:${p.id}`] ?? 0} onChange={d => change(`p:${p.id}`, d)}
                note={itemNotes[`p:${p.id}`] ?? ''} notePlaceholder="הערה (לא חובה)"
                onNote={v => setItemNotes(n => ({ ...n, [`p:${p.id}`]: v }))} />
            ))}
          </>
        )}
      </Card>

      <Card title="פרטים">
        <Label text="שם מלא *"><input required value={form.שם_מלא} onChange={e => set('שם_מלא', e.target.value)} maxLength={80} autoComplete="name" className={field} style={{ borderColor: C.border }} /></Label>
        <Label text="טלפון *"><input required type="tel" dir="ltr" value={form.טלפון} onChange={e => set('טלפון', e.target.value)} maxLength={30} autoComplete="tel" className={field} style={{ borderColor: C.border, textAlign: 'right' }} /></Label>
        <Label text="מייל (לא חובה)"><input type="email" dir="ltr" value={form.אימייל} onChange={e => set('אימייל', e.target.value)} maxLength={120} autoComplete="email" className={field} style={{ borderColor: C.border, textAlign: 'right' }} /></Label>
        {/* Honeypot — hidden from people, bots fill it. */}
        {/* Clipped in place (not pushed off-screen — in RTL that widens the page). */}
        <div aria-hidden="true" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap' }}>
          <label>Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={e => set('website', e.target.value)} /></label>
        </div>
      </Card>

      <Card title="אספקה">
        <div className="grid grid-cols-2 gap-2">
          {(['איסוף עצמי', 'משלוח'] as const).map(t => (
            <button type="button" key={t} onClick={() => set('סוג_אספקה', t)} className="h-11 rounded-xl text-sm font-medium border"
              style={form.סוג_אספקה === t ? { backgroundColor: C.brand, color: '#fff', borderColor: C.brand } : { backgroundColor: '#fff', color: C.text, borderColor: C.border }}>
              {t}
            </button>
          ))}
        </div>
        <Label text="תאריך *"><input required type="date" min={today} value={form.תאריך_אספקה} onChange={e => set('תאריך_אספקה', e.target.value)} className={field} style={{ borderColor: C.border }} /></Label>
        {isDelivery && (
          <>
            <Label text="כתובת *"><input value={form.כתובת} onChange={e => set('כתובת', e.target.value)} maxLength={200} autoComplete="street-address" className={field} style={{ borderColor: C.border }} /></Label>
            <Label text="עיר *"><input value={form.עיר} onChange={e => set('עיר', e.target.value)} maxLength={80} autoComplete="address-level2" className={field} style={{ borderColor: C.border }} /></Label>
            <Label text="שם המקבל/ת (אם זה לא אתם)"><input value={form.שם_מקבל} onChange={e => set('שם_מקבל', e.target.value)} maxLength={80} className={field} style={{ borderColor: C.border }} /></Label>
            <Label text="טלפון המקבל/ת"><input type="tel" dir="ltr" value={form.טלפון_מקבל} onChange={e => set('טלפון_מקבל', e.target.value)} maxLength={30} className={field} style={{ borderColor: C.border, textAlign: 'right' }} /></Label>
            <p className="text-xs" style={{ color: C.soft }}>דמי המשלוח ייקבעו לפי הכתובת ויאושרו מולכם.</p>
          </>
        )}
        <Label text="ברכה לכרטיס (לא חובה)"><textarea value={form.ברכה} onChange={e => set('ברכה', e.target.value)} maxLength={300} rows={2} className="mt-1 w-full rounded-xl p-3 text-base border" style={{ borderColor: C.border }} /></Label>
        <Label text="הערות (לא חובה)"><textarea value={form.הערות} onChange={e => set('הערות', e.target.value)} maxLength={1000} rows={3} className="mt-1 w-full rounded-xl p-3 text-base border" style={{ borderColor: C.border }} /></Label>
      </Card>

      <div className="rounded-2xl p-4 space-y-3 sticky bottom-3" style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, boxShadow: '0 4px 18px rgba(58,38,24,0.10)' }}>
        <div className="flex items-baseline justify-between">
          <span className="text-sm" style={{ color: C.soft }}>סה״כ משוער (כולל מע״מ)</span>
          <span className="text-xl font-bold tabular-nums" style={{ color: C.head }}>{formatCurrency(total)}</span>
        </div>
        {error && <p className="text-sm rounded-lg px-3 py-2" style={{ backgroundColor: C.redBg, color: C.red }} role="alert">{error}</p>}
        <button type="submit" disabled={sending} className="w-full h-12 rounded-xl text-base font-semibold text-white disabled:opacity-60" style={{ backgroundColor: C.brand }}>
          {sending ? 'שולח…' : 'שליחת בקשת הזמנה'}
        </button>
        <p className="text-xs text-center" style={{ color: C.soft }}>זו בקשה בלבד. ההזמנה והמחיר הסופי יאושרו מולכם לפני תשלום.</p>
      </div>
    </form>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl p-4 space-y-3" style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}>
      <h2 className="text-base font-semibold" style={{ color: C.head }}>{title}</h2>
      {children}
    </section>
  );
}

function GroupTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold pt-1" style={{ color: C.brand }}>{children}</h3>;
}

function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return <label className="block text-sm" style={{ color: C.text }}>{text}{children}</label>;
}

function ItemRow({ name, price, qty, onChange, note, notePlaceholder, onNote }: {
  name: string; price: number; qty: number; onChange: (d: number) => void;
  note: string; notePlaceholder: string; onNote: (v: string) => void;
}) {
  return (
    <div className="py-2 border-b last:border-b-0" style={{ borderColor: '#F0EAE0' }}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium" style={{ color: C.text }}>{name}</div>
          <div className="text-xs tabular-nums" style={{ color: C.soft }}>{formatCurrency(price)}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button type="button" onClick={() => onChange(-1)} disabled={qty === 0} aria-label={`פחות ${name}`}
            className="h-11 w-11 rounded-xl border inline-flex items-center justify-center disabled:opacity-30" style={{ borderColor: C.border, color: C.brand }}>
            <Minus size={16} />
          </button>
          <span className="w-8 text-center tabular-nums font-semibold" style={{ color: C.text }} aria-live="polite">{qty}</span>
          <button type="button" onClick={() => onChange(1)} aria-label={`עוד ${name}`}
            className="h-11 w-11 rounded-xl border inline-flex items-center justify-center" style={{ borderColor: C.border, color: C.brand }}>
            <Plus size={16} />
          </button>
        </div>
      </div>
      {qty > 0 && (
        <input value={note} onChange={e => onNote(e.target.value)} placeholder={notePlaceholder} maxLength={200}
          className="mt-2 w-full h-10 rounded-lg px-3 text-sm border" style={{ borderColor: C.border }} />
      )}
    </div>
  );
}
