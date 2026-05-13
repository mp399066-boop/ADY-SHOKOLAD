// Pure builder — turns the raw dashboard data into a flat list of work-queue
// items, bucketed into 3 urgency groups: דחוף עכשיו / להיום / למעקב.
//
// Design rules:
//   - Filter aggressively. The dashboard is NOT a directory. Show only what
//     requires action right now. Cancelled / completed / archived rows are
//     dropped at the source.
//   - Each item is reduced to a single primary action ("פעולה אחת ברורה").
//   - One item per real-world thing — an order doesn't show twice in the
//     same group, even if it's both unpaid AND in preparation.

import { formatCurrency } from '@/lib/utils';
import type { Delivery, Stock, TodayOrder } from './types';

export type QueueItemType = 'order' | 'delivery' | 'payment' | 'stock';
export type QueueUrgency  = 'urgent_now' | 'today' | 'follow_up';
export type QueueAction =
  | { kind: 'advance_order';  payload: TodayOrder }      // המשך טיפול / השלב הבא
  | { kind: 'open_order';     payload: TodayOrder }      // פתח הזמנה
  | { kind: 'mark_paid';      payload: TodayOrder }      // סמני שולם
  | { kind: 'assign_courier'; payload: Delivery }        // שייך שליח (status: 'ממתין')
  | { kind: 'open_delivery';  payload: Delivery }        // פתח משלוח
  | { kind: 'open_inventory'; payload?: undefined };     // פתח מלאי

// Inline status pills + row-click need direct access to the underlying entity
// so the UI can read the current סטטוס_הזמנה / סטטוס_תשלום and route to the
// correct detail page. Stock items don't carry an entity since there's no
// "stock detail" page yet (clicks go to /inventory).
export type QueueEntity =
  | { kind: 'order';    data: TodayOrder }
  | { kind: 'delivery'; data: Delivery };

export interface QueueItem {
  id: string;
  type: QueueItemType;
  urgency: QueueUrgency;
  title: string;            // customer name / item name
  meta: string;             // order # · time · status · etc
  amount?: string;          // formatted currency, when relevant
  action: { label: string; verb: QueueAction };
  // Optional accent — currently used by stock items
  severity?: 'critical' | 'low';
  // Underlying entity — set for order/delivery/payment items.
  entity?: QueueEntity;
}

interface Inputs {
  liveOrders: TodayOrder[];          // already excludes בוטלה / טיוטה
  todayDeliveries: Delivery[];
  stock: Stock;
  todayISO: string;
}

const ACTION_LABEL: Record<QueueAction['kind'], string> = {
  advance_order:    'המשך טיפול',
  open_order:       'פתח הזמנה',
  mark_paid:        'סמני שולם',
  // 'ממתין' deliveries need a courier picked first — only after assignment
  // does the row flip to 'נאסף' and WhatsApp goes out. The action text
  // names the actual decision the operator is about to make.
  assign_courier:   'שייך שליח',
  open_delivery:    'פתח משלוח',
  open_inventory:   'פתח מלאי',
};

function customerName(o: TodayOrder): string {
  const c = o.לקוחות;
  if (c) return `${c.שם_פרטי} ${c.שם_משפחה}`.trim() || 'לקוח';
  return o.שם_מקבל || 'לקוח';
}

function deliveryRecipient(d: Delivery): string {
  const o = d.הזמנות;
  const c = o?.לקוחות;
  return o?.שם_מקבל || (c ? `${c.שם_פרטי} ${c.שם_משפחה}`.trim() : '') || 'לקוח';
}

function isUnpaid(o: TodayOrder): boolean {
  return o.סטטוס_תשלום !== 'שולם' && o.סטטוס_תשלום !== 'בארטר' && o.סטטוס_תשלום !== 'בוטל';
}

function orderMeta(o: TodayOrder, fallbackStatus?: string): string {
  return [
    o.מספר_הזמנה,
    o.תאריך_אספקה || null,
    o.שעת_אספקה || null,
    fallbackStatus || o.סטטוס_הזמנה,
    o.סוג_אספקה || null,
    o.itemSummary || null,
  ].filter(Boolean).join(' · ');
}

