'use client';

// Dashboard v4 — full redesign (May 2026).
//
// This file is the orchestrator only:
//   - data fetching + auto-refresh
//   - mutation handlers (PATCH /api/orders/[id], PATCH /api/deliveries/[id])
//   - modal state (mark-paid, more-actions, confirm)
//   - assembling props for the UI components
//
// The visible UI lives entirely in dashboard/components/ — no JSX layout
// decisions in this file. Everything that's not state/data/handlers got
// deleted in this rewrite.
//
// Backend / endpoints / DB / Morning / status enums / business logic
// unchanged. Auto-create stays OFF (AUTO_CREATE_MORNING_DOCUMENTS=false in
// src/lib/morning.ts, gated at the route level).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { PageLoading } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/Modal';

import type { DashboardStats, Courier, RawMaterial, Recipe } from '@/types/database';
import type { TodayOrder, Delivery, Stock, StockRow } from './components/types';

import { CommandHeader } from './components/CommandHeader';
import { FocusStrip } from './components/FocusStrip';
import { DashboardShell } from './components/DashboardShell';
import { DashboardViewSwitcher } from './components/DashboardViewSwitcher';
import { WorkQueue } from './components/WorkQueue';
import { AttentionPanel } from './components/AttentionPanel';
import { buildQueueItems, type QueueItem } from './components/queue-builder';
import { buildKitchenView } from '@/lib/dashboard/kitchen-view';
import { KitchenView } from './components/KitchenView';
import { ProductionRecipeModal } from './components/ProductionRecipeModal';
import { C } from './components/theme';

// ─── Constants ────────────────────────────────────────────────────────────

type OrderStatus = 'חדשה' | 'בהכנה' | 'מוכנה למשלוח' | 'נשלחה' | 'הושלמה בהצלחה' | 'בוטלה' | 'טיוטה';

const STOCK_ALERT_STATES = ['מלאי נמוך', 'קריטי', 'אזל מהמלאי'];

const PAYMENT_METHODS = [
  'מזומן', 'כרטיס אשראי', 'העברה בנקאית', 'bit', 'PayBox', 'PayPal', 'המחאה', 'אחר',
] as const;

// סטטוס הזמנה carries no inventory side effects under the current policy
// (DEDUCT_INVENTORY_ON_ORDER_STATUS = false in src/lib/inventory-deduct.ts).
// Inventory deduction is now exclusively driven by סטטוס_תשלום → 'שולם',
// so the "יוריד מלאי" label moved to the payment-status grid below.
const ORDER_STATUS_OPTIONS: { value: OrderStatus; sideEffect?: string }[] = [
  { value: 'חדשה' },
  { value: 'בהכנה' },
  { value: 'מוכנה למשלוח' },
  { value: 'נשלחה' },
  { value: 'הושלמה בהצלחה' },
  { value: 'בוטלה' },
];

