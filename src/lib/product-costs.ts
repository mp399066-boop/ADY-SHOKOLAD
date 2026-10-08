// Product cost calculation for the /costs page (עלויות מוצרים).
//
// עלות ליחידה = עלות חומרים + עלות עבודה
//   חומרים — from the linked recipe (raw-material price × ingredient quantity
//            ÷ recipe yield) when חומרים_לפי_מתכון is on, else the manual amount.
//   עבודה  — production time × hourly rate ÷ units made in that time; falls
//            back to the manual amount until a time (and a rate) is entered.
//
// Pure functions only — used by the page for live previews.

import { round2 } from '@/lib/finance';

export interface CostRow {
  id: string;
  שם: string;
  גודל: string | null;
  סוג_יעד: 'sale_product' | 'petit_four' | null;
  יעד_id: string | null;
  מתכון_id: string | null;
  חומרים_לפי_מתכון: boolean;
  עלות_חומרים_ידנית: number | null;
  זמן_עבודה_דקות: number | null;
  יחידות_בזמן_עבודה: number;
  עלות_עבודה_ידנית: number | null;
  הערות: string | null;
  סדר: number;
  תאריך_עדכון: string | null;
}

export interface CostRawMaterial {
  id: string;
  שם_חומר_גלם: string;
  יחידת_מידה: string;
  מחיר_ליחידה: number | null;
  תאריך_עדכון: string | null;
}

export interface CostRecipeIngredient {
  חומר_גלם_id: string;
  כמות_נדרשת: number;
  יחידת_מידה: string;
}

export interface CostRecipe {
  id: string;
  שם_מתכון: string;
  כמות_תוצר: number;
  יחידת_תפוקה: string | null;
  production_target_type: 'sale_product' | 'petit_four' | null;
  production_target_id: string | null;
  רכיבי_מתכון: CostRecipeIngredient[];
}

export interface CatalogItem {
  type: 'sale_product' | 'petit_four';
  id: string;
  name: string;
  price: number | null;
  active: boolean;
}

// ── Units ────────────────────────────────────────────────────────────────
type Family = 'mass' | 'volume' | 'count';

const UNIT_TABLE: Record<string, { family: Family; factor: number }> = {
  'גרם': { family: 'mass', factor: 1 }, 'גר': { family: 'mass', factor: 1 }, 'ג': { family: 'mass', factor: 1 }, 'g': { family: 'mass', factor: 1 },
  'קג': { family: 'mass', factor: 1000 }, 'קילו': { family: 'mass', factor: 1000 }, 'kg': { family: 'mass', factor: 1000 },
  'מל': { family: 'volume', factor: 1 }, 'ml': { family: 'volume', factor: 1 },
  'ליטר': { family: 'volume', factor: 1000 }, 'ל': { family: 'volume', factor: 1000 }, 'l': { family: 'volume', factor: 1000 },
  'יחידה': { family: 'count', factor: 1 }, 'יחידות': { family: 'count', factor: 1 }, 'יח': { family: 'count', factor: 1 },
};

