export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth/requireAuthorizedUser';
import { syncCatalogFromPriceRows, syncPriceRowsFromProducts } from '@/lib/price-sync';

// POST /api/prices/link { rowIds, productId } → re-attaches price-list rows
// that lost their product (מוצר_id is NULL after the product was deleted —
// the FK is ON DELETE SET NULL) to a catalog product. Until a row is linked,
// neither the new-order form nor the costs page can see its price.
//
// Only rows that are still unlinked are touched. A row whose tier (price_type
// + min_quantity) the product already has an active price for is skipped, so
// linking never creates two competing prices for the same tier.

const linkSchema = z.object({
  rowIds: z.array(z.string().uuid()).min(1, 'לא נבחרו מחירים').max(50),
  productId: z.string().uuid('יש לבחור מוצר'),
});

type Row = { id: string; price_type: string | null; min_quantity: number | null; פעיל: boolean | null; תאריך_עדכון: string | null };
const tierKey = (r: Pick<Row, 'price_type' | 'min_quantity'>) => `${r.price_type}|${r.min_quantity ?? ''}`;

export async function POST(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();

  const parsed = linkSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }, { status: 400 });
  const { rowIds, productId } = parsed.data;

  const supabase = createAdminClient();
  const { data: product } = await supabase.from('מוצרים_למכירה').select('id').eq('id', productId).maybeSingle();
  if (!product) return NextResponse.json({ error: 'המוצר לא נמצא בקטלוג' }, { status: 404 });

  const [candRes, existingRes] = await Promise.all([
    supabase.from('מחירון').select('id, price_type, min_quantity, פעיל, תאריך_עדכון').in('id', rowIds).is('מוצר_id', null),
    supabase.from('מחירון').select('id, price_type, min_quantity, פעיל, תאריך_עדכון').eq('מוצר_id', productId).eq('פעיל', true),
  ]);
  if (candRes.error || existingRes.error) {
    console.error('[prices link] load', { productId, code: (candRes.error || existingRes.error)?.code });
    return NextResponse.json({ error: 'קישור המחירים נכשל' }, { status: 500 });
  }

  const taken = new Set(((existingRes.data ?? []) as Row[]).map(tierKey));
  // Newest first, so if two rows share a tier the most recently edited wins.
  const candidates = ((candRes.data ?? []) as Row[])
    .sort((a, b) => (b.תאריך_עדכון ?? '').localeCompare(a.תאריך_עדכון ?? ''));
  const toLink: string[] = [];
  let skipped = 0;
  for (const r of candidates) {
    if (r.פעיל && taken.has(tierKey(r))) { skipped++; continue; }
    if (r.פעיל) taken.add(tierKey(r));
    toLink.push(r.id);
  }

  if (toLink.length) {
    const { error } = await supabase.from('מחירון')
      .update({ מוצר_id: productId, תאריך_עדכון: new Date().toISOString() })
      .in('id', toLink)
      .is('מוצר_id', null);
    if (error) {
      console.error('[prices link] update', { productId, code: error.code });
      return NextResponse.json({ error: 'קישור המחירים נכשל' }, { status: 500 });
    }
  }

  // A linked row now belongs to the product: take its name/sku, and give it
  // the row's price if that row is its base price.
  await syncPriceRowsFromProducts(supabase, [productId], { withPrice: false });
  await syncCatalogFromPriceRows(supabase, toLink);

  return NextResponse.json({ linked: toLink.length, skipped, alreadyLinked: rowIds.length - candidates.length });
}
