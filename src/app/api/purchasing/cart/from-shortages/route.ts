export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { dbErrorResponse } from '@/lib/api-error';

// POST /api/purchasing/cart/from-shortages
//   { items: [{ חומר_גלם_id, כמות }], note? }
// Adds the raw materials missing for upcoming orders (סיכום חומרי גלם) to the
// shopping cart in one go. The quantity is in the material's STOCK unit — the
// unit the shortage was computed in — and the line goes to the material's
// preferred supplier, like a line added by hand.
//
// A material that is already in the cart is left alone (its line may be in a
// different purchase unit, and a second click must not double the amount);
// it is reported back as "already in cart".

const bodySchema = z.object({
  items: z.array(z.object({
    חומר_גלם_id: z.string().uuid(),
    כמות: z.coerce.number().finite().gt(0, 'כמות לא תקינה').max(1_000_000),
  })).min(1, 'אין חומרים להוספה').max(300),
  note: z.string().trim().max(200).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'בקשה לא תקינה' }, { status: 400 });
  }
  const { items, note } = parsed.data;
  const ids = [...new Set(items.map(i => i.חומר_גלם_id))];
  const supabase = createAdminClient();

  const [matRes, cartRes] = await Promise.all([
    supabase.from('מלאי_חומרי_גלם').select('id, שם_חומר_גלם, יחידת_מידה, ספק_מועדף_id').in('id', ids),
    supabase.from('סל_קניות').select('חומר_גלם_id').in('חומר_גלם_id', ids),
  ]);
  if (matRes.error) return dbErrorResponse(matRes.error, 'purchasing/cart/from-shortages materials');
  if (cartRes.error) return dbErrorResponse(cartRes.error, 'purchasing/cart/from-shortages cart');

  type Mat = { id: string; שם_חומר_גלם: string; יחידת_מידה: string | null; ספק_מועדף_id: string | null };
  const materials = new Map(((matRes.data ?? []) as Mat[]).map(m => [m.id, m]));
  const inCart = new Set(((cartRes.data ?? []) as { חומר_גלם_id: string }[]).map(r => r.חומר_גלם_id));

  const qtyById = new Map<string, number>();
  for (const i of items) qtyById.set(i.חומר_גלם_id, Math.max(qtyById.get(i.חומר_גלם_id) ?? 0, i.כמות));

  const rows = [];
  const alreadyInCart: string[] = [];
  for (const id of ids) {
    const m = materials.get(id);
    if (!m) continue;
    if (inCart.has(id)) { alreadyInCart.push(m.שם_חומר_גלם); continue; }
    rows.push({
      חומר_גלם_id: m.id,
      שם_פריט: m.שם_חומר_גלם,
      כמות: Math.ceil((qtyById.get(id) ?? 1) * 1000) / 1000,
      יחידה: m.יחידת_מידה || null,
      ספק_id: m.ספק_מועדף_id ?? null,
      הערה: note || 'חוסר להזמנות',
      נוצר_על_ידי: auth.email,
    });
  }

  // One insert per line: the unique index on חומר_גלם_id is partial, so
  // ON CONFLICT can't target it — a line a parallel click already added
  // fails with 23505 and is simply counted as "already in cart".
  let added = 0;
  for (const row of rows) {
    const { error } = await supabase.from('סל_קניות').insert(row);
    if (!error) { added++; continue; }
    if (error.code === '23505') { alreadyInCart.push(row.שם_פריט); continue; }
    return dbErrorResponse(error, 'purchasing/cart/from-shortages insert');
  }

  console.log('[purchasing/cart/from-shortages]', { added, alreadyInCart: alreadyInCart.length });
  return NextResponse.json({ added, alreadyInCart, notFound: ids.filter(id => !materials.has(id)).length });
}
