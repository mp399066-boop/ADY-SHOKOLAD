'use client';

// Dashboard = "מרכז עבודה יומי". A two-column CRM-style layout: a primary
// orders column on the right (RTL) and a secondary column on the left holding
// today's deliveries and the stock-attention card. KPI strip on top, mode
// toggle for work/management. Every status change still flows through the
// existing PATCH endpoints (PATCH /api/orders/[id], PATCH /api/deliveries/[id])
// so all server-side hooks (stock movements, Morning receipt/tax-invoice,
// WhatsApp courier ping) keep firing exactly as they do from the detail pages.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { PageLoading } from '@/components/ui/LoadingSpinner';
import { UrgentBadge } from '@/components/ui/StatusBadge';
import { Modal } from '@/components/ui/Modal';
import { formatCurrency } from '@/lib/utils';
import type { DashboardStats, Order } from '@/types/database';

// New tab-based dashboard split (May 2026 redesign). The page below still
// orchestrates state + handlers + modals; the panel files render the visible
// content for each tab.
import type { DashboardTab as TabId } from './components/types';
import { DashboardTabs } from './components/DashboardTabs';
import { DashboardSidePanel } from './components/DashboardSidePanel';
import { OverviewPanel } from './components/OverviewPanel';
import { TodayPanel } from './components/TodayPanel';
import { OrdersPanel } from './components/OrdersPanel';
import { DeliveriesPanel } from './components/DeliveriesPanel';
import { PaymentsPanel } from './components/PaymentsPanel';
import { InventoryPanel } from './components/InventoryPanel';

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
// Sub-view inside work mode: 'table' is the default premium command-center
// table; 'flow' shows the older Kanban board for users who want to see all
// orders grouped visually by status.
type WorkView = 'table' | 'flow';

// Action-verb filter buckets — chips read like the next verb the user has
// to do, not like a database status. The user almost never wants to see
// "all שולח" — they want "what needs to be packed", "what is waiting on
// money". `mark_ready` covers בהכנה (the kitchen still has work). `ready_to_go`
// folds 'מוכנה למשלוח' + 'נשלחה' into one bucket: the order has left the
// kitchen and is waiting to be handed off / completed.
type Filter = 'all' | 'start' | 'mark_ready' | 'ready_to_go' | 'unpaid' | 'urgent';

