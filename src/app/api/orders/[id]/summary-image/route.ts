export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import {
  buildItemName,
  extractPetitFours,
  renderOrderEmail,
  type OrderEmailData,
  type OrderEmailItem,
} from '@/lib/email';

// GET /api/orders/[id]/summary-image
//
// Returns the rendered customer order-summary email HTML for an order so the
// client can rasterise it to a PNG ("download order summary" → WhatsApp). It
// reuses renderOrderEmail (the exact same template the email uses) so the image
// is identical to what the customer would receive by email.
//
// Differences from /email-preview: this endpoint does NOT gate on the customer
// having an email address (the image is shareable regardless), and it always
// renders the clean "סיכום הזמנה" form (isUpdate:false, no "חדש"/"הוסרו"
// diffing) — it never sends anything and has no side effects.
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
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
  const customerName = customer
    ? `${customer['שם_פרטי'] || ''} ${customer['שם_משפחה'] || ''}`.trim()
    : '';

  const currentItemsRaw = (items || []) as Record<string, unknown>[];

  const emailItems: OrderEmailItem[] = currentItemsRaw.map((item) => {
    const prod         = item['מוצרים_למכירה']          as Record<string, unknown> | null;
    const pfSelections = item['בחירת_פטיפורים_בהזמנה'] as Record<string, unknown>[] | null;
    const petitFours   = extractPetitFours(pfSelections);
    const isPackage    = item['סוג_שורה'] === 'מארז';
    return {
      name:      buildItemName(item, prod),
      quantity:  Number(item['כמות']        || 1),
      unitPrice: Number(item['מחיר_ליחידה'] || 0),
      lineTotal: Number(item['סהכ']          || 0),
      ...(isPackage && petitFours.length > 0 ? { petitFours } : {}),
    };
  });

  const emailOrderData: OrderEmailData = {
    orderNumber:  (o['מספר_הזמנה']      as string) || '',
    orderDate:    (o['תאריך_הזמנה']      as string) || new Date().toISOString().split('T')[0],
    deliveryDate: (o['תאריך_אספקה']      as string) || null,
    subtotal:     Number(o['סכום_לפני_הנחה'] || 0),
    discount:     Number(o['סכום_הנחה']        || 0),
    total:        Number(o['סך_הכל_לתשלום']    || 0),
    deliveryFee:  Number(o['דמי_משלוח']         || 0),
    customerType: (customer?.['סוג_לקוח'] as string) || null,
    orderType:    (o['סוג_הזמנה']        as string) || null,
    isUpdate:     false,
    items:        emailItems,
  };

  const { html: emailHtml } = await renderOrderEmail(customerName, emailOrderData);

  // summary-image-only adjustments (the shared email template is NOT changed —
  // these apply only to the WhatsApp image): use the "סיכום הזמנה" heading and
  // drop the email-specific "automated email" closing line. Everything else
  // stays byte-identical to the email.
  const html = emailHtml
    .replace('הזמנתך התקבלה בהצלחה', 'סיכום הזמנה')
    // Remove ONLY the closing paragraph: the <p> must contain that text
    // directly ([^<]* keeps it within the single paragraph, so it can't span
    // back to an earlier <p> like the greeting).
    .replace(/<p\b[^>]*>\s*זהו מייל אוטומטי[^<]*<\/p>/, '');

  return NextResponse.json({
    html,
    orderNumber: emailOrderData.orderNumber,
    customerName,
  });
}
