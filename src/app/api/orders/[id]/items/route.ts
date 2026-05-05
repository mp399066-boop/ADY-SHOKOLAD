import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

// PUT: replace all order items, recalculate totals
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const body = await req.json();

  const {
    מוצרים = [],
    מארזים = [],
    סוג_הנחה = 'ללא',
    ערך_הנחה = 0,
    דמי_משלוח = 0,
  } = body as {
    מוצרים: { מוצר_id: string; כמות: number; מחיר_ליחידה: number; הערות_לשורה?: string }[];
    מארזים: { גודל_מארז: number; כמות: number; מחיר_ליחידה: number; הערות_לשורה?: string; פטיפורים: { פטיפור_id: string; כמות: number }[] }[];
    סוג_הנחה: 'ללא' | 'אחוז' | 'סכום';
    ערך_הנחה: number;
    דמי_משלוח: number;
  };

  console.log('[items PUT] orderId:', params.id);
  console.log('[items PUT] מוצרים:', מוצרים.length, 'מארזים:', מארזים.length, 'הנחה:', סוג_הנחה, ערך_הנחה);

  // 1. Get existing item IDs to delete petit-four selections first
  const { data: existingItems, error: fetchExistingError } = await supabase
    .from('מוצרים_בהזמנה')
    .select('id')
    .eq('הזמנה_id', params.id);

  if (fetchExistingError) {
    console.error('[items PUT] failed to fetch existing items:', fetchExistingError);
    return NextResponse.json({ error: `שגיאה בטעינת פריטים קיימים: ${fetchExistingError.message}` }, { status: 500 });
  }

  const existingIds = (existingItems || []).map((i: { id: string }) => i.id);
  console.log('[items PUT] existing item ids:', existingIds.length);

  // Delete petit-four selections first (FK dependency)
  if (existingIds.length > 0) {
    const { error: pfDeleteError } = await supabase
      .from('בחירת_פטיפורים_בהזמנה')
      .delete()
      .in('שורת_הזמנה_id', existingIds);

    if (pfDeleteError) {
      console.error('[items PUT] failed to delete petit-four selections:', pfDeleteError);
      return NextResponse.json({ error: `מחיקת בחירות פטיפורים נכשלה: ${pfDeleteError.message}` }, { status: 500 });
    }
    console.log('[items PUT] deleted petit-four selections for', existingIds.length, 'items');
  }

  // 2. Delete all existing order items
  const { error: deleteError } = await supabase
    .from('מוצרים_בהזמנה')
    .delete()
    .eq('הזמנה_id', params.id);

  if (deleteError) {
    console.error('[items PUT] failed to delete order items:', deleteError);
    return NextResponse.json({ error: `מחיקת פריטי הזמנה נכשלה: ${deleteError.message}` }, { status: 500 });
  }
  console.log('[items PUT] deleted existing order items');

  // 3. Validate product IDs + business-only check
  const incomingProductIds = מוצרים.map(i => i.מוצר_id).filter(Boolean);
  let validProductIds = new Set<string>(incomingProductIds);

  if (incomingProductIds.length > 0) {
    // Fetch order → customer type for business-only check
    const { data: orderRow } = await supabase
      .from('הזמנות')
      .select('לקוח_id, לקוחות(סוג_לקוח)')
      .eq('id', params.id)
      .single();
    const customerType: string =
      (orderRow?.לקוחות as { סוג_לקוח?: string } | null)?.סוג_לקוח || '';

    const { data: existingProds, error: prodsError } = await supabase
      .from('מוצרים_למכירה')
      .select('id, שם_מוצר, לקוחות_עסקיים_בלבד')
      .in('id', incomingProductIds);

    if (prodsError) {
      console.error('[items PUT] product validation query failed:', prodsError);
      return NextResponse.json({ error: `ולידציית מוצרים נכשלה: ${prodsError.message}` }, { status: 500 });
    }

    for (const prod of existingProds || []) {
      const p = prod as { id: string; שם_מוצר: string; לקוחות_עסקיים_בלבד: boolean };
      if (p.לקוחות_עסקיים_בלבד && customerType !== 'עסקי') {
        return NextResponse.json(
          { error: `מוצר "${p.שם_מוצר}" זמין ללקוחות עסקיים בלבד` },
          { status: 403 },
        );
      }
    }

    validProductIds = new Set((existingProds || []).map((p: { id: string }) => p.id));
    console.log('[items PUT] valid product ids:', validProductIds.size, '/', incomingProductIds.length);
  }

  // 4. Insert new product rows
  let subtotal = 0;

  for (const item of מוצרים) {
    if (item.מוצר_id && !validProductIds.has(item.מוצר_id)) {
      console.warn('[items PUT] skipping unknown product id:', item.מוצר_id);
      continue;
    }
    const lineTotal = (item.כמות || 1) * (item.מחיר_ליחידה || 0);
    subtotal += lineTotal;
    const { error } = await supabase.from('מוצרים_בהזמנה').insert({
      הזמנה_id: params.id,
      מוצר_id: item.מוצר_id || null,
      סוג_שורה: 'מוצר',
      כמות: item.כמות || 1,
      מחיר_ליחידה: item.מחיר_ליחידה || 0,
      סהכ: lineTotal,
      הערות_לשורה: item.הערות_לשורה || null,
    });
    if (error) {
      console.error('[items PUT] failed to insert product row:', error, item);
      return NextResponse.json({ error: `הוספת מוצר נכשלה: ${error.message}` }, { status: 500 });
    }
    console.log('[items PUT] inserted product row, מוצר_id:', item.מוצר_id, 'סהכ:', lineTotal);
  }

  // 5. Insert new package rows + petit-four selections
  for (const pkg of מארזים) {
    const lineTotal = (pkg.כמות || 1) * (pkg.מחיר_ליחידה || 0);
    subtotal += lineTotal;
    const { data: pkgRow, error: pkgError } = await supabase
      .from('מוצרים_בהזמנה')
      .insert({
        הזמנה_id: params.id,
        מוצר_id: null,
        סוג_שורה: 'מארז',
        גודל_מארז: pkg.גודל_מארז || null,
        כמות: pkg.כמות || 1,
        מחיר_ליחידה: pkg.מחיר_ליחידה || 0,
        סהכ: lineTotal,
        הערות_לשורה: pkg.הערות_לשורה || null,
      })
      .select()
      .single();

    if (pkgError) {
      console.error('[items PUT] failed to insert package row:', pkgError, pkg);
      return NextResponse.json({ error: `הוספת מארז נכשלה: ${pkgError.message}` }, { status: 500 });
    }
    console.log('[items PUT] inserted package row id:', pkgRow?.id, 'גודל:', pkg.גודל_מארז, 'סהכ:', lineTotal);

    if (pkg.פטיפורים && pkgRow) {
      for (const pf of pkg.פטיפורים) {
        const { error: pfError } = await supabase.from('בחירת_פטיפורים_בהזמנה').insert({
          שורת_הזמנה_id: pkgRow.id,
          פטיפור_id: pf.פטיפור_id,
          כמות: pf.כמות || 1,
        });
        if (pfError) {
          console.error('[items PUT] failed to insert petit-four selection:', pfError, pf);
          return NextResponse.json({ error: `הוספת פטיפור נכשלה: ${pfError.message}` }, { status: 500 });
        }
      }
    }
  }

  // 6. Recalculate order totals based on discount type
  let discountAmt = 0;
  if (סוג_הנחה === 'אחוז') {
    discountAmt = +(subtotal * (ערך_הנחה || 0) / 100).toFixed(2);
  } else if (סוג_הנחה === 'סכום') {
    discountAmt = Math.min(subtotal, ערך_הנחה || 0);
  }
  const total = Math.max(0, subtotal - discountAmt + (דמי_משלוח || 0));

  const { data: updatedOrder, error: updateError } = await supabase
    .from('הזמנות')
    .update({
      סוג_הנחה,
      ערך_הנחה: ערך_הנחה || 0,
      סכום_לפני_הנחה: subtotal,
      סכום_הנחה: discountAmt,
      סך_הכל_לתשלום: total,
      תאריך_עדכון: new Date().toISOString(),
    })
    .eq('id', params.id)
    .select()
    .single();

  if (updateError) {
    console.error('[items PUT] failed to update order totals:', updateError);
    return NextResponse.json({ error: `עדכון סכומי הזמנה נכשל: ${updateError.message}` }, { status: 500 });
  }

  console.log('[items PUT] done — subtotal:', subtotal, 'discount:', discountAmt, 'total:', total);
  return NextResponse.json({ data: updatedOrder });
}