// PAYMENT_METHODS — values must match the PAYMENT_BUILDERS keys in the
// Morning Edge Function (supabase/functions/create-morning-invoice/index.ts).
// Adding a method here without updating the Edge Function would mean the
// receipt is sent without a payment block (Morning will reject). Current
// builder coverage: מזומן / המחאה / העברה בנקאית / כרטיס אשראי / bit /
// PayBox / PayPal. 'אחר' is a deliberate UI-only escape hatch — Morning
// will reject those documents with a visible error rather than silently
// label them under the wrong method.
const PAYMENT_METHODS = [
  'מזומן', 'כרטיס אשראי', 'העברה בנקאית', 'bit', 'PayBox', 'PayPal', 'המחאה', 'אחר',
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

// ─── Premium status palette ───────────────────────────────────────────────
// Tones intentionally restrained — all backgrounds are <12% saturation, all
// foregrounds are deep enough to read against the bg. Borders share the
// same hue as the text to keep each pill tonally cohesive.

type Tone = { bg: string; text: string; border: string };
const FALLBACK_TONE: Tone = { bg: '#F5F1EB', text: '#8A7664', border: '#E0D4C2' };

const ORDER_STATUS_TONES: Record<string, Tone> = {
  'חדשה':           { bg: '#FAF5E9', text: '#6B4B32', border: '#E8D9BF' },
  'בהכנה':          { bg: '#FBF1DC', text: '#92602A', border: '#EAC78C' },
  'מוכנה למשלוח':   { bg: '#E0F2FE', text: '#075985', border: '#BAE0F4' },
  'נשלחה':          { bg: '#EEEAF4', text: '#4A3868', border: '#D4C8E8' },
  'הושלמה בהצלחה':  { bg: '#DCFAE6', text: '#065F46', border: '#A8E5C0' },
  'בוטלה':          { bg: '#FEE4E2', text: '#991B1B', border: '#F5BFC0' },
  'טיוטה':          { bg: '#F5F0FA', text: '#5B21B6', border: '#DDD6FE' },
};
const PAYMENT_STATUS_TONES: Record<string, Tone> = {
  'ממתין': { bg: '#FBF1DC', text: '#92602A', border: '#EAC78C' },
  'שולם':  { bg: '#DCFAE6', text: '#065F46', border: '#A8E5C0' },
  'חלקי':  { bg: '#FEF3C7', text: '#854D0E', border: '#F2D88A' },
  'בוטל':  { bg: '#FEE4E2', text: '#991B1B', border: '#F5BFC0' },
  'בארטר': { bg: '#EEEAF4', text: '#4A3868', border: '#D4C8E8' },
};
const DELIVERY_STATUS_TONES: Record<string, Tone> = {
  'ממתין': { bg: '#FBF1DC', text: '#92602A', border: '#EAC78C' },
  'נאסף':  { bg: '#DBEAFE', text: '#1E40AF', border: '#BFD2F2' },
  'נמסר':  { bg: '#DCFAE6', text: '#065F46', border: '#A8E5C0' },
};

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
  // Espresso — used for primary actions in the new command-center layout.
  // Slightly deeper than `brand` so primary buttons read with more weight.
  espresso: '#7A4A27',
  brandSoft:'#FAF5E9',
  // Matte gold — used for stepper steps that are completed. Softer than
  // the brand brown so the current step still pops as the focal point.
  gold:     '#B89870',
  goldSoft: '#F4E8D8',
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
      return { label: 'התחילי הכנה', newStatus: 'בהכנה', confirmText: 'מעבר להכנה עשוי להוריד מלאי. להמשיך?' };
    case 'בהכנה':
      return { label: isPickup ? 'סמני מוכנה לאיסוף' : 'סמני מוכנה למשלוח', newStatus: 'מוכנה למשלוח' };
    case 'מוכנה למשלוח':
      if (isPickup) return { label: 'סמני הושלמה', newStatus: 'הושלמה בהצלחה', confirmText: 'סימון כהושלמה עשוי להפיק חשבונית מס. להמשיך?' };
      return { label: 'סמני נשלחה', newStatus: 'נשלחה' };
    case 'נשלחה':
      return { label: 'סמני הושלמה', newStatus: 'הושלמה בהצלחה', confirmText: 'סימון כהושלמה עשוי להפיק חשבונית מס. להמשיך?' };
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

// Pure helper — returns the next forward status for the work-mode Kanban
// "העבר לשלב הבא" button. Mirrors the verb logic in nextOrderAction but
// strips the label/confirm fields. Pickup orders skip 'נשלחה' and go
// straight to 'הושלמה בהצלחה'. The receipt/invoice triggers in the route
// are unchanged — that's enforced by routing this through patchOrder + the
// existing confirm wrappers, never by writing to Supabase from the card.
function getNextOrderStatus(order: TodayOrder): OrderStatus | null {
  const status = order.סטטוס_הזמנה as OrderStatus;
  const isPickup = (order.סוג_אספקה ?? '') === 'איסוף עצמי';
  switch (status) {
    case 'חדשה':         return 'בהכנה';
    case 'בהכנה':        return 'מוכנה למשלוח';
    case 'מוכנה למשלוח': return isPickup ? 'הושלמה בהצלחה' : 'נשלחה';
    case 'נשלחה':        return 'הושלמה בהצלחה';
    default:             return null;
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>('work');
  const [workView, setWorkView] = useState<WorkView>('table');
  // Active tab in work mode. Persisted to localStorage so the user resumes
  // on the same tab they left.
  const [tab, setTab] = useState<TabId>('overview');
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
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const v = window.localStorage.getItem('dashboard-work-view');
    if (v === 'table' || v === 'flow') setWorkView(v);
  }, []);
  useEffect(() => {
    try { window.localStorage.setItem('dashboard-work-view', workView); } catch { /* no-op */ }
  }, [workView]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t = window.localStorage.getItem('dashboard-tab');
    if (t === 'overview' || t === 'today' || t === 'orders' || t === 'deliveries' || t === 'payments' || t === 'inventory') {
      setTab(t);
    }
  }, []);
  useEffect(() => {
    try { window.localStorage.setItem('dashboard-tab', tab); } catch { /* no-op */ }
  }, [tab]);

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
        text: 'מעבר להכנה עשוי להוריד מלאי. להמשיך?',
        cta: 'אישור — בהכנה',
        onConfirm: async () => { await exec(); setConfirmAction(null); },
      });
    } else if (newStatus === 'הושלמה בהצלחה' && o.סטטוס_הזמנה !== 'הושלמה בהצלחה') {
      setConfirmAction({
        text: 'סימון כהושלמה עשוי להפיק חשבונית מס. להמשיך?',
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

      {/* ════════ HERO ════════ */}
      {/* Compact-but-anchored. Greeting + meta on the right (RTL start),
          primary CTA + utilities on the left. No oversized chrome — just
          enough breathing room to feel premium. */}
      <header className="flex items-end justify-between gap-4 flex-wrap pb-1 border-b" style={{ borderColor: C.borderSoft }}>
        <div className="min-w-0">
          <h1 className="text-[22px] sm:text-[26px] font-bold leading-tight" style={{ color: C.text, letterSpacing: '-0.022em' }}>
            {mode === 'work'
              ? `${greeting}, מה צריך לבצע היום?`
              : 'סקירת פעילות יומית'}
          </h1>
          <p className="text-[12px] mt-1.5" style={{ color: C.textSoft, letterSpacing: '0.005em' }}>
            <span className="font-medium" style={{ color: C.text }}>{dateStr}</span>
            <span className="mx-1.5">·</span>
            <span>{mode === 'work' ? 'לוח עבודה יומי — הזמנות, תשלומים, משלוחים, מלאי' : 'מבט עסקי — KPI, פעילות אחרונה, ניהול'}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 pb-2">
          <button
            onClick={() => fetchAll(false)}
            className="inline-flex items-center justify-center w-10 h-10 rounded-lg border transition-colors"
            style={{ borderColor: C.border, color: C.textSoft, backgroundColor: C.card }}
            aria-label="רענון נתונים"
            title="רענון נתונים"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 0 1-9 9c-2.4 0-4.6-.9-6.3-2.4" />
              <path d="M3 12a9 9 0 0 1 9-9c2.4 0 4.6.9 6.3 2.4" />
              <polyline points="3 18 3 12 9 12" />
              <polyline points="21 6 21 12 15 12" />
            </svg>
          </button>
          <ModeToggle mode={mode} onChange={setMode} />
          <Link
            href="/orders/new"
            className="inline-flex items-center gap-1.5 px-4 h-10 text-[13px] font-semibold rounded-lg transition-colors shadow-sm"
            style={{ backgroundColor: C.espresso, color: '#FFFFFF' }}
          >
            <Icon name="plus" className="w-3.5 h-3.5" /> הזמנה חדשה
          </Link>
        </div>
      </header>

      {/* ════════ KPI STRIP — 5 compact cards, always ═══════════════════════ */}
      {/* Same 5 metrics in both modes. The KPI strip is navigation, not the
          centerpiece — a click scrolls the corresponding section into view
          and (for orders/payment) sets the chip filter. */}
      <section className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          icon="bag"
          label="הזמנות היום"
          value={String(stats?.ordersToday ?? liveOrders.length)}
          accent={C.espresso}
          sub={`${liveOrders.length} פעילות${stats?.ordersTomorrow ? ` · ${stats.ordersTomorrow} מחר` : ''}`}
          active={activeKpi === 'orders'}
          onClick={() => onKpiClick('orders')}
          compact
        />
        <KpiCard
          icon="clock"
          label="ממתין לתשלום"
          value={formatCurrency(stats?.unpaidAmount ?? 0)}
          accent={(stats?.unpaidOrders ?? 0) > 0 ? C.amber : C.textSoft}
          sub={(stats?.unpaidOrders ?? 0) > 0 ? `${stats?.unpaidOrders} הזמנות פתוחות` : 'הכל סגור'}
          active={activeKpi === 'unpaid'}
          onClick={() => onKpiClick('unpaid')}
          compact
        />
        <KpiCard
          icon="truck"
          label="משלוחים היום"
          value={String(stats?.deliveriesToday ?? todayDeliveries.length)}
          accent={C.blue}
          sub={`${stats?.deliveriesDelivered ?? 0} נמסרו · ${stats?.deliveriesCollected ?? 0} נאספו`}
          active={activeKpi === 'deliveries'}
          onClick={() => onKpiClick('deliveries')}
          compact
        />
        <KpiCard
          icon="alert"
          label="מלאי דורש טיפול"
          value={String(stockTotal)}
          accent={stockTotal > 0 ? C.red : C.textSoft}
          sub={stockTotal === 0 ? 'הכל תקין' : `${stock.raw.length} גלם · ${stock.products.length} מוצר · ${stock.petitFours.length} פטיפור`}
          active={activeKpi === 'inventory'}
          onClick={() => onKpiClick('inventory')}
          compact
        />
        <KpiCard
          icon="wallet"
          label="הכנסה צפויה היום"
          value={formatCurrency(expectedRevenue)}
          accent={C.green}
          sub={liveOrders.length > 0 ? `ממוצע ${formatCurrency(expectedRevenue / liveOrders.length)}` : 'אין הזמנות פעילות'}
          active={activeKpi === 'revenue'}
          onClick={() => onKpiClick('revenue')}
          compact
        />
      </section>

      {/* ════════ WORK MODE — tab-based Command Center ═══════════════════ */}
      {mode === 'work' && (() => {
        // Counts shown in the tab labels — small numeric badges next to each
        // tab name. Only counts items that need attention, not totals.
        const tabCounts: Partial<Record<TabId, number>> = {
          today:      liveOrders.filter(o => o.תאריך_אספקה && o.תאריך_אספקה === todayIsraelISO()).length,
          orders:     liveOrders.length,
          deliveries: todayDeliveries.filter(d => d.סטטוס_משלוח !== 'נמסר').length,
          payments:   liveOrders.filter(o => o.סטטוס_תשלום !== 'שולם' && o.סטטוס_תשלום !== 'בארטר').length,
          inventory:  stockTotal,
        };

        // Bundle data + handlers once so each panel gets a uniform set of
        // props. The panels destructure only what they use.
        const data = { stats, todayOrders, liveOrders, todayDeliveries, stock, stockTotal, expectedRevenue };
        const handlers = {
          updatingId,
          onAdvanceOrder:  (o: TodayOrder) => onPickOrderStatus(o, getNextOrderStatus(o)!),
          onMarkPaid:      (o: TodayOrder) => setMarkPaidOrder(o),
          onOpenOrder:     (o: TodayOrder) => router.push(`/orders/${o.id}`),
          onMoreActions:   (o: TodayOrder) => setMoreActionsOrder(o),
          onPatchDelivery: (d: Delivery, next: 'נאסף' | 'נמסר') => patchDelivery(d.id, next, d.סטטוס_משלוח),
          onOpenDelivery:  (d: Delivery) => d.הזמנות?.id && router.push(`/orders/${d.הזמנות.id}`),
        };

        // Quick actions for the side panel — they jump to a specific tab so
        // the user lands directly on the relevant worklist.
        const sideJumps = {
          onJumpUnpaid:     () => setTab('payments'),
          onJumpDeliveries: () => setTab('deliveries'),
          onJumpInventory:  () => setTab('inventory'),
          onJumpUrgent:     () => { setFilterFromChip('urgent'); setTab('orders'); },
        };

        return (
          <>
            <DashboardTabs active={tab} counts={tabCounts} onChange={setTab} />

            <section className="grid grid-cols-1 lg:grid-cols-4 gap-5">
              {/* Main panel area (3/4) */}
              <div className="lg:col-span-3 min-w-0">
                {tab === 'overview' && (
                  <OverviewPanel
                    {...data}
                    {...handlers}
                    onJumpInventory={sideJumps.onJumpInventory}
                  />
                )}
                {tab === 'today' && (
                  <TodayPanel {...data} {...handlers} />
                )}
                {tab === 'orders' && (
                  <OrdersPanel
                    visibleCount={visibleOrders.length}
                    empty={visibleOrders.length === 0}
                    emptyText={filter === 'all' ? 'אין הזמנות פעילות' : 'אין התאמות לסינון הנוכחי'}
                    filterChips={
                      <div className="flex items-end justify-between gap-3 flex-wrap">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <FilterChip label="הכל"             count={filterCounts.all}         active={filter === 'all'}         onClick={() => setFilterFromChip('all')} />
                          <FilterChip label="להתחיל הכנה"     count={filterCounts.start}       active={filter === 'start'}       onClick={() => setFilterFromChip('start')}       tone="amber" />
                          <FilterChip label="לסמן מוכנות"     count={filterCounts.mark_ready}  active={filter === 'mark_ready'}  onClick={() => setFilterFromChip('mark_ready')}  tone="amber" />
                          <FilterChip label="מוכנות לאספקה"   count={filterCounts.ready_to_go} active={filter === 'ready_to_go'} onClick={() => setFilterFromChip('ready_to_go')} />
                          <FilterChip label="ממתינות לתשלום"  count={filterCounts.unpaid}      active={filter === 'unpaid'}      onClick={() => setFilterFromChip('unpaid')}      tone="amber" />
                          <FilterChip label="דחופות"          count={filterCounts.urgent}      active={filter === 'urgent'}      onClick={() => setFilterFromChip('urgent')}      tone="red" />
                        </div>
                        <WorkViewToggle view={workView} onChange={setWorkView} />
                      </div>
                    }
                    table={
                      workView === 'table' ? (
                        <OrdersWorkTable
                          orders={visibleOrders}
                          updatingId={updatingId}
                          onAdvance={handlers.onAdvanceOrder}
                          onMarkPaid={handlers.onMarkPaid}
                          onOpen={handlers.onOpenOrder}
                          onMoreActions={handlers.onMoreActions}
                        />
                      ) : (
                        <KanbanBoard
                          orders={visibleOrders}
                          updatingId={updatingId}
                          onAdvance={handlers.onAdvanceOrder}
                          onMarkPaid={handlers.onMarkPaid}
                          onOpen={handlers.onOpenOrder}
                          onMoreActions={handlers.onMoreActions}
                        />
                      )
                    }
                  />
                )}
                {tab === 'deliveries' && (
                  <DeliveriesPanel
                    deliveries={todayDeliveries}
                    updatingId={updatingId}
                    onPatchDelivery={handlers.onPatchDelivery}
                    onOpenDelivery={handlers.onOpenDelivery}
                  />
                )}
                {tab === 'payments' && (
                  <PaymentsPanel
                    orders={liveOrders}
                    onMarkPaid={handlers.onMarkPaid}
                    onOpenOrder={handlers.onOpenOrder}
                  />
                )}
                {tab === 'inventory' && (
                  <InventoryPanel stock={stock} total={stockTotal} />
                )}
              </div>

              {/* Side panel (1/4) — same across all tabs */}
              <DashboardSidePanel {...data} {...sideJumps} />
            </section>
          </>
        );
      })()}

      {/* ════════ MANAGEMENT MODE — classic 2/3 + 1/3 split ════════════════ */}
      {mode === 'management' && (
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          <div ref={ordersRef} className="lg:col-span-2 space-y-3 scroll-mt-4">
            <SectionHeader title="הזמנות לטיפול היום" count={visibleOrders.length} href="/orders?filter=today" />
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: C.textSoft, letterSpacing: '0.08em' }}>מה דורש טיפול עכשיו?</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <FilterChip label="הכל"             count={filterCounts.all}         active={filter === 'all'}         onClick={() => setFilterFromChip('all')} />
                <FilterChip label="להתחיל הכנה"     count={filterCounts.start}       active={filter === 'start'}       onClick={() => setFilterFromChip('start')}       tone="amber" />
                <FilterChip label="לסמן מוכנות"     count={filterCounts.mark_ready}  active={filter === 'mark_ready'}  onClick={() => setFilterFromChip('mark_ready')}  tone="amber" />
                <FilterChip label="מוכנות לאספקה"   count={filterCounts.ready_to_go} active={filter === 'ready_to_go'} onClick={() => setFilterFromChip('ready_to_go')} />
                <FilterChip label="ממתינות לתשלום"  count={filterCounts.unpaid}      active={filter === 'unpaid'}      onClick={() => setFilterFromChip('unpaid')}      tone="amber" />
                <FilterChip label="דחופות"          count={filterCounts.urgent}      active={filter === 'urgent'}      onClick={() => setFilterFromChip('urgent')}      tone="red" />
              </div>
            </div>
            {visibleOrders.length === 0 ? (
              <EmptyInline
                icon="check"
                title={filter === 'all' ? 'אין הזמנות פעילות להיום' : 'אין התאמות לסינון הנוכחי'}
                hint={filter === 'all' ? 'צפה בכל ההזמנות' : 'נקי את הסינון'}
                hintHref={filter === 'all' ? '/orders' : undefined}
                hintOnClick={filter !== 'all' ? () => setFilter('all') : undefined}
              />
            ) : (
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

          <aside className="space-y-5">
            <div ref={deliveriesRef} className="space-y-3 scroll-mt-4">
              <SectionHeader title="משלוחים היום" count={todayDeliveries.length} href="/deliveries" />
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
            <div ref={inventoryRef} className="space-y-3 scroll-mt-4">
              <SectionHeader title="מלאי דורש טיפול" count={stockTotal} href="/inventory" />
              <StockAttentionCard stock={stock} total={stockTotal} expanded={activeKpi === 'inventory'} />
            </div>
          </aside>
        </section>
      )}

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
                      <PremiumBadge status={o.סטטוס_הזמנה} kind="order" />
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

// ─── PremiumBadge — local replacement for the global StatusBadge ──────────
// Identical API to components/ui/StatusBadge but uses the dashboard-local
// premium palette so the rest of the app keeps its existing tones unchanged.

function PremiumBadge({
  status, kind, size = 'md',
}: {
  status: string;
  kind: 'order' | 'payment' | 'delivery';
  size?: 'sm' | 'md';
}) {
  const map =
    kind === 'payment'  ? PAYMENT_STATUS_TONES :
    kind === 'delivery' ? DELIVERY_STATUS_TONES :
                          ORDER_STATUS_TONES;
  const tone = map[status] ?? FALLBACK_TONE;
  const padding = size === 'sm' ? 'px-1.5 py-px' : 'px-2 py-0.5';
  const text    = size === 'sm' ? 'text-[10px]'  : 'text-[11px]';
  return (
    <span
      className={`inline-flex items-center ${padding} ${text} font-semibold rounded-md whitespace-nowrap`}
      style={{
        backgroundColor: tone.bg,
        color: tone.text,
        border: `1px solid ${tone.border}`,
        letterSpacing: '0.01em',
      }}
    >
      {status}
    </span>
  );
}

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
  icon, label, value, accent, sub, active, onClick, compact,
}: {
  icon: string;
  label: string;
  value: string;
  accent: string;
  sub?: string;
  active?: boolean;
  onClick?: () => void;
  // Compact = smaller padding, smaller value text, no sub line, no hint label.
  // Used in work mode where the KPI strip is navigation only and the action
  // surface is the orders area below.
  compact?: boolean;
}) {
  const interactive = !!onClick;
  const Tag: 'button' | 'div' = interactive ? 'button' : 'div';
  const padCls = compact ? 'px-3 py-2.5' : 'px-4 py-3.5';
  const valueCls = compact ? 'text-lg' : 'text-2xl';
  return (
    <Tag
      onClick={onClick}
      className={`rounded-xl ${padCls} transition-all w-full text-right ${interactive ? 'cursor-pointer hover:-translate-y-px hover:shadow-sm' : ''}`}
      style={{
        backgroundColor: active ? `${accent}08` : C.card,
        border: `1px solid ${active ? accent : C.border}`,
        boxShadow: active
          ? `0 0 0 1px ${accent}30, 0 1px 0 rgba(255,255,255,0.6)`
          : '0 1px 0 rgba(255,255,255,0.6)',
      }}
    >
      <div className={`flex items-center justify-between ${compact ? 'mb-1' : 'mb-2'}`}>
        <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: C.textSoft, letterSpacing: '0.08em' }}>
          {label}
        </p>
        <span
          className={`${compact ? 'w-6 h-6' : 'w-7 h-7'} rounded-lg flex items-center justify-center`}
          style={{ backgroundColor: `${accent}14`, color: accent }}
        >
          <Icon name={icon} className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        </span>
      </div>
      <p className={`${valueCls} font-semibold tabular-nums leading-none`} style={{ color: C.text, letterSpacing: '-0.01em' }}>
        {value}
      </p>
      {sub && !compact && <p className="text-[11px] mt-2 truncate" style={{ color: C.textSoft }}>{sub}</p>}
      {/* Bottom accent rule — thicker when active */}
      <div
        className={`${compact ? 'mt-2' : 'mt-3'} rounded-full transition-all`}
        style={{
          backgroundColor: active ? accent : `${accent}22`,
          height: active ? 3 : 2,
        }}
      />
      {interactive && !compact && (
        <p className="text-[10px] mt-1.5 inline-flex items-center gap-1" style={{ color: active ? accent : C.textSoft }}>
          <span>{active ? '↓ הוצג למטה' : 'לחצי לפירוט'}</span>
        </p>
      )}
    </Tag>
  );
}

