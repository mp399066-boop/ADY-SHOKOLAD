export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { dbErrorResponse, dbStepErrorResponse } from '@/lib/api-error';
import { createDraftOrder } from '@/lib/draft-order';
import { logActivity, userActor } from '@/lib/activity-log';
import type { QuoteLine } from '@/lib/quotes';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/quotes/[id]/convert → turns the quote into a draft order.
// Idempotent: a quote that already became an order returns that order.
// The quote is claimed first (status → הומרה להזמנה) so two clicks can never
// create two orders; if creating the draft fails the claim is released.
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  if (!UUID.test(id)) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 });

  const supabase = createAdminClient();
  const { data: quote, error } = await supabase.from('הצעות_מחיר')
    .select('id, מספר_הצעה, לקוח_id, סטטוס, פריטים, סוג_הנחה, ערך_הנחה, דמי_משלוח, סך_הכל, תאריך_אספקה_מבוקש, הערות_ללקוח, הזמנה_id')
    .eq('id', id).maybeSingle();
  if (error) return dbErrorResponse(error, 'quotes/convert load');
  if (!quote) return NextResponse.json({ error: 'ההצעה לא נמצאה' }, { status: 404 });
  if (quote.הזמנה_id) return NextResponse.json({ orderId: quote.הזמנה_id, existing: true });
  if (quote.סטטוס === 'נדחתה') return NextResponse.json({ error: 'ההצעה נדחתה. כדי להפוך אותה להזמנה יש לפתוח אותה מחדש.' }, { status: 400 });

  const previousStatus = quote.סטטוס as string;
  const { data: claimed, error: claimErr } = await supabase.from('הצעות_מחיר')
    .update({ סטטוס: 'הומרה להזמנה', תאריך_עדכון: new Date().toISOString() })
    .eq('id', id).neq('סטטוס', 'הומרה להזמנה').is('הזמנה_id', null)
    .select('id').maybeSingle();
  if (claimErr) return dbErrorResponse(claimErr, 'quotes/convert claim');
  if (!claimed) {
    // Another click won the race — hand back its order once it's linked.
    const { data: again } = await supabase.from('הצעות_מחיר').select('הזמנה_id').eq('id', id).maybeSingle();
    if (again?.הזמנה_id) return NextResponse.json({ orderId: again.הזמנה_id, existing: true });
    return NextResponse.json({ error: 'ההצעה כבר בתהליך המרה. יש לרענן את הדף בעוד רגע.' }, { status: 409 });
  }

  const result = await createDraftOrder(supabase, {
    customerId: quote.לקוח_id,
    lines: (quote.פריטים ?? []) as QuoteLine[],
    discountType: quote.סוג_הנחה,
    discountValue: Number(quote.ערך_הנחה) || 0,
    shipping: Number(quote.דמי_משלוח) || 0,
    deliveryDate: quote.תאריך_אספקה_מבוקש,
    notes: [`נוצרה מהצעת מחיר ${quote.מספר_הצעה}`, quote.הערות_ללקוח].filter(Boolean).join('\n'),
    source: 'הצעת מחיר',
  });
  if (!result.ok) {
    await supabase.from('הצעות_מחיר').update({ סטטוס: previousStatus }).eq('id', id);
    return dbStepErrorResponse(result.error, 'quotes/convert', result.step);
  }

  const { error: linkErr } = await supabase.from('הצעות_מחיר').update({ הזמנה_id: result.orderId }).eq('id', id);
  if (linkErr) console.error('[quotes/convert] link failed', { quote: id, order: result.orderId, code: linkErr.code });

  void logActivity({
    actor: userActor(auth),
    module: 'orders',
    action: 'quote_converted',
    status: 'success',
    entityType: 'order',
    entityId: result.orderId,
    entityLabel: result.orderNumber,
    title: 'הצעת מחיר הפכה לטיוטת הזמנה',
    description: `הצעה ${quote.מספר_הצעה}`,
    metadata: { quote_id: id },
    request: req,
  });
  return NextResponse.json({ orderId: result.orderId, existing: false }, { status: 201 });
}
