export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { logActivity, PUBLIC_TOKEN_ACTOR } from '@/lib/activity-log';
import { sendSatmarSummaryEmail } from '@/lib/satmar-email';

// What the courier sees when they open the public token link. Read-only.
// Token is the only protection — no login. We never return prices,
// payment status, invoice/document data, or internal notes.
type OrderRow = {
  id: string;
  מספר_הזמנה: string | null;
  שם_מקבל: string | null;
  טלפון_מקבל: string | null;
  כתובת_מקבל_ההזמנה: string | null;
  עיר: string | null;
  הוראות_משלוח: string | null;
  הערות_להזמנה: string | null;
  סוג_הזמנה: string | null;
  סטטוס_הזמנה: string | null;
  לקוחות?: { שם_פרטי?: string | null; שם_משפחה?: string | null; טלפון?: string | null } | null;
};

type ItemRow = {
  id: string;
  סוג_שורה: string | null;
  גודל_מארז: number | null;
  כמות: number | null;
  הערות_לשורה: string | null;
  מוצרים_למכירה?: { שם_מוצר?: string | null } | null;
  בחירת_פטיפורים_בהזמנה?: Array<{ כמות: number | null; סוגי_פטיפורים?: { שם_פטיפור?: string | null } | null }> | null;
};

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  if (!params.token) return NextResponse.json({ error: 'לא תקין' }, { status: 400 });

  const supabase = createAdminClient();

  // 1. Delivery + linked order in one query. Selecting only fields the
  //    courier needs — never financial data.
  const { data, error } = await supabase
    .from('משלוחים')
    .select(`
      id, הזמנה_id, סטטוס_משלוח, delivered_at,
      כתובת, עיר, הוראות_משלוח, תאריך_משלוח, שעת_משלוח, הערות,
      הזמנות (
        id, מספר_הזמנה, שם_מקבל, טלפון_מקבל,
        כתובת_מקבל_ההזמנה, עיר, הוראות_משלוח, הערות_להזמנה,
        סוג_הזמנה, סטטוס_הזמנה,
        לקוחות (שם_פרטי, שם_משפחה, טלפון)
      )
    `)
    .eq('delivery_token', params.token)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'הקישור אינו תקין' }, { status: 404 });
  }

  const order = (data as Record<string, unknown>)['הזמנות'] as OrderRow | null;

  // 2. Order items — separate query so the courier sees products / packages
  //    + petit-four breakdown. Skip silently if the order is missing.
  let items: ItemRow[] = [];
  if (order?.id) {
    const { data: itemsData } = await supabase
      .from('מוצרים_בהזמנה')
      .select('id, סוג_שורה, גודל_מארז, כמות, הערות_לשורה, מוצרים_למכירה(שם_מוצר), בחירת_פטיפורים_בהזמנה(כמות, סוגי_פטיפורים(שם_פטיפור))')
      .eq('הזמנה_id', order.id)
      .order('סוג_שורה', { ascending: true });
    items = ((itemsData || []) as unknown) as ItemRow[];
  }

  const cust = order?.לקוחות || null;
  const customerName = cust ? `${cust.שם_פרטי || ''} ${cust.שם_משפחה || ''}`.trim() : null;
  // Recipient — prefer the explicit שם_מקבל; otherwise fall back to the customer.
  const recipientName = order?.שם_מקבל || customerName || null;
  // Recipient phone — prefer the explicit recipient phone; otherwise fall
  // back to the ordering customer's phone (most often the same person).
  const recipientPhone = order?.טלפון_מקבל || cust?.טלפון || null;
  // Address — delivery row's address takes precedence (it's what the
  // operator confirmed on assignment); fall back to the order's.
  const addressStreet = data.כתובת || order?.כתובת_מקבל_ההזמנה || null;
  const addressCity   = data.עיר   || order?.עיר                  || null;
  // Customer block (the ordering party) — show only when DIFFERENT from
  // the recipient, otherwise it's just clutter for the courier.
  const showOrderingCustomer = customerName && customerName !== recipientName;

  // 3. Courier-safe order items projection. No prices, no SKUs.
  const itemsOut = items.map(it => {
    const isPackage = it.סוג_שורה === 'מארז';
    const name = isPackage
      ? `מארז ${it.גודל_מארז ?? ''} פטיפורים`.trim()
      : (it.מוצרים_למכירה?.שם_מוצר || 'פריט');
    const petitFours = (it.בחירת_פטיפורים_בהזמנה || [])
      .map(s => ({ name: s.סוגי_פטיפורים?.שם_פטיפור || '', quantity: Number(s.כמות || 0) }))
      .filter(p => p.name && p.quantity > 0);
    return {
      name,
      quantity: Number(it.כמות || 1),
      isPackage,
      petitFours: petitFours.length > 0 ? petitFours : undefined,
      // Item note — only when present and not the WC-fallback prefix used
      // for unmatched WooCommerce products (operator-internal).
      note: it.הערות_לשורה && !/^מוצר מהאתר:/.test(it.הערות_לשורה) ? it.הערות_לשורה : null,
    };
  });

  return NextResponse.json({
    delivery: {
      // Row-level
      id:              data.id,
      orderId:         data.הזמנה_id,
      status:          data.סטטוס_משלוח,
      deliveredAt:     data.delivered_at,
      // Recipient
      recipientName,
      recipientPhone,
      addressStreet,
      addressCity,
      deliveryDate:    data.תאריך_משלוח || null,
      deliveryTime:    data.שעת_משלוח   || null,
      deliveryNotes:   data.הוראות_משלוח || order?.הוראות_משלוח || null,
      // Order-level (for the courier card)
      orderNumber:     order?.מספר_הזמנה || null,
      customerName:    showOrderingCustomer ? customerName : null,
      customerPhone:   showOrderingCustomer ? (cust?.טלפון || null) : null,
      orderNotes:      order?.הערות_להזמנה || null,
      items:           itemsOut,
    },
  });
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  if (!params.token) return NextResponse.json({ error: 'לא תקין' }, { status: 400 });

  const supabase = createAdminClient();
  const { data: existing, error: fetchError } = await supabase
    .from('משלוחים')
    .select('id, הזמנה_id, סטטוס_משלוח')
    .eq('delivery_token', params.token)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'הקישור אינו תקין' }, { status: 404 });
  }

  // Idempotent — second click returns ok/already without touching the DB
  // again. The page renders the "already delivered" state on this 200.
  if (existing.סטטוס_משלוח === 'נמסר') {
    return NextResponse.json({ ok: true, already: true });
  }

  // 1. Mark the delivery row delivered.
  const { error: updateError } = await supabase
    .from('משלוחים')
    .update({ סטטוס_משלוח: 'נמסר', delivered_at: new Date().toISOString() })
    .eq('id', existing.id);

  if (updateError) return NextResponse.json({ error: 'שגיאה בעדכון' }, { status: 500 });

  void logActivity({
    actor:       PUBLIC_TOKEN_ACTOR,
    module:      'deliveries',
    action:      'delivery_marked_delivered',
    status:      'success',
    entityType:  'delivery',
    entityId:    String(existing.id),
    title:       'משלוח סומן כנמסר דרך קישור שליח',
    description: 'השליח סימן את המשלוח כנמסר דרך הקישור הציבורי',
    request:     req,
  });

  // 2. Cascade to the linked order — flip סטטוס_הזמנה → 'הושלמה בהצלחה'
  //    if it isn't there already. Mirrors the side effects of the
  //    PATCH /api/orders/[id] path: ארכיון = true, satmar email when
  //    relevant. Morning auto-issuance stays gated off (the manual
  //    document-issuance modal is the sanctioned path for receipts).
  let orderCompleted = false;
  if (existing.הזמנה_id) {
    const { data: orderRow } = await supabase
      .from('הזמנות')
      .select('id, מספר_הזמנה, סטטוס_הזמנה, סוג_הזמנה')
      .eq('id', existing.הזמנה_id)
      .maybeSingle();

    if (orderRow && orderRow.סטטוס_הזמנה !== 'הושלמה בהצלחה') {
      const { error: orderUpdateErr } = await supabase
        .from('הזמנות')
        .update({
          סטטוס_הזמנה: 'הושלמה בהצלחה',
          ארכיון:       true,
          תאריך_עדכון:  new Date().toISOString(),
        })
        .eq('id', orderRow.id);

      if (orderUpdateErr) {
        console.error('[delivery-update] order completion failed:', orderUpdateErr.message);
        // Delivery is already marked delivered — that's the courier-facing
        // success. Surface the order failure in logs but don't undo the
        // delivery flip (it's an accurate physical state).
      } else {
        orderCompleted = true;

        // Mirror the satmar side-effect from PATCH /api/orders/[id].
        if (orderRow.סוג_הזמנה === 'סאטמר') {
          try { await sendSatmarSummaryEmail(orderRow.id); }
          catch (err) { console.error('[delivery-update] satmar email failed:', err instanceof Error ? err.message : err); }
        }

        void logActivity({
          actor:        PUBLIC_TOKEN_ACTOR,
          module:       'orders',
          action:       'order_completed_by_delivery',
          status:       'success',
          entityType:   'order',
          entityId:     String(orderRow.id),
          entityLabel:  orderRow.מספר_הזמנה || null,
          title:        'הזמנה הושלמה בעקבות מסירת משלוח',
          description:  'סטטוס ההזמנה עודכן להושלמה בהצלחה לאחר שהמשלוח סומן כנמסר',
          oldValue:     { סטטוס_הזמנה: orderRow.סטטוס_הזמנה },
          newValue:     { סטטוס_הזמנה: 'הושלמה בהצלחה' },
          request:      req,
        });
      }
    }
  }

  return NextResponse.json({ ok: true, delivered: true, orderCompleted });
}
