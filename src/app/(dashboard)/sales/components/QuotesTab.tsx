'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Plus, Link2, MessageCircle, FileCheck2, Pencil, Trash2, Undo2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { formatCurrency } from '@/lib/utils';
import { waLink } from '@/lib/whatsapp';
import { QUOTE_STATUS_STYLE, QUOTE_STATUSES, quoteEditable, quoteIsPreVat, type Quote, type QuoteStatus } from '@/lib/quotes';
import { C } from '../../finance/components/shared';
import QuoteEditor from './QuoteEditor';

const fmt = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

export default function QuotesTab() {
  const router = useRouter();
  const confirm = useConfirm();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<QuoteStatus | 'open' | 'all'>('open');
  const [editing, setEditing] = useState<Quote | 'new' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/quotes');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'שגיאה בטעינת ההצעות');
      setQuotes(json.data as Quote[]);
      setHint(json.tableReady === false ? json.hint : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בטעינת ההצעות');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => quotes.filter(q =>
    filter === 'all' ? true : filter === 'open' ? ['טיוטה', 'נשלחה', 'אושרה'].includes(q.סטטוס) : q.סטטוס === filter,
  ), [quotes, filter]);

  const replace = (q: Quote) => setQuotes(list => list.map(x => (x.id === q.id ? q : x)));
  const linkFor = (q: Quote) => `${window.location.origin}/q/${q.טוקן}`;

  const act = async (q: Quote, action: 'mark_sent' | 'reject' | 'reopen', quiet = false) => {
    setBusy(q.id);
    try {
      const res = await fetch(`/api/quotes/${q.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'הפעולה נכשלה');
      replace(json.data as Quote);
      if (!quiet) toast.success(action === 'reject' ? 'ההצעה סומנה כנדחתה' : action === 'reopen' ? 'ההצעה נפתחה מחדש' : 'ההצעה סומנה כנשלחה');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'הפעולה נכשלה');
    } finally {
      setBusy(null);
    }
  };

  const copyLink = async (q: Quote) => {
    try {
      await navigator.clipboard.writeText(linkFor(q));
      toast.success('הקישור הועתק');
    } catch {
      toast.error('ההעתקה נכשלה');
      return;
    }
    if (q.סטטוס === 'טיוטה') act(q, 'mark_sent', true);
  };

  const sendWhatsApp = (q: Quote) => {
    const c = q.לקוחות;
    const preVat = quoteIsPreVat(c?.סוג_לקוח, c?.פטור_ממעמ);
    const text = `שלום ${c?.שם_פרטי ?? ''},\nמצורפת הצעת המחיר שלנו (${formatCurrency(q.סך_הכל)}${preVat ? ' לפני מע״מ' : ''}).\nאפשר לראות את הפרטים ולאשר כאן:\n${linkFor(q)}`;
    const link = waLink(c?.טלפון, text);
    if (!link) { toast.error('ללקוח אין מספר טלפון תקין. אפשר להעתיק את הקישור.'); return; }
    window.open(link, '_blank', 'noopener');
    if (q.סטטוס === 'טיוטה') act(q, 'mark_sent', true);
  };

  const convert = async (q: Quote) => {
    if (!(await confirm(`ליצור טיוטת הזמנה מהצעה ${q.מספר_הצעה}? במסך ההזמנה יהיה אפשר להשלים פרטים, לבחור פטיפורים למארזים ולסיים.`, { title: 'הפיכה להזמנה', confirmLabel: 'יצירת הזמנה' }))) return;
    setBusy(q.id);
    try {
      const res = await fetch(`/api/quotes/${q.id}/convert`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'יצירת ההזמנה נכשלה');
      router.push(`/orders/new?draft=${json.orderId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'יצירת ההזמנה נכשלה');
      setBusy(null);
    }
  };

  const remove = async (q: Quote) => {
    if (!(await confirm(`למחוק את הצעה ${q.מספר_הצעה}? הקישור שנשלח ללקוח יפסיק לעבוד.`, { title: 'מחיקת הצעה', confirmLabel: 'מחיקה' }))) return;
    setBusy(q.id);
    try {
      const res = await fetch(`/api/quotes/${q.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'המחיקה נכשלה');
      setQuotes(list => list.filter(x => x.id !== q.id));
      toast.success('ההצעה נמחקה');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'המחיקה נכשלה');
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <div className="flex justify-center py-16"><LoadingSpinner /></div>;
  if (error) return <div className="rounded-xl p-4 text-sm" style={{ backgroundColor: C.redBg, color: C.red }}>{error}</div>;
  if (hint) return <div className="rounded-xl p-4 text-sm" style={{ backgroundColor: C.amberBg, color: C.amber }}>{hint}</div>;

  const counts = (s: QuoteStatus) => quotes.filter(q => q.סטטוס === s).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {([['open', 'פתוחות'], ...QUOTE_STATUSES.map(s => [s, s]), ['all', 'הכול']] as [string, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k as typeof filter)} className="h-9 px-3 rounded-full text-xs font-medium"
            style={filter === k ? { backgroundColor: C.brand, color: '#fff' } : { backgroundColor: C.totalBg, color: C.brand }}>
            {label}{QUOTE_STATUSES.includes(k as QuoteStatus) && counts(k as QuoteStatus) ? ` · ${counts(k as QuoteStatus)}` : ''}
          </button>
        ))}
        <Button className="mr-auto" onClick={() => setEditing('new')}><Plus size={16} />הצעת מחיר חדשה</Button>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-2xl bg-white" style={{ border: `1px solid ${C.border}` }}>
          <EmptyState title="אין הצעות מחיר כאן" description="הצעה נשלחת ללקוח כקישור. הלקוח מאשר בלחיצה, ואז היא הופכת להזמנה בלחיצה אחת." />
        </div>
      ) : (
        <ul className="space-y-2.5">
          {shown.map(q => {
            const c = q.לקוחות;
            const st = QUOTE_STATUS_STYLE[q.סטטוס];
            const preVat = quoteIsPreVat(c?.סוג_לקוח, c?.פטור_ממעמ);
            const disabled = busy === q.id;
            return (
              <li key={q.id} className="rounded-2xl bg-white p-4" style={{ border: `1px solid ${q.סטטוס === 'אושרה' ? '#BFD6B8' : C.border}` }}>
                <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm" style={{ color: C.text }}>{c ? `${c.שם_פרטי} ${c.שם_משפחה}`.trim() : '—'}</span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: st.bg, color: st.fg }}>{q.סטטוס}</span>
                      <span className="text-xs" style={{ color: C.sub }}>{q.מספר_הצעה}</span>
                    </div>
                    <p className="text-xs mt-1 truncate" style={{ color: C.sub }}>
                      {q.פריטים.map(l => `${l.שם} ×${l.כמות}`).join(' · ')}
                    </p>
                    <p className="text-[11.5px] mt-1" style={{ color: C.sub }}>
                      נוצרה {fmt(q.תאריך_יצירה)}
                      {q.תוקף_עד ? ` · בתוקף עד ${fmt(q.תוקף_עד)}` : ''}
                      {q.תאריך_אישור ? ` · אושרה ${fmt(q.תאריך_אישור)}${q.שם_המאשר ? ` ע״י ${q.שם_המאשר}` : ''}` : ''}
                    </p>
                  </div>
                  <div className="text-left">
                    <div className="text-lg font-bold tabular-nums" style={{ color: C.brand }}>{formatCurrency(q.סך_הכל)}</div>
                    <div className="text-[11px]" style={{ color: C.sub }}>{preVat ? 'לפני מע״מ' : 'כולל מע״מ'}</div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {q.סטטוס === 'הומרה להזמנה' && q.הזמנה_id ? (
                    <Button size="sm" variant="outline" onClick={() => router.push(`/orders/${q.הזמנה_id}`)}>לפתיחת ההזמנה</Button>
                  ) : (
                    <>
                      <Button size="sm" onClick={() => convert(q)} disabled={disabled || q.סטטוס === 'נדחתה'}>
                        <FileCheck2 size={14} />הפיכה להזמנה
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => sendWhatsApp(q)} disabled={disabled}><MessageCircle size={14} />שליחה בוואטסאפ</Button>
                      <Button size="sm" variant="outline" onClick={() => copyLink(q)} disabled={disabled}><Link2 size={14} />העתקת קישור</Button>
                      {quoteEditable(q.סטטוס) && <Button size="sm" variant="ghost" onClick={() => setEditing(q)} disabled={disabled}><Pencil size={14} />עריכה</Button>}
                      {(q.סטטוס === 'נשלחה' || q.סטטוס === 'טיוטה' || q.סטטוס === 'אושרה') && (
                        <Button size="sm" variant="ghost" onClick={() => act(q, 'reject')} disabled={disabled}><XCircle size={14} />נדחתה</Button>
                      )}
                      {(q.סטטוס === 'נדחתה' || q.סטטוס === 'אושרה') && (
                        <Button size="sm" variant="ghost" onClick={() => act(q, 'reopen')} disabled={disabled}><Undo2 size={14} />פתיחה מחדש</Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => remove(q)} disabled={disabled}><Trash2 size={14} />מחיקה</Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <QuoteEditor
          quote={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={q => {
            setQuotes(list => (list.some(x => x.id === q.id) ? list.map(x => (x.id === q.id ? q : x)) : [q, ...list]));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
