// Product cost calculation for the /costs page (עלויות מוצרים).
//
// עלות ליחידה = עלות חומרים + עלות עבודה
//   חומרים — when חומרים_לפי_מתכון is on, the sum over the row's sub-recipes
//            (migration 070) of: recipe batch cost ÷ units of this product one
//            batch makes. Without sub-recipes, the single linked recipe ÷ its
//            yield (the behaviour before 070). Otherwise the manual amount.
//            On top of either: the row's direct raw materials (migration 071 —
//            a box, a note card…) × quantity per unit at today's price.
//            Raw-material prices always count BEFORE VAT (the business gets
//            the VAT back) — a price entered with VAT is divided by 1.18.
//   עבודה  — production time × hourly rate ÷ units made in that time; falls
//            back to the manual amount until a time (and a rate) is entered.
//
// Pure functions only — used by the page for live previews.

import { round2, VAT_RATE } from '@/lib/finance';

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
  /** Sale price entered on the row itself (migration 069) — used when it isn't linked to a catalog product. */
  מחיר_מכירה?: number | null;
  /** Sub-recipes that make up the product (migration 070). Missing/empty = the single מתכון_id. */
  מתכונים?: CostRowRecipe[];
  /** Raw materials used directly per unit — packaging etc. (migration 071). */
  חומרים?: CostRowMaterial[];
  סדר: number;
  תאריך_עדכון: string | null;
}

/** One sub-recipe of a cost row: one batch of the recipe is enough for `יחידות` units of the product. */
export interface CostRowRecipe {
  מתכון_id: string;
  יחידות: number;
}

/** A raw material used directly by one unit of the product: `כמות` in `יחידת_מידה`. */
export interface CostRowMaterial {
  חומר_גלם_id: string;
  כמות: number;
  יחידת_מידה: string;
}

export interface CostRawMaterial {
  id: string;
  שם_חומר_גלם: string;
  יחידת_מידה: string;
  מחיר_ליחידה: number | null;
  /** true = מחיר_ליחידה was entered with VAT (migration 067; missing = before VAT). */
  מחיר_כולל_מעמ?: boolean;
  תאריך_עדכון: string | null;
}

