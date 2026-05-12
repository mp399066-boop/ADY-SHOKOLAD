'use client';

// Dashboard = "מרכז עבודה יומי". A two-column CRM-style layout: a primary
// orders column on the right (RTL) and a secondary column on the left holding
// today's deliveries and the stock-attention card. KPI strip on top, mode
// toggle for work/management. Every status change still flows through the
// existing PATCH endpoints (PATCH /api/orders/[id], PATCH /api/deliveries/[id])
// so all server-side hooks (stock movements, Morning receipt/tax-invoice,
// WhatsApp courier ping) keep firing exactly as they do from the detail pages.

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

// Action-verb filter buckets — chips read like the next verb the user has
// to do, not like a database status. The user almost never wants to see
// "all שולח" — they want "what needs to be packed", "what is waiting on
// money". `mark_ready` covers בהכנה (the kitchen still has work). `ready_to_go`
// folds 'מוכנה למשלוח' + 'נשלחה' into one bucket: the order has left the
// kitchen and is waiting to be handed off / completed.
type Filter = 'all' | 'start' | 'mark_ready' | 'ready_to_go' | 'unpaid' | 'urgent';

const PAYMENT_METHODS = [
  'מזומן', 'כרטיס אשראי', 'העברה בנקאית', 'bit', 'PayBox', 'PayPal', 'אחר',
] as const;
const STOCK_ALERT_STATES = ['מלאי נמוך', 'קריטי', 'אזל מהמלאי'];

// Full enum of order status — used only by the "עוד פעולות" override modal,
// where the user explicitly asks for any status (cancellation, manual revert,
// jumping straight from חדשה to הושלמה for a back-dated entry, etc.). The
// regular flow uses `nextOrderAction` and never asks the user to pick.
const ORDER_STATUS_OPTIONS: { value: OrderStatus; sideEffect?: string }[] = [
  { value: 'חדשה' },
  { value: 'בהכנה',          sideEffect: 'יוריד מלאי' },
  { value: 'מוכנה למשלוח' },
  { value: 'נשלחה' },
  { value: 'הושלמה בהצלחה',  sideEffect: 'עשוי להפיק חשבונית מס' },
  { value: 'בוטלה' },
];

const PAYMENT_STATUS_OPTIONS: { value: 'ממתין' | 'שולם' | 'חלקי' | 'בוטל' | 'בארטר'; sideEffect?: string }[] = [
  { value: 'ממתין' },
  { value: 'שולם',  sideEffect: 'עשוי להפיק קבלה' },
  { value: 'חלקי' },
  { value: 'בוטל' },
  { value: 'בארטר' },
];

// ─── Theme tokens (centralized for consistency) ───────────────────────────
const C = {
  bg:       '#FAF7F0',
  card:     '#FFFFFF',
  cardSoft: '#FFFCF7',
  border:   '#E8DED2',
  borderSoft: '#F0E7D8',
  text:     '#2B1B12',
  textSoft: '#8A735F',
  brand:    '#8B5E34',
  brandSoft:'#FAF5E9',
  green:    '#0F766E',
  greenSoft:'#ECFDF5',
  red:      '#B91C1C',
  redSoft:  '#FEF2F2',
  amber:    '#B45309',
  amberSoft:'#FFF7ED',
  blue:     '#0369A1',
  blueSoft: '#EFF6FF',
};

