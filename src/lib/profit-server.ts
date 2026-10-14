// Server-only: loads the unit cost of every sale product and petit-four type
// from the /costs sheet, computed exactly like the /costs page does
// (computeRowCost — recipe or manual materials + time or manual labor).
import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingTable } from '@/lib/finance-expense-schema';
import { COST_COLUMNS, normalizeCostRow } from '@/lib/product-costs-schema';
import {
  computeRowCost, type CostRow, type CostRecipe, type CostRawMaterial,
} from '@/lib/product-costs';
import type { UnitCosts, ProfitLineSource } from '@/lib/order-profit';
import { toFinanceOrder, type FinanceOrder, type FinanceOrderSource } from '@/lib/finance';

export interface UnitCostsResult {
  costs: UnitCosts;
  /** false when migration 058 (עלויות_מוצרים) hasn't been run. */
  tableReady: boolean;
  error: { code?: string | null } | null;
}

export async function loadUnitCosts(supabase: SupabaseClient): Promise<UnitCostsResult> {
  const costs: UnitCosts = { product: new Map(), petitFour: new Map() };

  const [rowsRes, recipesRes, rawRes, rateRes] = await Promise.all([
    supabase.from('עלויות_מוצרים').select(COST_COLUMNS).order('סדר').order('שם'),
    supabase.from('מתכונים')
      .select('id, שם_מתכון, כמות_תוצר, יחידת_תפוקה, production_target_type, production_target_id, רכיבי_מתכון(חומר_גלם_id, כמות_נדרשת, יחידת_מידה)'),
    supabase.from('מלאי_חומרי_גלם').select('id, שם_חומר_גלם, יחידת_מידה, מחיר_ליחידה, תאריך_עדכון'),
    supabase.from('system_config').select('value').eq('key', 'labor_hourly_rate').maybeSingle(),
  ]);

  if (rowsRes.error) {
    if (isMissingTable(rowsRes.error)) return { costs, tableReady: false, error: null };
    return { costs, tableReady: true, error: rowsRes.error };
  }
  const firstError = recipesRes.error || rawRes.error;
  if (firstError) return { costs, tableReady: true, error: firstError };

  type Ing = { חומר_גלם_id: string; כמות_נדרשת: unknown; יחידת_מידה: string };
  type RecipeRow = Omit<CostRecipe, 'כמות_תוצר' | 'רכיבי_מתכון'> & { כמות_תוצר: unknown; רכיבי_מתכון: Ing[] | null };
  const recipesById = new Map<string, CostRecipe>(
    ((recipesRes.data ?? []) as unknown as RecipeRow[]).map(r => [r.id, {
      ...r,
      כמות_תוצר: Number(r.כמות_תוצר) || 1,
      רכיבי_מתכון: (r.רכיבי_מתכון ?? []).map(i => ({ ...i, כמות_נדרשת: Number(i.כמות_נדרשת) || 0 })),
    }]),
  );
  type RawRow = Omit<CostRawMaterial, 'מחיר_ליחידה'> & { מחיר_ליחידה: unknown };
  const rawById = new Map<string, CostRawMaterial>(
    ((rawRes.data ?? []) as unknown as RawRow[]).map(m => [m.id, { ...m, מחיר_ליחידה: m.מחיר_ליחידה == null ? null : Number(m.מחיר_ליחידה) }]),
  );
  const rateNum = Number(rateRes.data?.value);
  const hourlyRate = rateRes.data?.value && rateNum > 0 ? rateNum : null;

  for (const raw of (rowsRes.data ?? []) as unknown as Record<string, unknown>[]) {
    const row = normalizeCostRow(raw) as unknown as CostRow;
    if (!row.סוג_יעד || !row.יעד_id) continue;
    const map = row.סוג_יעד === 'sale_product' ? costs.product : costs.petitFour;
    if (map.has(row.יעד_id)) continue; // first row (by סדר) wins
    const rc = computeRowCost(row, recipesById, rawById, hourlyRate);
    // A recipe priced with a per-kg price on a gram unit inflates the cost
    // ×1000 — better "no cost" than a wildly wrong profit.
    if (rc.total == null || rc.recipeSuspicious > 0) continue;
    map.set(row.יעד_id, rc.total);
  }

  return { costs, tableReady: true, error: null };
}

// ── Orders → profit input ────────────────────────────────────────────────

/** Columns an order needs for its profit (finance money + lines). */
export const PROFIT_ORDER_SELECT = `
  id, מספר_הזמנה, תאריך_הזמנה, תאריך_אספקה, סטטוס_הזמנה, סטטוס_תשלום, סוג_הזמנה, אופן_תשלום,
  סך_הכל_לתשלום, דמי_משלוח, לקוח_id,
  לקוחות(שם_פרטי, שם_משפחה, סוג_לקוח, פטור_ממעמ),
  מוצרים_בהזמנה(סוג_שורה, מוצר_id, גודל_מארז, כמות, סהכ, שם_פריט_מותאם,
    מוצרים_למכירה(שם_מוצר),
    בחירת_פטיפורים_בהזמנה(פטיפור_id, כמות))
`;

interface ProfitOrderRow extends FinanceOrderSource {
  מוצרים_בהזמנה: {
    סוג_שורה: string;
    מוצר_id: string | null;
    גודל_מארז: number | string | null;
    כמות: number | string | null;
    סהכ: number | string | null;
    שם_פריט_מותאם: string | null;
    מוצרים_למכירה: { שם_מוצר: string | null } | null;
    בחירת_פטיפורים_בהזמנה: { פטיפור_id: string; כמות: number | string | null }[] | null;
  }[] | null;
}

export function profitInput(row: unknown): { order: FinanceOrder; lines: ProfitLineSource[] } {
  const r = row as ProfitOrderRow;
  return {
    order: toFinanceOrder(r),
    lines: (r.מוצרים_בהזמנה ?? []).map(l => ({
      סוג_שורה: l.סוג_שורה,
      מוצר_id: l.מוצר_id,
      גודל_מארז: l.גודל_מארז == null ? null : Number(l.גודל_מארז),
      כמות: Number(l.כמות) || 0,
      סהכ: Number(l.סהכ) || 0,
      שם_פריט_מותאם: l.שם_פריט_מותאם,
      שם_מוצר: l.מוצרים_למכירה?.שם_מוצר ?? null,
      בחירות: (l.בחירת_פטיפורים_בהזמנה ?? []).map(s => ({ פטיפור_id: s.פטיפור_id, כמות: Number(s.כמות) || 0 })),
    })),
  };
}
