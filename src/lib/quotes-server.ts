// Server-only helpers shared by the quote routes and the public order form.
import type { SupabaseClient } from '@supabase/supabase-js';
import { BUSINESS_CUSTOMER_TYPES } from '@/lib/finance';
import type { PriceEntry } from '@/lib/order-pricing';
import type { QuoteLine } from '@/lib/quotes';

export interface CatalogProduct {
  id: string;
  name: string;
  /** Product code (מק"ט) — searchable in the quote editor. */
  sku: string | null;
  basePrice: number;
  businessOnly: boolean;
  category: string | null;
  preorder: boolean;
}
export interface CatalogPackage {
  id: string;
  name: string;
  size: number;
  price: number;
  maxKinds: number;
}
export interface SalesCatalog {
  products: CatalogProduct[];
  packages: CatalogPackage[];
  priceList: PriceEntry[];
}

/** Active products, active packages and the active price list. */
export async function loadSalesCatalog(supabase: SupabaseClient): Promise<{ data: SalesCatalog | null; error: { code?: string | null } | null }> {
  const [pRes, pkgRes, plRes] = await Promise.all([
    supabase.from('מוצרים_למכירה')
      .select('id, שם_מוצר, sku, מחיר, לקוחות_עסקיים_בלבד, קטגוריית_מוצר, בהזמנה_מראש')
      .eq('פעיל', true).order('שם_מוצר'),
    supabase.from('מארזים').select('id, שם_מארז, גודל_מארז, מחיר_מארז, כמה_סוגים_מותר_לבחור').eq('פעיל', true).order('גודל_מארז'),
    supabase.from('מחירון').select('מוצר_id, price_type, מחיר, min_quantity').eq('פעיל', true).not('מוצר_id', 'is', null),
  ]);
  const error = pRes.error || pkgRes.error || plRes.error;
  if (error) return { data: null, error };

  type P = { id: string; שם_מוצר: string; sku: string | null; מחיר: unknown; לקוחות_עסקיים_בלבד: boolean | null; קטגוריית_מוצר: string | null; בהזמנה_מראש: boolean | null };
  type Pkg = { id: string; שם_מארז: string; גודל_מארז: unknown; מחיר_מארז: unknown; כמה_סוגים_מותר_לבחור: unknown };
  type PL = { מוצר_id: string; price_type: string | null; מחיר: unknown; min_quantity: unknown };
  return {
    error: null,
    data: {
      products: ((pRes.data ?? []) as unknown as P[]).map(p => ({
        id: p.id, name: p.שם_מוצר, sku: p.sku ?? null, basePrice: Number(p.מחיר) || 0,
        businessOnly: p.לקוחות_עסקיים_בלבד === true, category: p.קטגוריית_מוצר, preorder: p.בהזמנה_מראש === true,
      })),
      packages: ((pkgRes.data ?? []) as unknown as Pkg[]).map(p => ({
        id: p.id, name: p.שם_מארז, size: Number(p.גודל_מארז) || 0, price: Number(p.מחיר_מארז) || 0,
        maxKinds: Number(p.כמה_סוגים_מותר_לבחור) || 0,
      })).filter(p => p.size > 0),
      priceList: ((plRes.data ?? []) as unknown as PL[]).map(r => ({
        מוצר_id: r.מוצר_id, price_type: r.price_type ?? 'retail', מחיר: Number(r.מחיר) || 0,
        min_quantity: r.min_quantity == null ? null : Number(r.min_quantity),
      })),
    },
  };
}

/**
 * Validates quote lines against the catalog and fills the names from the DB
 * (a product line is always named after the real product). Prices stay as
 * the owner typed them — manual pricing is allowed, as on orders.
 */
export async function resolveQuoteLines(
  supabase: SupabaseClient,
  lines: QuoteLine[],
  customerType: string | null,
): Promise<{ lines: QuoteLine[] } | { error: string }> {
  const ids = [...new Set(lines.filter(l => l.סוג === 'מוצר' && l.מוצר_id).map(l => l.מוצר_id as string))];
  const byId = new Map<string, { שם_מוצר: string; לקוחות_עסקיים_בלבד: boolean | null }>();
  if (ids.length) {
    const { data, error } = await supabase.from('מוצרים_למכירה').select('id, שם_מוצר, לקוחות_עסקיים_בלבד').in('id', ids);
    if (error) return { error: 'שגיאה בבדיקת המוצרים' };
    for (const p of (data ?? []) as unknown as { id: string; שם_מוצר: string; לקוחות_עסקיים_בלבד: boolean | null }[]) byId.set(p.id, p);
  }
  const isBusiness = BUSINESS_CUSTOMER_TYPES.has(customerType ?? '');
  const out: QuoteLine[] = [];
  for (const l of lines) {
    if (l.סוג === 'מוצר') {
      const p = byId.get(l.מוצר_id ?? '');
      if (!p) return { error: 'אחד המוצרים בהצעה לא נמצא בקטלוג' };
      if (p.לקוחות_עסקיים_בלבד && !isBusiness) return { error: `המוצר "${p.שם_מוצר}" זמין ללקוחות עסקיים בלבד` };
      out.push({ ...l, גודל_מארז: null, שם: p.שם_מוצר });
    } else if (l.סוג === 'מארז') {
      out.push({ ...l, מוצר_id: null, שם: l.שם?.trim() || `מארז ${l.גודל_מארז} יח׳` });
    } else {
      out.push({ ...l, מוצר_id: null, גודל_מארז: null });
    }
  }
  return { lines: out };
}

export const SALES_MIGRATION_HINT =
  'הטבלאות של הצעות המחיר ובקשות ההזמנה עדיין לא קיימות. יש להריץ את מיגרציה 066 (supabase/migrations/066_quotes_and_order_requests.sql) ב-Supabase SQL Editor.';

// `*` rather than a column list: the change-request columns (migration 074)
// show up once the migration ran, and the list keeps working before that.
export const QUOTE_SELECT = `
  *,
  לקוחות(id, שם_פרטי, שם_משפחה, טלפון, אימייל, סוג_לקוח, פטור_ממעמ)
`;

/** NUMERIC columns arrive as strings — coerce them. */
export function normalizeQuote<T extends Record<string, unknown>>(q: T): T {
  const n = (k: string) => Number(q[k]) || 0;
  return {
    ...q,
    ערך_הנחה: n('ערך_הנחה'), דמי_משלוח: n('דמי_משלוח'),
    סכום_לפני_הנחה: n('סכום_לפני_הנחה'), סכום_הנחה: n('סכום_הנחה'), סך_הכל: n('סך_הכל'),
  };
}
