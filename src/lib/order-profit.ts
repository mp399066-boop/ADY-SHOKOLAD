// Order & product profitability (רווחיות).
//
// Income uses the same definition as /finance: what really goes into the
// pocket — the order amount WITHOUT delivery and BEFORE VAT (FinanceOrder
// .netNoShipping). That amount is spread over the order lines in proportion
// to each line's סהכ, so a discount or a used credit lowers every line alike.
//
// Cost comes from the /costs sheet (עלויות_מוצרים): a unit cost per sale
// product and per petit-four type. A package line costs the average
// petit-four cost × the units in the package. A line whose cost isn't known
// is NOT guessed — the
// order is marked incomplete and the profit is shown only for the part
// that could be costed.
//
// Pure functions only — shared by the API routes and covered by tests.

import { round2 } from '@/lib/finance';

export interface ProfitSelection {
  פטיפור_id: string;
  כמות: number;
}

export interface ProfitLineSource {
  סוג_שורה: string;
  מוצר_id: string | null;
  גודל_מארז: number | null;
  כמות: number;
  סהכ: number;
  שם_פריט_מותאם: string | null;
  שם_מוצר?: string | null;
  בחירות: ProfitSelection[];
}

export interface UnitCosts {
  product: Map<string, number>;
  petitFour: Map<string, number>;
}

export type LineKind = 'product' | 'package' | 'custom' | 'charge';

export interface LineProfit {
  /** Grouping key for the per-product report. */
  key: string;
  label: string;
  kind: LineKind;
  qty: number;
  revenue: number;
  /** null = unknown (no cost entered for this item). */
  cost: number | null;
}

export interface OrderProfit {
  revenue: number;
  /** Cost of the lines that could be costed. */
  cost: number;
  /** Every line costed → revenue − cost; otherwise null. */
  profit: number | null;
  /** Profit on the costed part only (always available). */
  partialProfit: number;
  /** Revenue of the costed lines. */
  coveredRevenue: number;
  complete: boolean;
  /** Names of the items with no cost. */
  missing: string[];
  lines: LineProfit[];
}

function lineKind(t: string): LineKind {
  if (t === 'מארז') return 'package';
  if (t === 'מוצר') return 'product';
  if (t === 'תוספת_תשלום') return 'charge';
  return 'custom';
}

function lineIdentity(l: ProfitLineSource, kind: LineKind): { key: string; label: string } {
  if (kind === 'product' && l.מוצר_id) return { key: `p:${l.מוצר_id}`, label: l.שם_מוצר?.trim() || 'מוצר' };
  if (kind === 'package') {
    const size = Number(l.גודל_מארז) || 0;
    return { key: `pkg:${size}`, label: size ? `מארז ${size} יח׳` : 'מארז' };
  }
  const name = l.שם_פריט_מותאם?.trim() || (kind === 'charge' ? 'תוספת תשלום' : 'פריט ידני');
  return { key: `${kind === 'charge' ? 'x' : 'c'}:${name}`, label: name };
}

/** Mean unit cost over every petit-four type that has a cost; null when none. */
export function averagePetitFourCost(costs: UnitCosts): number | null {
  const vals = [...costs.petitFour.values()];
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
}

/** Unit-cost of one line × its quantity, or null when any part is unknown. */
export function lineCost(l: ProfitLineSource, costs: UnitCosts): number | null {
  const kind = lineKind(l.סוג_שורה);
  const qty = Number(l.כמות) || 0;
  if (kind === 'charge') return 0; // a surcharge / discount line has no goods behind it
  if (kind === 'product') {
    const c = l.מוצר_id ? costs.product.get(l.מוצר_id) : undefined;
    return c == null ? null : qty * c;
  }
  if (kind === 'package') {
    // Average petit-four cost × units in the package (most packages are sold
    // without a per-flavour selection). Size falls back to the selections.
    const avg = averagePetitFourCost(costs);
    const size = Number(l.גודל_מארז) || l.בחירות.reduce((s, x) => s + (Number(x.כמות) || 0), 0);
    if (avg == null || !(size > 0)) return null;
    return qty * size * avg;
  }
  return null; // free-text item — nothing to look a cost up by
}