// ─── OrderActionCard — stepper-driven work card ───────────────────────────
// Header (number + customer + meta) → horizontal order-status stepper
// (חדשה → בהכנה → מוכנה → נשלחה → הושלמה) → divider → payment stepper
// (ממתין → חלקי → שולם) → footer links. Each circle in either stepper is
// the action — clicking advances/reverts the status. No primary CTA, no
// inline mark-paid button. Cancelled orders get an exception banner instead
// of the order stepper but keep the payment stepper.

function OrderActionCard({
  order, updating, onOpen, onMoreActions, onPickOrderStatus, onPickPaymentStatus,
}: {
  order: TodayOrder;
  updating: boolean;
  onOpen: () => void;
  onMoreActions: () => void;
  onPickOrderStatus: (s: OrderStatus) => void;
  onPickPaymentStatus: (s: 'ממתין' | 'שולם' | 'חלקי' | 'בוטל' | 'בארטר') => void;
}) {
  const c = order.לקוחות;
  const customerName = c ? `${c.שם_פרטי} ${c.שם_משפחה}` : (order.שם_מקבל || 'לקוח');
  const isDelivery = (order.סוג_אספקה ?? '') === 'משלוח';
  const note = (order.הערות_להזמנה ?? '').trim();
  const cancelledOrDraft = order.סטטוס_הזמנה === 'בוטלה' || order.סטטוס_הזמנה === 'טיוטה';

  return (
    <div
      className="rounded-2xl relative overflow-hidden transition-all duration-200 hover:-translate-y-px"
      style={{
        backgroundColor: C.cardSoft,
        border: `1px solid ${C.border}`,
        // Multi-layer shadow: tight 1px lift + ambient soft drop
        boxShadow: '0 1px 2px rgba(58,42,26,0.04), 0 4px 16px rgba(58,42,26,0.04)',
      }}
    >
      {/* Urgent edge marker — single 3px bar on the start (right in RTL). */}
      {order.הזמנה_דחופה && (
        <div
          className="absolute top-0 right-0 bottom-0"
          style={{ width: 3, backgroundColor: '#C75F4D', opacity: 0.85 }}
          aria-hidden
        />
      )}

      <div className="px-6 py-5">
        {/* ── Row 1: customer name (dominant) · ORD# (gold, top-right) ───── */}
        <div className="flex items-start justify-between gap-4 mb-1.5">
          <h3
            className="text-[18px] font-semibold leading-tight truncate flex-1 min-w-0"
            style={{ color: C.text, letterSpacing: '-0.015em' }}
          >
            {customerName}
          </h3>
          <span
            className="font-mono text-[10px] font-semibold uppercase whitespace-nowrap mt-1 flex-shrink-0"
            style={{ color: C.gold, letterSpacing: '0.06em' }}
          >
            {order.מספר_הזמנה}
          </span>
        </div>

        {/* ── Row 2: refined meta line (no icons, dot separators, mono nums) ─ */}
        <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1 text-[12.5px] mb-5" style={{ color: C.textSoft }}>
          <span className="tabular-nums font-medium" style={{ color: C.text }}>
            {order.שעת_אספקה || '—'}
          </span>
          <DotSep />
          <span>{isDelivery ? 'משלוח' : 'איסוף'}</span>
          <DotSep />
          <span className="tabular-nums font-semibold" style={{ color: C.text }}>
            {formatCurrency(order.סך_הכל_לתשלום)}
          </span>
          {order.טלפון_מקבל && (
            <>
              <DotSep />
              <a
                href={`tel:${order.טלפון_מקבל}`}
                onClick={e => e.stopPropagation()}
                className="hover:underline tabular-nums"
                style={{ color: C.textSoft }}
              >
                {order.טלפון_מקבל}
              </a>
            </>
          )}
          {order.הזמנה_דחופה && (
            <>
              <DotSep />
              <span className="font-semibold uppercase tracking-wider text-[10.5px]" style={{ color: '#A8442D' }}>
                דחוף
              </span>
            </>
          )}
        </div>

        {/* ── Optional note: subtle dashed callout ─────────────────────────── */}
        {note && (
          <div
            className="flex items-start gap-2 px-3 py-2 rounded-lg mb-5"
            style={{ backgroundColor: C.goldSoft, border: `1px dashed #DCC8A2` }}
          >
            <Icon name="note" className="w-3 h-3 flex-shrink-0 mt-1" style={{ color: C.gold }} />
            <span className="text-[12px] leading-relaxed flex-1 truncate" style={{ color: C.text }}>{note}</span>
          </div>
        )}

        {/* ── Order status stepper (or exception banner) ───────────────────── */}
        <div className="mb-5">
          {cancelledOrDraft ? (
            <ExceptionStateBanner status={order.סטטוס_הזמנה as 'בוטלה' | 'טיוטה'} />
          ) : (
            <OrderStatusStepper
              order={order}
              updating={updating}
              onPick={onPickOrderStatus}
            />
          )}
        </div>

        {/* ── Hairline ─────────────────────────────────────────────────────── */}
        <div className="h-px mb-4" style={{ backgroundColor: C.borderSoft }} />

        {/* ── Payment stepper ─────────────────────────────────────────────── */}
        <div className="mb-3">
          <PaymentStatusStepper
            order={order}
            updating={updating}
            onPick={onPickPaymentStatus}
          />
        </div>

        {/* ── Footer: tertiary links with refined separator dot ────────────── */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            onClick={onMoreActions}
            className="text-[11px] font-medium hover:underline transition-colors"
            style={{ color: C.textSoft, letterSpacing: '0.01em' }}
          >
            עוד פעולות
          </button>
          <span className="w-1 h-1 rounded-full" style={{ backgroundColor: C.border }} />
          <button
            onClick={onOpen}
            className="text-[11px] font-semibold hover:underline transition-colors"
            style={{ color: C.brand, letterSpacing: '0.01em' }}
          >
            פרטים ←
          </button>
        </div>
      </div>
    </div>
  );
}

function Sep() {
  return <span style={{ color: C.borderSoft }}>·</span>;
}

// Refined dot separator for the meta line — small filled circle instead of
// the standard middle-dot character. Reads cleaner at 12px than "·".
function DotSep() {
  return <span className="inline-block rounded-full flex-shrink-0" style={{ width: 3, height: 3, backgroundColor: C.border }} />;
}

// ─── Kanban (work mode) ──────────────────────────────────────────────────
// 5 columns matching the order-status enum exactly. Each card has ONE
// primary action ("העבר לשלב הבא") computed from getNextOrderStatus, plus
// the secondary "סמני שולם" + small overflow "עוד" + "פרטים". Compact —
// ~150-180px tall — so multiple cards stack cleanly inside a column even
// when there's only one in the whole board.

const KANBAN_COLUMNS: { value: OrderStatus; label: string; tone: Tone }[] = [
  { value: 'חדשה',          label: 'חדשה',   tone: ORDER_STATUS_TONES['חדשה'] },
  { value: 'בהכנה',         label: 'בהכנה',  tone: ORDER_STATUS_TONES['בהכנה'] },
  { value: 'מוכנה למשלוח',  label: 'מוכנה',  tone: ORDER_STATUS_TONES['מוכנה למשלוח'] },
  { value: 'נשלחה',         label: 'נשלחה',  tone: ORDER_STATUS_TONES['נשלחה'] },
  { value: 'הושלמה בהצלחה', label: 'הושלמה', tone: ORDER_STATUS_TONES['הושלמה בהצלחה'] },
];

interface KanbanProps {
  orders: TodayOrder[];
  updatingId: string | null;
  onAdvance: (o: TodayOrder) => void;
  onMarkPaid: (o: TodayOrder) => void;
  onOpen: (o: TodayOrder) => void;
  onMoreActions: (o: TodayOrder) => void;
}

function KanbanBoard({ orders, updatingId, onAdvance, onMarkPaid, onOpen, onMoreActions }: KanbanProps) {
  // Group orders by status. Cancelled / draft are out of the regular ladder
  // — the upstream filter already excludes them, so this reduce is safe.
  const byStatus = new Map<OrderStatus, TodayOrder[]>();
  KANBAN_COLUMNS.forEach(c => byStatus.set(c.value, []));
  for (const o of orders) {
    const arr = byStatus.get(o.סטטוס_הזמנה as OrderStatus);
    if (arr) arr.push(o);
  }

  return (
    <div
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
      // On md and below the columns wrap into 2 columns then 1 on mobile —
      // tablet still gets a usable layout without horizontal scroll.
    >
      {KANBAN_COLUMNS.map(col => (
        <KanbanColumn
          key={col.value}
          column={col}
          items={byStatus.get(col.value) ?? []}
          updatingId={updatingId}
          onAdvance={onAdvance}
          onMarkPaid={onMarkPaid}
          onOpen={onOpen}
          onMoreActions={onMoreActions}
        />
      ))}
    </div>
  );
}

function KanbanColumn({
  column, items, updatingId, onAdvance, onMarkPaid, onOpen, onMoreActions,
}: {
  column: typeof KANBAN_COLUMNS[number];
  items: TodayOrder[];
  updatingId: string | null;
  onAdvance: (o: TodayOrder) => void;
  onMarkPaid: (o: TodayOrder) => void;
  onOpen: (o: TodayOrder) => void;
  onMoreActions: (o: TodayOrder) => void;
}) {
  return (
    <div
      className="rounded-xl px-2 pt-3 pb-2 flex flex-col"
      style={{
        backgroundColor: column.tone.bg,
        border: `1px solid ${column.tone.border}`,
        minHeight: 220,
      }}
    >
      {/* Column header — status name + count */}
      <header className="flex items-center justify-between mb-2.5 px-1.5">
        <span className="text-[12px] font-bold tracking-tight" style={{ color: column.tone.text }}>
          {column.label}
        </span>
        <span
          className="text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md"
          style={{ backgroundColor: 'rgba(255,255,255,0.7)', color: column.tone.text }}
        >
          {items.length}
        </span>
      </header>

      {items.length === 0 ? (
        <div
          className="flex-1 flex items-center justify-center text-[10.5px] py-4 px-2 rounded-md"
          style={{ color: column.tone.text, opacity: 0.5 }}
        >
          ריק
        </div>
      ) : (
        <div className="space-y-2 flex-1">
          {items.map(o => (
            <OrderKanbanCard
              key={o.id}
              order={o}
              updating={updatingId === o.id}
              onAdvance={() => onAdvance(o)}
              onMarkPaid={() => onMarkPaid(o)}
              onOpen={() => onOpen(o)}
              onMoreActions={() => onMoreActions(o)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OrderKanbanCard({
  order, updating, onAdvance, onMarkPaid, onOpen, onMoreActions,
}: {
  order: TodayOrder;
  updating: boolean;
  onAdvance: () => void;
  onMarkPaid: () => void;
  onOpen: () => void;
  onMoreActions: () => void;
}) {
  const c = order.לקוחות;
  const customerName = c ? `${c.שם_פרטי} ${c.שם_משפחה}` : (order.שם_מקבל || 'לקוח');
  const isDelivery = (order.סוג_אספקה ?? '') === 'משלוח';
  const action = nextOrderAction(order);
  const paid = order.סטטוס_תשלום === 'שולם' || order.סטטוס_תשלום === 'בארטר';

  return (
    <div
      className="rounded-lg px-3 py-2.5 transition-shadow hover:shadow-sm relative overflow-hidden"
      style={{
        backgroundColor: C.card,
        border: `1px solid ${C.border}`,
        boxShadow: '0 1px 2px rgba(58,42,26,0.05)',
      }}
    >
      {order.הזמנה_דחופה && (
        <div className="absolute top-0 right-0 bottom-0" style={{ width: 2.5, backgroundColor: '#C75F4D' }} aria-hidden />
      )}

      {/* Top row: ord# + urgent flag */}
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="font-mono text-[10px] font-semibold uppercase truncate" style={{ color: C.gold, letterSpacing: '0.04em' }}>
          {order.מספר_הזמנה}
        </span>
        {order.הזמנה_דחופה && (
          <span className="text-[9px] font-bold uppercase tracking-wider flex-shrink-0" style={{ color: '#C75F4D' }}>
            דחוף
          </span>
        )}
      </div>

      {/* Customer name */}
      <p className="text-[13.5px] font-semibold leading-tight truncate mb-1.5" style={{ color: C.text, letterSpacing: '-0.01em' }}>
        {customerName}
      </p>

      {/* Meta line */}
      <div className="flex items-center gap-x-2 gap-y-0.5 text-[11px] flex-wrap mb-2" style={{ color: C.textSoft }}>
        <span className="tabular-nums font-medium" style={{ color: C.text }}>
          {order.שעת_אספקה || '—'}
        </span>
        <DotSep />
        <span>{isDelivery ? 'משלוח' : 'איסוף'}</span>
        <DotSep />
        <span className="tabular-nums font-semibold" style={{ color: C.text }}>
          {formatCurrency(order.סך_הכל_לתשלום)}
        </span>
      </div>

      {order.טלפון_מקבל && (
        <a
          href={`tel:${order.טלפון_מקבל}`}
          onClick={e => e.stopPropagation()}
          className="text-[11px] hover:underline tabular-nums block mb-2 truncate"
          style={{ color: C.textSoft }}
        >
          {order.טלפון_מקבל}
        </a>
      )}

      {/* Payment indicator — pill-style; small mark-paid affordance inline */}
      <div className="mb-2.5">
        {paid ? (
          <PremiumBadge status={order.סטטוס_תשלום} kind="payment" size="sm" />
        ) : (
          <div
            className="flex items-center justify-between gap-2 px-2 py-1 rounded-md"
            style={{ backgroundColor: '#FBF1DC', border: '1px solid #EAC78C' }}
          >
            <span className="text-[10.5px] font-semibold" style={{ color: '#92602A' }}>
              ממתין לתשלום
            </span>
            <button
              onClick={e => { e.stopPropagation(); onMarkPaid(); }}
              disabled={updating}
              className="text-[10px] font-semibold px-2 h-5 rounded-md text-white transition-colors disabled:opacity-60"
              style={{ backgroundColor: C.green }}
            >
              סמני שולם
            </button>
          </div>
        )}
      </div>

      {/* Primary advance button + tertiary links */}
      <div className="flex items-center gap-1.5">
        {action ? (
          <button
            onClick={onAdvance}
            disabled={updating}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-md text-[12px] font-semibold text-white transition-colors disabled:opacity-60"
            style={{ backgroundColor: C.brand }}
          >
            <span>{updating ? '...' : action.label}</span>
            <Icon name="arrow" className="w-3 h-3 rtl-flip" />
          </button>
        ) : (
          <span
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-md text-[11px] font-medium"
            style={{ backgroundColor: C.brandSoft, color: C.brand }}
          >
            <Icon name="check" className="w-3 h-3" /> בוצעו כל השלבים
          </span>
        )}
      </div>

      {/* Footer micro-links */}
      <div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t" style={{ borderColor: C.borderSoft }}>
        <button
          onClick={onMoreActions}
          className="text-[10.5px] hover:underline transition-colors"
          style={{ color: C.textSoft }}
        >
          עוד
        </button>
        <span className="w-0.5 h-0.5 rounded-full" style={{ backgroundColor: C.border }} />
        <button
          onClick={onOpen}
          className="text-[10.5px] font-semibold hover:underline transition-colors"
          style={{ color: C.brand }}
        >
          פרטים
        </button>
      </div>
    </div>
  );
}

// ─── OrderStatusStepper ──────────────────────────────────────────────────
// 5 circular steps with hair-line connectors. Past steps show a check, the
// current step is filled with a soft ring around it, future steps are empty
// with a light border. Each circle is a full-width tap target (≥36px tall
// including label) for tablet use.
//
// IMPORTANT: the API value sent to PATCH stays the literal status string
// the DB expects ('מוכנה למשלוח', 'הושלמה בהצלחה'). The label shown to the
// user can be a shorter display string ('מוכנה', 'הושלמה').

const ORDER_STEPS: { label: string; value: OrderStatus }[] = [
  { label: 'חדשה',   value: 'חדשה' },
  { label: 'בהכנה',  value: 'בהכנה' },
  { label: 'מוכנה',  value: 'מוכנה למשלוח' },
  { label: 'נשלחה',  value: 'נשלחה' },
  { label: 'הושלמה', value: 'הושלמה בהצלחה' },
];

function OrderStatusStepper({
  order, updating, onPick,
}: {
  order: TodayOrder;
  updating: boolean;
  onPick: (s: OrderStatus) => void;
}) {
  const currentIdx = Math.max(0, ORDER_STEPS.findIndex(s => s.value === order.סטטוס_הזמנה));
  // Pickup orders never "ship" — relabel the 4th step to "נמסרה" so the verb
  // matches the flow the kitchen uses for self-collect orders. The PATCH still
  // sends 'נשלחה' under the hood, which is what the route + Morning expect.
  const isPickup = (order.סוג_אספקה ?? '') === 'איסוף עצמי';
  const steps = isPickup
    ? ORDER_STEPS.map((s, i) => (i === 3 ? { ...s, label: 'נמסרה' } : s))
    : ORDER_STEPS;
  const lastIdx = steps.length - 1;

  const currentLabel = steps[currentIdx]?.label ?? steps[0].label;

  return (
    <div>
      {/* ── Status callout: makes the current step unmistakable without
            making the user decode the dots first. ──────────────────────── */}
      <div className="flex items-baseline justify-between mb-3">
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] uppercase font-semibold" style={{ color: C.textSoft, letterSpacing: '0.1em' }}>
            סטטוס
          </span>
          <span className="text-[14px] font-bold" style={{ color: C.text, letterSpacing: '-0.005em' }}>
            {currentLabel}
          </span>
        </div>
        <span className="text-[10px] font-medium tabular-nums" style={{ color: C.textSoft }}>
          שלב {currentIdx + 1} מתוך {steps.length}
        </span>
      </div>

      {/* ── Stepper ─────────────────────────────────────────────────────── */}
      <div className="flex items-start" dir="rtl">
        {steps.map((step, idx) => {
          const isPast    = idx <  currentIdx;
          const isCurrent = idx === currentIdx;
          const isFuture  = idx >  currentIdx;
          const circleBg     = isCurrent ? C.brand : isPast ? C.gold : C.cardSoft;
          const circleColor  = isPast || isCurrent ? '#FFFFFF' : C.textSoft;
          const circleBorder = isCurrent ? C.brand : isPast ? C.gold : C.border;
          return (
            <Fragment key={step.value}>
              <button
                onClick={() => !isCurrent && onPick(step.value)}
                disabled={updating || isCurrent}
                className="flex flex-col items-center gap-2 flex-shrink-0 disabled:cursor-default group transition-transform hover:-translate-y-px"
                style={{ minWidth: 60 }}
                aria-label={`שינוי סטטוס ל${step.label}`}
                aria-current={isCurrent ? 'step' : undefined}
              >
                <span
                  className="rounded-full flex items-center justify-center font-semibold transition-all"
                  style={{
                    width:           28,
                    height:          28,
                    backgroundColor: circleBg,
                    color:           circleColor,
                    border:          `1.5px solid ${circleBorder}`,
                    fontSize:        11,
                    boxShadow: isCurrent
                      ? `0 0 0 5px ${C.brand}12, 0 2px 4px rgba(58,42,26,0.14)`
                      : isPast
                      ? `0 1px 2px rgba(184,152,112,0.25)`
                      : 'none',
                  }}
                >
                  {isPast ? <Icon name="check" className="w-3 h-3" /> : idx + 1}
                </span>
                <span
                  className="text-[10.5px] whitespace-nowrap transition-colors"
                  style={{
                    color: isCurrent ? C.text : C.textSoft,
                    fontWeight: isCurrent ? 700 : isPast ? 500 : 400,
                    letterSpacing: '0.01em',
                    opacity: isFuture ? 0.7 : 1,
                  }}
                >
                  {step.label}
                </span>
              </button>
              {idx < lastIdx && (
                <div
                  className="flex-1 transition-colors"
                  style={{
                    backgroundColor: idx < currentIdx ? C.gold : C.border,
                    height: 2,
                    minWidth: 12,
                    // 28px circle / 2 - 2px line / 2 = 13
                    marginTop: 13,
                  }}
                />
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ─── PaymentStatusStepper ────────────────────────────────────────────────
// Compact 3-state row: ממתין → חלקי → שולם. The שולם click opens MarkPaidModal
// (handled upstream by onPickPaymentStatus). 'בארטר' and 'בוטל' aren't on the
// regular ladder — render a labelled chip instead so the user still sees the
// state without having to engage with the stepper.

const PAYMENT_STEPS: { label: string; value: 'ממתין' | 'חלקי' | 'שולם'; tone: 'amber' | 'green' }[] = [
  { label: 'ממתין', value: 'ממתין', tone: 'amber' },
  { label: 'חלקי',  value: 'חלקי',  tone: 'amber' },
  { label: 'שולם',  value: 'שולם',  tone: 'green' },
];

function PaymentStatusStepper({
  order, updating, onPick,
}: {
  order: TodayOrder;
  updating: boolean;
  onPick: (s: 'ממתין' | 'שולם' | 'חלקי' | 'בוטל' | 'בארטר') => void;
}) {
  const status = order.סטטוס_תשלום;

  if (status === 'בארטר' || status === 'בוטל') {
    const tone = status === 'בוטל'
      ? { bg: '#FEE4E2', text: '#991B1B', border: '#F5BFC0' }
      : { bg: '#EEEAF4', text: '#4A3868', border: '#D4C8E8' };
    return (
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold w-12 flex-shrink-0" style={{ color: C.textSoft }}>תשלום</span>
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold"
          style={{ backgroundColor: tone.bg, color: tone.text, border: `1px solid ${tone.border}` }}
        >
          {status === 'בוטל' ? 'תשלום בוטל' : 'בארטר'}
        </span>
        <button
          onClick={() => onPick('ממתין')}
          disabled={updating}
          className="text-[11px] hover:underline disabled:opacity-50"
          style={{ color: C.textSoft }}
        >
          איפוס לממתין
        </button>
      </div>
    );
  }

  const currentIdx = Math.max(0, PAYMENT_STEPS.findIndex(s => s.value === status));
  const lastIdx = PAYMENT_STEPS.length - 1;

  return (
    <div className="flex items-center" dir="rtl">
      <span className="text-[11px] font-semibold w-12 flex-shrink-0" style={{ color: C.textSoft }}>תשלום</span>
      {PAYMENT_STEPS.map((step, idx) => {
        const isPast    = idx <  currentIdx;
        const isCurrent = idx === currentIdx;
        const isFuture  = idx >  currentIdx;
        const accent = step.tone === 'green' ? C.green : C.amber;
        // Past payment steps use matte gold for consistency with the order
        // stepper above; current step is the live tone (amber/green); future
        // is cream + light border.
        const circleBg     = isCurrent ? accent : isPast ? C.gold : C.cardSoft;
        const circleColor  = isPast || isCurrent ? '#FFFFFF' : C.textSoft;
        const circleBorder = isCurrent ? accent : isPast ? C.gold : C.border;
        return (
          <Fragment key={step.value}>
            <button
              onClick={() => !isCurrent && onPick(step.value)}
              disabled={updating || isCurrent}
              className="flex items-center gap-1.5 flex-shrink-0 disabled:cursor-default px-1 transition-transform hover:-translate-y-px"
              aria-label={`שינוי תשלום ל${step.label}`}
              aria-current={isCurrent ? 'step' : undefined}
            >
              <span
                className="rounded-full flex items-center justify-center text-[10px] font-semibold transition-all"
                style={{
                  width:           isCurrent ? 22 : 20,
                  height:          isCurrent ? 22 : 20,
                  backgroundColor: circleBg,
                  color:           circleColor,
                  border:          `1px solid ${circleBorder}`,
                  boxShadow: isCurrent
                    ? `0 0 0 3px ${accent}1A`
                    : isPast
                    ? `0 1px 1px rgba(184,152,112,0.20)`
                    : 'none',
                }}
              >
                {isPast ? <Icon name="check" className="w-2.5 h-2.5" /> : ''}
              </span>
              <span
                className="text-[11px] whitespace-nowrap transition-colors"
                style={{
                  color: isCurrent ? C.text : isPast ? C.text : C.textSoft,
                  fontWeight: isCurrent ? 700 : isPast ? 600 : 500,
                  letterSpacing: '0.01em',
                }}
              >
                {step.label}
              </span>
            </button>
            {idx < lastIdx && (
              <div
                className="flex-1 transition-colors mx-1.5"
                style={{
                  backgroundColor: idx < currentIdx ? C.gold : C.border,
                  height: 2,
                  minWidth: 10,
                }}
              />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

// ─── ExceptionStateBanner — replaces the order stepper for cancelled/draft ─

function ExceptionStateBanner({ status }: { status: 'בוטלה' | 'טיוטה' }) {
  const isCancelled = status === 'בוטלה';
  const tone = isCancelled
    ? { bg: '#FEE4E2', text: '#991B1B', border: '#F5BFC0', label: 'ההזמנה בוטלה', hint: 'להחזרה השתמשי ב"עוד פעולות"' }
    : { bg: '#F5F0FA', text: '#5B21B6', border: '#DDD6FE', label: 'טיוטה', hint: 'ההזמנה אינה פעילה — להפעלה השתמשי ב"עוד פעולות"' };
  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
      style={{ backgroundColor: tone.bg, border: `1px solid ${tone.border}` }}
    >
      <Icon name="alert" className="w-4 h-4 flex-shrink-0" style={{ color: tone.text }} />
      <span className="text-[12px] font-semibold" style={{ color: tone.text }}>{tone.label}</span>
      <span className="text-[11px] flex-1 truncate" style={{ color: tone.text, opacity: 0.8 }}>{tone.hint}</span>
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
        <PremiumBadge status={delivery.סטטוס_משלוח} kind="delivery" />
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

      {/* Action area — three distinct visual states matching the spec:
          ממתין → primary button (triggers PATCH which auto-opens WhatsApp
                  if the courier has a phone)
          נאסף  → status text only ("ממתין לאישור מסירה מהשליח") + tiny
                  manual override link "סמן ידנית" for exception cases
          נמסר  → green "נמסר" pill, no primary action */}
      <div className="flex items-center gap-2">
        {delivery.סטטוס_משלוח === 'ממתין' && action && (
          <button
            onClick={() => onPrimary(action.newStatus)}
            disabled={updating}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-lg text-[12px] font-semibold text-white transition-colors disabled:opacity-60"
            style={{ backgroundColor: C.brand }}
          >
            <Icon name="truck" className="w-3.5 h-3.5" />
            {updating ? '...' : 'סמן נאסף ושלח לשליח'}
          </button>
        )}

        {delivery.סטטוס_משלוח === 'נאסף' && (
          <div
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 px-3 rounded-lg text-[11.5px] font-semibold"
            style={{ backgroundColor: '#DBEAFE', color: '#1E40AF', border: '1px solid #BFD2F2' }}
          >
            <Icon name="truck" className="w-3.5 h-3.5" />
            נאסף · ממתין לאישור מסירה מהשליח
          </div>
        )}

        {delivery.סטטוס_משלוח === 'נמסר' && (
          <div
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-lg text-[12px] font-semibold"
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

      {/* Exception escape hatch — only when נאסף, only as a tiny text link */}
      {delivery.סטטוס_משלוח === 'נאסף' && (
        <div className="text-end mt-1.5">
          <button
            onClick={() => onPrimary('נמסר')}
            disabled={updating}
            className="text-[10.5px] hover:underline disabled:opacity-50"
            style={{ color: C.textSoft }}
          >
            סמן נמסר ידנית (חריג)
          </button>
        </div>
      )}
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
        סימון כשולם עשוי להפיק קבלה. בחרי את אמצעי התשלום שיופיע על הקבלה:
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
      <PremiumBadge status={order.סטטוס_הזמנה} kind="order" />
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

// ═══════════════════════════════════════════════════════════════════════════
// Command Center components — added in the v2 dashboard rewrite. Pure UI;
// no logic, no fetches, no writes — they all delegate to the parent's
// existing handlers (patchOrder / patchDelivery / setMarkPaidOrder /
// setMoreActionsOrder), which means every button still flows through
// PATCH /api/orders/[id] and PATCH /api/deliveries/[id] exactly as before.
// ═══════════════════════════════════════════════════════════════════════════

// ─── WorkViewToggle — flips between the dense table view and the Kanban ──

function WorkViewToggle({ view, onChange }: { view: WorkView; onChange: (v: WorkView) => void }) {
  const opt = (val: WorkView, label: string, icon: React.ReactNode) => {
    const active = view === val;
    return (
      <button
        key={val}
        onClick={() => onChange(val)}
        className="inline-flex items-center gap-1.5 px-2.5 h-7 text-[11px] font-semibold rounded-md transition-colors"
        style={{
          backgroundColor: active ? C.card : 'transparent',
          color: active ? C.text : C.textSoft,
          boxShadow: active ? '0 1px 2px rgba(58,42,26,0.06)' : undefined,
        }}
        aria-pressed={active}
      >
        {icon}
        {label}
      </button>
    );
  };
  const tableIcon = (
    <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  );
  const flowIcon = (
    <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="5" height="16" rx="1.5" />
      <rect x="10" y="4" width="5" height="11" rx="1.5" />
      <rect x="17" y="4" width="4" height="7" rx="1.5" />
    </svg>
  );
  return (
    <div
      className="inline-flex p-0.5 rounded-lg"
      style={{ backgroundColor: '#F3EBDD', border: `1px solid ${C.border}` }}
      role="group"
      aria-label="תצוגת עבודה"
    >
      {opt('table', 'טבלה', tableIcon)}
      {opt('flow', 'זרימה', flowIcon)}
    </div>
  );
}

// ─── OrdersWorkTable — premium dense work table ───────────────────────────
// 7 columns: order# / customer / time / type / amount / status+payment /
// next-step + actions. Hover highlights the row, the action column shows
// the next forward verb computed by nextOrderAction (so the user never has
// to think about which status comes next). Mark-paid lives inline on the
// payment cell when payment is open.

function OrdersWorkTable({
  orders, updatingId, onAdvance, onMarkPaid, onOpen, onMoreActions,
}: {
  orders: TodayOrder[];
  updatingId: string | null;
  onAdvance: (o: TodayOrder) => void;
  onMarkPaid: (o: TodayOrder) => void;
  onOpen: (o: TodayOrder) => void;
  onMoreActions: (o: TodayOrder) => void;
}) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        backgroundColor: C.card,
        border: `1px solid ${C.border}`,
        boxShadow: '0 1px 2px rgba(58,42,26,0.04), 0 4px 16px rgba(58,42,26,0.04)',
      }}
    >
      {/* Header strip */}
      <div
        className="grid items-center gap-3 px-4 py-2.5 text-[10px] uppercase font-semibold"
        style={{
          backgroundColor: '#F8F1E2',
          color: C.textSoft,
          letterSpacing: '0.08em',
          gridTemplateColumns: '74px minmax(0,1.6fr) 56px 64px 80px minmax(0,1fr) auto',
          borderBottom: `1px solid ${C.borderSoft}`,
        }}
      >
        <span>הזמנה</span>
        <span>לקוח</span>
        <span>שעה</span>
        <span>אספקה</span>
        <span>סכום</span>
        <span>סטטוס</span>
        <span className="text-end">פעולה</span>
      </div>

      {/* Rows */}
      {orders.map((o, idx) => {
        const isLast = idx === orders.length - 1;
        const customer = o.לקוחות;
        const customerName = customer ? `${customer.שם_פרטי} ${customer.שם_משפחה}` : (o.שם_מקבל || 'לקוח');
        const isDelivery = (o.סוג_אספקה ?? '') === 'משלוח';
        const action = nextOrderAction(o);
        const paid = o.סטטוס_תשלום === 'שולם' || o.סטטוס_תשלום === 'בארטר';
        const updating = updatingId === o.id;
        return (
          <div
            key={o.id}
            className="grid items-center gap-3 px-4 py-3 transition-colors hover:bg-amber-50/50 group relative"
            style={{
              gridTemplateColumns: '74px minmax(0,1.6fr) 56px 64px 80px minmax(0,1fr) auto',
              borderBottom: isLast ? 'none' : `1px solid ${C.borderSoft}`,
            }}
          >
            {o.הזמנה_דחופה && (
              <div
                className="absolute top-0 right-0 bottom-0"
                style={{ width: 2, backgroundColor: '#C75F4D' }}
                aria-hidden
              />
            )}

            {/* Order # */}
            <button
              onClick={() => onOpen(o)}
              className="font-mono text-[10.5px] font-semibold text-start hover:underline transition-colors uppercase"
              style={{ color: C.gold, letterSpacing: '0.04em' }}
              title={`פתח הזמנה ${o.מספר_הזמנה}`}
            >
              {o.מספר_הזמנה.replace(/^ORD-/, '')}
            </button>

            {/* Customer + tags */}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[13.5px] font-semibold truncate" style={{ color: C.text, letterSpacing: '-0.005em' }}>
                  {customerName}
                </span>
                {o.הזמנה_דחופה && (
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0" style={{ color: '#A8442D', backgroundColor: '#FEE7E2' }}>
                    דחוף
                  </span>
                )}
              </div>
              {o.טלפון_מקבל && (
                <a
                  href={`tel:${o.טלפון_מקבל}`}
                  onClick={e => e.stopPropagation()}
                  className="text-[10.5px] hover:underline tabular-nums truncate inline-block"
                  style={{ color: C.textSoft }}
                >
                  {o.טלפון_מקבל}
                </a>
              )}
            </div>

            {/* Time */}
            <span className="tabular-nums text-[12px] font-medium" style={{ color: C.text }}>
              {o.שעת_אספקה || '—'}
            </span>

            {/* Delivery type */}
            <span
              className="inline-flex items-center justify-center text-[10px] font-semibold px-2 py-1 rounded-md w-fit"
              style={{
                backgroundColor: isDelivery ? C.blueSoft : C.brandSoft,
                color: isDelivery ? C.blue : C.brand,
              }}
            >
              {isDelivery ? 'משלוח' : 'איסוף'}
            </span>

            {/* Amount */}
            <span className="tabular-nums text-[13px] font-bold" style={{ color: C.text }}>
              {formatCurrency(o.סך_הכל_לתשלום)}
            </span>

            {/* Status badges + inline mark-paid */}
            <div className="flex items-center gap-1.5 min-w-0">
              <PremiumBadge status={o.סטטוס_הזמנה} kind="order" size="sm" />
              {paid ? (
                <PremiumBadge status={o.סטטוס_תשלום} kind="payment" size="sm" />
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); onMarkPaid(o); }}
                  disabled={updating}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md transition-colors disabled:opacity-60"
                  style={{ backgroundColor: '#FBF1DC', color: '#92602A', border: '1px solid #EAC78C' }}
                  title="סמני שולם"
                >
                  <Icon name="wallet" className="w-2.5 h-2.5" />
                  שולם
                </button>
              )}
            </div>

            {/* Primary action + overflow */}
            <div className="flex items-center gap-1 justify-end flex-shrink-0">
              {action ? (
                <button
                  onClick={() => onAdvance(o)}
                  disabled={updating}
                  className="inline-flex items-center gap-1 h-8 px-3 text-[11.5px] font-semibold text-white rounded-md transition-colors disabled:opacity-60"
                  style={{ backgroundColor: C.espresso }}
                >
                  <span>{updating ? '...' : action.label}</span>
                  <Icon name="arrow" className="w-3 h-3 rtl-flip" />
                </button>
              ) : (
                <span
                  className="inline-flex items-center gap-1 h-8 px-2.5 text-[10.5px] font-medium rounded-md"
                  style={{ backgroundColor: C.brandSoft, color: C.brand }}
                >
                  <Icon name="check" className="w-3 h-3" />
                  הושלם
                </span>
              )}
              <button
                onClick={() => onMoreActions(o)}
                className="inline-flex items-center justify-center w-7 h-8 rounded-md transition-colors hover:bg-amber-100/50"
                style={{ color: C.textSoft }}
                title="עוד פעולות"
                aria-label="עוד פעולות"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" /></svg>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── AttentionPanel — sidebar of urgent items requiring attention ────────

function AttentionPanel({
  stats, liveOrders, todayDeliveries, stockTotal,
  onJumpUnpaid, onJumpDeliveries, onJumpInventory, onJumpUrgent,
}: {
  stats: DashboardStats | null;
  liveOrders: TodayOrder[];
  todayDeliveries: Delivery[];
  stockTotal: number;
  onJumpUnpaid: () => void;
  onJumpDeliveries: () => void;
  onJumpInventory: () => void;
  onJumpUrgent: () => void;
}) {
  const urgentCount = liveOrders.filter(o => o.הזמנה_דחופה).length;
  const unpaidCount = stats?.unpaidOrders ?? 0;
  const unpaidAmount = stats?.unpaidAmount ?? 0;
  const pendingDeliveryCount = todayDeliveries.filter(d => d.סטטוס_משלוח === 'ממתין').length;
  const collectedNotDeliveredCount = todayDeliveries.filter(d => d.סטטוס_משלוח === 'נאסף').length;

  type AttentionItem = {
    key: string;
    severity: 'red' | 'amber' | 'blue';
    title: string;
    sub: string;
    onAction: () => void;
    actionLabel: string;
  };
  const items: AttentionItem[] = [];

  if (urgentCount > 0) {
    items.push({
      key: 'urgent',
      severity: 'red',
      title: `${urgentCount} הזמנות דחופות`,
      sub: 'מסומנות לטיפול מיידי',
      onAction: onJumpUrgent,
      actionLabel: 'הצג',
    });
  }
  if (unpaidCount > 0) {
    items.push({
      key: 'unpaid',
      severity: 'amber',
      title: `${unpaidCount} ממתינות לתשלום`,
      sub: `סך פתוח ${formatCurrency(unpaidAmount)}`,
      onAction: onJumpUnpaid,
      actionLabel: 'גבה',
    });
  }
  if (stockTotal > 0) {
    items.push({
      key: 'stock',
      severity: 'red',
      title: `${stockTotal} פריטי מלאי קריטיים`,
      sub: 'לבדוק לפני המשך הכנה',
      onAction: onJumpInventory,
      actionLabel: 'בדוק',
    });
  }
  if (pendingDeliveryCount > 0) {
    items.push({
      key: 'pending-delivery',
      severity: 'amber',
      title: `${pendingDeliveryCount} משלוחים ממתינים`,
      sub: 'טרם נאספו על ידי שליח',
      onAction: onJumpDeliveries,
      actionLabel: 'שלח',
    });
  }
  if (collectedNotDeliveredCount > 0) {
    items.push({
      key: 'in-transit',
      severity: 'blue',
      title: `${collectedNotDeliveredCount} משלוחים בדרך`,
      sub: 'ממתינים לאישור מסירה מהשליח',
      onAction: onJumpDeliveries,
      actionLabel: 'מעקב',
    });
  }

  const sevTone: Record<AttentionItem['severity'], { bar: string; chip: string; chipText: string }> = {
    red:   { bar: '#C75F4D', chip: '#FEE4E2', chipText: '#991B1B' },
    amber: { bar: '#D9A655', chip: '#FBF1DC', chipText: '#92602A' },
    blue:  { bar: '#5B8FB8', chip: '#DBEAFE', chipText: '#1E40AF' },
  };

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <h2 className="text-[15px] font-bold tracking-tight" style={{ color: C.text }}>דורש תשומת לב</h2>
        <span className="text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md" style={{ backgroundColor: items.length > 0 ? '#FEE4E2' : C.brandSoft, color: items.length > 0 ? '#991B1B' : C.brand }}>
          {items.length}
        </span>
      </div>

      {items.length === 0 ? (
        <div
          className="rounded-xl px-4 py-8 text-center"
          style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}
        >
          <div
            className="w-9 h-9 mx-auto rounded-full flex items-center justify-center mb-2"
            style={{ backgroundColor: C.greenSoft, color: C.green }}
          >
            <Icon name="check" className="w-4 h-4" />
          </div>
          <p className="text-[13px] font-semibold" style={{ color: C.text }}>הכל בשליטה</p>
          <p className="text-[11px] mt-1" style={{ color: C.textSoft }}>אין פריטים שדורשים טיפול דחוף</p>
        </div>
      ) : (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            backgroundColor: C.card,
            border: `1px solid ${C.border}`,
            boxShadow: '0 1px 2px rgba(58,42,26,0.04)',
          }}
        >
          {items.map((it, idx) => {
            const tone = sevTone[it.severity];
            const isLast = idx === items.length - 1;
            return (
              <div
                key={it.key}
                className="flex items-stretch transition-colors hover:bg-amber-50/40"
                style={{ borderBottom: isLast ? 'none' : `1px solid ${C.borderSoft}` }}
              >
                <div style={{ width: 3, backgroundColor: tone.bar }} aria-hidden />
                <div className="flex-1 px-3 py-3 flex items-center gap-3 min-w-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold truncate" style={{ color: C.text }}>{it.title}</p>
                    <p className="text-[11px] mt-0.5 truncate" style={{ color: C.textSoft }}>{it.sub}</p>
                  </div>
                  <button
                    onClick={it.onAction}
                    className="inline-flex items-center text-[11px] font-semibold px-2.5 h-7 rounded-md transition-colors flex-shrink-0"
                    style={{ backgroundColor: tone.chip, color: tone.chipText }}
                  >
                    {it.actionLabel}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── PanelDeliveries / PanelStock / PanelPayments — bottom 3-panel row ───

function BottomPanelShell({
  innerRef, title, count, href, children,
}: {
  innerRef?: React.RefObject<HTMLDivElement | null>;
  title: string;
  count: number;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <div ref={innerRef as React.RefObject<HTMLDivElement>} className="space-y-3 scroll-mt-4">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <h3 className="text-[13px] font-bold tracking-tight" style={{ color: C.text }}>{title}</h3>
          <span className="text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md" style={{ backgroundColor: C.brandSoft, color: C.brand }}>
            {count}
          </span>
        </div>
        <Link href={href} className="text-[10.5px] font-medium hover:underline" style={{ color: C.textSoft }}>
          לרשימה המלאה →
        </Link>
      </div>
      <div
        className="rounded-xl"
        style={{
          backgroundColor: C.card,
          border: `1px solid ${C.border}`,
          boxShadow: '0 1px 2px rgba(58,42,26,0.04)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function PanelDeliveries({
  innerRef, deliveries, updatingId, onPrimary, onOpen,
}: {
  innerRef: React.RefObject<HTMLDivElement | null>;
  deliveries: Delivery[];
  updatingId: string | null;
  onPrimary: (d: Delivery, next: 'נאסף' | 'נמסר') => void;
  onOpen: (d: Delivery) => void;
}) {
  const top = deliveries.slice(0, 4);
  return (
    <BottomPanelShell innerRef={innerRef} title="משלוחים היום" count={deliveries.length} href="/deliveries">
      {top.length === 0 ? (
        <div className="px-4 py-5 text-center text-[12px]" style={{ color: C.textSoft }}>
          אין משלוחים מתוכננים להיום
        </div>
      ) : (
        <ul>
          {top.map((d, idx) => {
            const o = d.הזמנות;
            const c = o?.לקוחות;
            const recipient = o?.שם_מקבל || (c ? `${c.שם_פרטי} ${c.שם_משפחה}` : 'לקוח');
            const isLast = idx === top.length - 1;
            const status = d.סטטוס_משלוח;
            const updating = updatingId === d.id;
            return (
              <li
                key={d.id}
                className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-amber-50/40"
                style={{ borderBottom: isLast ? 'none' : `1px solid ${C.borderSoft}` }}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-semibold truncate" style={{ color: C.text }}>{recipient}</p>
                  <p className="text-[10.5px] truncate" style={{ color: C.textSoft }}>
                    {[d.כתובת, d.עיר].filter(Boolean).join(', ') || 'אין כתובת'}
                  </p>
                </div>
                {status === 'ממתין' && (
                  <button
                    onClick={() => onPrimary(d, 'נאסף')}
                    disabled={updating}
                    className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-2.5 h-7 rounded-md text-white transition-colors disabled:opacity-60 flex-shrink-0"
                    style={{ backgroundColor: C.espresso }}
                  >
                    <Icon name="truck" className="w-3 h-3" />
                    שלח לשליח
                  </button>
                )}
                {status === 'נאסף' && (
                  <span
                    className="text-[10.5px] font-semibold px-2 py-1 rounded-md flex-shrink-0"
                    style={{ backgroundColor: '#DBEAFE', color: '#1E40AF' }}
                  >
                    בדרך
                  </span>
                )}
                {status === 'נמסר' && (
                  <span
                    className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-1 rounded-md flex-shrink-0"
                    style={{ backgroundColor: C.greenSoft, color: C.green }}
                  >
                    <Icon name="check" className="w-3 h-3" />
                    נמסר
                  </span>
                )}
                <button
                  onClick={() => onOpen(d)}
                  className="text-[10px] font-medium hover:underline flex-shrink-0"
                  style={{ color: C.textSoft }}
                >
                  →
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </BottomPanelShell>
  );
}

function PanelStock({
  innerRef, stock, total, expanded,
}: {
  innerRef: React.RefObject<HTMLDivElement | null>;
  stock: { raw: StockRow[]; products: StockRow[]; petitFours: StockRow[] };
  total: number;
  expanded: boolean;
}) {
  // Flatten alerts ordered by severity (אזל → קריטי → מלאי נמוך).
  const all: (StockRow & { kind: string })[] = [
    ...stock.raw.map(r => ({ ...r, kind: 'גלם' })),
    ...stock.products.map(r => ({ ...r, kind: 'מוצר' })),
    ...stock.petitFours.map(r => ({ ...r, kind: 'פטיפור' })),
  ];
  const severityRank: Record<string, number> = { 'אזל מהמלאי': 0, 'קריטי': 1, 'מלאי נמוך': 2 };
  all.sort((a, b) => (severityRank[a.status] ?? 3) - (severityRank[b.status] ?? 3));
  const top = expanded ? all : all.slice(0, 4);

  return (
    <BottomPanelShell innerRef={innerRef} title="מלאי דורש טיפול" count={total} href="/inventory">
      {top.length === 0 ? (
        <div className="px-4 py-5 text-center text-[12px]" style={{ color: C.green }}>
          ✓ כל המלאי בטווח התקין
        </div>
      ) : (
        <ul>
          {top.map((it, idx) => {
            const isLast = idx === top.length - 1;
            const tone = it.status === 'אזל מהמלאי'
              ? { chip: '#FEE4E2', chipText: '#991B1B' }
              : it.status === 'קריטי'
              ? { chip: '#FFEFD5', chipText: '#92400E' }
              : { chip: '#FBF1DC', chipText: '#92602A' };
            return (
              <li
                key={`${it.kind}-${it.id}`}
                className="flex items-center gap-2 px-3 py-2.5 transition-colors hover:bg-amber-50/40"
                style={{ borderBottom: isLast ? 'none' : `1px solid ${C.borderSoft}` }}
              >
                <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded flex-shrink-0" style={{ color: C.textSoft, backgroundColor: C.borderSoft, letterSpacing: '0.04em' }}>
                  {it.kind}
                </span>
                <span className="text-[12.5px] font-semibold truncate flex-1 min-w-0" style={{ color: C.text }}>{it.שם}</span>
                <span className="text-[10.5px] font-semibold tabular-nums" style={{ color: C.textSoft }}>{it.quantity}</span>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0" style={{ backgroundColor: tone.chip, color: tone.chipText }}>
                  {it.status}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </BottomPanelShell>
  );
}

function PanelPayments({
  orders, onMarkPaid,
}: {
  orders: TodayOrder[];
  onMarkPaid: (o: TodayOrder) => void;
}) {
  const unpaid = orders.filter(o => o.סטטוס_תשלום !== 'שולם' && o.סטטוס_תשלום !== 'בארטר');
  const top = unpaid.slice(0, 4);
  const totalOpen = unpaid.reduce((s, o) => s + (o.סך_הכל_לתשלום || 0), 0);

  return (
    <BottomPanelShell title={`תשלומים פתוחים${totalOpen > 0 ? ` · ${formatCurrency(totalOpen)}` : ''}`} count={unpaid.length} href="/orders?filter=unpaid">
      {top.length === 0 ? (
        <div className="px-4 py-5 text-center text-[12px]" style={{ color: C.green }}>
          ✓ כל ההזמנות שולמו
        </div>
      ) : (
        <ul>
          {top.map((o, idx) => {
            const c = o.לקוחות;
            const name = c ? `${c.שם_פרטי} ${c.שם_משפחה}` : (o.שם_מקבל || 'לקוח');
            const isLast = idx === top.length - 1;
            return (
              <li
                key={o.id}
                className="flex items-center gap-2 px-3 py-2.5 transition-colors hover:bg-amber-50/40"
                style={{ borderBottom: isLast ? 'none' : `1px solid ${C.borderSoft}` }}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-semibold truncate" style={{ color: C.text }}>{name}</p>
                  <p className="text-[10px] tabular-nums" style={{ color: C.textSoft }}>
                    {o.מספר_הזמנה} · {o.שעת_אספקה || '—'}
                  </p>
                </div>
                <span className="text-[12px] tabular-nums font-bold flex-shrink-0" style={{ color: C.text }}>
                  {formatCurrency(o.סך_הכל_לתשלום)}
                </span>
                <button
                  onClick={() => onMarkPaid(o)}
                  className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-2.5 h-7 rounded-md text-white transition-colors flex-shrink-0"
                  style={{ backgroundColor: C.green }}
                >
                  <Icon name="wallet" className="w-3 h-3" />
                  שולם
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </BottomPanelShell>
  );
}
