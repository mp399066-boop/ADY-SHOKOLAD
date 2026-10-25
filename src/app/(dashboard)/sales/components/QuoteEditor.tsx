'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Trash2, Plus } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import { productSearchText } from '@/lib/normalize';
import { formatCurrency } from '@/lib/utils';
import { resolvePriceListEntry } from '@/lib/order-pricing';
import { computeQuoteTotals, lineTotal, quoteIsPreVat, type Quote, type QuoteLine } from '@/lib/quotes';
import type { SalesCatalog } from '@/lib/quotes-server';
import { C } from '../../finance/components/shared';

type Customer = NonNullable<Quote['לקוחות']>;

const inputCls = 'h-10 w-full rounded-lg border px-2.5 text-sm bg-white focus:outline-none focus:border-[#C9A46A]';
const addDaysISO = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
};

/** Default unit price for a product by customer type: business list → retail list → base price. */
function defaultPrice(catalog: SalesCatalog, productId: string, customerType: string | null | undefined, qty: number): number {
  const p = catalog.products.find(x => x.id === productId);
  const type = customerType === 'עסקי - כמות' ? 'business_quantity'
    : customerType === 'עסקי' || customerType === 'עסקי - קבוע' ? 'business_fixed' : 'retail';
  const entry = resolvePriceListEntry(catalog.priceList, productId, type, qty)
    ?? resolvePriceListEntry(catalog.priceList, productId, 'retail', qty);
  return entry?.מחיר ?? p?.basePrice ?? 0;
}