export function orderProfit(pocket: number, lines: ProfitLineSource[], costs: UnitCosts): OrderProfit {
  const lineSum = lines.reduce((s, l) => s + (Number(l.סהכ) || 0), 0);
  const factor = lineSum !== 0 ? pocket / lineSum : 0;

  const out: LineProfit[] = [];
  const missing: string[] = [];
  let cost = 0;
  let coveredRevenue = 0;

  for (const l of lines) {
    const kind = lineKind(l.סוג_שורה);
    const { key, label } = lineIdentity(l, kind);
    const revenue = (Number(l.סהכ) || 0) * factor;
    const c = lineCost(l, costs);
    if (c == null) {
      if (!missing.includes(label)) missing.push(label);
    } else {
      cost += c;
      coveredRevenue += revenue;
    }
    out.push({ key, label, kind, qty: Number(l.כמות) || 0, revenue: round2(revenue), cost: c == null ? null : round2(c) });
  }

  const complete = missing.length === 0;
  return {
    revenue: round2(pocket),
    cost: round2(cost),
    profit: complete ? round2(pocket - cost) : null,
    partialProfit: round2(coveredRevenue - cost),
    coveredRevenue: round2(coveredRevenue),
    complete,
    missing,
    lines: out,
  };
}

export interface ProductProfitRow {
  key: string;
  label: string;
  kind: LineKind;
  qty: number;
  orders: number;
  revenue: number;
  /** Cost of the costed units only. */
  cost: number;
  /** Units that had no cost. */
  uncostedQty: number;
  /** Revenue − cost, counted only over costed units. */
  profit: number | null;
  /** Margin (%) on the costed units. */
  margin: number | null;
}

/** Groups costed lines of many orders into one row per product / package size. */
export function aggregateByProduct(orders: OrderProfit[]): ProductProfitRow[] {
  type Acc = ProductProfitRow & { coveredRevenue: number };
  const map = new Map<string, Acc>();
  orders.forEach(o => {
    const seen = new Set<string>();
    for (const l of o.lines) {
      if (l.kind === 'charge') continue;
      let a = map.get(l.key);
      if (!a) {
        a = { key: l.key, label: l.label, kind: l.kind, qty: 0, orders: 0, revenue: 0, cost: 0, uncostedQty: 0, profit: null, margin: null, coveredRevenue: 0 };
        map.set(l.key, a);
      }
      a.qty += l.qty;
      a.revenue += l.revenue;
      if (l.cost == null) a.uncostedQty += l.qty;
      else { a.cost += l.cost; a.coveredRevenue += l.revenue; }
      if (!seen.has(l.key)) { seen.add(l.key); a.orders++; }
    }
  });
  return [...map.values()].map(a => {
    const costed = a.qty - a.uncostedQty > 0;
    const profit = costed ? round2(a.coveredRevenue - a.cost) : null;
    return {
      key: a.key, label: a.label, kind: a.kind,
      qty: round2(a.qty), orders: a.orders,
      revenue: round2(a.revenue), cost: round2(a.cost), uncostedQty: round2(a.uncostedQty),
      profit,
      margin: profit != null && a.coveredRevenue > 0 ? Math.round((profit / a.coveredRevenue) * 1000) / 10 : null,
    };
  }).sort((x, y) => y.revenue - x.revenue);
}

/** Margin (%) of a profit over a revenue, one decimal; null when undefined. */
export function profitMargin(profit: number | null, revenue: number): number | null {
  if (profit == null || !(revenue > 0)) return null;
  return Math.round((profit / revenue) * 1000) / 10;
}
