'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { MessageCircle, Check, CalendarDays } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { formatCurrency } from '@/lib/utils';
import { waLink, fillTemplate } from '@/lib/whatsapp';
import { C } from '../../finance/components/shared';

interface Item { key: string; label: string; group: 'product' | 'package' | 'petit_four' | 'custom'; last: number; current: number }
interface WinBack { customerId: string; name: string; phone: string | null; customerType: string; orders: number; total: number; lastDate: string | null; items: string[]; contactedAt: string | null }
interface Side { orders: number; customers: number; revenue: number | null }
interface HolidayData {
  holiday: { key: string; label: string; current: string; previous: string };
  holidays: { key: string; label: string; date: string }[];
  days: number;
  today: string;
  windows: { last: { from: string; to: string }; current: { from: string; to: string } };
  summary: { last: Side; current: Side };
  items: Item[];
  winBack: WinBack[];
  contactSubject: string;
}

const GROUP_LABEL: Record<Item['group'], string> = { package: 'מארזים', product: 'מוצרים', petit_four: 'פטיפורים (בתוך המארזים)', custom: 'פריטים ידניים' };
const fmt = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');
const daysUntil = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
const TEMPLATE_KEY = 'sales.winback.template';

function defaultTemplate(holiday: string) {
  return `היי {שם}, כאן עדי מעדי תכשיט שוקולד 🍫\nבשנה שעברה הזמנת אצלנו ל${holiday}, ורצינו לעדכן שאנחנו כבר מקבלים הזמנות לחג הקרוב.\nאשמח לעזור לבחור — אפשר לענות כאן להודעה.`;
}

