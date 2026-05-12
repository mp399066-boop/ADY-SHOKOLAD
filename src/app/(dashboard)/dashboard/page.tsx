'use client';

// Dashboard = "מרכז עבודה יומי". Default mode is 'work' (action-first cards
// for the kitchen tablet); 'management' adds a top KPI strip above the same
// action area for desktop oversight. Both modes use the same writes — every
// status change goes through PATCH /api/orders/[id] or PATCH /api/deliveries/[id]
// so all server-side side effects (stock deduction on 'בהכנה', Morning receipt
// on 'שולם', Morning tax invoice on 'הושלמה בהצלחה', WhatsApp courier ping on
// delivery 'נאסף') keep firing exactly as they do from the order detail page.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { PageLoading } from '@/components/ui/LoadingSpinner';
import { StatusBadge, UrgentBadge } from '@/components/ui/StatusBadge';
import { Modal } from '@/components/ui/Modal';
import { formatCurrency } from '@/lib/utils';
import type { DashboardStats, Order } from '@/types/database';

// ─── Types ────────────────────────────────────────────────────────────────

type OrderStatus = 'חדשה' | 'בהכנה' | 'מוכנה למשלוח' | 'נשלחה' | 'הושלמה בהצלחה' | 'בוטלה' | 'טיוטה';

type TodayOrder = Order & {
  לקוחות?: { שם_פרטי: string; שם_משפחה: string };
  סוג_אספקה?: string;
  שעת_אספקה?: string | null;
  הערות_להזמנה?: string | null;
  אופן_תשלום?: string | null;
  שם_מקבל?: string | null;
  טלפון_מקבל?: string | null;
};

type Delivery = {
  id: string;
  הזמנה_id: string;
  סטטוס_משלוח: string;
  כתובת: string | null;
  עיר: string | null;
  שעת_משלוח: string | null;
  הזמנות?: {
    id: string;
    מספר_הזמנה: string;
    שם_מקבל: string | null;
    טלפון_מקבל: string | null;
    לקוחות?: { שם_פרטי: string; שם_משפחה: string } | null;
  } | null;
  שליחים?: { שם_שליח: string } | null;
  _noRecord?: boolean;
};

type StockRow = { id: string; שם: string; status: string; quantity: number };

type Mode = 'work' | 'management';
type Filter = 'all' | 'urgent' | 'preparation' | 'unpaid' | 'pickup' | 'delivery';

const PAYMENT_METHODS = [
  'מזומן',
  'כרטיס אשראי',
  'העברה בנקאית',
  'bit',
  'PayBox',
  'PayPal',
  'אחר',
] as const;

const STOCK_ALERT_STATES = ['מלאי נמוך', 'קריטי', 'אזל מהמלאי'];