export default function QuoteEditor({ quote, onClose, onSaved }: {
  quote: Quote | null;
  onClose: () => void;
  onSaved: (q: Quote) => void;
}) {
  const [catalog, setCatalog] = useState<SalesCatalog | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(quote?.לקוחות ?? null);
  const [lines, setLines] = useState<QuoteLine[]>(quote?.פריטים ?? []);
  const [discountType, setDiscountType] = useState<Quote['סוג_הנחה']>(quote?.סוג_הנחה ?? 'ללא');
  const [discountValue, setDiscountValue] = useState(quote?.ערך_הנחה ?? 0);
  const [shipping, setShipping] = useState(quote?.דמי_משלוח ?? 0);
  const [validUntil, setValidUntil] = useState(quote ? quote.תוקף_עד ?? '' : addDaysISO(14));
  const [deliveryDate, setDeliveryDate] = useState(quote?.תאריך_אספקה_מבוקש ?? '');
  const [notes, setNotes] = useState(quote?.הערות_ללקוח ?? '');
  const [internal, setInternal] = useState(quote?.הערות_פנימיות ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/quotes/catalog')
      .then(r => r.json().then(j => (r.ok ? j : Promise.reject(new Error(j.error)))))
      .then(j => setCatalog(j as SalesCatalog))
      .catch(() => toast.error('טעינת המוצרים נכשלה'));
  }, []);

  const totals = useMemo(() => computeQuoteTotals(lines, discountType, discountValue, shipping), [lines, discountType, discountValue, shipping]);
  const preVat = quoteIsPreVat(customer?.סוג_לקוח, customer?.פטור_ממעמ);

  const productOptions = useMemo(() => (catalog?.products ?? [])
    .filter(p => !p.businessOnly || quoteIsPreVat(customer?.סוג_לקוח, false))
    .map(p => ({
      value: p.id, label: p.name, searchText: productSearchText(p.name, p.sku),
      hint: [p.sku, formatCurrency(defaultPrice(catalog!, p.id, customer?.סוג_לקוח, 1))].filter(Boolean).join(' · '),
    })),
  [catalog, customer?.סוג_לקוח]);

  const update = (i: number, patch: Partial<QuoteLine>) => setLines(ls => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const addProduct = (id: string) => {
    if (!catalog || !id) return;
    const p = catalog.products.find(x => x.id === id);
    if (!p) return;
    setLines(ls => [...ls, { סוג: 'מוצר', מוצר_id: p.id, גודל_מארז: null, שם: p.name, כמות: 1, מחיר_ליחידה: defaultPrice(catalog, p.id, customer?.סוג_לקוח, 1), הערה: null }]);
  };
  const addPackage = (id: string) => {
    const p = catalog?.packages.find(x => x.id === id);
    if (!p) return;
    setLines(ls => [...ls, { סוג: 'מארז', מוצר_id: null, גודל_מארז: p.size, שם: p.name || `מארז ${p.size} יח׳`, כמות: 1, מחיר_ליחידה: p.price, הערה: null }]);
  };
  const addCustom = () => setLines(ls => [...ls, { סוג: 'ידני', מוצר_id: null, גודל_מארז: null, שם: '', כמות: 1, מחיר_ליחידה: 0, הערה: null }]);

  const save = async () => {
    if (!customer) { toast.error('יש לבחור לקוח'); return; }
    if (lines.length === 0) { toast.error('יש להוסיף לפחות פריט אחד'); return; }
    setSaving(true);
    try {
      const body = {
        לקוח_id: customer.id,
        פריטים: lines,
        סוג_הנחה: discountType,
        ערך_הנחה: discountType === 'ללא' ? 0 : discountValue,
        דמי_משלוח: shipping,
        תוקף_עד: validUntil || null,
        תאריך_אספקה_מבוקש: deliveryDate || null,
        הערות_ללקוח: notes,
        הערות_פנימיות: internal,
      };
      const res = await fetch(quote ? `/api/quotes/${quote.id}` : '/api/quotes', {
        method: quote ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'השמירה נכשלה');
      toast.success(quote ? 'ההצעה עודכנה' : 'ההצעה נשמרה. אפשר לשלוח אותה ללקוח.');
      onSaved(json.data as Quote);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'השמירה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={quote ? `עריכת הצעה ${quote.מספר_הצעה}` : 'הצעת מחיר חדשה'} size="xl">
      <div className="space-y-5">
        <CustomerPicker value={customer} onChange={setCustomer} />

        {/* Lines */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold" style={{ color: C.text }}>פריטים</h3>
          {lines.length === 0 && <p className="text-xs" style={{ color: C.sub }}>עדיין אין פריטים. אפשר להוסיף מוצר, מארז או פריט חופשי.</p>}
          <ul className="space-y-2">
            {lines.map((l, i) => (
              <li key={i} className="rounded-xl p-3 grid grid-cols-2 sm:grid-cols-12 gap-2 items-end" style={{ backgroundColor: C.soft, border: `1px solid ${C.border}` }}>
                <div className="col-span-2 sm:col-span-5">
                  <span className="text-[11px]" style={{ color: C.sub }}>{l.סוג === 'מוצר' ? 'מוצר' : l.סוג === 'מארז' ? 'מארז (הפטיפורים ייבחרו בהזמנה)' : 'פריט חופשי'}</span>
                  {l.סוג === 'ידני' ? (
                    <input value={l.שם} onChange={e => update(i, { שם: e.target.value })} placeholder="שם הפריט" maxLength={200} className={inputCls} style={{ borderColor: C.border }} />
                  ) : (
                    <div className="h-10 flex items-center text-sm font-medium" style={{ color: C.text }}>{l.שם}</div>
                  )}
                </div>
                <label className="sm:col-span-2 text-[11px]" style={{ color: C.sub }}>כמות
                  <input type="number" min={1} value={l.כמות} onChange={e => update(i, { כמות: Number(e.target.value) })} className={inputCls} style={{ borderColor: C.border }} />
                </label>
                <label className="sm:col-span-2 text-[11px]" style={{ color: C.sub }}>מחיר ליחידה
                  <input type="number" min={0} step={0.5} value={l.מחיר_ליחידה} onChange={e => update(i, { מחיר_ליחידה: Number(e.target.value) })} className={inputCls} style={{ borderColor: C.border }} />
                </label>
                <div className="sm:col-span-2 text-sm tabular-nums font-semibold h-10 flex items-center" style={{ color: C.text }}>{formatCurrency(lineTotal(l))}</div>
                <button onClick={() => setLines(ls => ls.filter((_, idx) => idx !== i))} aria-label="הסרת הפריט"
                  className="sm:col-span-1 h-10 w-10 inline-flex items-center justify-center rounded-lg hover:bg-white justify-self-end" style={{ color: C.red }}>
                  <Trash2 size={16} />
                </button>
                <input value={l.הערה ?? ''} onChange={e => update(i, { הערה: e.target.value || null })} placeholder="הערה לפריט (לא חובה)" maxLength={500}
                  className={`${inputCls} col-span-2 sm:col-span-12`} style={{ borderColor: C.border }} />
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Combobox value="" onChange={addProduct} options={productOptions} placeholder={catalog ? '+ הוספת מוצר' : 'טוען מוצרים…'} disabled={!catalog} />
            <select value="" onChange={e => addPackage(e.target.value)} disabled={!catalog} aria-label="הוספת מארז"
              className={inputCls} style={{ borderColor: C.border, color: C.text }}>
              <option value="">+ הוספת מארז</option>
              {(catalog?.packages ?? []).map(p => <option key={p.id} value={p.id}>{p.name || `מארז ${p.size} יח׳`} · {formatCurrency(p.price)}</option>)}
            </select>
            <Button variant="outline" onClick={addCustom}><Plus size={15} />פריט חופשי</Button>
          </div>
        </section>

        {/* Terms */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <label className="text-xs" style={{ color: C.sub }}>הנחה
            <select value={discountType} onChange={e => setDiscountType(e.target.value as Quote['סוג_הנחה'])} className={inputCls} style={{ borderColor: C.border }}>
              <option value="ללא">ללא</option><option value="אחוז">אחוזים</option><option value="סכום">סכום</option>
            </select>
          </label>
          <label className="text-xs" style={{ color: C.sub }}>{discountType === 'אחוז' ? 'אחוז הנחה' : 'סכום הנחה'}
            <input type="number" min={0} value={discountValue} disabled={discountType === 'ללא'} onChange={e => setDiscountValue(Number(e.target.value))} className={inputCls} style={{ borderColor: C.border }} />
          </label>
          <label className="text-xs" style={{ color: C.sub }}>דמי משלוח
            <input type="number" min={0} value={shipping} onChange={e => setShipping(Number(e.target.value))} className={inputCls} style={{ borderColor: C.border }} />
          </label>
          <label className="text-xs" style={{ color: C.sub }}>בתוקף עד
            <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} className={inputCls} style={{ borderColor: C.border }} />
          </label>
          <label className="text-xs col-span-2 sm:col-span-1" style={{ color: C.sub }}>תאריך אספקה מבוקש
            <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} className={inputCls} style={{ borderColor: C.border }} />
          </label>
          <label className="text-xs col-span-2 sm:col-span-3" style={{ color: C.sub }}>הערה ללקוח (תופיע בהצעה)
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} maxLength={2000} className="w-full rounded-lg border p-2.5 text-sm" style={{ borderColor: C.border }} />
          </label>
          <label className="text-xs col-span-2 sm:col-span-4" style={{ color: C.sub }}>הערה פנימית (רק במערכת)
            <input value={internal} onChange={e => setInternal(e.target.value)} maxLength={2000} className={inputCls} style={{ borderColor: C.border }} />
          </label>
        </section>

        {/* Totals + save */}
        <div className="rounded-xl p-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm" style={{ backgroundColor: C.totalBg }}>
          <span style={{ color: C.sub }}>ביניים: <b className="tabular-nums" style={{ color: C.text }}>{formatCurrency(totals.subtotal)}</b></span>
          {totals.discount > 0 && <span style={{ color: C.green }}>הנחה: −{formatCurrency(totals.discount)}</span>}
          <span className="text-base" style={{ color: C.brand }}>סה״כ: <b className="tabular-nums">{formatCurrency(totals.total)}</b> {customer ? (preVat ? 'לפני מע״מ' : 'כולל מע״מ') : ''}</span>
          <div className="mr-auto flex gap-2">
            <Button variant="ghost" onClick={onClose}>ביטול</Button>
            <Button onClick={save} loading={saving}>{quote ? 'שמירת שינויים' : 'שמירת ההצעה'}</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function CustomerPicker({ value, onChange }: { value: Customer | null; onChange: (c: Customer | null) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    // Commas/parentheses would break the API's search filter — drop them.
    const term = q.replace(/[,()]/g, ' ').trim();
    if (term.length < 2) { setResults([]); return; }
    const t = setTimeout(() => {
      setSearching(true);
      fetch(`/api/customers?search=${encodeURIComponent(term)}&limit=12`)
        .then(r => r.json())
        .then(j => setResults((j.data ?? []) as Customer[]))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  if (value) {
    return (
      <div className="rounded-xl p-3 flex items-center gap-3" style={{ border: `1px solid ${C.border}` }}>
        <div className="min-w-0">
          <div className="text-sm font-semibold" style={{ color: C.text }}>{`${value.שם_פרטי} ${value.שם_משפחה}`.trim()}</div>
          <div className="text-xs" style={{ color: C.sub }}>{value.סוג_לקוח}{value.טלפון ? ` · ${value.טלפון}` : ''}</div>
        </div>
        <Button size="sm" variant="ghost" className="mr-auto" onClick={() => onChange(null)}>החלפת לקוח</Button>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-semibold" style={{ color: C.text }} htmlFor="quote-customer">לקוח</label>
      <input id="quote-customer" value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש לפי שם, טלפון או מייל…" autoFocus
        className={inputCls} style={{ borderColor: C.border }} />
      {searching && <p className="text-xs" style={{ color: C.sub }}>מחפש…</p>}
      {results.length > 0 && (
        <ul className="rounded-xl overflow-hidden divide-y" style={{ border: `1px solid ${C.border}` }}>
          {results.map(c => (
            <li key={c.id}>
              <button onClick={() => onChange(c)} className="w-full text-right px-3 py-2.5 hover:bg-[#FAF7F0] text-sm" style={{ color: C.text }}>
                {`${c.שם_פרטי} ${c.שם_משפחה}`.trim()} <span className="text-xs" style={{ color: C.sub }}>· {c.סוג_לקוח}{c.טלפון ? ` · ${c.טלפון}` : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && !searching && results.length === 0 && (
        <p className="text-xs" style={{ color: C.sub }}>לא נמצא לקוח. אפשר להוסיף לקוח חדש בעמוד <a href="/customers/new" target="_blank" className="underline">לקוחות</a> ולחזור לכאן.</p>
      )}
    </div>
  );
}
