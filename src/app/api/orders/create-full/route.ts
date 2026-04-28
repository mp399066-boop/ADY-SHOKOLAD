export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { generateOrderNumber } from '@/lib/utils';
import { sendOrderEmail, isInternalEmail, type OrderEmailData, type EmailContext } from '@/lib/email';

export async function POST(req: NextRequest) {
  const supabase = createAdminClient();
  const body = await req.json();

  const {
    לקוח,
    הזמנה,
    משלוח,
    תשלום,
    מוצרים = [],
    מארזי_פטיפורים = [],
  } = body;

  if (!לקוח) return NextResponse.json({ error: 'פרטי לקוח הם חובה' }, { status: 400 });

  // 1. Find or create customer
  let customerId: string;
  if (לקוח.id) {
    customerId = לקוח.id;
  } else {
    const { data: created, error } = await supabase
      .from('לקוחות')
      .insert(לקוח)
      .select('id')
      .single();
    if (error) return NextResponse.json({ error: `יצירת לקוח נכשלה: ${error.message}` }, { status: 500 });
    customerId = created!.id;
  }

  // 2. Calculate totals
  let subtotal = 0;
  for (const item of מוצרים) subtotal += (item.כמות || 1) * (item.מחיר_ליחידה || 0);
  for (const pkg of מארזי_פטיפורים) subtotal += (pkg.כמות || 1) * (pkg.מחיר_ליחידה || 0);
  const discount = הזמנה?.סכום_הנחה || 0;
  const shipping = הזמנה?.דמי_משלוח || 0;
  const total = subtotal - discount + shipping;

  // 3. Create order
  const { data: order, error: orderError } = await supabase
    .from('הזמנות')
    .insert({
      מספר_הזמנה: generateOrderNumber(),
      לקוח_id: customerId,
      סטטוס_הזמנה: הזמנה?.סטטוס_הזמנה || 'חדשה',
      הזמנה_דחופה: הזמנה?.הזמנה_דחופה || false,
      תאריך_הזמנה: הזמנה?.תאריך_הזמנה || new Date().toISOString().split('T')[0],
      תאריך_אספקה: הזמנה?.תאריך_אספקה || null,
      שעת_אספקה: הזמנה?.שעת_אספקה || null,
      סוג_אספקה: הזמנה?.סוג_אספקה || 'איסוף עצמי',
      שם_מקבל: הזמנה?.שם_מקבל || null,
      טלפון_מקבל: הזמנה?.טלפון_מקבל || null,
      כתובת_מקבל_ההזמנה: הזמנה?.כתובת_מקבל_ההזמנה || null,
      עיר: הזמנה?.עיר || null,
      הוראות_משלוח: הזמנה?.הוראות_משלוח || null,
      דמי_משלוח: shipping,
      אופן_תשלום: הזמנה?.אופן_תשלום || null,
      סטטוס_תשלום: הזמנה?.סטטוס_תשלום || 'ממתין',
      סכום_לפני_הנחה: subtotal,
      סכום_הנחה: discount,
      סך_הכל_לתשלום: total,
      מקור_ההזמנה: הזמנה?.מקור_ההזמנה || null,
      ברכה_טקסט: הזמנה?.ברכה_טקסט || null,
      הערות_להזמנה: הזמנה?.הערות_להזמנה || null,
    })
    .select()
    .single();

  if (orderError) return NextResponse.json({ error: `יצירת הזמנה נכשלה: ${orderError.message}` }, { status: 500 });

  // 4. Validate product IDs against מוצרים_למכירה before inserting lines
  const incomingProductIds = (מוצרים as Record<string, unknown>[])
    .map(i => i.מוצר_id as string)
    .filter(Boolean);

  console.log('[create-full] product_ids received:', incomingProductIds);

  let validProductIds = new Set<string>();
  if (incomingProductIds.length > 0) {
    const { data: existingProds } = await supabase
      .from('מוצרים_למכירה')
      .select('id')
      .in('id', incomingProductIds);
    validProductIds = new Set((existingProds || []).map((p: { id: string }) => p.id));
    console.log('[create-full] valid product_ids:', Array.from(validProductIds));
    for (const id of incomingProductIds.filter(id => !validProductIds.has(id))) {
      console.error('[create-full] product_id not found in מוצרים_למכירה, skipping:', id);
    }
  }

  const validProducts = (מוצרים as Record<string, unknown>[]).filter(
    i => !i.מוצר_id || validProductIds.has(i.מוצר_id as string),
  );

  if (מוצרים.length > 0 && validProducts.length === 0) {
    return NextResponse.json({ error: 'לא נמצאו מוצרים תקינים להזמנה' }, { status: 400 });
  }

  // 5. Create regular product lines (validated only)
  for (const item of validProducts) {
    const { error: itemError } = await supabase.from('מוצרים_בהזמנה').insert({
      הזמנה_id: order!.id,
      מוצר_id: (item.מוצר_id as string) || null,
      סוג_שורה: 'מוצר',
      כמות: (item.כמות as number) || 1,
      מחיר_ליחידה: (item.מחיר_ליחידה as number) || 0,
      סהכ: ((item.כמות as number) || 1) * ((item.מחיר_ליחידה as number) || 0),
      הערות_לשורה: (item.הערות_לשורה as string) || null,
    });
    if (itemError) return NextResponse.json({ error: `יצירת פריט נכשלה: ${itemError.message}` }, { status: 500 });
  }

  // 6. Create package lines + petit-four selections
  for (const pkg of מארזי_פטיפורים) {
    // מוצר_id for package rows references מארזים, not מוצרים_למכירה — keep null to avoid FK violation
    const { data: pkgRow, error: pkgError } = await supabase.from('מוצרים_בהזמנה').insert({
      הזמנה_id: order!.id,
      מוצר_id: null,
      סוג_שורה: 'מארז',
      גודל_מארז: pkg.גודל_מארז || null,
      כמות: pkg.כמות || 1,
      מחיר_ליחידה: pkg.מחיר_ליחידה || 0,
      סהכ: (pkg.כמות || 1) * (pkg.מחיר_ליחידה || 0),
      הערות_לשורה: pkg.הערות_לשורה || null,
    }).select().single();

    if (pkgError) return NextResponse.json({ error: `יצירת מארז נכשלה: ${pkgError.message}` }, { status: 500 });

    if (pkg.פטיפורים && pkgRow) {
      for (const pf of pkg.פטיפורים) {
        const { error: pfError } = await supabase.from('בחירת_פטיפורים_בהזמנה').insert({
          שורת_הזמנה_id: pkgRow.id,
          פטיפור_id: pf.פטיפור_id,
          כמות: pf.כמות || 1,
        });
        if (pfError) return NextResponse.json({ error: `יצירת בחירת פטיפור נכשלה: ${pfError.message}` }, { status: 500 });
      }
    }
  }

  // 7. Create delivery record
  if (משלוח) {
    await supabase.from('משלוחים').insert({
      הזמנה_id: order!.id,
      סטטוס_משלוח: 'ממתין',
      כתובת: משלוח.כתובת || null,
      עיר: משלוח.עיר || null,
      הוראות_משלוח: משלוח.הוראות_משלוח || null,
    });
  }

  // 8. Create payment record
  if (תשלום) {
    await supabase.from('תשלומים').insert({
      הזמנה_id: order!.id,
      סכום: תשלום.סכום || total,
      אמצעי_תשלום: תשלום.אמצעי_תשלום || 'מזומן',
      סטטוס_תשלום: תשלום.סטטוס_תשלום || 'ממתין',
      תאריך_תשלום: תשלום.תאריך_תשלום || new Date().toISOString().split('T')[0],
    });
  }

  const { data: fullOrder } = await supabase
    .from('הזמנות')
    .select('*, לקוחות(*)')
    .eq('id', order!.id)
    .single();

  const { data: fullItems } = await supabase
    .from('מוצרים_בהזמנה')
    .select('*, מוצרים_למכירה(*), בחירת_פטיפורים_בהזמנה(*, סוגי_פטיפורים(*))')
    .eq('הזמנה_id', order!.id);

  // Send order summary email — non-blocking, never fails the order
  const emailCustomer = (fullOrder as Record<string, unknown>)?.['לקוחות'] as Record<string, string> | null;
  const emailTo = emailCustomer?.['אימייל'];
  const emailName = emailCustomer ? `${emailCustomer['שם_פרטי'] || ''} ${emailCustomer['שם_משפחה'] || ''}`.trim() : '';

  console.log('[create-full] email — to:', emailTo || 'NO EMAIL', '| name:', emailName);

  if (emailTo && !isInternalEmail(emailTo)) {
    const o = fullOrder as Record<string, unknown>;
    const emailOrderData: OrderEmailData = {
      orderNumber: (o['מספר_הזמנה'] as string) || '',
      orderDate: (o['תאריך_הזמנה'] as string) || new Date().toISOString().split('T')[0],
      deliveryDate: (o['תאריך_אספקה'] as string) || null,
      subtotal: Number(o['סכום_לפני_הנחה'] || 0),
      discount: Number(o['סכום_הנחה'] || 0),
      total: Number(o['סך_הכל_לתשלום'] || 0),
      items: (fullItems || []).map((item: Record<string, unknown>) => {
        const prod = item['מוצרים_למכירה'] as Record<string, unknown> | null;
        const pfSelections = item['בחירת_פטיפורים_בהזמנה'] as Record<string, unknown>[] | null;
        const pfNames = pfSelections?.map(s => {
          const pf = s['סוגי_פטיפורים'] as Record<string, string> | null;
          return pf ? `${pf['שם_פטיפור']} ×${s['כמות']}` : '';
        }).filter(Boolean).join(', ');
        const name = item['סוג_שורה'] === 'מארז'
          ? `מארז ${item['גודל_מארז'] || ''} יח׳${pfNames ? ` (${pfNames})` : ''}`
          : (prod?.['שם_מוצר'] as string) || 'פריט';
        return {
          name,
          quantity: Number(item['כמות'] || 1),
          unitPrice: Number(item['מחיר_ליחידה'] || 0),
          lineTotal: Number(item['סהכ'] || 0),
        };
      }),
    };

    const emailContext: EmailContext = {
      customerId: customerId,
      orderId: order!.id,
    };
    void (async () => {
      try {
        console.log('[create-full] calling sendOrderEmail...');
        await sendOrderEmail(emailTo, emailName, emailOrderData, emailContext);
        console.log('[create-full] sendOrderEmail completed successfully');
      } catch (err) {
        console.error('[create-full] sendOrderEmail failed:', err);
      }
    })();
  } else {
    console.log('[create-full] skipping email —', emailTo ? 'internal address' : 'no email');
  }

  return NextResponse.json({ data: { ...fullOrder, מוצרים_בהזמנה: fullItems || [] } }, { status: 201 });
}
