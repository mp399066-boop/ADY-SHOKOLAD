export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

type POItem = { חומר_גלם_id: string | null; שם_פריט: string; כמות: number; יחידה: string | null };

type CartRow = {
  id: string;
  חומר_גלם_id: string | null;
  שם_פריט: string;
  כמות: number;
  יחידה: string | null;
  ספק_id: string | null;
};

export async function POST(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
  }

  const cartItemIds = Array.isArray(body['cart_item_ids'])
    ? (body['cart_item_ids'] as unknown[]).filter((v): v is string => typeof v === 'string')
    : null;

  let supplierId: string | null = typeof body['ספק_id'] === 'string' && body['ספק_id'] ? (body['ספק_id'] as string) : null;
  let items: POItem[];

  if (cartItemIds) {
    // ── Cart flow: quantities, names and supplier come from the cart rows,
    // never from the client. The ordered lines leave the cart afterwards.
    if (cartItemIds.length === 0) {
      return NextResponse.json({ error: 'לא נבחרו פריטים' }, { status: 400 });
    }

    const { data: cartData, error: cartError } = await supabase
      .from('סל_קניות')
      .select('id, חומר_גלם_id, שם_פריט, כמות, יחידה, ספק_id')
      .in('id', cartItemIds);

    if (cartError) {
      console.error('[purchasing/orders] cart load failed', cartError.code);
      return NextResponse.json({ error: 'שגיאה בטעינת הסל' }, { status: 500 });
    }
    const cartRows = (cartData ?? []) as CartRow[];
    if (!cartRows.length) {
      return NextResponse.json({ error: 'הפריטים לא נמצאו בסל' }, { status: 404 });
    }

    const supplierIds = new Set(cartRows.map(r => r.ספק_id ?? null));
    if (supplierIds.size > 1) {
      return NextResponse.json({ error: 'הפריטים שייכים ליותר מספק אחד' }, { status: 400 });
    }
    supplierId = cartRows[0].ספק_id ?? null;

    items = cartRows.map(r => ({
      חומר_גלם_id: r.חומר_גלם_id ?? null,
      שם_פריט:     r.שם_פריט,
      כמות:        Number(r.כמות),
      יחידה:       r.יחידה ?? null,
    }));
  } else {
    // ── Legacy flow: explicit item list in the request body.
    const rawItems = Array.isArray(body['items']) ? (body['items'] as Array<Record<string, unknown>>) : [];
    if (rawItems.length === 0) {
      return NextResponse.json({ error: 'לא נבחרו פריטים' }, { status: 400 });
    }
    items = [];
    for (const item of rawItems) {
      const name = typeof item['שם_פריט'] === 'string' ? item['שם_פריט'].trim() : '';
      const qty = Number(item['כמות']);
      if (!name || !Number.isFinite(qty) || qty <= 0) {
        return NextResponse.json({ error: 'פריט לא תקין' }, { status: 400 });
      }
      items.push({
        חומר_גלם_id: typeof item['חומר_גלם_id'] === 'string' ? item['חומר_גלם_id'] : null,
        שם_פריט:     name.slice(0, 200),
        כמות:        qty,
        יחידה:       typeof item['יחידה'] === 'string' ? item['יחידה'].slice(0, 20) : null,
      });
    }
  }

  if (supplierId) {
    const { data: supplier } = await supabase.from('ספקים').select('id').eq('id', supplierId).maybeSingle();
    if (!supplier) return NextResponse.json({ error: 'הספק לא נמצא' }, { status: 404 });
  }

  const notes = typeof body['הערות'] === 'string' && body['הערות'].trim() ? body['הערות'].trim().slice(0, 1000) : null;

  const { data: order, error: orderError } = await supabase
    .from('הזמנות_רכש')
    .insert({
      ספק_id:         supplierId,
      תאריך_הזמנה:   new Date().toISOString().split('T')[0],
      סטטוס:          'נשלח',
      הערות:          notes,
      נוצר_על_ידי:   auth.email,
    })
    .select()
    .single();

  if (orderError || !order) {
    console.error('[purchasing/orders] header insert failed', orderError?.code);
    return NextResponse.json({ error: 'שגיאה ביצירת הזמנת רכש' }, { status: 500 });
  }

  const { error: itemsError } = await supabase
    .from('פריטי_הזמנת_רכש')
    .insert(items.map(item => ({ הזמנת_רכש_id: order.id, ...item })));

  if (itemsError) {
    // Do not leave an empty purchase order behind, and keep the cart intact.
    console.error('[purchasing/orders] items insert failed', itemsError.code);
    await supabase.from('הזמנות_רכש').delete().eq('id', order.id);
    return NextResponse.json({ error: 'שגיאה בשמירת פריטי ההזמנה' }, { status: 500 });
  }

  let removedFromCart = 0;
  if (cartItemIds) {
    const { error: clearError, count } = await supabase
      .from('סל_קניות')
      .delete({ count: 'exact' })
      .in('id', cartItemIds);
    if (clearError) {
      console.error('[purchasing/orders] cart clear failed', clearError.code);
    } else {
      removedFromCart = count ?? 0;
    }
  }

  return NextResponse.json({ data: order, removedFromCart }, { status: 201 });
}