/** Lower-cases and strips quote marks / dots / spaces: ק"ג, ק״ג → קג; יח׳ → יח. */
export function normalizeUnit(u: string | null | undefined): string {
  return (u ?? '').toLowerCase().replace(/["'׳״`.\s]/g, '');
}

/**
 * Factor to multiply a quantity in `from` units by to get `to` units, or
 * null when the units can't be converted (e.g. grams → יחידה).
 */
export function unitFactor(from: string, to: string): number | null {
  const a = normalizeUnit(from);
  const b = normalizeUnit(to);
  if (a === b) return 1;
  const ua = UNIT_TABLE[a];
  const ub = UNIT_TABLE[b];
  if (!ua || !ub || ua.family !== ub.family) return null;
  return ua.factor / ub.factor;
}

// ── Recipe cost ──────────────────────────────────────────────────────────
export type LineIssue = 'missing_material' | 'no_price' | 'unit_mismatch';

export interface RecipeCostLine {
  materialId: string;
  name: string;
  qty: number;
  unit: string;
  materialUnit: string | null;
  price: number | null;
  cost: number | null;
  issue: LineIssue | null;
  /** Priced per gram/ml at ₪1+ — probably a per-kg price on a gram unit. */
  suspicious: boolean;
}

export interface RecipeCost {
  lines: RecipeCostLine[];
  /** Sum of the lines that could be priced (whole batch). */
  batchTotal: number;
  yield: number;
  /** batchTotal ÷ yield. */
  perUnit: number;
  issues: number;
  suspicious: number;
  complete: boolean;
}

export function recipeCost(recipe: CostRecipe, rawById: Map<string, CostRawMaterial>): RecipeCost {
  const lines: RecipeCostLine[] = (recipe.רכיבי_מתכון ?? []).map(ing => {
    const m = rawById.get(ing.חומר_גלם_id);
    const qty = Number(ing.כמות_נדרשת) || 0;
    const base = {
      materialId: ing.חומר_גלם_id,
      name: m?.שם_חומר_גלם ?? 'חומר גלם שנמחק',
      qty,
      unit: ing.יחידת_מידה,
      materialUnit: m?.יחידת_מידה ?? null,
      price: m?.מחיר_ליחידה ?? null,
      suspicious: !!m && isSuspiciousPrice(m),
    };
    if (!m) return { ...base, cost: null, issue: 'missing_material' as const };
    if (m.מחיר_ליחידה == null || Number(m.מחיר_ליחידה) <= 0) return { ...base, price: null, cost: null, issue: 'no_price' as const };
    const f = unitFactor(ing.יחידת_מידה, m.יחידת_מידה);
    if (f == null) return { ...base, cost: null, issue: 'unit_mismatch' as const };
    return { ...base, cost: qty * f * Number(m.מחיר_ליחידה), issue: null };
  });
  const batchTotal = lines.reduce((s, l) => s + (l.cost ?? 0), 0);
  const y = Number(recipe.כמות_תוצר) > 0 ? Number(recipe.כמות_תוצר) : 1;
  const issues = lines.filter(l => l.issue).length;
  return {
    lines,
    batchTotal: round2(batchTotal),
    yield: y,
    perUnit: batchTotal / y,
    issues,
    suspicious: lines.filter(l => l.suspicious && l.cost != null).length,
    complete: lines.length > 0 && issues === 0,
  };
}

// ── Row cost ─────────────────────────────────────────────────────────────
export type MaterialsSource = 'recipe' | 'manual' | 'none';
export type LaborSource = 'time' | 'manual' | 'none';

export interface RowCost {
  materials: number | null;
  materialsSource: MaterialsSource;
  /** Present when materials come from a recipe that has unpriced/mismatched lines. */
  recipeIssues: number;
  /** Recipe lines priced with a suspicious per-gram/ml price. */
  recipeSuspicious: number;
  labor: number | null;
  laborSource: LaborSource;
  /** Time was entered but there's no hourly rate yet → manual/none fallback used. */
  laborNeedsRate: boolean;
  total: number | null;
  /** Both parts known. */
  complete: boolean;
}

export type CostInputs = Pick<CostRow,
  'מתכון_id' | 'חומרים_לפי_מתכון' | 'עלות_חומרים_ידנית' | 'זמן_עבודה_דקות' | 'יחידות_בזמן_עבודה' | 'עלות_עבודה_ידנית'>;

export function laborFromTime(minutes: number, units: number, hourlyRate: number): number {
  return (minutes / 60) * hourlyRate / (units > 0 ? units : 1);
}

export function computeRowCost(
  row: CostInputs,
  recipesById: Map<string, CostRecipe>,
  rawById: Map<string, CostRawMaterial>,
  hourlyRate: number | null,
): RowCost {
  let materials: number | null = null;
  let materialsSource: MaterialsSource = 'none';
  let recipeIssues = 0;
  let recipeSuspicious = 0;
  const recipe = row.מתכון_id ? recipesById.get(row.מתכון_id) : undefined;
  if (row.חומרים_לפי_מתכון && recipe) {
    const rc = recipeCost(recipe, rawById);
    materials = rc.perUnit;
    materialsSource = 'recipe';
    recipeIssues = rc.issues;
    recipeSuspicious = rc.suspicious;
  } else if (row.עלות_חומרים_ידנית != null) {
    materials = Number(row.עלות_חומרים_ידנית);
    materialsSource = 'manual';
  }

  let labor: number | null = null;
  let laborSource: LaborSource = 'none';
  const minutes = row.זמן_עבודה_דקות != null ? Number(row.זמן_עבודה_דקות) : null;
  const hasTime = minutes != null && minutes > 0;
  const rate = hourlyRate != null && hourlyRate > 0 ? hourlyRate : null;
  if (hasTime && rate) {
    labor = laborFromTime(minutes!, Number(row.יחידות_בזמן_עבודה) || 1, rate);
    laborSource = 'time';
  } else if (row.עלות_עבודה_ידנית != null) {
    labor = Number(row.עלות_עבודה_ידנית);
    laborSource = 'manual';
  }

  const total = materials == null && labor == null ? null : round2((materials ?? 0) + (labor ?? 0));
  return {
    materials: materials == null ? null : round2(materials),
    materialsSource,
    recipeIssues,
    recipeSuspicious,
    labor: labor == null ? null : round2(labor),
    laborSource,
    laborNeedsRate: hasTime && !rate,
    total,
    complete: materials != null && labor != null && recipeIssues === 0 && recipeSuspicious === 0,
  };
}

/** Profit margin on the sale price (%), or null when there's no price/cost. */
export function marginPct(price: number | null | undefined, cost: number | null): number | null {
  const p = Number(price);
  if (!p || p <= 0 || cost == null) return null;
  return Math.round(((p - cost) / p) * 1000) / 10;
}

/** 90 → "1:30 ש׳", 25 → "25 דק׳". */
export function formatMinutes(min: number | null | undefined): string {
  if (min == null || !(min > 0)) return '—';
  const m = Math.round(min * 10) / 10;
  if (m < 60) return `${m} דק׳`;
  const h = Math.floor(m / 60);
  const rest = Math.round(m - h * 60);
  return `${h}:${String(rest).padStart(2, '0')} ש׳`;
}

export const LINE_ISSUE_LABEL: Record<LineIssue, string> = {
  missing_material: 'חומר הגלם נמחק',
  no_price: 'אין מחיר לחומר הגלם',
  unit_mismatch: 'יחידות לא תואמות',
};

/** GET /api/costs response. */
export interface CostsData {
  rows: CostRow[];
  tableReady: boolean;
  hint: string | null;
  recipes: CostRecipe[];
  rawMaterials: CostRawMaterial[];
  catalog: CatalogItem[];
  hourlyRate: number | null;
}

/**
 * A price of ₪1+ per gram / ml is almost always a per-kg / per-liter price
 * saved on a gram/ml unit — it inflates recipe costs ×1000.
 */
export function isSuspiciousPrice(m: Pick<CostRawMaterial, 'יחידת_מידה' | 'מחיר_ליחידה'>): boolean {
  const u = UNIT_TABLE[normalizeUnit(m.יחידת_מידה)];
  return !!u && u.factor === 1 && u.family !== 'count' && Number(m.מחיר_ליחידה) >= 1;
}
