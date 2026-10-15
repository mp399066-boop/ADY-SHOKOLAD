// Server-side validation for /api/costs writes.
import { z } from 'zod';
import { round2 } from '@/lib/finance';

const optText = (max: number) =>
  z.string().trim().max(max).optional().nullable().transform(v => (v ? v : null));

const optMoney = z.union([z.null(), z.coerce.number().finite().min(0, 'סכום לא יכול להיות שלילי').max(1_000_000)])
  .optional().transform(v => (v == null ? null : round2(v)));

const optUuid = z.string().uuid().optional().nullable().transform(v => v ?? null);

export const costRowInputSchema = z.object({
  שם:                 z.string().trim().min(1, 'שם המוצר הוא שדה חובה').max(200),
  גודל:               optText(100),
  סוג_יעד:            z.enum(['sale_product', 'petit_four']).optional().nullable().transform(v => v ?? null),
  יעד_id:             optUuid,
  מתכון_id:           optUuid,
  // Sub-recipes (migration 070): one batch of each recipe makes `יחידות` units of this product.
  מתכונים:            z.array(z.object({
    מתכון_id: z.string().uuid(),
    יחידות:   z.coerce.number().finite().gt(0, 'מספר היחידות מכל מתכון חייב להיות גדול מ-0').max(1_000_000).transform(round2),
  })).max(30, 'אפשר לשייך עד 30 מתכונים למוצר')
    .refine(list => new Set(list.map(l => l.מתכון_id)).size === list.length, { message: 'אותו מתכון נבחר פעמיים' })
    // Missing = leave the row's sub-recipes as they are.
    .optional(),
  חומרים_לפי_מתכון:   z.boolean().default(false),
  עלות_חומרים_ידנית:  optMoney,
  זמן_עבודה_דקות:     z.union([z.null(), z.coerce.number().finite().min(0, 'זמן לא יכול להיות שלילי').max(100_000)])
    .optional().transform(v => (v == null || v === 0 ? null : round2(v))),
  יחידות_בזמן_עבודה:  z.coerce.number().finite().gt(0, 'מספר היחידות חייב להיות גדול מ-0').max(1_000_000).default(1),
  עלות_עבודה_ידנית:   optMoney,
  הערות:              optText(1000),
}).refine(r => (r.סוג_יעד == null) === (r.יעד_id == null), { message: 'קישור לקטלוג לא שלם', path: ['יעד_id'] })
  .refine(r => !r.חומרים_לפי_מתכון || (r.מתכונים ? r.מתכונים.length > 0 : r.מתכון_id != null), { message: 'כדי לחשב לפי מתכון יש לבחור מתכון', path: ['מתכון_id'] })
  // מתכון_id (kept for older screens) = the first sub-recipe.
  .transform(r => ({ ...r, מתכון_id: r.מתכונים ? r.מתכונים[0]?.מתכון_id ?? null : r.מתכון_id }));

export type CostRowInput = z.infer<typeof costRowInputSchema>;

export const hourlyRateSchema = z.object({
  labor_hourly_rate: z.union([z.null(), z.coerce.number().finite().min(0).max(10_000)]).transform(v => (v == null || v === 0 ? null : round2(v))),
});

export const rawPriceSchema = z.object({
  מחיר_ליחידה: z.union([z.null(), z.coerce.number().finite().min(0, 'מחיר לא יכול להיות שלילי').max(1_000_000)])
    .transform(v => (v == null ? null : round2(v))).optional(),
  /** true = the price above includes VAT (migration 067). */
  מחיר_כולל_מעמ: z.boolean().optional(),
}).refine(b => b.מחיר_ליחידה !== undefined || b.מחיר_כולל_מעמ !== undefined, { message: 'אין מה לעדכן' });

export const salePriceSchema = z.object({
  // No coercion of null / '' — an empty field must not silently become ₪0.
  מחיר: z.preprocess(
    v => (typeof v === 'string' && v.trim() !== '' ? Number(v) : v),
    z.number({ required_error: 'יש להזין מחיר', invalid_type_error: 'מחיר לא תקין' }).finite('מחיר לא תקין')
      .min(0, 'מחיר לא יכול להיות שלילי').max(1_000_000, 'מחיר לא תקין'),
  ).transform(round2),
});

export const COSTS_MIGRATION_HINT =
  'טבלת עלויות המוצרים עדיין לא קיימת. יש להריץ את מיגרציה 058 (supabase/migrations/058_product_costs.sql) ב-Supabase SQL Editor.';

export const RECIPE_LINKS_MIGRATION_HINT =
  'כדי לשייך כמה מתכונים למוצר (או לשנות כמה יחידות יוצאות ממתכון) יש להריץ את מיגרציה 070 (supabase/migrations/070_cost_row_recipes.sql) ב-Supabase SQL Editor.';

export const COST_COLUMNS =
  'id, שם, גודל, סוג_יעד, יעד_id, מתכון_id, חומרים_לפי_מתכון, עלות_חומרים_ידנית, זמן_עבודה_דקות, יחידות_בזמן_עבודה, עלות_עבודה_ידנית, הערות, סדר, תאריך_עדכון';

/** NUMERIC columns come back from PostgREST as strings — coerce them. */
export function normalizeCostRow(r: Record<string, unknown>) {
  const num = (v: unknown) => (v == null ? null : Number(v));
  return {
    ...r,
    עלות_חומרים_ידנית: num(r['עלות_חומרים_ידנית']),
    זמן_עבודה_דקות: num(r['זמן_עבודה_דקות']),
    יחידות_בזמן_עבודה: Number(r['יחידות_בזמן_עבודה']) || 1,
    עלות_עבודה_ידנית: num(r['עלות_עבודה_ידנית']),
    מחיר_מכירה: num(r['מחיר_מכירה']),
  };
}
