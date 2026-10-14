'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Link2, FileCheck2, XCircle, Undo2, MessageCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { formatCurrency } from '@/lib/utils';
import { waLink } from '@/lib/whatsapp';
import { REQUEST_STATUS_STYLE } from '@/lib/order-form';
import type { QuoteLine } from '@/lib/quotes';
import { C } from '../../finance/components/shared';

interface OrderRequest {
  id: string;
  סטטוס: 'חדשה' | 'הומרה להזמנה' | 'נדחתה';
  שם_מלא: string;
  טלפון: string;
  אימייל: string | null;
  פריטים: QuoteLine[];
  סכום_משוער: number | string;
  סוג_אספקה: 'משלוח' | 'איסוף עצמי';
  תאריך_אספקה: string | null;
  שם_מקבל: string | null;
  טלפון_מקבל: string | null;
  כתובת: string | null;
  עיר: string | null;
  ברכה: string | null;
  הערות: string | null;
  הזמנה_id: string | null;
  תאריך_יצירה: string;
}

const fmt = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const localPhone = (p: string | null) => (p ? `0${p.replace(/^972/, '')}` : '');

export default function RequestsTab({ onNewCount }: { onNewCount: (n: number) => void }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [requests, setRequests] = useState<OrderRequest[]>([]);
  const [formToken, setFormToken] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'חדשה' | 'all'>('חדשה');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/order-requests');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'שגיאה בטעינת הבקשות');
      setRequests(json.data as OrderRequest[]);
      setFormToken(json.formToken ?? null);
      setHint(json.tableReady === false ? json.hint : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בטעינת הבקשות');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch('/api/me').then(r => (r.ok ? r.json() : null)).then(j => setRole(j?.role ?? null)).catch(() => setRole(null));
  }, []);

  const newCount = useMemo(() => requests.filter(r => r.סטטוס === 'חדשה').length, [requests]);
  useEffect(() => { onNewCount(newCount); }, [newCount, onNewCount]);

  const shown = filter === 'all' ? requests : requests.filter(r => r.סטטוס === 'חדשה');
  const formUrl = formToken ? `${typeof window === 'undefined' ? '' : window.location.origin}/order-form/${formToken}` : null;

  const linkAction = async (action: 'open' | 'regenerate' | 'close') => {
    if (action === 'regenerate' && !(await confirm('ליצור קישור חדש? הקישור הקודם יפסיק לעבוד, וכל מי שקיבל אותו יצטרך את החדש.', { title: 'קישור חדש לטופס', confirmLabel: 'יצירת קישור חדש' }))) return;
    if (action === 'close' && !(await confirm('לסגור את הטופס? מי שינסה לפתוח את הקישור יראה שהטופס סגור.', { title: 'סגירת הטופס', confirmLabel: 'סגירה' }))) return;
    setBusy('link');
    try {
      const res = await fetch('/api/order-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'הפעולה נכשלה');
      setFormToken(json.formToken ?? null);
      toast.success(action === 'close' ? 'הטופס נסגר' : 'הטופס פתוח. אפשר להעתיק את הקישור.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'הפעולה נכשלה');
    } finally {
      setBusy(null);
    }
  };

  const copyFormLink = async () => {
    if (!formUrl) return;
    try { await navigator.clipboard.writeText(formUrl); toast.success('הקישור לטופס הועתק'); } catch { toast.error('ההעתקה נכשלה'); }
  };

  const convert = async (r: OrderRequest) => {
    if (!(await confirm(`לאשר את הבקשה של ${r.שם_מלא}? תיפתח טיוטת הזמנה (הלקוח יימצא לפי הטלפון, או ייווצר לקוח חדש). שם אפשר לבדוק מחירים, לבחור פטיפורים ולסיים.`, { title: 'אישור בקשה', confirmLabel: 'פתיחת טיוטת הזמנה' }))) return;
    setBusy(r.id);
    try {
      const res = await fetch(`/api/order-requests/${r.id}/convert`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'יצירת ההזמנה נכשלה');
      if (json.customerCreated) toast.success('נוצר לקוח חדש');
      router.push(`/orders/new?draft=${json.orderId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'יצירת ההזמנה נכשלה');
      setBusy(null);
    }
  };

  const setStatus = async (r: OrderRequest, action: 'reject' | 'reopen') => {
    if (action === 'reject' && !(await confirm(`לדחות את הבקשה של ${r.שם_מלא}?`, { title: 'דחיית בקשה', confirmLabel: 'דחייה' }))) return;
    setBusy(r.id);
    try {
      const res = await fetch(`/api/order-requests/${r.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'הפעולה נכשלה');
      setRequests(list => list.map(x => (x.id === r.id ? (json.data as OrderRequest) : x)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'הפעולה נכשלה');
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <div className="flex justify-center py-16"><LoadingSpinner /></div>;
  if (error) return <div className="rounded-xl p-4 text-sm" style={{ backgroundColor: C.redBg, color: C.red }}>{error}</div>;
  if (hint) return <div className="rounded-xl p-4 text-sm" style={{ backgroundColor: C.amberBg, color: C.amber }}>{hint}</div>;

  const isAdmin = role === 'admin';

  return (
    <div className="space-y-4">
      {/* Form link */}
      <section className="rounded-2xl bg-white p-4 space-y-2" style={{ border: `1px solid ${C.border}` }}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold" style={{ color: C.text }}>טופס הזמנה ללקוחות</h2>
          <span className="text-[11px] px-2 py-0.5 rounded-full" style={formToken ? { backgroundColor: C.greenBg, color: C.green } : { backgroundColor: C.totalBg, color: C.sub }}>
            {formToken ? 'פתוח' : 'סגור'}
          </span>
        </div>
        <p className="text-xs leading-relaxed" style={{ color: C.sub }}>
          קישור שאפשר לשלוח ללקוחות, או לשים באינסטגרם ובוואטסאפ. הלקוח בוחר מוצרים ותאריך, והבקשה מגיעה לכאן (ובמייל) לאישור.
          שום הזמנה לא נוצרת לפני שמאשרים.
        </p>
        {formUrl && (
          <div className="flex flex-wrap items-center gap-2">
            <code className="text-xs rounded-lg px-2 py-1.5 break-all" style={{ backgroundColor: C.soft, color: C.text }} dir="ltr">{formUrl}</code>
            <Button size="sm" variant="outline" onClick={copyFormLink}><Link2 size={14} />העתקה</Button>
            <a href={formUrl} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs underline" style={{ color: C.brand }}><ExternalLink size={13} />תצוגה</a>
          </div>
        )}
        {isAdmin ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {!formToken && <Button size="sm" onClick={() => linkAction('open')} loading={busy === 'link'}>פתיחת הטופס</Button>}
            {formToken && <Button size="sm" variant="ghost" onClick={() => linkAction('regenerate')} disabled={busy === 'link'}>קישור חדש</Button>}
            {formToken && <Button size="sm" variant="ghost" onClick={() => linkAction('close')} disabled={busy === 'link'}>סגירת הטופס</Button>}
          </div>
        ) : !formToken && (
          <p className="text-xs" style={{ color: C.sub }}>רק המנהלת יכולה לפתוח את הטופס.</p>
        )}
      </section>

      <div className="flex gap-2">
        {([['חדשה', `חדשות${newCount ? ` · ${newCount}` : ''}`], ['all', 'הכול']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)} className="h-9 px-3 rounded-full text-xs font-medium"
            style={filter === k ? { backgroundColor: C.brand, color: '#fff' } : { backgroundColor: C.totalBg, color: C.brand }}>
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-2xl bg-white" style={{ border: `1px solid ${C.border}` }}>
          <EmptyState title={filter === 'חדשה' ? 'אין בקשות חדשות' : 'עדיין לא הגיעו בקשות'} description="בקשות שלקוחות שולחים מהטופס יופיעו כאן." />
        </div>
      ) : (
        <ul className="space-y-2.5">
          {shown.map(r => {
            const st = REQUEST_STATUS_STYLE[r.סטטוס];
            const wa = waLink(r.טלפון, `שלום ${r.שם_מלא.split(' ')[0]}, קיבלנו את בקשת ההזמנה שלך ל-${fmt(r.תאריך_אספקה)}. `);
            return (
              <li key={r.id} className="rounded-2xl bg-white p-4" style={{ border: `1px solid ${r.סטטוס === 'חדשה' ? C.gold : C.border}` }}>
                <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm" style={{ color: C.text }}>{r.שם_מלא}</span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: st.bg, color: st.fg }}>{r.סטטוס}</span>
                      <span className="text-xs tabular-nums" style={{ color: C.sub }} dir="ltr">{localPhone(r.טלפון)}</span>
                    </div>
                    <p className="text-xs mt-1" style={{ color: C.sub }}>
                      נשלחה {fmt(r.תאריך_יצירה)} · {r.סוג_אספקה} ל-<b style={{ color: C.text }}>{fmt(r.תאריך_אספקה)}</b>
                      {r.סוג_אספקה === 'משלוח' && r.כתובת ? ` · ${r.כתובת}${r.עיר ? `, ${r.עיר}` : ''}` : ''}
                    </p>
                  </div>
                  <div className="text-left">
                    <div className="text-lg font-bold tabular-nums" style={{ color: C.brand }}>{formatCurrency(Number(r.סכום_משוער) || 0)}</div>
                    <div className="text-[11px]" style={{ color: C.sub }}>משוער, לפני משלוח</div>
                  </div>
                </div>
                <ul className="mt-2 text-sm space-y-0.5" style={{ color: C.text }}>
                  {r.פריטים.map((l, i) => <li key={i}>{l.שם} ×{l.כמות}{l.הערה ? <span className="text-xs" style={{ color: C.sub }}> · {l.הערה}</span> : null}</li>)}
                </ul>
                {(r.שם_מקבל || r.ברכה || r.הערות) && (
                  <div className="mt-2 text-xs space-y-0.5" style={{ color: C.sub }}>
                    {r.שם_מקבל && <p>מקבל/ת: {r.שם_מקבל}{r.טלפון_מקבל ? ` · ${localPhone(r.טלפון_מקבל)}` : ''}</p>}
                    {r.ברכה && <p>ברכה: {r.ברכה}</p>}
                    {r.הערות && <p className="whitespace-pre-line">הערות: {r.הערות}</p>}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {r.סטטוס === 'חדשה' && (
                    <>
                      <Button size="sm" onClick={() => convert(r)} disabled={busy === r.id}><FileCheck2 size={14} />אישור ופתיחת הזמנה</Button>
                      {wa && <Button size="sm" variant="outline" onClick={() => window.open(wa, '_blank', 'noopener')}><MessageCircle size={14} />וואטסאפ ללקוח</Button>}
                      <Button size="sm" variant="ghost" onClick={() => setStatus(r, 'reject')} disabled={busy === r.id}><XCircle size={14} />דחייה</Button>
                    </>
                  )}
                  {r.סטטוס === 'הומרה להזמנה' && r.הזמנה_id && (
                    <Button size="sm" variant="outline" onClick={() => router.push(`/orders/${r.הזמנה_id}`)}>לפתיחת ההזמנה</Button>
                  )}
                  {r.סטטוס === 'נדחתה' && (
                    <Button size="sm" variant="ghost" onClick={() => setStatus(r, 'reopen')} disabled={busy === r.id}><Undo2 size={14} />החזרה לטיפול</Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
