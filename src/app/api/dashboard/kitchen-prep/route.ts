export const dynamic = 'force-dynamic';

// /api/dashboard/kitchen-prep
//
// Returns ITEM-AGGREGATED demand across active upcoming orders — the
// data the Kitchen View needs to answer "what do I need to prepare?".
// The dashboard page already has a customer-focused order list; this
// endpoint exists specifically to flip the axis to item-first.
//
// Aggregation rules:
//   1. Pull all active orders (statuses: חדשה / בהכנה / מוכנה למשלוח)
//      with תאריך_אספקה in [today .. +14d] OR null (legacy / unscheduled).
//   2. Join מוצרים_בהזמנה + מוצרים_למכירה(שם_מוצר) + בחירת_פטיפורים_בהזמנה
//      + סוגי_פטיפורים(שם_פטיפור).
//   3. Bucket lines:
//        - סוג_שורה='מוצר' → bucket by מוצר_id (fall back to line name);
//        - סוג_שורה='מארז' → bucket by "מארז Y פטיפורים" (Y=גודל_מארז);
//        - petit-four breakdown rolled up by פטיפור_id across all packages,
//          weighted by (selection.כמות × package_line.כמות).
//   4. Per bucket: total quantity, distinct order count, earliest
//      dispatch ISO timestamp (תאריך_אספקה + שעת_אספקה sorted asc).
//   5. Inventory comparison:
//        - finished products: compare against מוצרים_למכירה.כמות_במלאי
//        - petit-fours:       compare against סוגי_פטיפורים.כמות_במלאי
//        - raw materials:     NOT computed automatically — most products
//          don't have linked recipes here. The Kitchen View shows the
//          existing low-stock raw-materials panel separately.
//
// Returns only the data; no UI decisions, no thresholds, no rendering.

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

const ACTIVE_ORDER_STATUSES = ['חדשה', 'בהכנה', 'מוכנה למשלוח'];
const FORWARD_WINDOW_DAYS   = 14;

export type PrepStatus = 'enough_stock' | 'partial_stock' | 'needs_preparation' | 'missing_finished' | 'unknown';

export interface PrepBucket {
  key:                 string;        // unique identifier (prefix:id)
  kind:                'product' | 'package' | 'petitfour';
  name:                string;
  unitLabel?:          string | null; // e.g. "יח׳" or "ק"ג"
  totalDemand:         number;
  orderCount:          number;
  earliestDispatchISO: string | null; // 'YYYY-MM-DDTHH:MM' for sorting
  earliestDueLabel:    string;        // human-readable, e.g. 'היום 14:00'
  notes:               string[];      // distinct הערות_לשורה values
  // Inventory cross-check (omitted for kinds we can't compute):
  availableStock:      number | null;
  shortfall:           number | null; // demand - available, if positive
  status:              PrepStatus;
}

export interface KitchenPrepResponse {
  generatedAt:     string;           // ISO timestamp
  todayISO:        string;           // YYYY-MM-DD in Asia/Jerusalem
  forwardWindow:   number;           // days
  ordersConsidered: number;
  buckets:         PrepBucket[];     // sorted by earliestDispatchISO ASC
}

type OrderRow = {
  id:            string;
  מספר_הזמנה:  string | null;
  סטטוס_הזמנה: string;
  תאריך_אספקה: string | null;
  שעת_אספקה:   string | null;
};

type ItemRow = {
  id:                string;
  הזמנה_id:          string;
  סוג_שורה:          string | null;
  מוצר_id:           string | null;
  גודל_מארז:         number | null;
  כמות:              number | null;
  הערות_לשורה:       string | null;
  מוצרים_למכירה?:    { שם_מוצר: string | null } | null;
  בחירת_פטיפורים_בהזמנה?: Array<{
    פטיפור_id:        string | null;
    כמות:             number | null;
    סוגי_פטיפורים?:   { שם_פטיפור: string | null } | null;
  }> | null;
};

function dueLabel(date: string | null, time: string | null, todayISO: string): string {
  if (!date) return time || 'ללא תאריך';
  if (date === todayISO) return time ? `היום ${time}` : 'היום';
  return time ? `${date} ${time}` : date;
}

function dispatchSortKey(date: string | null, time: string | null): string | null {
  if (!date) return null;
  // Pad time so '8:30' (legacy) and '08:30' sort consistently.
  const t = (time || '').trim();
  const padded = /^\d:\d{2}/.test(t) ? `0${t}` : t;
  return `${date}T${padded || '00:00'}`;
}

