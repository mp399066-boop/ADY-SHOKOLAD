export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { sendOrderEmail, isInternalEmail, type OrderEmailData, type EmailContext } from '@/lib/email';

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();

  const { data: order, error } = await supabase
    .from('הזמנות')
    .select('*, לקוחות(*)')
    .eq('id', params.id)
    .single();

  if (error || !order) return NextResponse.json({ error: 'הזמנה לא נמצאה' }, { status: 404 });

  const { data: items } = await supabase
    .from('מוצרים_בהזמנה')
    .select('*, מוצרים_למכירה(*), בחירת_פטיפורים_בהזמנה(*, סוגי_פטיפורים(*))')
    .eq('הזמנה_id', params.id)
    .order('סדר_תצוגה', { ascending: true });

  const o = order as Record<string, unknown>;
  const customer = o['לקוחות'] as Record<string, string> | null;
  const to = customer?.['אימייל'] || '';

  if (!to) {
    return NextResponse.json({ message: 'ללקוח אין כתובת אימייל — לא נשלח' });
  }
  if (isInternalEmail(to)) {
    return NextResponse.json({ message: 'כתובת מייל פנימית — לא נשלח ללקוח' });
  }

  const customerName = customer
    ? `${customer['שם_פרטי'] || ''} ${customer['שם_משפחה'] || ''}`.trim()
    : '';

  const emailOrderData: OrderEmailData = {
    orderNumber:  (o['מספר_הזמנה']     as string) || '',
    orderDate:    (o['תאריך_הזמנה']     as string) || new Date().toISOString().split('T')[0],
    deliveryDate: (o['תאריך_אספקה']     as string) || null,
    subtotal:     Number(o['סכום_לפני_הנחה'] || 0),
    discount:     Number(o['סכום_הנחה']        || 0),
    total:        Number(o['סך_הכל_לתשלום']    || 0),
    deliveryFee:  Number(o['דמי_משלוח']         || 0),
    customerType: (customer?.['סוג_לקוח']  as string) || null,
    orderType:    (o['סוג_הזמנה']         as string) || null,
    isUpdate:     true,
    items: (items || []).map((item: Record<string, unknown>) => {
      const prod        = item['מוצרים_למכירה']          as Record<string, unknown> | null;
      const pfSelections = item['בחירת_פטיפורים_בהזמנה'] as Record<string, unknown>[] | null;
      const petitFours  = (pfSelections ?? [])
        .map(s => {
          const pf = s['סוגי_פטיפורים'] as Record<string, string> | null;
          return pf?.['שם_פטיפור']
            ? { name: pf['שם_פטיפור'], quantity: Number(s['כמות'] ?? 0) }
            : null;
        })
        .filter((p): p is { name: string; quantity: number } => p !== null && p.quantity > 0);

      const rowType = item['סוג_שורה'] as string;
      const isPackage = rowType === 'מארז';
      const isCustom  = rowType === 'מוצר_ידני' || rowType === 'תוספת_תשלום';
      const name = isPackage
        ? `מארז ${item['גודל_מארז'] || ''} פטיפורים`
        : isCustom
          ? (item['שם_פריט_מותאם'] as string) || 'פריט'
          : (prod?.['שם_מוצר'] as string) || 'פריט';

      return {
        name,
        quantity:  Number(item['כמות']          || 1),
        unitPrice: Number(item['מחיר_ליחידה']   || 0),
        lineTotal: Number(item['סהכ']            || 0),
        ...(isPackage && petitFours.length > 0 ? { petitFours } : {}),
        ...(isCustom ? { isNew: true } : {}),
      };
    }),
  };

  const emailContext: EmailContext = {
    customerId: o['לקוח_id'] as string,
    orderId:    params.id,
  };

  try {
    await sendOrderEmail(to, customerName, emailOrderData, emailContext);

    // Record the total that was sent so the order page can detect stale summaries.
    await supabase
      .from('הזמנות')
      .update({
        summary_email_sent_at:    new Date().toISOString(),
        summary_email_sent_total: o['סך_הכל_לתשלום'] ?? 0,
      })
      .eq('id', params.id);

    return NextResponse.json({ message: `סיכום הזמנה נשלח בהצלחה ל-${to}` });
  } catch (err: unknown) {
    console.error('[send-email] sendOrderEmail failed:', err);
    return NextResponse.json(
      { error: `שגיאה בשליחת מייל: ${err instanceof Error ? err.message : 'שגיאה לא ידועה'}` },
      { status: 500 },
    );
  }
}