export default function HolidaysTab() {
  const [holiday, setHoliday] = useState<string>('');
  const [days, setDays] = useState(21);
  const [growth, setGrowth] = useState(0);
  const [data, setData] = useState<HolidayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [template, setTemplate] = useState('');
  const [hideContacted, setHideContacted] = useState(false);
  const [sending, setSending] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ days: String(days), ...(holiday ? { holiday } : {}) });
      const res = await fetch(`/api/sales/holidays?${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'שגיאה בטעינת הנתונים');
      setData(json as HolidayData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בטעינת הנתונים');
    } finally {
      setLoading(false);
    }
  }, [holiday, days]);

  useEffect(() => { load(); }, [load]);

  // The message template is remembered per holiday on this device.
  const label = data?.holiday.label ?? '';
  useEffect(() => {
    if (!label) return;
    let saved: string | null = null;
    try { saved = localStorage.getItem(`${TEMPLATE_KEY}.${label}`); } catch { /* storage blocked */ }
    setTemplate(saved || defaultTemplate(label));
  }, [label]);
  const saveTemplate = (v: string) => {
    setTemplate(v);
    try { localStorage.setItem(`${TEMPLATE_KEY}.${label}`, v); } catch { /* storage blocked */ }
  };

  const forecast = useMemo(() => (data?.items ?? []).map(i => {
    const expected = Math.ceil(i.last * (1 + growth / 100));
    return { ...i, expected, remaining: Math.max(0, expected - i.current) };
  }), [data?.items, growth]);

  const winBack = useMemo(
    () => (data?.winBack ?? []).filter(w => !hideContacted || !w.contactedAt),
    [data?.winBack, hideContacted],
  );

  const sendWhatsApp = async (w: WinBack) => {
    if (!data) return;
    const firstName = w.name.split(' ')[0] ?? '';
    const text = fillTemplate(template, firstName);
    const link = waLink(w.phone, text);
    if (!link) { toast.error('ללקוח הזה אין מספר טלפון תקין'); return; }
    // Open first (a popup must come straight from the click), then log it.
    window.open(link, '_blank', 'noopener');
    setSending(w.customerId);
    try {
      const res = await fetch(`/api/customers/${w.customerId}/communication`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ סוג: 'וואטסאפ', תוכן: text, כיוון: 'יוצא', נושא: data.contactSubject, אל: w.phone, סטטוס: 'נשלח' }),
      });
      if (!res.ok) throw new Error();
      const now = new Date().toISOString();
      setData(d => d && ({ ...d, winBack: d.winBack.map(x => (x.customerId === w.customerId ? { ...x, contactedAt: now } : x)) }));
    } catch {
      toast.error('ההודעה נפתחה בוואטסאפ, אבל הסימון "נשלח" לא נשמר');
    } finally {
      setSending(null);
    }
  };

  const contactedCount = (data?.winBack ?? []).filter(w => w.contactedAt).length;
  const s = data?.summary;

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="rounded-2xl bg-white p-3 sm:p-4 flex flex-wrap items-center gap-2" style={{ border: `1px solid ${C.border}` }}>
        <CalendarDays size={16} style={{ color: C.brand }} />
        <select value={holiday || data?.holiday.key || ''} onChange={e => setHoliday(e.target.value)} aria-label="חג"
          className="h-10 rounded-lg px-2 text-sm border bg-white" style={{ borderColor: C.border, color: C.text }}>
          {(data?.holidays ?? []).map(h => <option key={h.key} value={h.key}>{h.label} · {fmt(h.date)}</option>)}
        </select>
        <select value={days} onChange={e => setDays(Number(e.target.value))} aria-label="כמה ימים לפני החג"
          className="h-10 rounded-lg px-2 text-sm border bg-white" style={{ borderColor: C.border, color: C.text }}>
          {[14, 21, 30, 45].map(d => <option key={d} value={d}>{d} ימים לפני החג</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm" style={{ color: C.sub }}>
          צמיחה צפויה
          <input type="number" value={growth} min={-90} max={300} step={5}
            onChange={e => setGrowth(Math.max(-90, Math.min(300, Number(e.target.value) || 0)))}
            className="h-10 w-20 rounded-lg px-2 text-sm border" style={{ borderColor: C.border, color: C.text }} />
          %
        </label>
      </div>

      {error ? (
        <div className="rounded-xl p-4 text-sm" style={{ backgroundColor: C.redBg, color: C.red }}>{error}</div>
      ) : loading || !data || !s ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : (
        <>
          <p className="text-sm" style={{ color: C.sub }}>
            {data.holiday.label} השנה: <b style={{ color: C.text }}>{fmt(data.holiday.current)}</b>
            {data.holiday.current >= data.today ? ` (בעוד ${daysUntil(data.today, data.holiday.current)} ימים)` : ''}.
            ההשוואה היא לאספקות בין {fmt(data.windows.last.from)} ל-{fmt(data.windows.last.to)} בשנה שעברה,
            מול {fmt(data.windows.current.from)}–{fmt(data.windows.current.to)} השנה.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SideCard title={`שנה שעברה · ${fmt(data.holiday.previous)}`} side={s.last} />
            <SideCard title="השנה — הוזמן עד עכשיו" side={s.current} progress={s.last.orders ? Math.round((s.current.orders / s.last.orders) * 100) : null} />
          </div>

          {/* Forecast */}
          <section className="rounded-2xl bg-white overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
            <div className="px-4 py-3" style={{ borderBottom: `1px solid ${C.border}` }}>
              <h2 className="font-semibold text-sm" style={{ color: C.text }}>מה להכין</h2>
              <p className="text-xs mt-0.5" style={{ color: C.sub }}>
                כמה נמכר בשנה שעברה{growth ? ` (+${growth}%)` : ''}, כמה כבר הוזמן השנה, וכמה עוד צפוי.
              </p>
            </div>
            {forecast.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm" style={{ color: C.sub }}>לא היו הזמנות בתקופה הזו בשנה שעברה.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: C.choc, color: '#FBF0E4' }}>
                      <th className="px-4 py-2.5 text-right font-semibold text-xs">פריט</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-xs">שנה שעברה</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-xs">הוזמן השנה</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-xs">עוד צפוי</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecast.map((i, idx) => (
                      <FragmentRow key={i.key} showGroup={idx === 0 || forecast[idx - 1].group !== i.group} groupLabel={GROUP_LABEL[i.group]}>
                        <td className="px-4 py-2" style={{ color: C.text }}>{i.label}</td>
                        <td className="px-3 py-2 tabular-nums" style={{ color: C.sub }}>{i.expected}{growth ? <span className="text-[11px]"> ({i.last})</span> : null}</td>
                        <td className="px-3 py-2 tabular-nums" style={{ color: C.text }}>{i.current}</td>
                        <td className="px-3 py-2 tabular-nums font-semibold" style={{ color: i.remaining ? C.brand : C.green }}>
                          {i.remaining || <Check size={14} />}
                        </td>
                      </FragmentRow>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Win back */}
          <section className="rounded-2xl bg-white" style={{ border: `1px solid ${C.border}` }}>
            <div className="px-4 py-3 flex flex-wrap items-center gap-2" style={{ borderBottom: `1px solid ${C.border}` }}>
              <div className="min-w-0">
                <h2 className="font-semibold text-sm" style={{ color: C.text }}>לקוחות לחזרה · {data.winBack.length}</h2>
                <p className="text-xs mt-0.5" style={{ color: C.sub }}>
                  הזמינו ל{data.holiday.label} בשנה שעברה ועדיין לא הזמינו השנה. נשלחה הודעה ל-{contactedCount}.
                </p>
              </div>
              <label className="mr-auto flex items-center gap-1.5 text-xs" style={{ color: C.sub }}>
                <input type="checkbox" checked={hideContacted} onChange={e => setHideContacted(e.target.checked)} />
                הסתרת מי שכבר קיבל הודעה
              </label>
            </div>

            <div className="p-4 space-y-2" style={{ borderBottom: `1px solid ${C.border}` }}>
              <label className="text-xs font-medium" style={{ color: C.sub }} htmlFor="wb-template">
                נוסח ההודעה (<code>{'{שם}'}</code> יוחלף בשם הפרטי)
              </label>
              <textarea id="wb-template" value={template} onChange={e => saveTemplate(e.target.value)} rows={4}
                className="w-full rounded-xl border p-3 text-sm leading-relaxed" style={{ borderColor: C.border, color: C.text }} />
              <button onClick={() => saveTemplate(defaultTemplate(data.holiday.label))} className="text-xs underline" style={{ color: C.sub }}>
                חזרה לנוסח המקורי
              </button>
            </div>

            {winBack.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm" style={{ color: C.sub }}>
                {data.winBack.length ? 'כל הלקוחות כבר קיבלו הודעה.' : 'אין לקוחות לחזרה. כל מי שהזמין בשנה שעברה כבר הזמין השנה, או שלא היו הזמנות.'}
              </p>
            ) : (
              <ul className="divide-y" style={{ borderColor: C.border }}>
                {winBack.map(w => (
                  <li key={w.customerId} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <Link href={`/customers/${w.customerId}`} className="font-medium text-sm hover:underline" style={{ color: C.text }}>{w.name}</Link>
                        <span className="text-xs" style={{ color: C.sub }}>{w.customerType}</span>
                        {w.phone && <span className="text-xs tabular-nums" style={{ color: C.sub }} dir="ltr">{w.phone}</span>}
                      </div>
                      <p className="text-xs mt-0.5 truncate" style={{ color: C.sub }} title={w.items.join(' · ')}>
                        {formatCurrency(w.total)} · {w.orders > 1 ? `${w.orders} הזמנות · ` : ''}{w.items.join(' · ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {w.contactedAt && (
                        <span className="text-[11px] px-2 py-1 rounded-full" style={{ backgroundColor: C.greenBg, color: C.green }}>
                          נשלח {fmt(w.contactedAt.slice(0, 10))}
                        </span>
                      )}
                      <button onClick={() => sendWhatsApp(w)} disabled={!w.phone || sending === w.customerId}
                        className="min-h-[40px] px-3 rounded-lg text-xs font-semibold text-white inline-flex items-center gap-1.5 disabled:opacity-40"
                        style={{ backgroundColor: '#1F8F4E' }} title={w.phone ? undefined : 'אין מספר טלפון'}>
                        <MessageCircle size={14} />
                        {w.contactedAt ? 'שליחה שוב' : 'וואטסאפ'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function SideCard({ title, side, progress }: { title: string; side: Side; progress?: number | null }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3" style={{ border: `1px solid ${C.border}` }}>
      <div className="text-xs" style={{ color: C.sub }}>{title}</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-2xl font-bold tabular-nums" style={{ color: C.text }}>{side.orders} <span className="text-sm font-normal">הזמנות</span></span>
        <span className="text-sm tabular-nums" style={{ color: C.sub }}>{side.customers} לקוחות</span>
        {side.revenue != null && <span className="text-sm tabular-nums" style={{ color: C.sub }}>{formatCurrency(side.revenue)} לפני מע״מ</span>}
      </div>
      {progress != null && (
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: C.totalBg }}>
            <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, progress)}%`, backgroundColor: C.gold }} />
          </div>
          <span className="text-xs tabular-nums" style={{ color: C.sub }}>{progress}% משנה שעברה</span>
        </div>
      )}
    </div>
  );
}

function FragmentRow({ showGroup, groupLabel, children }: { showGroup: boolean; groupLabel: string; children: React.ReactNode }) {
  return (
    <>
      {showGroup && (
        <tr><td colSpan={4} className="px-4 pt-3 pb-1 text-[11px] font-semibold" style={{ color: C.brand, backgroundColor: C.soft }}>{groupLabel}</td></tr>
      )}
      <tr className="border-t" style={{ borderColor: '#F0EAE0' }}>{children}</tr>
    </>
  );
}