// ─── Tiny inline icon set (kept from the previous dashboard for visual continuity) ─
function Icon({ name, className = 'w-4 h-4' }: { name: string; className?: string }) {
  const props = {
    className,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    viewBox: '0 0 24 24',
    'aria-hidden': true,
  };
  switch (name) {
    case 'truck':    return <svg {...props}><path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>;
    case 'bag':      return <svg {...props}><path d="M5 8h14l-1 12H6z"/><path d="M9 8a3 3 0 0 1 6 0"/></svg>;
    case 'clock':    return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
    case 'wallet':   return <svg {...props}><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9H5a2 2 0 0 1 0-4h13"/><circle cx="17" cy="13" r="1"/></svg>;
    case 'check':    return <svg {...props}><path d="m5 13 4 4 10-10"/></svg>;
    case 'box':      return <svg {...props}><path d="m3 7 9-4 9 4-9 4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/></svg>;
    case 'plus':     return <svg {...props}><path d="M12 5v14M5 12h14"/></svg>;
    case 'arrow':    return <svg {...props}><path d="m15 6-6 6 6 6"/></svg>;
    case 'flame':    return <svg {...props}><path d="M12 3c1 4 5 5 5 10a5 5 0 1 1-10 0c0-2 1-3 2-4-1 3 1 4 2 4 0-3-1-6 1-10z"/></svg>;
    case 'phone':    return <svg {...props}><path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 2.08 4.18 2 2 0 0 1 4.07 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>;
    case 'mapPin':   return <svg {...props}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>;
    case 'note':     return <svg {...props}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></svg>;
    case 'play':     return <svg {...props}><path d="M5 3v18l15-9z"/></svg>;
    default:         return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function todayIsraelISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

function timeKey(t?: string | null): number {
  if (!t) return 24 * 60 + 1;
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// Decide the next forward action for an order. Returns null when nothing forward
// remains (cancelled / draft / completed / shipped is treated as "let the user
// confirm completion manually").
function nextOrderAction(o: TodayOrder): { label: string; newStatus: OrderStatus; confirmText?: string } | null {
  const status = o.סטטוס_הזמנה as OrderStatus;
  const isPickup = (o.סוג_אספקה ?? '') === 'איסוף עצמי';
  switch (status) {
    case 'חדשה':
      return {
        label: 'התחילי הכנה',
        newStatus: 'בהכנה',
        confirmText: 'מעבר ל"בהכנה" יוריד מלאי לפי הלוגיקה הקיימת. להמשיך?',
      };
    case 'בהכנה':
      return {
        label: isPickup ? 'סמני מוכנה לאיסוף' : 'סמני מוכנה למשלוח',
        newStatus: 'מוכנה למשלוח',
      };
    case 'מוכנה למשלוח':
      if (isPickup) {
        return {
          label: 'סמני הושלמה',
          newStatus: 'הושלמה בהצלחה',
          confirmText: 'סימון כ"הושלמה בהצלחה" עשוי להפיק חשבונית מס לפי הלוגיקה הקיימת. להמשיך?',
        };
      }
      return { label: 'סמני נשלחה', newStatus: 'נשלחה' };
    case 'נשלחה':
      return {
        label: 'סמני הושלמה',
        newStatus: 'הושלמה בהצלחה',
        confirmText: 'סימון כ"הושלמה בהצלחה" עשוי להפיק חשבונית מס לפי הלוגיקה הקיימת. להמשיך?',
      };
    default:
      return null;
  }
}

function nextDeliveryAction(d: Delivery): { label: string; newStatus: 'נאסף' | 'נמסר' } | null {
  switch (d.סטטוס_משלוח) {
    case 'ממתין': return { label: 'סמן נאסף', newStatus: 'נאסף' };
    case 'נאסף':  return { label: 'סמן נמסר', newStatus: 'נמסר' };
    default:      return null;
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>('work');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [todayOrders, setTodayOrders] = useState<TodayOrder[]>([]);
  const [todayDeliveries, setTodayDeliveries] = useState<Delivery[]>([]);
  const [stock, setStock] = useState<{ raw: StockRow[]; products: StockRow[]; petitFours: StockRow[] }>({
    raw: [], products: [], petitFours: [],
  });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');

  // Per-row write spinner ID
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Modal state
  const [confirmAction, setConfirmAction] = useState<{
    text: string; cta: string; onConfirm: () => Promise<void> | void;
  } | null>(null);
  const [markPaidOrder, setMarkPaidOrder] = useState<TodayOrder | null>(null);

  // In-flight write counter — auto-refresh skips ticks while > 0 so optimistic
  // updates aren't clobbered by a stale GET response.
  const inflightRef = useRef(0);

  // Persist mode in localStorage so the same browser/tablet keeps its preference.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem('dashboard-mode');
    if (saved === 'work' || saved === 'management') setMode(saved);
  }, []);
  useEffect(() => {
    try { window.localStorage.setItem('dashboard-mode', mode); } catch { /* no-op */ }
  }, [mode]);

  // ─── Data fetching ──────────────────────────────────────────────────────

  const fetchAll = useCallback(async (silent: boolean) => {
    if (silent && inflightRef.current > 0) return; // a write is mid-flight — skip
    if (!silent) setLoading(true);
    try {
      const today = todayIsraelISO();
      const [dash, ordersRes, deliveriesRes, rawRes, prodsRes, pfRes] = await Promise.all([
        fetch('/api/dashboard').then(r => r.json()),
        fetch('/api/orders?filter=today&limit=100').then(r => r.json()),
        fetch(`/api/deliveries?date=${today}`).then(r => r.json()),
        fetch('/api/inventory').then(r => r.json()),
        fetch('/api/products?active=true').then(r => r.json()),
        fetch('/api/petit-four-types').then(r => r.json()),
      ]);

      if (dash?.data) setStats(dash.data);
      setTodayOrders((ordersRes?.data || []) as TodayOrder[]);
      setTodayDeliveries((deliveriesRes?.data || []) as Delivery[]);

      type RawRow = Record<string, unknown>;
      const filterAlerts = (rows: RawRow[], nameKey: string): StockRow[] =>
        (rows || [])
          .filter(r => STOCK_ALERT_STATES.includes(String(r['סטטוס_מלאי'] ?? '')))
          .map(r => ({
            id: String(r.id),
            שם: String(r[nameKey] ?? ''),
            status: String(r['סטטוס_מלאי'] ?? ''),
            quantity: Number(r['כמות_במלאי'] ?? 0),
          }));

      setStock({
        raw:        filterAlerts((rawRes?.data || []) as RawRow[],   'שם_חומר_גלם'),
        products:   filterAlerts((prodsRes?.data || []) as RawRow[], 'שם_מוצר'),
        petitFours: filterAlerts((pfRes?.data || []) as RawRow[],    'שם_פטיפור'),
      });
    } catch (err) {
      if (!silent) {
        console.error('[dashboard] fetch failed:', err);
        toast.error('שגיאה בטעינת הדשבורד');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(false); }, [fetchAll]);

  // Auto-refresh every 45s, but only when no write is in progress. The interval
  // itself is harmless to leave running; the in-flight check inside fetchAll
  // turns it into a no-op while a PATCH is mid-flight.
  useEffect(() => {
    const t = window.setInterval(() => fetchAll(true), 45_000);
    return () => window.clearInterval(t);
  }, [fetchAll]);

  // ─── Mutations — go through the same APIs the detail pages use ──────────

  const patchOrder = useCallback(async (
    id: string,
    patch: Record<string, unknown>,
    rollback: Partial<TodayOrder>,
  ): Promise<boolean> => {
    setUpdatingId(id);
    inflightRef.current++;
    setTodayOrders(curr => curr.map(o => o.id === id ? ({ ...o, ...patch } as TodayOrder) : o));
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTodayOrders(curr => curr.map(o => o.id === id ? ({ ...o, ...rollback } as TodayOrder) : o));
        toast.error(json.error || 'שגיאה בעדכון ההזמנה');
        return false;
      }
      toast.success('עודכן');
      return true;
    } catch {
      setTodayOrders(curr => curr.map(o => o.id === id ? ({ ...o, ...rollback } as TodayOrder) : o));
      toast.error('שגיאה ברשת');
      return false;
    } finally {
      setUpdatingId(null);
      inflightRef.current = Math.max(0, inflightRef.current - 1);
    }
  }, []);

  const patchDelivery = useCallback(async (id: string, newStatus: 'נאסף' | 'נמסר', prevStatus: string) => {
    setUpdatingId(id);
    inflightRef.current++;
    setTodayDeliveries(curr => curr.map(d => d.id === id ? { ...d, סטטוס_משלוח: newStatus } : d));
    try {
      const res = await fetch(`/api/deliveries/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ סטטוס_משלוח: newStatus }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTodayDeliveries(curr => curr.map(d => d.id === id ? { ...d, סטטוס_משלוח: prevStatus } : d));
        toast.error(json.error || 'שגיאה בעדכון משלוח');
        return;
      }
      // The /deliveries PATCH may have auto-created a real delivery row out of a
      // synthetic 'no-record-{orderId}' id. Replace the local row with the real one
      // so the next click uses the persisted id.
      if (json.was_created && json.data) {
        setTodayDeliveries(curr => curr.map(d => d.id === id ? ({ ...d, ...json.data, _noRecord: false } as Delivery) : d));
      }
      // נאסף may also return a WhatsApp URL when a courier is attached. Open it
      // exactly like /deliveries does.
      if (newStatus === 'נאסף' && json.whatsapp_url) {
        const win = window.open(json.whatsapp_url, '_blank');
        if (!win || win.closed) toast('הדפדפן חסם — פתח וואטסאפ ידנית', { icon: '⚠️' });
        else toast.success('וואטסאפ נפתח לשליח');
      } else if (newStatus === 'נאסף' && json.send_error) {
        toast.error(json.send_error);
      } else {
        toast.success('עודכן');
      }
    } catch {
      setTodayDeliveries(curr => curr.map(d => d.id === id ? { ...d, סטטוס_משלוח: prevStatus } : d));
      toast.error('שגיאה ברשת');
    } finally {
      setUpdatingId(null);
      inflightRef.current = Math.max(0, inflightRef.current - 1);
    }
  }, []);

  // ─── Click flow for the primary order action ────────────────────────────

  const onPrimaryOrderAction = (o: TodayOrder) => {
    const action = nextOrderAction(o);
    if (!action) return;
    const exec = () => patchOrder(
      o.id,
      { סטטוס_הזמנה: action.newStatus },
      { סטטוס_הזמנה: o.סטטוס_הזמנה },
    );
    if (action.confirmText) {
      setConfirmAction({
        text: action.confirmText,
        cta: action.label,
        onConfirm: async () => { await exec(); setConfirmAction(null); },
      });
    } else {
      void exec();
    }
  };

  // ─── Filtered + sorted list of cards to render ──────────────────────────

  const visibleOrders = useMemo(() => {
    const live = todayOrders.filter(o => o.סטטוס_הזמנה !== 'בוטלה' && o.סטטוס_הזמנה !== 'טיוטה');
    let f = live;
    if (filter === 'urgent') f = live.filter(o => o.הזמנה_דחופה);
    else if (filter === 'preparation') f = live.filter(o => o.סטטוס_הזמנה === 'בהכנה');
    else if (filter === 'unpaid') f = live.filter(o => o.סטטוס_תשלום !== 'שולם' && o.סטטוס_תשלום !== 'בארטר');
    else if (filter === 'pickup') f = live.filter(o => o.סוג_אספקה === 'איסוף עצמי');
    else if (filter === 'delivery') f = live.filter(o => o.סוג_אספקה === 'משלוח');
    return [...f].sort((a, b) => timeKey(a.שעת_אספקה) - timeKey(b.שעת_אספקה));
  }, [todayOrders, filter]);

  const filterCounts = useMemo(() => {
    const live = todayOrders.filter(o => o.סטטוס_הזמנה !== 'בוטלה' && o.סטטוס_הזמנה !== 'טיוטה');
    return {
      all:         live.length,
      urgent:      live.filter(o => o.הזמנה_דחופה).length,
      preparation: live.filter(o => o.סטטוס_הזמנה === 'בהכנה').length,
      unpaid:      live.filter(o => o.סטטוס_תשלום !== 'שולם' && o.סטטוס_תשלום !== 'בארטר').length,
      pickup:      live.filter(o => o.סוג_אספקה === 'איסוף עצמי').length,
      delivery:    live.filter(o => o.סוג_אספקה === 'משלוח').length,
    };
  }, [todayOrders]);

  const stockTotal = stock.raw.length + stock.products.length + stock.petitFours.length;
  const dateStr = new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
  const greeting = (() => {
    const h = parseInt(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Jerusalem' }), 10);
    if (h < 11) return 'בוקר טוב';
    if (h < 17) return 'צהריים טובים';
    if (h < 21) return 'ערב טוב';
    return 'לילה טוב';
  })();

  if (loading) return <PageLoading />;

  return (
    <div dir="rtl" className="space-y-5 max-w-7xl pb-10">

      {/* ════════ HEADER ════════ */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold leading-tight" style={{ color: '#2B1A10' }}>
            {greeting}, מה צריך לבצע היום?
          </h1>
          <p className="text-xs mt-1" style={{ color: '#9B7A5A' }}>{dateStr}</p>
        </div>
        <div className="flex items-center gap-2">
          <ModeToggle mode={mode} onChange={setMode} />
          <Link
            href="/orders/new"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-xl transition-colors"
            style={{ backgroundColor: '#8B5E34', color: '#FFFFFF', minHeight: 44 }}
          >
            <Icon name="plus" className="w-4 h-4" /> הזמנה חדשה
          </Link>
        </div>
      </header>

      {/* ════════ MANAGEMENT MODE: TOP KPI STRIP ════════ */}
      {mode === 'management' && stats && (
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard icon="bag"    label="הזמנות היום"       value={String(stats.ordersToday)}                  accent="#8B5E34" />
          <KpiCard icon="wallet" label="הכנסה צפויה היום"  value={formatCurrency(visibleOrdersRevenue(todayOrders))} accent="#0F766E" tint="#ECFDF5" />
          <KpiCard icon="clock"  label="ממתין לתשלום"      value={formatCurrency(stats.unpaidAmount)}         accent={stats.unpaidOrders > 0 ? '#B45309' : '#9B7A5A'} tint={stats.unpaidOrders > 0 ? '#FFFBEB' : undefined} />
          <KpiCard icon="truck"  label="משלוחים היום"      value={String(stats.deliveriesToday)}              accent="#0369A1" tint="#F0F9FF" />
        </section>
      )}

      {/* ════════ FILTER CHIPS ════════ */}
      <section>
        <div className="flex flex-wrap gap-2">
          <FilterChip label="הכל"        count={filterCounts.all}         active={filter === 'all'}         onClick={() => setFilter('all')} />
          <FilterChip label="דחופות"     count={filterCounts.urgent}      active={filter === 'urgent'}      onClick={() => setFilter('urgent')}      tone="red" />
          <FilterChip label="בהכנה"      count={filterCounts.preparation} active={filter === 'preparation'} onClick={() => setFilter('preparation')} tone="amber" />
          <FilterChip label="לא שולמו"   count={filterCounts.unpaid}      active={filter === 'unpaid'}      onClick={() => setFilter('unpaid')}      tone="amber" />
          <FilterChip label="איסוף"      count={filterCounts.pickup}      active={filter === 'pickup'}      onClick={() => setFilter('pickup')} />
          <FilterChip label="משלוח"      count={filterCounts.delivery}    active={filter === 'delivery'}    onClick={() => setFilter('delivery')} />
        </div>
      </section>

      {/* ════════ TODAY ORDERS — ACTION CARDS ════════ */}
      <section>
        <SectionTitle title="הזמנות היום" subtitle={`${visibleOrders.length} מתוך ${filterCounts.all}`} href="/orders?filter=today" />
        {visibleOrders.length === 0 ? (
          <EmptyBlock icon="check" text={filter === 'all' ? 'אין הזמנות פעילות להיום' : 'אין התאמות לסינון הנוכחי'} />
        ) : (
          <div className={`grid grid-cols-1 ${mode === 'work' ? 'xl:grid-cols-2' : 'lg:grid-cols-2'} gap-3`}>
            {visibleOrders.map(o => (
              <OrderActionCard
                key={o.id}
                order={o}
                updating={updatingId === o.id}
                onPrimary={() => onPrimaryOrderAction(o)}
                onMarkPaid={() => setMarkPaidOrder(o)}
                onOpen={() => router.push(`/orders/${o.id}`)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ════════ DELIVERIES TODAY ════════ */}
      <section>
        <SectionTitle title="משלוחים היום" subtitle={`${todayDeliveries.length} משלוחים`} href="/deliveries" />
        {todayDeliveries.length === 0 ? (
          <EmptyBlock icon="truck" text="אין משלוחים מתוכננים להיום" />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {todayDeliveries.map(d => (
              <DeliveryActionCard
                key={d.id}
                delivery={d}
                updating={updatingId === d.id}
                onPrimary={(next) => patchDelivery(d.id, next, d.סטטוס_משלוח)}
                onOpen={() => d.הזמנות?.id && router.push(`/orders/${d.הזמנות.id}`)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ════════ STOCK ATTENTION ════════ */}
      <section>
        <SectionTitle
          title="מלאי דורש טיפול"
          subtitle={stockTotal === 0 ? 'הכל תקין' : `${stockTotal} פריטים`}
          href="/inventory"
        />
        {stockTotal === 0 ? (
          <EmptyBlock icon="check" text="כל המלאי בטווח התקין" />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <StockGroup title="חומרי גלם"      icon="box"   items={stock.raw} />
            <StockGroup title="מוצרים מוכנים" icon="bag"   items={stock.products} />
            <StockGroup title="פטיפורים"      icon="flame" items={stock.petitFours} />
          </div>
        )}
      </section>

      {/* ════════ Modals ════════ */}
      {confirmAction && (
        <ConfirmActionModal
          title="אישור פעולה"
          text={confirmAction.text}
          ctaLabel={confirmAction.cta}
          loading={!!updatingId}
          onConfirm={confirmAction.onConfirm}
          onClose={() => setConfirmAction(null)}
        />
      )}

      {markPaidOrder && (
        <MarkPaidModal
          order={markPaidOrder}
          loading={!!updatingId}
          onClose={() => setMarkPaidOrder(null)}
          onConfirm={async (method) => {
            const o = markPaidOrder;
            const ok = await patchOrder(
              o.id,
              { סטטוס_תשלום: 'שולם', אופן_תשלום: method },
              { סטטוס_תשלום: o.סטטוס_תשלום, אופן_תשלום: o.אופן_תשלום ?? null },
            );
            if (ok) setMarkPaidOrder(null);
          }}
        />
      )}
    </div>
  );
}

// Sum the same set of orders that the cards render — used by the management
// KPI strip so the headline matches what's on screen.
function visibleOrdersRevenue(orders: TodayOrder[]): number {
  return orders
    .filter(o => o.סטטוס_הזמנה !== 'בוטלה' && o.סטטוס_הזמנה !== 'טיוטה')
    .reduce((s, o) => s + (o.סך_הכל_לתשלום || 0), 0);
}

// ─── Sub-components ───────────────────────────────────────────────────────

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const opt = (val: Mode, label: string) => {
    const active = mode === val;
    return (
      <button
        key={val}
        onClick={() => onChange(val)}
        className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
        style={{
          backgroundColor: active ? '#FFFFFF' : 'transparent',
          color: active ? '#2B1A10' : '#6B4A2D',
          boxShadow: active ? '0 1px 3px rgba(58,42,26,0.10)' : undefined,
        }}
      >
        {label}
      </button>
    );
  };
  return (
    <div
      className="inline-flex p-1 rounded-xl"
      style={{ backgroundColor: '#F5EDE3', border: '1px solid #EAE0D4' }}
      role="group"
      aria-label="מצב תצוגה"
    >
      {opt('work', 'תצוגת עבודה')}
      {opt('management', 'תצוגת ניהול')}
    </div>
  );
}

function FilterChip({
  label, count, active, onClick, tone,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  tone?: 'red' | 'amber';
}) {
  const activeBg = tone === 'red' ? '#991B1B' : tone === 'amber' ? '#92400E' : '#8B5E34';
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-colors border"
      style={{
        backgroundColor: active ? activeBg : '#FFFFFF',
        color: active ? '#FFFFFF' : '#3A2A1A',
        borderColor: active ? activeBg : '#EAE0D4',
        minHeight: 40,
      }}
    >
      <span>{label}</span>
      <span
        className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums"
        style={{
          backgroundColor: active ? 'rgba(255,255,255,0.2)' : '#FAF5E9',
          color: active ? '#FFFFFF' : '#8B5E34',
        }}
      >
        {count}
      </span>
    </button>
  );
}

function SectionTitle({ title, subtitle, href }: { title: string; subtitle?: string; href?: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-baseline gap-2">
        <h2 className="text-base font-semibold" style={{ color: '#2B1A10' }}>{title}</h2>
        {subtitle && <span className="text-xs" style={{ color: '#9B7A5A' }}>{subtitle}</span>}
      </div>
      {href && (
        <Link href={href} className="text-xs hover:underline flex items-center gap-1" style={{ color: '#8B5E34' }}>
          פתח רשימה מלאה <Icon name="arrow" className="w-3 h-3 rtl-flip" />
        </Link>
      )}
    </div>
  );
}

function EmptyBlock({ icon, text }: { icon: string; text: string }) {
  return (
    <div
      className="flex items-center justify-center gap-2.5 px-4 py-10 rounded-2xl"
      style={{ backgroundColor: '#FFFFFF', border: '1px dashed #EAE0D4' }}
    >
      <span className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: '#FAF5E9', color: '#9B7A5A' }}>
        <Icon name={icon} className="w-4 h-4" />
      </span>
      <span className="text-sm" style={{ color: '#9B7A5A' }}>{text}</span>
    </div>
  );
}

// ─── OrderActionCard ──────────────────────────────────────────────────────

function OrderActionCard({
  order, updating, onPrimary, onMarkPaid, onOpen,
}: {
  order: TodayOrder;
  updating: boolean;
  onPrimary: () => void;
  onMarkPaid: () => void;
  onOpen: () => void;
}) {
  const c = order.לקוחות;
  const customerName = c ? `${c.שם_פרטי} ${c.שם_משפחה}` : (order.שם_מקבל || 'לקוח');
  const isDelivery = (order.סוג_אספקה ?? '') === 'משלוח';
  const action = nextOrderAction(order);
  const paid = order.סטטוס_תשלום === 'שולם' || order.סטטוס_תשלום === 'בארטר';
  const note = (order.הערות_להזמנה ?? '').trim();

  return (
    <div
      className="rounded-2xl bg-white p-4 sm:p-5"
      style={{ border: '1px solid #EAE0D4', boxShadow: '0 1px 0 rgba(255,255,255,0.6)' }}
    >
      {/* Top row — order number + urgent badge + delivery icon + open button */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold" style={{ color: '#8B5E34' }}>
              {order.מספר_הזמנה}
            </span>
            {order.הזמנה_דחופה && <UrgentBadge />}
          </div>
          <p className="text-base font-semibold mt-0.5 truncate" style={{ color: '#2B1A10' }}>
            {customerName}
          </p>
        </div>
        <button
          onClick={onOpen}
          className="text-xs px-2.5 py-1 rounded-lg transition-colors"
          style={{ backgroundColor: '#FAF5E9', color: '#8B5E34', minHeight: 32 }}
          aria-label="פתח כרטיס"
        >
          פרטים
        </button>
      </div>

      {/* Meta row — time, delivery type, amount */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs mb-2.5" style={{ color: '#6B4A2D' }}>
        <span className="inline-flex items-center gap-1">
          <Icon name="clock" className="w-3.5 h-3.5" />
          <span className="tabular-nums">{order.שעת_אספקה || '—'}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <Icon name={isDelivery ? 'truck' : 'box'} className="w-3.5 h-3.5" />
          {isDelivery ? 'משלוח' : 'איסוף'}
        </span>
        <span className="inline-flex items-center gap-1 font-semibold tabular-nums" style={{ color: '#2B1A10' }}>
          {formatCurrency(order.סך_הכל_לתשלום)}
        </span>
      </div>

      {/* Status badges */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <StatusBadge status={order.סטטוס_הזמנה} type="order" />
        <StatusBadge status={order.סטטוס_תשלום} type="payment" />
      </div>

      {/* Optional note */}
      {note && (
        <div
          className="flex items-start gap-1.5 px-3 py-2 rounded-lg mb-3 text-xs"
          style={{ backgroundColor: '#FFFBEB', color: '#92400E' }}
        >
          <Icon name="note" className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span className="line-clamp-2">{note}</span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row gap-2">
        {action ? (
          <PrimaryButton
            onClick={onPrimary}
            loading={updating}
            icon="play"
            label={action.label}
          />
        ) : (
          <DisabledNote text="בוצעו כל השלבים" />
        )}

        {!paid && (
          <PrimaryButton
            onClick={onMarkPaid}
            loading={updating}
            icon="wallet"
            label="סמני שולם"
            tone="green"
          />
        )}
      </div>
    </div>
  );
}

function PrimaryButton({
  onClick, loading, label, icon, tone,
}: {
  onClick: () => void;
  loading: boolean;
  label: string;
  icon: string;
  tone?: 'green';
}) {
  const bg = tone === 'green' ? '#0F766E' : '#8B5E34';
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="inline-flex items-center justify-center gap-2 flex-1 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-60"
      style={{ backgroundColor: bg, minHeight: 44, padding: '0 16px' }}
    >
      <Icon name={icon} className="w-4 h-4" />
      <span>{loading ? '...' : label}</span>
    </button>
  );
}

function DisabledNote({ text }: { text: string }) {
  return (
    <div
      className="inline-flex items-center justify-center gap-2 flex-1 rounded-xl text-sm"
      style={{ backgroundColor: '#F5F1EB', color: '#9B7A5A', minHeight: 44, padding: '0 16px' }}
    >
      <Icon name="check" className="w-4 h-4" />
      <span>{text}</span>
    </div>
  );
}

// ─── DeliveryActionCard ───────────────────────────────────────────────────

function DeliveryActionCard({
  delivery, updating, onPrimary, onOpen,
}: {
  delivery: Delivery;
  updating: boolean;
  onPrimary: (newStatus: 'נאסף' | 'נמסר') => void;
  onOpen: () => void;
}) {
  const o = delivery.הזמנות;
  const c = o?.לקוחות;
  const recipient = o?.שם_מקבל || (c ? `${c.שם_פרטי} ${c.שם_משפחה}` : 'לקוח');
  const phone = o?.טלפון_מקבל;
  const addr = [delivery.כתובת, delivery.עיר].filter(Boolean).join(', ');
  const action = nextDeliveryAction(delivery);
  const courier = delivery.שליחים?.שם_שליח;

  return (
    <div
      className="rounded-2xl bg-white p-4 sm:p-5"
      style={{ border: '1px solid #EAE0D4' }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          {o?.מספר_הזמנה && (
            <span className="font-mono text-xs font-semibold" style={{ color: '#0369A1' }}>
              {o.מספר_הזמנה}
            </span>
          )}
          <p className="text-base font-semibold mt-0.5 truncate" style={{ color: '#2B1A10' }}>
            {recipient}
          </p>
        </div>
        <button
          onClick={onOpen}
          className="text-xs px-2.5 py-1 rounded-lg transition-colors"
          style={{ backgroundColor: '#F0F9FF', color: '#0369A1', minHeight: 32 }}
        >
          פרטים
        </button>
      </div>

      <div className="space-y-1.5 mb-3 text-xs" style={{ color: '#6B4A2D' }}>
        {addr && (
          <div className="flex items-start gap-1.5">
            <Icon name="mapPin" className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span className="break-words">{addr}</span>
          </div>
        )}
        {phone && (
          <div className="flex items-center gap-1.5">
            <Icon name="phone" className="w-3.5 h-3.5" />
            <a href={`tel:${phone}`} className="hover:underline tabular-nums" style={{ color: '#0369A1' }}>{phone}</a>
          </div>
        )}
        {delivery.שעת_משלוח && (
          <div className="flex items-center gap-1.5">
            <Icon name="clock" className="w-3.5 h-3.5" />
            <span className="tabular-nums">{delivery.שעת_משלוח}</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <StatusBadge status={delivery.סטטוס_משלוח} type="delivery" />
        {courier && (
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: '#F5EDE3', color: '#6B4A2D' }}>
            שליח: {courier}
          </span>
        )}
      </div>

      {action ? (
        <PrimaryButton
          onClick={() => onPrimary(action.newStatus)}
          loading={updating}
          icon={action.newStatus === 'נמסר' ? 'check' : 'truck'}
          label={action.label}
        />
      ) : (
        <DisabledNote text="המשלוח נמסר" />
      )}
    </div>
  );
}

// ─── StockGroup ───────────────────────────────────────────────────────────

function StockGroup({ title, icon, items }: { title: string; icon: string; items: StockRow[] }) {
  const top = items.slice(0, 3);
  const tone = (s: string) =>
    s === 'אזל מהמלאי' ? { bg: '#FEF2F2', text: '#991B1B' }
    : s === 'קריטי'     ? { bg: '#FFFBEB', text: '#92400E' }
    :                     { bg: '#FBF5EA', text: '#8B5E34' };
  return (
    <div className="rounded-2xl bg-white p-4" style={{ border: '1px solid #EAE0D4' }}>
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#FAF5E9', color: '#8B5E34' }}>
            <Icon name={icon} className="w-3.5 h-3.5" />
          </span>
          <span className="text-sm font-semibold" style={{ color: '#2B1A10' }}>{title}</span>
        </div>
        <span className="text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full" style={{ backgroundColor: items.length > 0 ? '#FEF2F2' : '#F5F1EB', color: items.length > 0 ? '#991B1B' : '#9B7A5A' }}>
          {items.length}
        </span>
      </div>
      {top.length === 0 ? (
        <p className="text-xs py-2" style={{ color: '#9B7A5A' }}>הכל תקין</p>
      ) : (
        <ul className="space-y-1.5">
          {top.map(it => {
            const t = tone(it.status);
            return (
              <li key={it.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg" style={{ backgroundColor: t.bg }}>
                <span className="text-xs font-medium truncate" style={{ color: t.text }}>{it.שם}</span>
                <span className="text-[11px] font-semibold tabular-nums flex-shrink-0" style={{ color: t.text }}>
                  {it.quantity} · {it.status}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <Link href="/inventory" className="text-[11px] mt-2.5 inline-flex items-center gap-1 hover:underline" style={{ color: '#8B5E34' }}>
        פתח מלאי מלא <Icon name="arrow" className="w-3 h-3 rtl-flip" />
      </Link>
    </div>
  );
}

// ─── ConfirmActionModal ───────────────────────────────────────────────────
// Warm-toned confirm (not the red destructive ConfirmModal). Used for the two
// status transitions that have business side effects: "התחילי הכנה" (deducts
// stock) and "הושלמה בהצלחה" (creates Morning tax invoice).

function ConfirmActionModal({
  title, text, ctaLabel, loading, onConfirm, onClose,
}: {
  title: string;
  text: string;
  ctaLabel: string;
  loading: boolean;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}) {
  return (
    <Modal open onClose={onClose} title={title} size="sm">
      <p className="text-sm mb-6" style={{ color: '#6B4A2D' }}>{text}</p>
      <div className="flex gap-3 justify-end">
        <button
          onClick={onClose}
          disabled={loading}
          className="px-4 py-2.5 text-sm font-medium rounded-xl border transition-colors disabled:opacity-50"
          style={{ borderColor: '#D8CCBA', color: '#6B4A2D', minHeight: 44 }}
        >
          ביטול
        </button>
        <button
          onClick={() => void onConfirm()}
          disabled={loading}
          className="px-5 py-2.5 text-sm font-semibold rounded-xl text-white transition-colors disabled:opacity-50"
          style={{ backgroundColor: '#8B5E34', minHeight: 44 }}
        >
          {loading ? '...' : ctaLabel}
        </button>
      </div>
    </Modal>
  );
}

// ─── MarkPaidModal ────────────────────────────────────────────────────────
// Confirm + payment-method picker. Sends סטטוס_תשלום='שולם' and אופן_תשלום
// in the same PATCH so by the time the existing receipt-trigger fires inside
// PATCH /api/orders/[id], אופן_תשלום is already saved — Morning gets the right
// payment method (no need to update separately).

function MarkPaidModal({
  order, loading, onConfirm, onClose,
}: {
  order: TodayOrder;
  loading: boolean;
  onConfirm: (method: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const initial = (order.אופן_תשלום ?? '').trim();
  const [method, setMethod] = useState<string>(
    initial && (PAYMENT_METHODS as readonly string[]).includes(initial) ? initial : 'מזומן',
  );
  const c = order.לקוחות;
  const name = c ? `${c.שם_פרטי} ${c.שם_משפחה}` : (order.שם_מקבל || 'לקוח');

  return (
    <Modal open onClose={onClose} title="סימון כשולם" size="sm">
      <div className="text-sm mb-2" style={{ color: '#3A2A1A' }}>
        <span className="font-semibold">{name}</span>
        <span className="mx-2" style={{ color: '#9B7A5A' }}>·</span>
        <span className="font-mono text-xs">{order.מספר_הזמנה}</span>
      </div>
      <p className="text-sm mb-4" style={{ color: '#6B4A2D' }}>
        סימון כ&quot;שולם&quot; עשוי להפיק קבלה לפי הלוגיקה הקיימת.
        בחרי את אמצעי התשלום שיופיע על הקבלה:
      </p>

      <div className="grid grid-cols-2 gap-2 mb-5">
        {PAYMENT_METHODS.map(m => {
          const active = method === m;
          return (
            <button
              key={m}
              onClick={() => setMethod(m)}
              className="text-sm font-medium rounded-xl transition-colors border"
              style={{
                backgroundColor: active ? '#8B5E34' : '#FFFFFF',
                color: active ? '#FFFFFF' : '#3A2A1A',
                borderColor: active ? '#8B5E34' : '#EAE0D4',
                minHeight: 44,
              }}
            >
              {m}
            </button>
          );
        })}
      </div>

      <div className="flex gap-3 justify-end">
        <button
          onClick={onClose}
          disabled={loading}
          className="px-4 py-2.5 text-sm font-medium rounded-xl border transition-colors disabled:opacity-50"
          style={{ borderColor: '#D8CCBA', color: '#6B4A2D', minHeight: 44 }}
        >
          ביטול
        </button>
        <button
          onClick={() => void onConfirm(method)}
          disabled={loading || !method}
          className="px-5 py-2.5 text-sm font-semibold rounded-xl text-white transition-colors disabled:opacity-50"
          style={{ backgroundColor: '#0F766E', minHeight: 44 }}
        >
          {loading ? '...' : 'אישור — סמני שולם'}
        </button>
      </div>
    </Modal>
  );
}

// ─── KpiCard (management mode only) ───────────────────────────────────────

function KpiCard({
  icon, label, value, accent, tint,
}: {
  icon: string;
  label: string;
  value: string;
  accent: string;
  tint?: string;
}) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{ backgroundColor: tint ?? '#FFFFFF', border: '1px solid #EAE0D4' }}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] uppercase tracking-wider font-medium" style={{ color: '#9B7A5A' }}>{label}</p>
        <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${accent}1A`, color: accent }}>
          <Icon name={icon} className="w-3.5 h-3.5" />
        </span>
      </div>
      <p className="text-2xl sm:text-3xl font-semibold tabular-nums leading-none" style={{ color: '#2B1A10' }}>
        {value}
      </p>
    </div>
  );
}
