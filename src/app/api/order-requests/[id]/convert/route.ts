export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { dbErrorResponse, dbStepErrorResponse } from '@/lib/api-error';
import { fetchAllPages } from '@/lib/supabase/fetch-all';
import { createDraftOrder } from '@/lib/draft-order';
import { splitFullName } from '@/lib/order-form';
import { waNumber } from '@/lib/whatsapp';
import { logActivity, userActor } from '@/lib/activity-log';
import type { QuoteLine } from '@/lib/quotes';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/order-requests/[id]/convert
// Approves a form request: finds the customer by phone (or creates a new
// private customer) and opens a draft order with the requested items.
// Idempotent — the request is claimed first, a second click gets the same
// order back.
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  if (!UUID.test(id)) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 });

  const supabase = createAdminClient();
  const { data: request, error } = await supabase.from('בקשות_הזמנה').select('*').eq('id', id).maybeSingle();
  if (error) return dbErrorResponse(error, 'order-requests/convert load');
  if (!request) return NextResponse.json({ error: 'הבקשה לא נמצאה' }, { status: 404 });
  if (request.הזמנה_id) return NextResponse.json({ orderId: request.הזמנה_id, existing: true });
  if (request.סטטוס !== 'חדשה') return NextResponse.json({ error: 'הבקשה נדחתה. אפשר להחזיר אותה לטיפול ואז להמיר.' }, { status: 400 });

  const { data: claimed, error: claimErr } = await supabase.from('בקשות_הזמנה')
    .update({ סטטוס: 'הומרה להזמנה', טופל_על_ידי: auth.email ?? null, תאריך_טיפול: new Date().toISOString() })
    .eq('id', id).eq('סטטוס', 'חדשה').select('id').maybeSingle();
  if (claimErr) return dbErrorResponse(claimErr, 'order-requests/convert claim');
  if (!claimed) return NextResponse.json({ error: 'הבקשה כבר בטיפול. יש לרענן את הדף בעוד רגע.' }, { status: 409 });
  const release = () => supabase.from('בקשות_הזמנה').update({ סטטוס: 'חדשה', טופל_על_ידי: null, תאריך_טיפול: null }).eq('id', id);

  // ── Customer: same phone → existing customer, else a new private one ──
  const phone = waNumber(request.טלפון);
  let customerId: string | null = null;
  let customerCreated = false;
  if (phone) {
    const { data: customers, error: custErr } = await fetchAllPages((a, b) => supabase
      .from('לקוחות').select('id, טלפון').not('טלפון', 'is', null).order('id').range(a, b));
    if (custErr) { await release(); return dbErrorResponse(custErr, 'order-requests/convert customers'); }
    customerId = (customers as { id: string; טלפון: string }[]).find(c => waNumber(c.טלפון) === phone)?.id ?? null;
  }
  if (!customerId) {
    const { first, last } = splitFullName(request.שם_מלא);
    const local = phone ? `0${phone.slice(3)}` : request.טלפון;
    const { data: created, error: createErr } = await supabase.from('לקוחות').insert({
      שם_פרטי: first,
      שם_משפחה: last,
      טלפון: local,
      אימייל: request.אימייל || null,
      סוג_לקוח: 'פרטי',
      מקור_הגעה: 'טופס הזמנה',
    }).select('id').single();
    if (createErr) { await release(); return dbStepErrorResponse(createErr, 'order-requests/convert', 'יצירת הלקוח נכשלה'); }
    customerId = created.id as string;
    customerCreated = true;
  }

  const recipientPhone = request.טלפון_מקבל ? `0${String(request.טלפון_מקבל).replace(/^972/, '')}` : null;
  const result = await createDraftOrder(supabase, {
    customerId,
    lines: (request.פריטים ?? []) as QuoteLine[],
    deliveryDate: request.תאריך_אספקה,
    deliveryType: request.סוג_אספקה,
    recipientName: request.שם_מקבל,
    recipientPhone,
    address: request.כתובת,
    city: request.עיר,
    greeting: request.ברכה,
    notes: ['התקבלה מטופס ההזמנה באתר', request.הערות].filter(Boolean).join('\n'),
    source: 'טופס הזמנה',
  });
  if (!result.ok) {
    await release();
    return dbStepErrorResponse(result.error, 'order-requests/convert', result.step);
  }

  const { error: linkErr } = await supabase.from('בקשות_הזמנה')
    .update({ הזמנה_id: result.orderId, לקוח_id: customerId }).eq('id', id);
  if (linkErr) console.error('[order-requests/convert] link failed', { request: id, order: result.orderId, code: linkErr.code });

  void logActivity({
    actor: userActor(auth),
    module: 'orders', action: 'order_request_converted', status: 'success',
    entityType: 'order', entityId: result.orderId, entityLabel: result.orderNumber,
    title: 'בקשה מטופס ההזמנה הפכה לטיוטת הזמנה',
    metadata: { request_id: id, customer_created: customerCreated },
    request: req,
  });
  return NextResponse.json({ orderId: result.orderId, customerCreated, existing: false }, { status: 201 });
}
