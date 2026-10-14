// Server-only helpers for the public order form.
import { timingSafeEqual } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_TOKEN_RE } from '@/lib/quotes';
import { resolvePriceListEntry } from '@/lib/order-pricing';
import type { SalesCatalog, CatalogProduct, CatalogPackage } from '@/lib/quotes-server';

export const ORDER_FORM_TOKEN_KEY = 'order_form_token';

/** The current form token, or null when the form is closed. */
export async function currentFormToken(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase.from('system_config').select('value').eq('key', ORDER_FORM_TOKEN_KEY).maybeSingle();
  const v = (data?.value as string | null | undefined)?.trim() ?? '';
  return PUBLIC_TOKEN_RE.test(v) ? v : null;
}

export function tokensMatch(given: string, expected: string | null): boolean {
  if (!expected || !PUBLIC_TOKEN_RE.test(given)) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface PublicProduct { id: string; name: string; price: number; category: string | null }
export interface PublicPackage { id: string; name: string; size: number; price: number }

/** What a private customer may order on the form, at retail prices (VAT included). */
export function publicCatalog(c: SalesCatalog): { products: PublicProduct[]; packages: PublicPackage[] } {
  return {
    products: c.products
      .filter((p: CatalogProduct) => !p.businessOnly)
      .map(p => ({
        id: p.id, name: p.name, category: p.category,
        price: resolvePriceListEntry(c.priceList, p.id, 'retail', 1)?.מחיר ?? p.basePrice,
      }))
      .filter(p => p.price > 0),
    packages: c.packages
      .filter((p: CatalogPackage) => p.price > 0)
      .map(p => ({ id: p.id, name: p.name || `מארז ${p.size} יח׳`, size: p.size, price: p.price })),
  };
}