function nextAdvanceLabel(o: TodayOrder): string {
  // Local copy of the verb logic — UI-facing labels only. Status values
  // sent to the server still come from the page.tsx getNextOrderStatus.
  const isPickup = (o.סוג_אספקה ?? '') === 'איסוף עצמי';
  switch (o.סטטוס_הזמנה) {
    case 'חדשה':         return 'התחילי הכנה';
    case 'בהכנה':        return isPickup ? 'סמני מוכנה לאיסוף' : 'סמני מוכנה למשלוח';
    case 'מוכנה למשלוח': return isPickup ? 'סמני נמסרה' : 'סמני נשלחה';
    case 'נשלחה':        return 'סמני הושלמה';
    default:             return 'המשך טיפול';
  }
}

function hasNextStep(o: TodayOrder): boolean {
  return o.סטטוס_הזמנה === 'חדשה'
      || o.סטטוס_הזמנה === 'בהכנה'
      || o.סטטוס_הזמנה === 'מוכנה למשלוח'
      || o.סטטוס_הזמנה === 'נשלחה';
}

export function buildQueueItems({ liveOrders, todayDeliveries, stock, todayISO }: Inputs): QueueItem[] {
  const items: QueueItem[] = [];
  const seenOrderIds = new Set<string>();
  const seenDeliveryIds = new Set<string>();
  const seenStockIds = new Set<string>();

  // ── 1. Urgent orders — always first, regardless of date ──────────────────
  for (const o of liveOrders.filter(o => o.הזמנה_דחופה).slice(0, 6)) {
    if (seenOrderIds.has(o.id)) continue;
    seenOrderIds.add(o.id);
    const advance = hasNextStep(o);
    items.push({
      id: `o-${o.id}`,
      type: 'order',
      urgency: 'urgent_now',
      title: customerName(o),
      meta: orderMeta(o),
      amount: formatCurrency(o.סך_הכל_לתשלום),
      action: advance
        ? { label: nextAdvanceLabel(o),     verb: { kind: 'advance_order', payload: o } }
        : { label: ACTION_LABEL.open_order, verb: { kind: 'open_order',    payload: o } },
      entity: { kind: 'order', data: o },
    });
  }

  // ── 2. Stock / production attention ───────────────────────────────────
  const stockRank: Record<string, number> = { 'אזל מהמלאי': 0, 'קריטי': 1, 'מלאי נמוך': 2 };
  const stockRows = [
    ...stock.raw.map(s => ({ ...s, kind: 'חומר גלם' })),
    ...stock.products.map(s => ({ ...s, kind: 'מוצר' })),
    ...stock.petitFours.map(s => ({ ...s, kind: 'פטיפור' })),
  ].filter(s => stockRank[s.status] !== undefined)
   .sort((a, b) => (stockRank[a.status] ?? 9) - (stockRank[b.status] ?? 9))
   .slice(0, 6);

  for (const s of stockRows) {
    const stockId = `${s.kind}-${s.id}`;
    if (seenStockIds.has(stockId)) continue;
    seenStockIds.add(stockId);
    items.push({
      id: `s-${stockId}`,
      type: 'stock',
      urgency: s.status === 'מלאי נמוך' ? 'follow_up' : 'urgent_now',
      title: s.שם,
      meta: `${s.kind} · ${s.status} · כמות ${s.quantity}`,
      action: { label: ACTION_LABEL.open_inventory, verb: { kind: 'open_inventory' } },
      severity: s.status === 'מלאי נמוך' ? 'low' : 'critical',
    });
  }

  // ── 3. Today's pending orders (חדשה / בהכנה) ─────────────────────────────
  const todayPending = liveOrders.filter(o =>
    o.תאריך_אספקה === todayISO
    && (o.סטטוס_הזמנה === 'חדשה' || o.סטטוס_הזמנה === 'בהכנה')
    && !seenOrderIds.has(o.id),
  );
  for (const o of todayPending) {
    seenOrderIds.add(o.id);
    items.push({
      id: `o-${o.id}`,
      type: 'order',
      urgency: 'today',
      title: customerName(o),
      meta: orderMeta(o),
      amount: formatCurrency(o.סך_הכל_לתשלום),
      action: { label: nextAdvanceLabel(o), verb: { kind: 'advance_order', payload: o } },
      entity: { kind: 'order', data: o },
    });
  }

  // ── 4. Today's pending deliveries ────────────────────────────────────────
  const todayDeliveriesPending = todayDeliveries.filter(d => d.סטטוס_משלוח === 'ממתין');
  for (const d of todayDeliveriesPending) {
    seenDeliveryIds.add(d.id);
    const o = d.הזמנות;
    items.push({
      id: `d-${d.id}`,
      type: 'delivery',
      urgency: 'today',
      title: deliveryRecipient(d),
      meta: `היום · ${d.כתובת ?? ''}${d.עיר ? ' · ' + d.עיר : ''}${o?.מספר_הזמנה ? ' · ' + o.מספר_הזמנה : ''}`,
      action: { label: ACTION_LABEL.assign_courier, verb: { kind: 'assign_courier', payload: d } },
      entity: { kind: 'delivery', data: d },
    });
  }

  // ── 5. Today's "מוכנה למשלוח" — needs send/handoff ───────────────────────
  const todayReady = liveOrders.filter(o =>
    o.תאריך_אספקה === todayISO
    && o.סטטוס_הזמנה === 'מוכנה למשלוח'
    && !seenOrderIds.has(o.id),
  );
  for (const o of todayReady) {
    seenOrderIds.add(o.id);
    items.push({
      id: `o-${o.id}`,
      type: 'order',
      urgency: 'today',
      title: customerName(o),
      meta: orderMeta(o, 'מוכנה'),
      amount: formatCurrency(o.סך_הכל_לתשלום),
      action: { label: nextAdvanceLabel(o), verb: { kind: 'advance_order', payload: o } },
      entity: { kind: 'order', data: o },
    });
  }

  // ── 5b. Shipped orders awaiting completion confirmation ─────────────────
  // 'נשלחה' means the order has left the workshop. The owner still needs to
  // flip it to 'הושלמה בהצלחה' once the customer has it in hand — only at
  // that point should it leave the active board (the page filter excludes
  // 'הושלמה בהצלחה' / 'בוטלה' / 'טיוטה' from liveOrders). Without this
  // bucket the queue had no place for 'נשלחה' rows and they silently
  // disappeared the moment the operator clicked "סמני נשלחה". Limit to 8
  // so a long shipping tail doesn't flood the dashboard.
  const shippedAwaitingCompletion = liveOrders.filter(o =>
    o.סטטוס_הזמנה === 'נשלחה'
    && !seenOrderIds.has(o.id),
  ).slice(0, 8);
  for (const o of shippedAwaitingCompletion) {
    seenOrderIds.add(o.id);
    items.push({
      id: `o-${o.id}`,
      type: 'order',
      urgency: 'follow_up',
      title: customerName(o),
      meta: orderMeta(o, 'נשלחה'),
      amount: formatCurrency(o.סך_הכל_לתשלום),
      // nextAdvanceLabel returns 'סמני הושלמה' for 'נשלחה'; advance_order
      // resolves to 'הושלמה בהצלחה' via getNextOrderStatus in page.tsx, and
      // the page already shows a confirm modal before that transition.
      action: { label: nextAdvanceLabel(o), verb: { kind: 'advance_order', payload: o } },
      entity: { kind: 'order', data: o },
    });
  }

  // ── 6. Follow-up: in-transit deliveries (waiting courier confirm) ───────
  const inTransit = todayDeliveries.filter(d => d.סטטוס_משלוח === 'נאסף' && !seenDeliveryIds.has(d.id));
  for (const d of inTransit.slice(0, 3)) {
    seenDeliveryIds.add(d.id);
    items.push({
      id: `d-${d.id}`,
      type: 'delivery',
      urgency: 'follow_up',
      title: deliveryRecipient(d),
      meta: `נאסף · ממתין לאישור מסירה מהשליח${d.עיר ? ' · ' + d.עיר : ''}`,
      action: { label: ACTION_LABEL.open_delivery, verb: { kind: 'open_delivery', payload: d } },
      entity: { kind: 'delivery', data: d },
    });
  }

  // ── 7. Follow-up: unpaid orders not from today ──────────────────────────
  const unpaidLater = liveOrders.filter(o =>
    isUnpaid(o)
    && o.תאריך_אספקה !== todayISO
    && !seenOrderIds.has(o.id),
  ).slice(0, 5);
  for (const o of unpaidLater) {
    seenOrderIds.add(o.id);
    items.push({
      id: `o-${o.id}`,
      type: 'payment',
      urgency: 'follow_up',
      title: customerName(o),
      meta: orderMeta(o, o.סטטוס_תשלום),
      amount: formatCurrency(o.סך_הכל_לתשלום),
      action: { label: ACTION_LABEL.mark_paid, verb: { kind: 'mark_paid', payload: o } },
      entity: { kind: 'order', data: o },
    });
  }

  return items;
}