function compareDispatch(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

function classify(demand: number, available: number | null): PrepStatus {
  if (available === null) return 'unknown';
  if (available >= demand)         return 'enough_stock';
  if (available > 0)               return 'partial_stock';
  return 'missing_finished';
}

export async function GET() {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();

  const supabase = createAdminClient();

  // Today + forward window in Asia/Jerusalem to match the dashboard.
  const todayISO    = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  const horizonISO  = new Date(Date.now() + FORWARD_WINDOW_DAYS * 86400000)
    .toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });

  // 1. Pull active orders in the window (or with no date — kitchen still
  //    needs to know about un-scheduled orders).
  const { data: orderRows, error: ordErr } = await supabase
    .from('הזמנות')
    .select('id, מספר_הזמנה, סטטוס_הזמנה, תאריך_אספקה, שעת_אספקה')
    .in('סטטוס_הזמנה', ACTIVE_ORDER_STATUSES)
    .or(`תאריך_אספקה.gte.${todayISO},תאריך_אספקה.is.null`)
    .lte('תאריך_אספקה', horizonISO);
  if (ordErr) {
    console.error('[kitchen-prep] orders query failed:', ordErr.message);
    return NextResponse.json({ error: ordErr.message }, { status: 500 });
  }

  const orders = (orderRows ?? []) as OrderRow[];
  if (orders.length === 0) {
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      todayISO,
      forwardWindow: FORWARD_WINDOW_DAYS,
      ordersConsidered: 0,
      buckets: [],
    } as KitchenPrepResponse);
  }

  const orderById = new Map(orders.map(o => [o.id, o] as const));
  const orderIds  = orders.map(o => o.id);

  // 2. Item lines + product names + petit-four breakdowns, all in one go.
  const { data: itemRows, error: itemsErr } = await supabase
    .from('מוצרים_בהזמנה')
    .select(`
      id, הזמנה_id, סוג_שורה, מוצר_id, גודל_מארז, כמות, הערות_לשורה,
      מוצרים_למכירה(שם_מוצר),
      בחירת_פטיפורים_בהזמנה(פטיפור_id, כמות, סוגי_פטיפורים(שם_פטיפור))
    `)
    .in('הזמנה_id', orderIds);
  if (itemsErr) {
    console.error('[kitchen-prep] items query failed:', itemsErr.message);
    return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  }

  const items = (itemRows ?? []) as unknown as ItemRow[];

  // 3. Stock for inventory comparison.
  const [{ data: productStockRows }, { data: petitFourStockRows }] = await Promise.all([
    supabase.from('מוצרים_למכירה').select('id, שם_מוצר, כמות_במלאי'),
    supabase.from('סוגי_פטיפורים').select('id, שם_פטיפור, כמות_במלאי'),
  ]);
  const productStockById = new Map(
    ((productStockRows ?? []) as Array<{ id: string; כמות_במלאי: number | null }>)
      .map(r => [r.id, Number(r.כמות_במלאי ?? 0)]),
  );
  const petitFourStockById = new Map(
    ((petitFourStockRows ?? []) as Array<{ id: string; כמות_במלאי: number | null }>)
      .map(r => [r.id, Number(r.כמות_במלאי ?? 0)]),
  );

  // 4. Aggregate. Buckets keyed by:
  //    product:<מוצר_id>            or  product:name:<name>  (fallback)
  //    package:<גודל_מארז>
  //    petitfour:<פטיפור_id>
  type Bucket = {
    key:        string;
    kind:       'product' | 'package' | 'petitfour';
    name:       string;
    totalDemand: number;
    orderIds:   Set<string>;
    earliest:   string | null;
    notes:      Set<string>;
    availableStock: number | null;
  };
  const buckets = new Map<string, Bucket>();

  function getBucket(key: string, kind: Bucket['kind'], name: string, availableStock: number | null): Bucket {
    let b = buckets.get(key);
    if (!b) {
      b = { key, kind, name, totalDemand: 0, orderIds: new Set(), earliest: null, notes: new Set(), availableStock };
      buckets.set(key, b);
    }
    return b;
  }

  for (const item of items) {
    const order = orderById.get(item.הזמנה_id);
    if (!order) continue;
    const lineQty = Number(item.כמות || 0);
    if (lineQty <= 0) continue;
    const sortKey = dispatchSortKey(order.תאריך_אספקה, order.שעת_אספקה);

    if (item.סוג_שורה === 'מארז') {
      // Package bucket
      const size = item.גודל_מארז ?? 0;
      const pkgKey  = `package:${size}`;
      const pkgName = size ? `מארז ${size} פטיפורים` : 'מארז פטיפורים';
      const pkgBucket = getBucket(pkgKey, 'package', pkgName, null);
      pkgBucket.totalDemand += lineQty;
      pkgBucket.orderIds.add(item.הזמנה_id);
      if (compareDispatch(sortKey, pkgBucket.earliest) < 0) pkgBucket.earliest = sortKey;
      if (item.הערות_לשורה) pkgBucket.notes.add(item.הערות_לשורה);

      // Petit-four breakdown rolled up by פטיפור_id, weighted by
      // (selection.qty × package_qty) so 3 packages × 5 שוהם each → 15.
      for (const sel of (item.בחירת_פטיפורים_בהזמנה ?? [])) {
        if (!sel.פטיפור_id) continue;
        const selQty = Number(sel.כמות || 0);
        if (selQty <= 0) continue;
        const pfKey  = `petitfour:${sel.פטיפור_id}`;
        const pfName = sel.סוגי_פטיפורים?.שם_פטיפור || 'פטיפור';
        const avail  = petitFourStockById.get(sel.פטיפור_id) ?? null;
        const pfBucket = getBucket(pfKey, 'petitfour', pfName, avail);
        pfBucket.totalDemand += selQty * lineQty;
        pfBucket.orderIds.add(item.הזמנה_id);
        if (compareDispatch(sortKey, pfBucket.earliest) < 0) pfBucket.earliest = sortKey;
      }
    } else {
      // Product bucket (default for 'מוצר' and anything else)
      const productId = item.מוצר_id;
      const productName = item.מוצרים_למכירה?.שם_מוצר?.trim() || 'פריט ללא שם';
      const prodKey = productId ? `product:${productId}` : `product:name:${productName}`;
      const avail   = productId ? (productStockById.get(productId) ?? null) : null;
      const prodBucket = getBucket(prodKey, 'product', productName, avail);
      prodBucket.totalDemand += lineQty;
      prodBucket.orderIds.add(item.הזמנה_id);
      if (compareDispatch(sortKey, prodBucket.earliest) < 0) prodBucket.earliest = sortKey;
      if (item.הערות_לשורה) prodBucket.notes.add(item.הערות_לשורה);
    }
  }

  // 5. Materialize sorted output.
  const out: PrepBucket[] = Array.from(buckets.values())
    .map(b => {
      const earliest = b.earliest;
      const [date = null, time = null] = earliest ? earliest.split('T') as [string, string | undefined] : [];
      const cleanTime = (time && time !== '00:00') ? time : null;
      const shortfall = b.availableStock === null
        ? null
        : Math.max(0, b.totalDemand - b.availableStock);
      return {
        key: b.key,
        kind: b.kind,
        name: b.name,
        unitLabel: null,
        totalDemand:         b.totalDemand,
        orderCount:          b.orderIds.size,
        earliestDispatchISO: earliest,
        earliestDueLabel:    dueLabel(date, cleanTime, todayISO),
        notes:               Array.from(b.notes),
        availableStock:      b.availableStock,
        shortfall,
        status:              classify(b.totalDemand, b.availableStock),
      } satisfies PrepBucket;
    })
    .sort((a, b) => {
      // Primary: earliest dispatch ASC (nulls last).
      const byDate = compareDispatch(a.earliestDispatchISO, b.earliestDispatchISO);
      if (byDate !== 0) return byDate;
      // Secondary: kind order — packages first (drive petit-four prep),
      // then products, then standalone petit-four totals.
      const kindRank = { package: 0, product: 1, petitfour: 2 } as const;
      const k = kindRank[a.kind] - kindRank[b.kind];
      if (k !== 0) return k;
      return a.name.localeCompare(b.name, 'he');
    });

  console.log('[kitchen-prep] aggregated',
    '| orders:', orders.length,
    '| items:', items.length,
    '| buckets:', out.length,
  );

  const body: KitchenPrepResponse = {
    generatedAt:    new Date().toISOString(),
    todayISO,
    forwardWindow:  FORWARD_WINDOW_DAYS,
    ordersConsidered: orders.length,
    buckets:        out,
  };
  return NextResponse.json(body);
}