/** The raw material's price per unit BEFORE VAT — what product cost uses. */
export function netUnitPrice(m: Pick<CostRawMaterial, 'מחיר_ליחידה' | 'מחיר_כולל_מעמ'>): number | null {
  if (m.מחיר_ליחידה == null) return null;
  const p = Number(m.מחיר_ליחידה);
  return m.מחיר_כולל_מעמ ? p / (1 + VAT_RATE) : p;
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
  /** Price per material unit, before VAT. */
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

/** Prices `qty` `unit` of one raw material (before VAT). */
export function costLine(materialId: string, qty: number, unit: string, rawById: Map<string, CostRawMaterial>): RecipeCostLine {
  const m = rawById.get(materialId);
  const base = {
    materialId,
    name: m?.שם_חומר_גלם ?? 'חומר גלם שנמחק',
    qty,
    unit,
    materialUnit: m?.יחידת_מידה ?? null,
    price: m ? netUnitPrice(m) : null,
    suspicious: !!m && isSuspiciousPrice(m),
  };
  if (!m) return { ...base, cost: null, issue: 'missing_material' };
  if (m.מחיר_ליחידה == null || Number(m.מחיר_ליחידה) <= 0) return { ...base, price: null, cost: null, issue: 'no_price' };
  const f = unitFactor(unit, m.יחידת_מידה);
  if (f == null) return { ...base, cost: null, issue: 'unit_mismatch' };
  return { ...base, cost: qty * f * netUnitPrice(m)!, issue: null };
}

/** The row's direct raw-material lines (migration 071), each priced for ONE unit of the product. */
export function rowMaterialLines(row: Pick<CostRow, 'חומרים'>, rawById: Map<string, CostRawMaterial>): RecipeCostLine[] {
  return (row.חומרים ?? []).map(l => costLine(l.חומר_גלם_id, Number(l.כמות) || 0, l.יחידת_מידה, rawById));
}

/** Units a raw material's quantity can be entered in: its own unit + convertible ones (גרם ↔ ק״ג…). */
export function compatibleUnits(materialUnit: string): string[] {
  const own = UNIT_TABLE[normalizeUnit(materialUnit)];
  if (!own) return [materialUnit];
  const canonical: Record<Family, string[]> = { mass: ['גרם', 'ק"ג'], volume: ['מ"ל', 'ליטר'], count: ['יחידה'] };
  const others = canonical[own.family].filter(u => normalizeUnit(u) !== normalizeUnit(materialUnit) && unitFactor(u, materialUnit) != null);
  return [materialUnit, ...others];
}

export function recipeCost(recipe: CostRecipe, rawById: Map<string, CostRawMaterial>): RecipeCost {
  const lines: RecipeCostLine[] = (recipe.רכיבי_מתכון ?? []).map(ing =>
    costLine(ing.חומר_גלם_id, Number(ing.כמות_נדרשת) || 0, ing.יחידת_מידה, rawById));
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
/** 'items' = only direct raw materials (no recipe and no manual amount). */
export type MaterialsSource = 'recipe' | 'manual' | 'items' | 'none';
export type LaborSource = 'time' | 'manual' | 'none';

export interface RowCost {
  materials: number | null;
  materialsSource: MaterialsSource;
  /** Present when materials come from a recipe that has unpriced/mismatched lines. */
  recipeIssues: number;
  /** Recipe lines priced with a suspicious per-gram/ml price. */
  recipeSuspicious: number;
  /** Direct raw materials (migration 071) included in `materials`, ₪ per unit; 0 when none. */
  extraMaterials: number;
  /** Number of direct raw-material lines. */
  extraCount: number;
  labor: number | null;
  laborSource: LaborSource;
  /** Time was entered but there's no hourly rate yet → manual/none fallback used. */
  laborNeedsRate: boolean;
  total: number | null;
  /** Both parts known. */
  complete: boolean;
}

export type CostInputs = Pick<CostRow,
  'מתכון_id' | 'מתכונים' | 'חומרים' | 'חומרים_לפי_מתכון' | 'עלות_חומרים_ידנית' | 'זמן_עבודה_דקות' | 'יחידות_בזמן_עבודה' | 'עלות_עבודה_ידנית'>;

export function laborFromTime(minutes: number, units: number, hourlyRate: number): number {
  return (minutes / 60) * hourlyRate / (units > 0 ? units : 1);
}

export interface RecipePart {
  recipe: CostRecipe;
  /** Units of the product one batch of this recipe makes. */
  units: number;
  cost: RecipeCost;
  /** This recipe's share of the product's unit cost (unrounded). */
  perUnit: number;
}

/**
 * The sub-recipes a row's material cost is built from: its מתכונים list, or —
 * when it has none (before migration 070) — the single מתכון_id at the
 * recipe's own yield. Links to deleted recipes are skipped.
 */
export function rowRecipeParts(
  row: Pick<CostRow, 'מתכון_id' | 'מתכונים'>,
  recipesById: Map<string, CostRecipe>,
  rawById: Map<string, CostRawMaterial>,
): RecipePart[] {
  const links: { מתכון_id: string; יחידות: number | null }[] = row.מתכונים?.length
    ? row.מתכונים
    : row.מתכון_id ? [{ מתכון_id: row.מתכון_id, יחידות: null }] : [];
  const parts: RecipePart[] = [];
  for (const l of links) {
    const recipe = recipesById.get(l.מתכון_id);
    if (!recipe) continue;
    const cost = recipeCost(recipe, rawById);
    const units = Number(l.יחידות) > 0 ? Number(l.יחידות) : cost.yield;
    // cost.perUnit × cost.yield = the unrounded batch total.
    parts.push({ recipe, units, cost, perUnit: (cost.perUnit * cost.yield) / units });
  }
  return parts;
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
  const parts = row.חומרים_לפי_מתכון ? rowRecipeParts(row, recipesById, rawById) : [];
  if (parts.length) {
    materials = parts.reduce((s, p) => s + p.perUnit, 0);
    materialsSource = 'recipe';
    recipeIssues = parts.reduce((s, p) => s + p.cost.issues, 0);
    recipeSuspicious = parts.reduce((s, p) => s + p.cost.suspicious, 0);
  } else if (row.עלות_חומרים_ידנית != null) {
    materials = Number(row.עלות_חומרים_ידנית);
    materialsSource = 'manual';
  }
  // Direct raw materials (box, note card…) add to whichever base was used.
  const extraLines = rowMaterialLines(row, rawById);
  const extra = extraLines.reduce((s, l) => s + (l.cost ?? 0), 0);
  if (extraLines.length) {
    materials = (materials ?? 0) + extra;
    if (materialsSource === 'none') materialsSource = 'items';
    recipeIssues += extraLines.filter(l => l.issue).length;
    recipeSuspicious += extraLines.filter(l => l.suspicious && l.cost != null).length;
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
    extraMaterials: round2(extra),
    extraCount: extraLines.length,
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
  /** false until migration 067 (מחיר_כולל_מעמ) is run. */
  vatFlagReady: boolean;
  /** false until migration 070 (מתכוני_עלות — several sub-recipes per product) is run. */
  recipeLinksReady: boolean;
  /** false until migration 071 (חומרי_עלות — raw materials directly on a product) is run. */
  materialLinksReady: boolean;
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
