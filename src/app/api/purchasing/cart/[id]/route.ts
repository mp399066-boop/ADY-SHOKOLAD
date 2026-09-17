export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

const CART_SELECT = `
  id, חומר_גלם_id, שם_פריט, כמות, יחידה, ספק_id, הערה, הועבר_ידנית, תאריך_יצירה,
  מלאי_חומרי_גלם(id, שם_חומר_גלם, כמות_במלאי, יחידת_מידה, סטטוס_מלאי, שם_מוצר_אצל_הספק, מקט_ספק, יחידת_קניה, הערות_רכש, ספק_מועדף_id),
  ספקים(id, שם_ספק, טלפון, אימייל, איש_קשר)
`;

const MAX_QTY = 1_000_000;

// PATCH /api/purchasing/cart/[id] → quantity, unit, note, or a supplier move.
// Only these fields are writable; the item name and the raw-material link are
// never taken from the client.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
  }

  const update: Record<string, unknown> = { תאריך_עדכון: new Date().toISOString() };

  if ('כמות' in body) {
    const n = Number(body['כמות']);
    if (!Number.isFinite(n) || n <= 0 || n > MAX_QTY) {
      return NextResponse.json({ error: 'כמות לא תקינה' }, { status: 400 });
    }
    update['כמות'] = Math.round(n * 1000) / 1000;
  }

  if ('יחידה' in body) {
    const u = body['יחידה'];
    update['יחידה'] = typeof u === 'string' && u.trim() ? u.trim().slice(0, 20) : null;
  }

  if ('הערה' in body) {
    const note = body['הערה'];
    update['הערה'] = typeof note === 'string' && note.trim() ? note.trim().slice(0, 500) : null;
  }

  // Supplier move — "carry" the line to another supplier. Marked as a manual
  // move so the preferred supplier never silently takes it back.
  if ('ספק_id' in body) {
    const raw = body['ספק_id'];
    const supplierId = typeof raw === 'string' && raw ? raw : null;
    if (supplierId) {
      const { data: supplier } = await supabase.from('ספקים').select('id').eq('id', supplierId).maybeSingle();
      if (!supplier) return NextResponse.json({ error: 'הספק לא נמצא' }, { status: 404 });
    }
    update['ספק_id'] = supplierId;
    update['הועבר_ידנית'] = true;
  }

  if (Object.keys(update).length === 1) {
    return NextResponse.json({ error: 'אין שדות לעדכון' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('סל_קניות')
    .update(update)
    .eq('id', params.id)
    .select(CART_SELECT)
    .maybeSingle();

  if (error) {
    console.error('[purchasing/cart] patch failed', error.code);
    return NextResponse.json({ error: 'שגיאה בעדכון הפריט' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'הפריט לא נמצא בסל' }, { status: 404 });

  return NextResponse.json({ data });
}

// DELETE /api/purchasing/cart/[id] → remove one line from the cart
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();

  const { error } = await supabase.from('סל_קניות').delete().eq('id', params.id);
  if (error) {
    console.error('[purchasing/cart] delete failed', error.code);
    return NextResponse.json({ error: 'שגיאה בהסרת הפריט' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
