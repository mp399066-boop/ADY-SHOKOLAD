import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

// PUT: replace all order items, recalculate totals
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
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

  // 1. Get existing item IDs to delete petit-four selections first
  const { data: existingItems } = await supabase
    .from('מוצרים_בהזמנה')
    .select('id')
    .eq('הזמנה_id', params.id);

  const existingIds = (existingItems || []).map((i: { id: string }) => i.id);

  if (existingIds.length > 0) {
    await supabase.from('בחירת_פטיפורים_בהזמנה').delete().in('שורת_הזמנה_id', existingIds);
  }

  // 2. Delete all existing order items
  const { error: deleteError } = await supabase
    .from('מוצרים_בהזמנה')
    .delete()
    .eq('הזמנה_id', params.id);

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  // 3. Validate product IDs
  const incomingProductIds = מוצרים.map(i => i.מוצר_id).filter(Boolean);
  let validProductIds = new Set<string>();
  if (incomingProductIds.length > 0) {
    const { data: existingProds } = await supabase
      .from('מוצרים_למכירה')
      .select('id')
      .in('id', incomingProductIds);
    validProductIds = new Set((existingProds || []).map((p: { id: string }) => p.id));
  }

  // 4. Insert new product rows
  let subtotal = 0;

  for (const item of מוצרים) {
    if (item.מוצר_id && !validProductIds.has(item.מוצר_id)) continue;
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
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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

    if (pkgError) return NextResponse.json({ error: pkgError.message }, { status: 500 });

    if (pkg.פטיפורים && pkgRow) {
      for (const pf of pkg.פטיפורים) {
        const { error: pfError } = await supabase.from('בחירת_פטיפורים_בהזמנה').insert({
          שורת_הזמנה_id: pkgRow.id,
          פטיפור_id: pf.פטיפור_id,
          כמות: pf.כמות || 1,
        });
        if (pfError) return NextResponse.json({ error: pfError.message }, { status: 500 });
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

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ data: updatedOrder });
}