const PAYMENT_STATUS_OPTIONS: { value: 'ממתין' | 'שולם' | 'חלקי' | 'בוטל' | 'בארטר'; sideEffect?: string }[] = [
  { value: 'ממתין' },
  { value: 'שולם',           sideEffect: 'יוריד מלאי' },
  { value: 'חלקי' },
  { value: 'בוטל' },
  { value: 'בארטר' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────

function todayIsraelISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

function summarizeOrderItems(orderDetail: unknown): string | null {
  const data = (orderDetail as { data?: Record<string, unknown> } | null)?.data;
  const items = (data?.['מוצרים_בהזמנה'] as Record<string, unknown>[] | undefined) || [];
  if (!Array.isArray(items) || items.length === 0) return null;

  const labels = items.slice(0, 3).map(item => {
    const qty = Number(item['כמות'] ?? 1);
    const product = item['מוצרים_למכירה'] as Record<string, unknown> | null | undefined;
    const productName = String(product?.['שם_מוצר'] ?? '').trim();
    const rowType = String(item['סוג_שורה'] ?? '');
    const packageSize = item['גודל_מארז'];
    const fallback = rowType === 'מארז' && packageSize ? `מארז ${packageSize}` : 'פריט';
    return `${qty > 1 ? `${qty}× ` : ''}${productName || fallback}`;
  });

  const rest = items.length - labels.length;
  return rest > 0 ? `${labels.join(', ')} +${rest}` : labels.join(', ');
}

async function fetchOrderSummaries(orders: TodayOrder[]): Promise<Map<string, string | null>> {
  const unique = Array.from(new Map(orders.map(order => [order.id, order])).values());
  const targets = unique.slice(0, 50);
  const summaries = await Promise.allSettled(
    targets.map(async order => {
      const res = await fetch(`/api/orders/${order.id}`);
      if (!res.ok) return [order.id, null] as const;
      const json = await res.json();
      return [order.id, summarizeOrderItems(json)] as const;
    }),
  );

  const byId = new Map<string, string | null>();
  for (const result of summaries) {
    if (result.status === 'fulfilled') byId.set(result.value[0], result.value[1]);
  }

  return byId;
}

function applyOrderSummaries(orders: TodayOrder[], summaries: Map<string, string | null>): TodayOrder[] {
  return orders.map(order => (
    summaries.has(order.id) ? { ...order, itemSummary: summaries.get(order.id) ?? null } : order
  ));
}

// Returns the next forward order status, with pickup-vs-delivery branching.
// Used by the queue's "advance" action — the actual API value is sent here
// while the user-facing label is generated locally inside the queue builder.
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

  // ── Data state ──────────────────────────────────────────────────────────
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [todayOrders, setTodayOrders] = useState<TodayOrder[]>([]);
  const [todayDeliveries, setTodayDeliveries] = useState<Delivery[]>([]);
  const [stock, setStock] = useState<Stock>({ raw: [], products: [], petitFours: [] });
  const [activeOrders, setActiveOrders] = useState<TodayOrder[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  // Active couriers — used by the assign-courier modal triggered from the
  // queue's "שייך שליח" action. Loaded once with the rest of the dashboard.
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Mutation / modal state ──────────────────────────────────────────────
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ text: string; cta: string; onConfirm: () => Promise<void> | void } | null>(null);
  const [markPaidOrder, setMarkPaidOrder] = useState<TodayOrder | null>(null);
  const [moreActionsOrder, setMoreActionsOrder] = useState<TodayOrder | null>(null);
  const [dashboardMode, setDashboardMode] = useState<'management' | 'kitchen'>('management');
  const [productionModalOpen, setProductionModalOpen] = useState(false);
  // The delivery the operator is about to assign a courier to. Null = closed.
  const [assignCourierFor, setAssignCourierFor] = useState<Delivery | null>(null);

  // In-flight write counter — auto-refresh skips ticks while > 0 so optimistic
  // updates aren't clobbered by a stale GET response.
  const inflightRef = useRef(0);

  // ── Data fetching ───────────────────────────────────────────────────────

  const fetchAll = useCallback(async (silent: boolean) => {
    if (silent && inflightRef.current > 0) return;
    if (!silent) setLoading(true);
    try {
      const today = todayIsraelISO();
      const [dash, ordersTodayRes, ordersAllRes, deliveriesRes, rawRes, prodsRes, pfRes, couriersRes, recipesRes] = await Promise.all([
        fetch('/api/dashboard').then(r => r.json()),
        fetch('/api/orders?filter=today&limit=100').then(r => r.json()),
        // All active orders (excludes drafts/archive based on the orders API
        // default behavior). Used for the "follow-up" group in the queue
        // (unpaid orders not from today, in-transit orders, etc.).
        fetch('/api/orders?limit=200').then(r => r.json()),
        fetch(`/api/deliveries?date=${today}`).then(r => r.json()),
        fetch('/api/inventory').then(r => r.json()),
        fetch('/api/products?active=true').then(r => r.json()),
        fetch('/api/petit-four-types').then(r => r.json()),
        // Couriers list — needed by the assign-courier modal. Filtered down
        // to active records only since only those should appear in the
        // picker. Cheap call (one row per courier), batched with everything
        // else so the dashboard doesn't fan out a second wave.
        fetch('/api/couriers').then(r => r.json()),
        fetch('/api/recipes').then(r => r.json()),
      ]);

      const todayOrderRows = (ordersTodayRes?.data || []) as TodayOrder[];
      const activeOrderRows = (ordersAllRes?.data || []) as TodayOrder[];
      const orderSummaries = await fetchOrderSummaries([...todayOrderRows, ...activeOrderRows]);
      const todayWithSummaries = applyOrderSummaries(todayOrderRows, orderSummaries);
      const activeWithSummaries = applyOrderSummaries(activeOrderRows, orderSummaries);

      if (dash?.data) setStats(dash.data);
      setTodayOrders(todayWithSummaries);
      setActiveOrders(activeWithSummaries);
      setTodayDeliveries((deliveriesRes?.data || []) as Delivery[]);

      type RawRow = Record<string, unknown>;
      const filterAlerts = (rows: RawRow[], nameKey: string, unitKey?: string): StockRow[] =>
        (rows || [])
          .filter(r => STOCK_ALERT_STATES.includes(String(r['סטטוס_מלאי'] ?? '')))
          .map(r => ({
            id: String(r.id),
            שם: String(r[nameKey] ?? ''),
            status: String(r['סטטוס_מלאי'] ?? ''),
            quantity: Number(r['כמות_במלאי'] ?? 0),
            unit: unitKey ? String(r[unitKey] ?? '') : null,
          }));

      setRawMaterials((rawRes?.data || []) as RawMaterial[]);
      setRecipes((recipesRes?.data || []) as Recipe[]);
      setStock({
        raw:        filterAlerts((rawRes?.data || []) as RawRow[],   'שם_חומר_גלם', 'יחידת_מידה'),
        products:   filterAlerts((prodsRes?.data || []) as RawRow[], 'שם_מוצר'),
        petitFours: filterAlerts((pfRes?.data || []) as RawRow[],    'שם_פטיפור'),
      });

      const allCouriers = (couriersRes?.data || []) as Courier[];
      setCouriers(allCouriers.filter(c => c.פעיל));
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

  // ── Mutations — go through existing APIs (no bypass) ───────────────────

  const patchOrder = useCallback(async (
    id: string,
    patch: Record<string, unknown>,
    rollback: Partial<TodayOrder>,
  ): Promise<boolean> => {
    setUpdatingId(id);
    inflightRef.current++;
    setTodayOrders(curr => curr.map(o => o.id === id ? ({ ...o, ...patch } as TodayOrder) : o));
    setActiveOrders(curr => curr.map(o => o.id === id ? ({ ...o, ...patch } as TodayOrder) : o));
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTodayOrders(curr => curr.map(o => o.id === id ? ({ ...o, ...rollback } as TodayOrder) : o));
        setActiveOrders(curr => curr.map(o => o.id === id ? ({ ...o, ...rollback } as TodayOrder) : o));
        toast.error(json.error || 'שגיאה בעדכון ההזמנה');
        return false;
      }
      toast.success('עודכן');
      return true;
    } catch {
      setTodayOrders(curr => curr.map(o => o.id === id ? ({ ...o, ...rollback } as TodayOrder) : o));
      setActiveOrders(curr => curr.map(o => o.id === id ? ({ ...o, ...rollback } as TodayOrder) : o));
      toast.error('שגיאה ברשת');
      return false;
    } finally {
      setUpdatingId(null);
      inflightRef.current = Math.max(0, inflightRef.current - 1);
    }
  }, []);

  const patchDelivery = useCallback(async (id: string, newStatus: 'ממתין' | 'נאסף' | 'נמסר', prevStatus: string) => {
    setUpdatingId(id);
    inflightRef.current++;
    setTodayDeliveries(curr => curr.map(d => d.id === id ? { ...d, סטטוס_משלוח: newStatus } : d));
    try {
      const res = await fetch(`/api/deliveries/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          סטטוס_משלוח: newStatus,
          ...(newStatus === 'נמסר' ? { delivered_at: new Date().toISOString() } : {}),
        }),
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
        if (!win || win.closed) toast('הדפדפן חסם — פתחי וואטסאפ ידנית', { icon: '⚠️' });
        else toast.success('וואטסאפ נפתח לשליח');
      } else if (newStatus === 'נאסף' && json.already_notified) {
        // Idempotency path — the row was already 'נאסף' or whatsapp_sent_at
        // was set. We deliberately did NOT resend. Tell the operator clearly
        // so they don't think the WhatsApp window is missing because of an
        // error.
        toast('השליח כבר עודכן בעבר — לא נשלחה הודעה חוזרת', { icon: 'ℹ️' });
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

  // Assign a courier to a delivery, then flip the row to 'נאסף' so the API
  // builds the WhatsApp link and returns it for the browser to open.
  //
  // Two sequential PATCHes (not one) because the deliveries API fetches the
  // delivery+courier row BEFORE applying the body when handling a 'נאסף'
  // transition. If we sent {courier_id, סטטוס_משלוח: 'נאסף'} together, the
  // existing-row fetch would still see the OLD (null) courier and skip the
  // WhatsApp build. Two calls = guaranteed correct ordering on the server.
  const assignCourierAndDispatch = useCallback(async (delivery: Delivery, courierId: string) => {
    setUpdatingId(delivery.id);
    inflightRef.current++;
    try {
      // 1. Persist the courier assignment. Plain-update branch — no WhatsApp.
      const assignRes = await fetch(`/api/deliveries/${delivery.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courier_id: courierId }),
      });
      const assignJson = await assignRes.json().catch(() => ({}));
      if (!assignRes.ok) {
        toast.error(assignJson.error || 'שגיאה בשיוך שליח');
        return;
      }
      // The API may auto-create the row (synthetic id) on first PATCH.
      // Use the real id from now on so the next call hits the same record.
      const realId = (assignJson.data?.id as string) || delivery.id;

      // 2. Flip status to 'נאסף'. PATCH endpoint will build the WhatsApp URL
      //    using the just-assigned courier and return it in `whatsapp_url`.
      //    The idempotency guard (added previously) prevents double-send.
      const flipRes = await fetch(`/api/deliveries/${realId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ סטטוס_משלוח: 'נאסף' }),
      });
      const flipJson = await flipRes.json().catch(() => ({}));
      if (!flipRes.ok) {
        toast.error(flipJson.error || 'שגיאה בעדכון סטטוס משלוח');
        return;
      }

      // Optimistic local update — bump status + courier on the matching row.
      const courierData = couriers.find(c => c.id === courierId) || null;
      setTodayDeliveries(curr => curr.map(d => d.id === delivery.id ? ({
        ...d,
        ...(flipJson.data || {}),
        id: realId,
        סטטוס_משלוח: 'נאסף' as const,
        courier_id: courierId,
        שליחים: courierData ? { id: courierData.id, שם_שליח: courierData.שם_שליח, טלפון_שליח: courierData.טלפון_שליח } : null,
        _noRecord: false,
      } as Delivery) : d));

      // 3. Open WhatsApp if the API gave us a URL.
      if (flipJson.whatsapp_url) {
        const win = window.open(flipJson.whatsapp_url, '_blank');
        if (!win || win.closed) toast('הדפדפן חסם — פתחי וואטסאפ ידנית', { icon: '⚠️' });
        else toast.success('שליח שויך, וואטסאפ נפתח');
      } else if (flipJson.send_error) {
        toast.error(flipJson.send_error);
      } else if (flipJson.already_notified) {
        toast('השליח כבר עודכן בעבר — לא נשלחה הודעה חוזרת', { icon: 'ℹ️' });
      } else {
        toast.success('שליח שויך');
      }
    } catch {
      toast.error('שגיאה ברשת');
    } finally {
      setAssignCourierFor(null);
      setUpdatingId(null);
      inflightRef.current = Math.max(0, inflightRef.current - 1);
    }
  }, [couriers]);

  // ── Order/payment status handlers (used by queue + modals) ──────────────

  const onPickOrderStatus = (o: TodayOrder, newStatus: OrderStatus) => {
    setMoreActionsOrder(null);
    if (newStatus === o.סטטוס_הזמנה) return;
    const exec = () => patchOrder(o.id, { סטטוס_הזמנה: newStatus }, { סטטוס_הזמנה: o.סטטוס_הזמנה });
    // Note: there is intentionally no confirm modal for the בהכנה transition
    // anymore. The inventory side-effect was removed when policy switched to
    // "deduct on payment paid" (see DEDUCT_INVENTORY_ON_ORDER_STATUS = false
    // in src/lib/inventory-deduct.ts). Showing a stale "יוריד מלאי" warning
    // here would mislead the operator about what the click actually does.
    if (newStatus === 'הושלמה בהצלחה' && o.סטטוס_הזמנה !== 'הושלמה בהצלחה') {
      setConfirmAction({
        text: 'סימון כהושלמה ישנה את סטטוס ההזמנה. להמשיך?',
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
      setMarkPaidOrder(o);
      return;
    }
    void patchOrder(o.id, { סטטוס_תשלום: newStatus }, { סטטוס_תשלום: o.סטטוס_תשלום });
  };

  // ── Derived data ────────────────────────────────────────────────────────

  // The queue is built from active orders + today's deliveries + alerts.
  // active orders = not בוטלה, not טיוטה, not הושלמה (already-completed
  // orders shouldn't appear in the worklist).
  const queueItems = useMemo<QueueItem[]>(() => {
    const live = activeOrders.filter(o =>
      o.סטטוס_הזמנה !== 'בוטלה'
      && o.סטטוס_הזמנה !== 'טיוטה'
      && o.סטטוס_הזמנה !== 'הושלמה בהצלחה',
    );
    return buildQueueItems({
      liveOrders: live,
      todayDeliveries,
      stock,
      todayISO: todayIsraelISO(),
    });
  }, [activeOrders, todayDeliveries, stock]);

  const kitchenData = useMemo(() => {
    const live = activeOrders.filter(o =>
      o.סטטוס_הזמנה !== 'בוטלה'
      && o.סטטוס_הזמנה !== 'טיוטה'
      && o.סטטוס_הזמנה !== 'הושלמה בהצלחה',
    );
    return buildKitchenView({
      liveOrders: live,
      todayOrders,
      todayDeliveries,
      stock,
      todayISO: todayIsraelISO(),
    });
  }, [activeOrders, todayOrders, todayDeliveries, stock]);

  // Today-only counts for the focus strip.
  const today = todayIsraelISO();
  const ordersTodayCount = todayOrders.filter(o =>
    o.סטטוס_הזמנה !== 'בוטלה' && o.סטטוס_הזמנה !== 'טיוטה' && o.סטטוס_הזמנה !== 'הושלמה בהצלחה',
  ).length;
  const deliveriesTodayActive = todayDeliveries.filter(d => d.סטטוס_משלוח !== 'נמסר').length;
  const allStock = [...stock.raw, ...stock.products, ...stock.petitFours];
  const criticalStockCount = allStock.filter(s => s.status === 'אזל מהמלאי' || s.status === 'קריטי').length;
  void today; // silence unused-binding if branches change later

  // Date string + greeting
  const dateStr = new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
  const greeting = (() => {
    const h = parseInt(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Jerusalem' }), 10);
    if (h < 11) return 'בוקר טוב';
    if (h < 17) return 'צהריים טובים';
    if (h < 21) return 'ערב טוב';
    return 'לילה טוב';
  })();

  // ── Queue action dispatcher ─────────────────────────────────────────────

  const onQueueAction = (verb: QueueItem['action']['verb']) => {
    switch (verb.kind) {
      case 'advance_order': {
        const o = verb.payload;
        const next = getNextOrderStatus(o);
        if (next) onPickOrderStatus(o, next);
        return;
      }
      case 'open_order':
        router.push(`/orders/${verb.payload.id}`);
        return;
      case 'mark_paid':
        setMarkPaidOrder(verb.payload);
        return;
      case 'assign_courier':
        // Open the picker — assignment + status flip + WhatsApp happens
        // inside the modal's confirm handler so the operator sees a clear
        // intermediate step ("which courier?") before any side effect fires.
        setAssignCourierFor(verb.payload);
        return;
      case 'open_delivery': {
        // Pass the delivery id so the deliveries page can scroll to and
        // briefly highlight the row — useful when the operator just dispatched
        // it from the dashboard and expects to see it on landing.
        const id = verb.payload.id;
        const real = id.startsWith('no-record-') ? '' : id;
        router.push(real ? `/deliveries?highlight=${encodeURIComponent(real)}` : '/deliveries');
        return;
      }
      case 'open_inventory':
        router.push('/inventory');
        return;
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) return <PageLoading />;

  return (
    <div dir="rtl" className="mx-auto max-w-[1360px] space-y-3 pb-10 px-2 sm:px-3" style={{ backgroundColor: C.bg }}>

      <CommandHeader
        greeting={greeting}
        dateStr={dateStr}
        onRefresh={() => fetchAll(false)}
      />

      <DashboardViewSwitcher mode={dashboardMode} onChange={setDashboardMode} />

      {dashboardMode === 'management' ? (
        <>
          <FocusStrip
            ordersTodayCount={ordersTodayCount}
            deliveriesTodayCount={deliveriesTodayActive}
            unpaidAmount={stats?.unpaidAmount ?? 0}
            unpaidCount={stats?.unpaidOrders ?? 0}
            criticalStockCount={criticalStockCount}
            ordersTomorrow={stats?.ordersTomorrow ?? 0}
            onJumpOrders={() => router.push('/orders?filter=today')}
            onJumpDeliveries={() => router.push('/deliveries')}
            onJumpUnpaid={() => router.push('/orders?filter=unpaid')}
            onJumpStock={() => router.push('/inventory')}
          />

          <DashboardShell
            main={
              <WorkQueue
                items={queueItems}
                updatingId={updatingId}
                handlers={{
                  onAction: onQueueAction,
                  onRowClick: (item) => {
                    // Where each row navigates to. Stops short of opening
                    // anything for stock items where the action button (פתח מלאי)
                    // already does the routing.
                    if (item.entity?.kind === 'order') {
                      router.push(`/orders/${item.entity.data.id}`);
                      return;
                    }
                    if (item.entity?.kind === 'delivery') {
                      const orderId = item.entity.data.הזמנות?.id;
                      if (orderId) router.push(`/orders/${orderId}`);
                      else router.push('/deliveries');
                      return;
                    }
                    if (item.type === 'stock') {
                      router.push('/inventory');
                    }
                  },
                  onChangeOrderStatus: onPickOrderStatus,
                  onChangePaymentStatus: onPickPaymentStatus,
                  onChangeDeliveryStatus: (delivery, next) => patchDelivery(delivery.id, next, delivery.סטטוס_משלוח),
                }}
              />
            }
            side={
              <AttentionPanel
                liveOrders={activeOrders}
                todayDeliveries={todayDeliveries}
                stock={stock}
                unpaidAmount={stats?.unpaidAmount ?? 0}
                unpaidCount={stats?.unpaidOrders ?? 0}
                updatingId={updatingId}
                onChangePaymentStatus={onPickPaymentStatus}
                onPatchDelivery={(delivery, next) => patchDelivery(delivery.id, next, delivery.סטטוס_משלוח)}
              />
            }
          />
        </>
      ) : (
        <KitchenView
          data={kitchenData}
          updatingId={updatingId}
          onNavigate={(path) => router.push(path)}
          onProduction={() => setProductionModalOpen(true)}
          onOrderStatus={onPickOrderStatus}
          onPaymentStatus={onPickPaymentStatus}
          onDeliveryStatus={(delivery, next) => patchDelivery(delivery.id, next, delivery.סטטוס_משלוח)}
          onOpenOrder={(order) => router.push(`/orders/${order.id}`)}
        />
      )}

      {/* Modals — kept inline because they're cross-cutting state */}
      <ProductionRecipeModal
        open={productionModalOpen}
        recipes={recipes}
        rawMaterials={rawMaterials}
        onClose={() => setProductionModalOpen(false)}
        onDone={() => fetchAll(false)}
      />

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

      {assignCourierFor && (
        <AssignCourierModal
          delivery={assignCourierFor}
          couriers={couriers}
          loading={!!updatingId}
          onClose={() => setAssignCourierFor(null)}
          onPick={(courierId) => assignCourierAndDispatch(assignCourierFor, courierId)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Inline modal components — small, cross-cutting, kept here so the page is
// self-contained. The big surface UI all lives in dashboard/components/.
// ═══════════════════════════════════════════════════════════════════════════

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
          style={{ backgroundColor: C.espresso }}
        >
          {loading ? '...' : ctaLabel}
        </button>
      </div>
    </Modal>
  );
}

function MarkPaidModal({
  order, loading, onConfirm, onClose,
}: {
  order: TodayOrder;
  loading: boolean;
  onConfirm: (method: string) => Promise<void> | void;
  onClose: () => void;
}) {
  // Pre-select only when the order already carries a known method. Falling
  // back to a hardcoded default (e.g. 'מזומן' or the order's stored value
  // when it isn't in the list) is a silent default — the owner explicitly
  // banned that pattern. An empty selection keeps the confirm button
  // disabled, forcing an explicit pick.
  const initial = (order.אופן_תשלום ?? '').trim();
  const [method, setMethod] = useState<string>(
    initial && (PAYMENT_METHODS as readonly string[]).includes(initial) ? initial : '',
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
        בחרי את אמצעי התשלום שיופיע על הקבלה (תופק ידנית בכרטיס ההזמנה):
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
                backgroundColor: active ? C.espresso : C.card,
                color: active ? '#FFFFFF' : C.text,
                borderColor: active ? C.espresso : C.border,
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

// ─── AssignCourierModal — picker triggered by the queue's "שייך שליח" action.
// Lists active couriers with phone, click a row → assign + flip to 'נאסף'
// + WhatsApp open. Couriers with no phone are listed but disabled (the API
// would refuse to build a WhatsApp link for them anyway, and the owner
// asked for a clear up-front message rather than a silent failure).
function AssignCourierModal({
  delivery, couriers, loading, onClose, onPick,
}: {
  delivery: Delivery;
  couriers: Courier[];
  loading: boolean;
  onClose: () => void;
  onPick: (courierId: string) => void;
}) {
  const o = delivery.הזמנות;
  const customer = o?.שם_מקבל
    || (o?.לקוחות ? `${o.לקוחות.שם_פרטי} ${o.לקוחות.שם_משפחה}` : '')
    || 'לקוח';
  const addr = [delivery.כתובת, delivery.עיר].filter(Boolean).join(', ');

  return (
    <Modal open onClose={onClose} title="שיוך שליח למשלוח" size="sm">
      <div className="text-sm mb-3" style={{ color: C.text }}>
        <span className="font-semibold">{customer}</span>
        {addr && (
          <>
            <span className="mx-2" style={{ color: C.textSoft }}>·</span>
            <span style={{ color: C.textSoft }}>{addr}</span>
          </>
        )}
      </div>
      <p className="text-sm mb-4" style={{ color: C.textSoft }}>
        בחירת שליח תשייך אותו למשלוח, תעביר את הסטטוס ל"נאסף" ותפתח וואטסאפ עם קישור לסימון "נמסר".
      </p>

      {couriers.length === 0 ? (
        <div className="rounded-xl px-3 py-4 text-center text-[12.5px] mb-4" style={{ backgroundColor: C.amberSoft, color: C.amber, border: `1px solid ${C.border}` }}>
          אין שליחים פעילים במערכת. ניתן להוסיף שליח במסך משלוחים → שליחים.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 mb-5">
          {couriers.map(c => {
            const hasPhone = !!c.טלפון_שליח;
            return (
              <button
                key={c.id}
                onClick={() => hasPhone && !loading && onPick(c.id)}
                disabled={loading || !hasPhone}
                className="text-right px-3 py-2.5 rounded-xl border transition-colors disabled:cursor-not-allowed"
                style={{
                  backgroundColor: hasPhone ? C.card : '#FBF6EE',
                  borderColor: hasPhone ? C.border : C.borderSoft,
                  color: C.text,
                  opacity: hasPhone ? 1 : 0.65,
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold truncate">{c.שם_שליח}</span>
                  {hasPhone ? (
                    <span dir="ltr" className="text-[11px] font-mono" style={{ color: C.textSoft }}>{c.טלפון_שליח}</span>
                  ) : (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: C.redSoft, color: C.red, border: '1px solid #E4C2BE' }}>אין טלפון</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex gap-3 justify-end">
        <button
          onClick={onClose}
          disabled={loading}
          className="px-4 h-10 text-sm font-medium rounded-xl border transition-colors disabled:opacity-50"
          style={{ borderColor: C.border, color: C.textSoft }}
        >
          ביטול
        </button>
      </div>
    </Modal>
  );
}

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
        מסך חריגים. סטטוסים עם פעולות צד יציגו אישור לפני ביצוע ולא יעקפו את הלוגיקה הקיימת.
      </p>

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
                  backgroundColor: active ? C.espresso : C.card,
                  color: active ? '#FFFFFF' : C.text,
                  borderColor: active ? C.espresso : C.border,
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