// ─── Tiny inline icon set ─────────────────────────────────────────────────
function Icon({ name, className = 'w-4 h-4', style }: { name: string; className?: string; style?: React.CSSProperties }) {
  const props = {
    className,
    style,
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
    case 'alert':    return <svg {...props}><path d="M12 9v4M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg>;
    case 'tag':      return <svg {...props}><path d="M20 12 12 20l-9-9V3h8z"/><circle cx="7" cy="7" r="1.5"/></svg>;
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

// Decide the next forward action for an order. Returns null when no forward
// action remains (cancelled / draft / completed).
function nextOrderAction(o: TodayOrder): { label: string; newStatus: OrderStatus; confirmText?: string } | null {
  const status = o.סטטוס_הזמנה as OrderStatus;
  const isPickup = (o.סוג_אספקה ?? '') === 'איסוף עצמי';
  switch (status) {
    case 'חדשה':
      return { label: 'התחילי הכנה', newStatus: 'בהכנה', confirmText: 'מעבר ל"בהכנה" יוריד מלאי לפי הלוגיקה הקיימת. להמשיך?' };
    case 'בהכנה':
      return { label: isPickup ? 'סמני מוכנה לאיסוף' : 'סמני מוכנה למשלוח', newStatus: 'מוכנה למשלוח' };
    case 'מוכנה למשלוח':
      if (isPickup) return { label: 'סמני הושלמה', newStatus: 'הושלמה בהצלחה', confirmText: 'סימון כ"הושלמה בהצלחה" עשוי להפיק חשבונית מס לפי הלוגיקה הקיימת. להמשיך?' };
      return { label: 'סמני נשלחה', newStatus: 'נשלחה' };
    case 'נשלחה':
      return { label: 'סמני הושלמה', newStatus: 'הושלמה בהצלחה', confirmText: 'סימון כ"הושלמה בהצלחה" עשוי להפיק חשבונית מס לפי הלוגיקה הקיימת. להמשיך?' };
    default:
      return null;
  }
}

function nextDeliveryAction(d: Delivery): { label: string; newStatus: 'נאסף' | 'נמסר' } | null {
  switch (d.סטטוס_משלוח) {
    case 'ממתין': return { label: 'סמני נאסף', newStatus: 'נאסף' };
    case 'נאסף':  return { label: 'סמני נמסר', newStatus: 'נמסר' };
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

  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ text: string; cta: string; onConfirm: () => Promise<void> | void } | null>(null);
  const [markPaidOrder, setMarkPaidOrder] = useState<TodayOrder | null>(null);
  const [moreActionsOrder, setMoreActionsOrder] = useState<TodayOrder | null>(null);

  // Recent activity feed — populated only when mode=management. Same shape
  // as the orders today list, just sliced to the last 8 across all dates.
  const [recentOrders, setRecentOrders] = useState<TodayOrder[]>([]);

  // Tracks which KPI was last clicked so we can highlight it. Cleared when
  // the user changes the chip filter manually so the highlight doesn't lie.
  const [activeKpi, setActiveKpi] = useState<'orders' | 'revenue' | 'unpaid' | 'deliveries' | 'inventory' | null>(null);

  // Section refs for the click-to-scroll KPIs.
  const ordersRef     = useRef<HTMLDivElement>(null);
  const deliveriesRef = useRef<HTMLDivElement>(null);
  const inventoryRef  = useRef<HTMLDivElement>(null);

  // In-flight write counter — auto-refresh skips ticks while > 0 so optimistic
  // updates aren't clobbered by a stale GET response.
  const inflightRef = useRef(0);

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
    if (silent && inflightRef.current > 0) return;
    if (!silent) setLoading(true);
    try {
      const today = todayIsraelISO();
      const [dash, ordersRes, deliveriesRes, rawRes, prodsRes, pfRes, recentRes] = await Promise.all([
        fetch('/api/dashboard').then(r => r.json()),
        fetch('/api/orders?filter=today&limit=100').then(r => r.json()),
        fetch(`/api/deliveries?date=${today}`).then(r => r.json()),
        fetch('/api/inventory').then(r => r.json()),
        fetch('/api/products?active=true').then(r => r.json()),
        fetch('/api/petit-four-types').then(r => r.json()),
        fetch('/api/orders?limit=8').then(r => r.json()),
      ]);

      if (dash?.data) setStats(dash.data);
      setTodayOrders((ordersRes?.data || []) as TodayOrder[]);
      setTodayDeliveries((deliveriesRes?.data || []) as Delivery[]);
      setRecentOrders((recentRes?.data || []) as TodayOrder[]);

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
  useEffect(() => {
    const t = window.setInterval(() => fetchAll(true), 45_000);
    return () => window.clearInterval(t);
  }, [fetchAll]);

  // ─── Mutations — go through existing APIs (no bypass) ───────────────────

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
      if (json.was_created && json.data) {
        setTodayDeliveries(curr => curr.map(d => d.id === id ? ({ ...d, ...json.data, _noRecord: false } as Delivery) : d));
      }
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

  const onPrimaryOrderAction = (o: TodayOrder) => {
    const action = nextOrderAction(o);
    if (!action) return;
    const exec = () => patchOrder(o.id, { סטטוס_הזמנה: action.newStatus }, { סטטוס_הזמנה: o.סטטוס_הזמנה });
    if (action.confirmText) {
      setConfirmAction({ text: action.confirmText, cta: action.label, onConfirm: async () => { await exec(); setConfirmAction(null); } });
    } else {
      void exec();
    }
  };

  // Manual override from the "עוד פעולות" modal. Same safety rails as the
  // primary buttons: side-effecting transitions go through the existing
  // confirm / mark-paid modals — never write to Supabase from here.
  const onPickOrderStatus = (o: TodayOrder, newStatus: OrderStatus) => {
    setMoreActionsOrder(null);
    if (newStatus === o.סטטוס_הזמנה) return;
    const exec = () => patchOrder(o.id, { סטטוס_הזמנה: newStatus }, { סטטוס_הזמנה: o.סטטוס_הזמנה });
    if (newStatus === 'בהכנה' && o.סטטוס_הזמנה !== 'בהכנה') {
      setConfirmAction({
        text: 'מעבר ל"בהכנה" יוריד מלאי לפי הלוגיקה הקיימת. להמשיך?',
        cta: 'אישור — בהכנה',
        onConfirm: async () => { await exec(); setConfirmAction(null); },
      });
    } else if (newStatus === 'הושלמה בהצלחה' && o.סטטוס_הזמנה !== 'הושלמה בהצלחה') {
      setConfirmAction({
        text: 'סימון כ"הושלמה בהצלחה" עשוי להפיק חשבונית מס לפי הלוגיקה הקיימת. להמשיך?',
        cta: 'אישור — הושלמה',
        onConfirm: async () => { await exec(); setConfirmAction(null); },
      });
    } else if (newStatus === 'בוטלה' && o.סטטוס_הזמנה !== 'בוטלה') {
      setConfirmAction({
        text: 'ביטול ההזמנה אינו הפיך אוטומטית. להמשיך?',
        cta: 'אישור — בטלי',
        onConfirm: async () => { await exec(); setConfirmAction(null); },
      });
    } else {
      void exec();
    }
  };

  const onPickPaymentStatus = (
    o: TodayOrder,
    newStatus: 'ממתין' | 'שולם' | 'חלקי' | 'בוטל' | 'בארטר',
  ) => {
    setMoreActionsOrder(null);
    if (newStatus === o.סטטוס_תשלום) return;
    if (newStatus === 'שולם') {
      // Hand off to the existing mark-paid modal so the user picks אופן_תשלום
      // before the receipt-trigger fires (same flow as the secondary card button).
      setMarkPaidOrder(o);
      return;
    }
    void patchOrder(o.id, { סטטוס_תשלום: newStatus }, { סטטוס_תשלום: o.סטטוס_תשלום });
  };

  // KPI click → smooth-scroll to the matching section + (when relevant) set
  // the chip filter so the section opens already filtered to what the KPI
  // counted. The activeKpi state drives the visual highlight on the card.
  const onKpiClick = (kpi: 'orders' | 'revenue' | 'unpaid' | 'deliveries' | 'inventory') => {
    setActiveKpi(kpi);
    if (kpi === 'unpaid') {
      setFilter('unpaid');
      ordersRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (kpi === 'orders' || kpi === 'revenue') {
      setFilter('all');
      ordersRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (kpi === 'deliveries') {
      deliveriesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (kpi === 'inventory') {
      inventoryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Wrap setFilter so manual chip clicks clear the KPI highlight (otherwise
  // the highlighted card would lie about what's currently shown).
  const setFilterFromChip = (f: Filter) => {
    setFilter(f);
    setActiveKpi(null);
  };

  // ─── Derived data ───────────────────────────────────────────────────────

  const liveOrders = useMemo(
    () => todayOrders.filter(o => o.סטטוס_הזמנה !== 'בוטלה' && o.סטטוס_הזמנה !== 'טיוטה'),
    [todayOrders],
  );

  // Match an order against an action-verb filter bucket.
  const matchesFilter = (o: TodayOrder, f: Filter): boolean => {
    switch (f) {
      case 'all':         return true;
      case 'start':       return o.סטטוס_הזמנה === 'חדשה';
      case 'mark_ready':  return o.סטטוס_הזמנה === 'בהכנה';
      case 'ready_to_go': return o.סטטוס_הזמנה === 'מוכנה למשלוח' || o.סטטוס_הזמנה === 'נשלחה';
      case 'unpaid':      return o.סטטוס_תשלום !== 'שולם' && o.סטטוס_תשלום !== 'בארטר';
      case 'urgent':      return !!o.הזמנה_דחופה;
    }
  };

  const visibleOrders = useMemo(
    () => [...liveOrders.filter(o => matchesFilter(o, filter))]
      .sort((a, b) => timeKey(a.שעת_אספקה) - timeKey(b.שעת_אספקה)),
    [liveOrders, filter],
  );

  const filterCounts = useMemo(() => ({
    all:         liveOrders.length,
    start:       liveOrders.filter(o => matchesFilter(o, 'start')).length,
    mark_ready:  liveOrders.filter(o => matchesFilter(o, 'mark_ready')).length,
    ready_to_go: liveOrders.filter(o => matchesFilter(o, 'ready_to_go')).length,
    unpaid:      liveOrders.filter(o => matchesFilter(o, 'unpaid')).length,
    urgent:      liveOrders.filter(o => matchesFilter(o, 'urgent')).length,
  }), [liveOrders]);

  const expectedRevenue = useMemo(
    () => liveOrders.reduce((s, o) => s + (o.סך_הכל_לתשלום || 0), 0),
    [liveOrders],
  );

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

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div dir="rtl" className="mx-auto max-w-[1500px] space-y-5 pb-10">

      {/* ════════ HEADER (compact) ════════ */}
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-semibold leading-tight" style={{ color: C.text, letterSpacing: '-0.01em' }}>
            {mode === 'work'
              ? `${greeting}, מה צריך לבצע היום?`
              : 'סקירת פעילות יומית'}
          </h1>
          <p className="text-[11px] mt-1" style={{ color: C.textSoft }}>
            <span>{dateStr}</span>
            <span className="mx-1.5">·</span>
            <span>{mode === 'work' ? 'תצוגת עבודה — מותאם לטאבלט במטבח' : 'תצוגת ניהול — מבט עסקי'}</span>
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <ModeToggle mode={mode} onChange={setMode} />
          <Link
            href="/orders/new"
            className="inline-flex items-center gap-1.5 px-3.5 h-10 text-sm font-semibold rounded-xl transition-colors"
            style={{ backgroundColor: C.brand, color: '#FFFFFF' }}
          >
            <Icon name="plus" className="w-3.5 h-3.5" /> הזמנה חדשה
          </Link>
        </div>
      </header>

      {/* ════════ KPI STRIP — clickable, scrolls + filters the relevant section ═══ */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard
          icon="bag"
          label="הזמנות היום"
          value={String(stats?.ordersToday ?? liveOrders.length)}
          accent={C.brand}
          sub={`${liveOrders.length} פעילות${stats?.ordersTomorrow ? ` · ${stats.ordersTomorrow} מחר` : ''}`}
          active={activeKpi === 'orders'}
          onClick={() => onKpiClick('orders')}
        />
        <KpiCard
          icon="wallet"
          label="הכנסה צפויה היום"
          value={formatCurrency(expectedRevenue)}
          accent={C.green}
          sub={liveOrders.length > 0 ? `ממוצע ${formatCurrency(expectedRevenue / liveOrders.length)}` : 'אין הזמנות פעילות'}
          active={activeKpi === 'revenue'}
          onClick={() => onKpiClick('revenue')}
        />
        <KpiCard
          icon="clock"
          label="ממתין לתשלום"
          value={formatCurrency(stats?.unpaidAmount ?? 0)}
          accent={(stats?.unpaidOrders ?? 0) > 0 ? C.amber : C.textSoft}
          sub={(stats?.unpaidOrders ?? 0) > 0 ? `${stats?.unpaidOrders} הזמנות פתוחות` : 'הכל סגור'}
          active={activeKpi === 'unpaid'}
          onClick={() => onKpiClick('unpaid')}
        />
        <KpiCard
          icon="truck"
          label="משלוחים היום"
          value={String(stats?.deliveriesToday ?? todayDeliveries.length)}
          accent={C.blue}
          sub={`${stats?.deliveriesDelivered ?? 0} נמסרו · ${stats?.deliveriesCollected ?? 0} נאספו`}
          active={activeKpi === 'deliveries'}
          onClick={() => onKpiClick('deliveries')}
        />
        <KpiCard
          icon="alert"
          label="מלאי דורש טיפול"
          value={String(stockTotal)}
          accent={stockTotal > 0 ? C.red : C.textSoft}
          sub={stockTotal === 0 ? 'הכל תקין' : `${stock.raw.length} גלם · ${stock.products.length} מוצר · ${stock.petitFours.length} פטיפור`}
          active={activeKpi === 'inventory'}
          onClick={() => onKpiClick('inventory')}
        />
      </section>

      {/* ════════ TWO-COLUMN MAIN AREA ════════ */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── PRIMARY COLUMN: Today orders (lg: 2/3) ────────────────────── */}
        <div ref={ordersRef} className="lg:col-span-2 space-y-3 scroll-mt-4">
          <SectionHeader
            title="הזמנות לטיפול היום"
            count={visibleOrders.length}
            href="/orders?filter=today"
          />

          {/* Action-verb chips. Each one filters the cards below to the orders
              that share the same next-step verb, so clicking "להתחיל הכנה"
              shows just the orders whose primary button is "התחילי הכנה". */}
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: C.textSoft, letterSpacing: '0.08em' }}>
              מה דורש טיפול עכשיו?
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <FilterChip label="הכל"             count={filterCounts.all}         active={filter === 'all'}         onClick={() => setFilterFromChip('all')} />
              <FilterChip label="להתחיל הכנה"     count={filterCounts.start}       active={filter === 'start'}       onClick={() => setFilterFromChip('start')}       tone="amber" />
              <FilterChip label="לסמן מוכנות"     count={filterCounts.mark_ready}  active={filter === 'mark_ready'}  onClick={() => setFilterFromChip('mark_ready')}  tone="amber" />
              <FilterChip label="מוכנות לאספקה"   count={filterCounts.ready_to_go} active={filter === 'ready_to_go'} onClick={() => setFilterFromChip('ready_to_go')} />
              <FilterChip label="ממתינות לתשלום"  count={filterCounts.unpaid}      active={filter === 'unpaid'}      onClick={() => setFilterFromChip('unpaid')}      tone="amber" />
              <FilterChip label="דחופות"          count={filterCounts.urgent}      active={filter === 'urgent'}      onClick={() => setFilterFromChip('urgent')}      tone="red" />
            </div>
          </div>

          {/* Order cards */}
          {visibleOrders.length === 0 ? (
            <EmptyInline
              icon="check"
              title={filter === 'all' ? 'אין הזמנות פעילות להיום' : 'אין התאמות לסינון הנוכחי'}
              hint={filter === 'all' ? 'צפה בכל ההזמנות' : 'נקי את הסינון'}
              hintHref={filter === 'all' ? '/orders' : undefined}
              hintOnClick={filter !== 'all' ? () => setFilter('all') : undefined}
            />
          ) : mode === 'work' ? (
            <div className="space-y-3">
              {visibleOrders.map(o => (
                <OrderActionCard
                  key={o.id}
                  order={o}
                  updating={updatingId === o.id}
                  onPrimary={() => onPrimaryOrderAction(o)}
                  onMarkPaid={() => setMarkPaidOrder(o)}
                  onOpen={() => router.push(`/orders/${o.id}`)}
                  onMoreActions={() => setMoreActionsOrder(o)}
                />
              ))}
            </div>
          ) : (
            // Management mode — compact one-line rows. No big primary CTA;
            // actions live in the existing מצמן modal accessible via "עוד".
            <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}>
              {visibleOrders.map((o, idx) => (
                <OrderRow
                  key={o.id}
                  order={o}
                  isLast={idx === visibleOrders.length - 1}
                  onOpen={() => router.push(`/orders/${o.id}`)}
                  onMoreActions={() => setMoreActionsOrder(o)}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── SECONDARY COLUMN: Deliveries + Stock (lg: 1/3) ───────────── */}
        <aside className="space-y-5">
          {/* Today deliveries */}
          <div ref={deliveriesRef} className="space-y-3 scroll-mt-4">
            <SectionHeader
              title="משלוחים היום"
              count={todayDeliveries.length}
              href="/deliveries"
            />
            {todayDeliveries.length === 0 ? (
              <EmptyInline icon="truck" title="אין משלוחים מתוכננים להיום" hint="ניהול משלוחים" hintHref="/deliveries" />
            ) : (
              <div className="space-y-2.5">
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
          </div>

          {/* Stock attention — single card, three internal sections */}
          <div ref={inventoryRef} className="space-y-3 scroll-mt-4">
            <SectionHeader
              title="מלאי דורש טיפול"
              count={stockTotal}
              href="/inventory"
            />
            <StockAttentionCard stock={stock} total={stockTotal} expanded={activeKpi === 'inventory'} />
          </div>
        </aside>
      </section>

      {/* ════════ MANAGEMENT-ONLY: Recent activity + admin links ════════ */}
      {mode === 'management' && (
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-3">
            <SectionHeader title="פעילות אחרונה" count={recentOrders.length} href="/orders" />
            {recentOrders.length === 0 ? (
              <EmptyInline icon="clock" title="אין פעילות אחרונה" />
            ) : (
              <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}>
                {recentOrders.slice(0, 8).map((o, idx) => {
                  const c = o.לקוחות;
                  const name = c ? `${c.שם_פרטי} ${c.שם_משפחה}` : (o.שם_מקבל || 'לקוח');
                  const isLast = idx === Math.min(7, recentOrders.length - 1);
                  return (
                    <Link
                      key={o.id}
                      href={`/orders/${o.id}`}
                      className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-amber-50/40"
                      style={{ borderBottom: isLast ? 'none' : `1px solid ${C.borderSoft}` }}
                    >
                      <span className="font-mono text-[11px] font-semibold flex-shrink-0" style={{ color: C.brand, width: 92 }}>
                        {o.מספר_הזמנה}
                      </span>
                      <span className="text-[13px] font-medium truncate flex-1" style={{ color: C.text }}>
                        {name}
                      </span>
                      <StatusBadge status={o.סטטוס_הזמנה} type="order" />
                      <span className="text-[12px] tabular-nums font-semibold w-20 text-left flex-shrink-0" style={{ color: C.text }}>
                        {formatCurrency(o.סך_הכל_לתשלום)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          <aside className="space-y-3">
            <SectionHeader title="קישורים מהירים" />
            <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}>
              <AdminLink href="/orders"     icon="bag"    label="ניהול הזמנות" />
              <AdminLink href="/customers"  icon="check"  label="לקוחות" />
              <AdminLink href="/invoices"   icon="wallet" label="חשבוניות וקבלות" />
              <AdminLink href="/inventory"  icon="box"    label="ניהול מלאי" />
              <AdminLink href="/products"   icon="bag"    label="קטלוג מוצרים" />
              <AdminLink href="/reports/orders" icon="note" label="דוחות הזמנות" />
              <AdminLink href="/settings"   icon="tag"    label="הגדרות" last />
            </div>
          </aside>
        </section>
      )}

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

      {moreActionsOrder && (
        <MoreActionsModal
          order={moreActionsOrder}
          onClose={() => setMoreActionsOrder(null)}
          onPickOrderStatus={(s) => onPickOrderStatus(moreActionsOrder, s)}
          onPickPaymentStatus={(s) => onPickPaymentStatus(moreActionsOrder, s)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════════

// ─── ModeToggle ───────────────────────────────────────────────────────────

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const opt = (val: Mode, label: string) => {
    const active = mode === val;
    return (
      <button
        key={val}
        onClick={() => onChange(val)}
        className="px-3.5 h-9 text-[12px] font-semibold rounded-lg transition-colors whitespace-nowrap"
        style={{
          backgroundColor: active ? C.card : 'transparent',
          color: active ? C.text : C.textSoft,
          boxShadow: active ? '0 1px 2px rgba(58,42,26,0.06)' : undefined,
        }}
      >
        {label}
      </button>
    );
  };
  return (
    <div
      className="inline-flex p-1 rounded-xl"
      style={{ backgroundColor: '#F3EBDD', border: `1px solid ${C.border}` }}
      role="group"
      aria-label="מצב תצוגה"
    >
      {opt('work', 'תצוגת עבודה')}
      {opt('management', 'תצוגת ניהול')}
    </div>
  );
}

// ─── SectionHeader ────────────────────────────────────────────────────────

function SectionHeader({ title, count, href }: { title: string; count?: number; href?: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-semibold tracking-tight" style={{ color: C.text }}>{title}</h2>
        {typeof count === 'number' && (
          <span
            className="text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md"
            style={{ backgroundColor: C.brandSoft, color: C.brand }}
          >
            {count}
          </span>
        )}
      </div>
      {href && (
        <Link href={href} className="text-[11px] hover:underline transition-colors" style={{ color: C.textSoft }}>
          לרשימה המלאה →
        </Link>
      )}
    </div>
  );
}

// ─── FilterChip ───────────────────────────────────────────────────────────

function FilterChip({
  label, count, active, onClick, tone,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  tone?: 'red' | 'amber';
}) {
  const activeBg = tone === 'red' ? C.red : tone === 'amber' ? C.amber : C.brand;
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-[11px] font-medium transition-colors border"
      style={{
        backgroundColor: active ? activeBg : C.card,
        color: active ? '#FFFFFF' : C.text,
        borderColor: active ? activeBg : C.border,
      }}
    >
      <span>{label}</span>
      <span
        className="text-[10px] font-semibold px-1 rounded tabular-nums"
        style={{
          backgroundColor: active ? 'rgba(255,255,255,0.2)' : C.brandSoft,
          color: active ? '#FFFFFF' : C.brand,
          minWidth: 18, textAlign: 'center',
        }}
      >
        {count}
      </span>
    </button>
  );
}

// ─── KpiCard ──────────────────────────────────────────────────────────────

function KpiCard({
  icon, label, value, accent, sub, active, onClick,
}: {
  icon: string;
  label: string;
  value: string;
  accent: string;
  sub?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const interactive = !!onClick;
  const Tag: 'button' | 'div' = interactive ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`rounded-2xl px-4 py-3.5 transition-all w-full text-right ${interactive ? 'cursor-pointer hover:-translate-y-px hover:shadow-sm' : ''}`}
      style={{
        backgroundColor: active ? `${accent}08` : C.card,
        border: `1px solid ${active ? accent : C.border}`,
        boxShadow: active
          ? `0 0 0 1px ${accent}30, 0 1px 0 rgba(255,255,255,0.6)`
          : '0 1px 0 rgba(255,255,255,0.6)',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: C.textSoft, letterSpacing: '0.08em' }}>
          {label}
        </p>
        <span
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${accent}14`, color: accent }}
        >
          <Icon name={icon} className="w-3.5 h-3.5" />
        </span>
      </div>
      <p className="text-2xl font-semibold tabular-nums leading-none" style={{ color: C.text, letterSpacing: '-0.01em' }}>
        {value}
      </p>
      {sub && <p className="text-[11px] mt-2 truncate" style={{ color: C.textSoft }}>{sub}</p>}
      {/* Bottom accent rule — thicker when active */}
      <div
        className="mt-3 rounded-full transition-all"
        style={{
          backgroundColor: active ? accent : `${accent}22`,
          height: active ? 3 : 2,
        }}
      />
      {interactive && (
        <p className="text-[10px] mt-1.5 inline-flex items-center gap-1" style={{ color: active ? accent : C.textSoft }}>
          <span>{active ? '↓ הוצג למטה' : 'לחצי לפירוט'}</span>
        </p>
      )}
    </Tag>
  );
}

// ─── OrderActionCard — the centerpiece ────────────────────────────────────

function OrderActionCard({
  order, updating, onPrimary, onMarkPaid, onOpen, onMoreActions,
}: {
  order: TodayOrder;
  updating: boolean;
  onPrimary: () => void;
  onMarkPaid: () => void;
  onOpen: () => void;
  onMoreActions: () => void;
}) {
  const c = order.לקוחות;
  const customerName = c ? `${c.שם_פרטי} ${c.שם_משפחה}` : (order.שם_מקבל || 'לקוח');
  const isDelivery = (order.סוג_אספקה ?? '') === 'משלוח';
  const action = nextOrderAction(order);
  const paid = order.סטטוס_תשלום === 'שולם' || order.סטטוס_תשלום === 'בארטר';
  const note = (order.הערות_להזמנה ?? '').trim();

  // Subtle left accent strip for urgent
  const leftAccent = order.הזמנה_דחופה ? C.red : null;

  return (
    <div
      className="rounded-2xl bg-white relative overflow-hidden transition-shadow hover:shadow-sm"
      style={{
        backgroundColor: C.card,
        border: `1px solid ${C.border}`,
        boxShadow: '0 1px 2px rgba(58,42,26,0.04)',
      }}
    >
      {leftAccent && (
        <div
          className="absolute top-0 right-0 bottom-0 w-[3px]"
          style={{ backgroundColor: leftAccent }}
          aria-hidden
        />
      )}

      <div className="px-5 py-4">
        {/* ── Top row: order number + status badges + open link ─────────── */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-[11px] font-semibold tracking-wide" style={{ color: C.brand }}>
                {order.מספר_הזמנה}
              </span>
              {order.הזמנה_דחופה && <UrgentBadge />}
            </div>
            <p className="text-[17px] font-semibold leading-tight truncate" style={{ color: C.text, letterSpacing: '-0.01em' }}>
              {customerName}
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <StatusBadge status={order.סטטוס_הזמנה} type="order" />
          </div>
        </div>

        {/* ── Meta row: time / type / amount / phone ────────────────────── */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] mb-3" style={{ color: C.textSoft }}>
          <Meta icon="clock" text={order.שעת_אספקה || '—'} mono />
          <span style={{ color: C.borderSoft }}>·</span>
          <Meta icon={isDelivery ? 'truck' : 'box'} text={isDelivery ? 'משלוח' : 'איסוף'} />
          <span style={{ color: C.borderSoft }}>·</span>
          <span className="tabular-nums font-semibold" style={{ color: C.text }}>
            {formatCurrency(order.סך_הכל_לתשלום)}
          </span>
          {order.טלפון_מקבל && (
            <>
              <span style={{ color: C.borderSoft }}>·</span>
              <a
                href={`tel:${order.טלפון_מקבל}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 hover:underline tabular-nums"
                style={{ color: C.blue }}
              >
                <Icon name="phone" className="w-3 h-3" />
                {order.טלפון_מקבל}
              </a>
            </>
          )}
        </div>

        {/* ── Note ──────────────────────────────────────────────────────── */}
        {note && (
          <div
            className="flex items-start gap-1.5 px-2.5 py-1.5 rounded-lg mb-3 text-[12px]"
            style={{ backgroundColor: C.amberSoft, color: C.amber }}
          >
            <Icon name="note" className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span className="line-clamp-2">{note}</span>
          </div>
        )}

        {/* ── Inline payment alert (only when unpaid) ───────────────────── */}
        {!paid && (
          <div
            className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg mb-3"
            style={{ backgroundColor: C.amberSoft, border: `1px solid #FCD9A8` }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Icon name="alert" className="w-3.5 h-3.5 flex-shrink-0" style={{ color: C.amber }} />
              <span className="text-[12px] font-medium truncate" style={{ color: C.amber }}>
                ממתין לתשלום
              </span>
              <span className="text-[12px] tabular-nums font-semibold" style={{ color: C.amber }}>
                · {formatCurrency(order.סך_הכל_לתשלום)}
              </span>
              {order.אופן_תשלום && (
                <span className="text-[11px] truncate" style={{ color: C.amber, opacity: 0.85 }}>
                  · {order.אופן_תשלום}
                </span>
              )}
            </div>
            <button
              onClick={onMarkPaid}
              disabled={updating}
              className="text-[11px] font-semibold px-2.5 h-7 rounded-md transition-colors flex-shrink-0 disabled:opacity-60"
              style={{ backgroundColor: C.green, color: '#FFFFFF' }}
            >
              סמני שולם
            </button>
          </div>
        )}

        {/* ── Action row: PRIMARY (big) + tertiary text links ───────────── */}
        <div className="flex items-center gap-3">
          <div className="flex-1">
            {action ? (
              <button
                onClick={onPrimary}
                disabled={updating}
                className="inline-flex items-center justify-center gap-2 w-full h-11 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-60"
                style={{ backgroundColor: C.brand }}
              >
                <span>{updating ? '...' : action.label}</span>
                <Icon name="arrow" className="w-3.5 h-3.5 rtl-flip" />
              </button>
            ) : (
              <div
                className="inline-flex items-center justify-center gap-2 w-full h-11 rounded-xl text-sm font-medium"
                style={{ backgroundColor: C.brandSoft, color: C.brand }}
              >
                <Icon name="check" className="w-4 h-4" />
                <span>בוצעו כל השלבים</span>
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
            <button
              onClick={onOpen}
              className="text-[12px] font-medium hover:underline transition-colors"
              style={{ color: C.textSoft }}
            >
              פתיחת הזמנה →
            </button>
            <button
              onClick={onMoreActions}
              className="text-[11px] hover:underline transition-colors"
              style={{ color: C.textSoft, opacity: 0.85 }}
            >
              עוד פעולות
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Meta({ icon, text, mono }: { icon: string; text: string; mono?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 ${mono ? 'tabular-nums' : ''}`}>
      <Icon name={icon} className="w-3 h-3" />
      <span>{text}</span>
    </span>
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
      className="rounded-xl px-4 py-3"
      style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate" style={{ color: C.text }}>{recipient}</p>
          {o?.מספר_הזמנה && (
            <span className="font-mono text-[10px] font-medium" style={{ color: C.textSoft }}>
              {o.מספר_הזמנה}
            </span>
          )}
        </div>
        <StatusBadge status={delivery.סטטוס_משלוח} type="delivery" />
      </div>

      <div className="space-y-1 mb-2.5 text-[11px]" style={{ color: C.textSoft }}>
        {addr && (
          <div className="flex items-start gap-1.5">
            <Icon name="mapPin" className="w-3 h-3 flex-shrink-0 mt-0.5" />
            <span className="break-words leading-snug">{addr}</span>
          </div>
        )}
        {phone && (
          <a
            href={`tel:${phone}`}
            onClick={e => e.stopPropagation()}
            className="flex items-center gap-1.5 hover:underline"
            style={{ color: C.blue }}
          >
            <Icon name="phone" className="w-3 h-3" />
            <span className="tabular-nums">{phone}</span>
          </a>
        )}
        {courier && (
          <div className="flex items-center gap-1.5">
            <Icon name="tag" className="w-3 h-3" />
            <span>שליח: {courier}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {action ? (
          <button
            onClick={() => onPrimary(action.newStatus)}
            disabled={updating}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-lg text-[12px] font-semibold text-white transition-colors disabled:opacity-60"
            style={{ backgroundColor: C.brand }}
          >
            <Icon name={action.newStatus === 'נמסר' ? 'check' : 'truck'} className="w-3.5 h-3.5" />
            {updating ? '...' : action.label}
          </button>
        ) : (
          <div
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-lg text-[12px] font-medium"
            style={{ backgroundColor: C.greenSoft, color: C.green }}
          >
            <Icon name="check" className="w-3.5 h-3.5" />
            נמסר
          </div>
        )}
        <button
          onClick={onOpen}
          className="text-[11px] font-medium hover:underline flex-shrink-0"
          style={{ color: C.textSoft }}
        >
          הזמנה →
        </button>
      </div>
    </div>
  );
}

// ─── StockAttentionCard ──────────────────────────────────────────────────

function StockAttentionCard({
  stock, total, expanded,
}: {
  stock: { raw: StockRow[]; products: StockRow[]; petitFours: StockRow[] };
  total: number;
  // When the user clicked the inventory KPI, show every alert (not just top-3).
  expanded?: boolean;
}) {
  if (total === 0) {
    return (
      <div
        className="rounded-2xl px-4 py-5 text-center"
        style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}
      >
        <div
          className="w-9 h-9 mx-auto rounded-full flex items-center justify-center mb-2"
          style={{ backgroundColor: C.greenSoft, color: C.green }}
        >
          <Icon name="check" className="w-4 h-4" />
        </div>
        <p className="text-[13px] font-medium" style={{ color: C.text }}>כל המלאי בטווח התקין</p>
        <Link href="/inventory" className="text-[11px] mt-1 inline-block hover:underline" style={{ color: C.textSoft }}>
          פתח מלאי →
        </Link>
      </div>
    );
  }

  const limit = expanded ? Infinity : 3;
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}
    >
      <StockGroupRow title="חומרי גלם"      icon="box"   items={stock.raw}        limit={limit} />
      <Divider />
      <StockGroupRow title="מוצרים מוכנים" icon="bag"   items={stock.products}   limit={limit} />
      <Divider />
      <StockGroupRow title="פטיפורים"      icon="flame" items={stock.petitFours} limit={limit} />
    </div>
  );
}

function Divider() {
  return <div className="h-px" style={{ backgroundColor: C.borderSoft }} />;
}

function StockGroupRow({ title, icon, items, limit = 3 }: { title: string; icon: string; items: StockRow[]; limit?: number }) {
  const top = items.slice(0, Number.isFinite(limit) ? limit : items.length);
  const tone = (s: string) =>
    s === 'אזל מהמלאי' ? { text: C.red,   bg: C.redSoft }
    : s === 'קריטי'     ? { text: C.amber, bg: C.amberSoft }
    :                     { text: C.brand, bg: C.brandSoft };

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className="w-6 h-6 rounded-md flex items-center justify-center"
            style={{ backgroundColor: C.brandSoft, color: C.brand }}
          >
            <Icon name={icon} className="w-3 h-3" />
          </span>
          <span className="text-[12px] font-semibold" style={{ color: C.text }}>{title}</span>
        </div>
        {items.length === 0 ? (
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
            style={{ backgroundColor: C.greenSoft, color: C.green }}
          >
            תקין
          </span>
        ) : (
          <span
            className="text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md"
            style={{ backgroundColor: C.redSoft, color: C.red }}
          >
            {items.length}
          </span>
        )}
      </div>
      {top.length > 0 && (
        <ul className="space-y-1">
          {top.map(it => {
            const t = tone(it.status);
            return (
              <li
                key={it.id}
                className="flex items-center justify-between gap-2 px-2 py-1 rounded-md"
                style={{ backgroundColor: t.bg }}
              >
                <span className="text-[11px] font-medium truncate" style={{ color: t.text }}>{it.שם}</span>
                <span className="text-[10px] font-semibold tabular-nums flex-shrink-0" style={{ color: t.text }}>
                  {it.quantity} · {it.status}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── EmptyInline ──────────────────────────────────────────────────────────

function EmptyInline({
  icon, title, hint, hintHref, hintOnClick,
}: {
  icon: string;
  title: string;
  hint?: string;
  hintHref?: string;
  hintOnClick?: () => void;
}) {
  const hintEl = hint && (hintHref ? (
    <Link href={hintHref} className="text-[11px] font-medium hover:underline" style={{ color: C.brand }}>
      {hint} →
    </Link>
  ) : hintOnClick ? (
    <button onClick={hintOnClick} className="text-[11px] font-medium hover:underline" style={{ color: C.brand }}>
      {hint}
    </button>
  ) : null);

  return (
    <div
      className="flex items-center gap-3 px-4 py-3.5 rounded-xl"
      style={{ backgroundColor: C.card, border: `1px dashed ${C.border}` }}
    >
      <span
        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: C.brandSoft, color: C.brand }}
      >
        <Icon name={icon} className="w-3.5 h-3.5" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium" style={{ color: C.text }}>{title}</p>
        {hintEl && <div className="mt-0.5">{hintEl}</div>}
      </div>
    </div>
  );
}

// ─── ConfirmActionModal ───────────────────────────────────────────────────

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
      <p className="text-sm mb-6" style={{ color: C.textSoft }}>{text}</p>
      <div className="flex gap-3 justify-end">
        <button
          onClick={onClose}
          disabled={loading}
          className="px-4 h-10 text-sm font-medium rounded-xl border transition-colors disabled:opacity-50"
          style={{ borderColor: C.border, color: C.textSoft }}
        >
          ביטול
        </button>
        <button
          onClick={() => void onConfirm()}
          disabled={loading}
          className="px-5 h-10 text-sm font-semibold rounded-xl text-white transition-colors disabled:opacity-50"
          style={{ backgroundColor: C.brand }}
        >
          {loading ? '...' : ctaLabel}
        </button>
      </div>
    </Modal>
  );
}

// ─── MarkPaidModal ────────────────────────────────────────────────────────

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
      <div className="text-sm mb-2" style={{ color: C.text }}>
        <span className="font-semibold">{name}</span>
        <span className="mx-2" style={{ color: C.textSoft }}>·</span>
        <span className="font-mono text-xs">{order.מספר_הזמנה}</span>
      </div>
      <p className="text-sm mb-4" style={{ color: C.textSoft }}>
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
              className="text-sm font-medium h-10 rounded-xl transition-colors border"
              style={{
                backgroundColor: active ? C.brand : C.card,
                color: active ? '#FFFFFF' : C.text,
                borderColor: active ? C.brand : C.border,
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
          className="px-4 h-10 text-sm font-medium rounded-xl border transition-colors disabled:opacity-50"
          style={{ borderColor: C.border, color: C.textSoft }}
        >
          ביטול
        </button>
        <button
          onClick={() => void onConfirm(method)}
          disabled={loading || !method}
          className="px-5 h-10 text-sm font-semibold rounded-xl text-white transition-colors disabled:opacity-50"
          style={{ backgroundColor: C.green }}
        >
          {loading ? '...' : 'אישור — סמני שולם'}
        </button>
      </div>
    </Modal>
  );
}

// ─── OrderRow — compact one-line view (management mode) ──────────────────
// No primary CTA — that's deliberate. Management mode is for oversight, not
// for poking at status. Action access is via the existing "עוד" link → modal,
// which still routes through the same PATCH endpoints.

function OrderRow({
  order, isLast, onOpen, onMoreActions,
}: {
  order: TodayOrder;
  isLast: boolean;
  onOpen: () => void;
  onMoreActions: () => void;
}) {
  const c = order.לקוחות;
  const name = c ? `${c.שם_פרטי} ${c.שם_משפחה}` : (order.שם_מקבל || 'לקוח');
  const isDelivery = (order.סוג_אספקה ?? '') === 'משלוח';
  const paid = order.סטטוס_תשלום === 'שולם' || order.סטטוס_תשלום === 'בארטר';

  return (
    <div
      className="grid items-center gap-3 px-4 py-2.5 transition-colors hover:bg-amber-50/40"
      style={{
        borderBottom: isLast ? 'none' : `1px solid ${C.borderSoft}`,
        gridTemplateColumns: '52px 92px minmax(0,1fr) 56px 88px auto auto',
      }}
    >
      {/* time */}
      <span className="text-[12px] tabular-nums font-semibold" style={{ color: C.text }}>
        {order.שעת_אספקה || '—'}
      </span>
      {/* order # */}
      <span className="font-mono text-[11px] font-semibold" style={{ color: C.brand }}>
        {order.מספר_הזמנה}
      </span>
      {/* customer + urgent badge */}
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-[13px] font-medium truncate" style={{ color: C.text }}>{name}</span>
        {order.הזמנה_דחופה && <UrgentBadge />}
      </div>
      {/* type */}
      <span
        className="inline-flex items-center justify-center gap-1 text-[11px] px-2 py-0.5 rounded-md"
        style={{
          backgroundColor: isDelivery ? C.blueSoft : C.brandSoft,
          color: isDelivery ? C.blue : C.brand,
        }}
      >
        <Icon name={isDelivery ? 'truck' : 'box'} className="w-3 h-3" />
        {isDelivery ? 'משלוח' : 'איסוף'}
      </span>
      {/* amount + payment-pending dot */}
      <div className="flex items-center gap-1.5 justify-end">
        {!paid && (
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: C.amber }}
            title="ממתין לתשלום"
            aria-label="ממתין לתשלום"
          />
        )}
        <span className="text-[12px] tabular-nums font-semibold" style={{ color: C.text }}>
          {formatCurrency(order.סך_הכל_לתשלום)}
        </span>
      </div>
      {/* status */}
      <StatusBadge status={order.סטטוס_הזמנה} type="order" />
      {/* actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={onMoreActions}
          className="text-[11px] hover:underline"
          style={{ color: C.textSoft }}
        >
          עוד
        </button>
        <button
          onClick={onOpen}
          className="text-[11px] font-medium hover:underline"
          style={{ color: C.brand }}
        >
          פתח →
        </button>
      </div>
    </div>
  );
}

// ─── AdminLink — management mode quick links ─────────────────────────────

function AdminLink({ href, icon, label, last }: { href: string; icon: string; label: string; last?: boolean }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-amber-50/40"
      style={{ borderBottom: last ? 'none' : `1px solid ${C.borderSoft}` }}
    >
      <span
        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: C.brandSoft, color: C.brand }}
      >
        <Icon name={icon} className="w-3.5 h-3.5" />
      </span>
      <span className="text-[13px] font-medium flex-1 truncate" style={{ color: C.text }}>{label}</span>
      <Icon name="arrow" className="w-3 h-3 rtl-flip" style={{ color: C.textSoft }} />
    </Link>
  );
}

// ─── MoreActionsModal — manual override surface ───────────────────────────
// Lets the user jump to any status when the auto-suggested next-step doesn't
// fit (revert from בהכנה → חדשה after a mistake, cancel an order, jump
// straight to הושלמה for a back-dated entry, etc). Each pick is routed back
// into the parent through onPickOrderStatus / onPickPaymentStatus, which
// applies the same confirm + mark-paid wrappers as the primary flow — so
// side-effecting transitions cannot be accidentally bypassed from here.

function MoreActionsModal({
  order, onClose, onPickOrderStatus, onPickPaymentStatus,
}: {
  order: TodayOrder;
  onClose: () => void;
  onPickOrderStatus: (s: OrderStatus) => void;
  onPickPaymentStatus: (s: 'ממתין' | 'שולם' | 'חלקי' | 'בוטל' | 'בארטר') => void;
}) {
  const c = order.לקוחות;
  const name = c ? `${c.שם_פרטי} ${c.שם_משפחה}` : (order.שם_מקבל || 'לקוח');

  return (
    <Modal open onClose={onClose} title="עוד פעולות" size="md">
      <div className="text-sm mb-4 flex items-center gap-2 flex-wrap" style={{ color: C.text }}>
        <span className="font-semibold">{name}</span>
        <span style={{ color: C.textSoft }}>·</span>
        <span className="font-mono text-xs" style={{ color: C.textSoft }}>{order.מספר_הזמנה}</span>
      </div>

      <p className="text-[12px] mb-5 px-3 py-2 rounded-lg" style={{ backgroundColor: C.amberSoft, color: C.amber }}>
        זה מסך חריגים. סטטוסים עם פעולות צד יציגו אישור לפני ביצוע ולא יעקפו את הלוגיקה הקיימת.
      </p>

      {/* Order status block */}
      <div className="mb-5">
        <p className="text-[11px] uppercase tracking-wider font-semibold mb-2" style={{ color: C.textSoft, letterSpacing: '0.08em' }}>
          סטטוס הזמנה
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {ORDER_STATUS_OPTIONS.map(opt => {
            const active = order.סטטוס_הזמנה === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => onPickOrderStatus(opt.value)}
                disabled={active}
                className="text-sm font-medium h-11 rounded-xl transition-colors border text-right px-3 disabled:cursor-default"
                style={{
                  backgroundColor: active ? C.brand : C.card,
                  color: active ? '#FFFFFF' : C.text,
                  borderColor: active ? C.brand : C.border,
                }}
              >
                <span className="block leading-tight">{opt.value}</span>
                {opt.sideEffect && (
                  <span className="block text-[10px] leading-tight mt-0.5" style={{ color: active ? 'rgba(255,255,255,0.85)' : C.amber }}>
                    {opt.sideEffect}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Payment status block */}
      <div className="mb-5">
        <p className="text-[11px] uppercase tracking-wider font-semibold mb-2" style={{ color: C.textSoft, letterSpacing: '0.08em' }}>
          סטטוס תשלום
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {PAYMENT_STATUS_OPTIONS.map(opt => {
            const active = order.סטטוס_תשלום === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => onPickPaymentStatus(opt.value)}
                disabled={active}
                className="text-sm font-medium h-11 rounded-xl transition-colors border text-right px-3 disabled:cursor-default"
                style={{
                  backgroundColor: active ? C.green : C.card,
                  color: active ? '#FFFFFF' : C.text,
                  borderColor: active ? C.green : C.border,
                }}
              >
                <span className="block leading-tight">{opt.value}</span>
                {opt.sideEffect && (
                  <span className="block text-[10px] leading-tight mt-0.5" style={{ color: active ? 'rgba(255,255,255,0.85)' : C.amber }}>
                    {opt.sideEffect}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-3 justify-end">
        <button
          onClick={onClose}
          className="px-4 h-10 text-sm font-medium rounded-xl border transition-colors"
          style={{ borderColor: C.border, color: C.textSoft }}
        >
          סגור
        </button>
      </div>
    </Modal>
  );
}
