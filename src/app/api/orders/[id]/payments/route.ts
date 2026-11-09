export const dynamic = 'force-dynamic';

// Partial payments on an order — "the customer paid X so far".
//   POST   { סכום, אמצעי_תשלום }  → records a paid (שולם) payment row
//   DELETE ?paymentId=…            → removes a row recorded by mistake
// The order's balance (order-balance.ts) is total − paid rows, so the dashboard
// "open debt" shows only what is still owed. The amount is validated against
// the order total from the DB; the order is set to 'חלקי' while a balance
// remains. Reaching the full amount does NOT mark it שולם here — that keeps
// its own flow (Morning/satmar side effects), the screen offers it instead.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { logActivity, userActor } from '@/lib/activity-log';
import { balanceShown, vatAddedOnTop, type PaymentLike } from '@/lib/order-balance';
import { todayJerusalem } from '@/lib/finance';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bodySchema = z.object({
  סכום: z.preprocess(v => (typeof v === 'string' ? Number(v) : v), z.number({ invalid_type_error: 'סכום לא תקין' }).finite().positive('הסכום חייב להיות גדול מ-0').max(1_000_000)),
  אמצעי_תשלום: z.string().trim().min(1, 'יש לבחור אמצעי תשלום').max(50),
});

type OrderRow = {
  id: string;
  מספר_הזמנה: string | null;
  סך_הכל_לתשלום: number | null;
  סטטוס_תשלום: string | null;
  סוג_הזמנה: string | null;
  לקוחות: { סוג_לקוח: string | null } | null;
  תשלומים: (PaymentLike & { id: string })[] | null;
};

async function loadOrder(supabase: ReturnType<typeof createAdminClient>, id: string): Promise<OrderRow | null> {
  const { data } = await supabase
    .from('הזמנות')
    .select('id, מספר_הזמנה, סך_הכל_לתשלום, סטטוס_תשלום, סוג_הזמנה, לקוחות(סוג_לקוח), תשלומים(id, סכום, סטטוס_תשלום)')
    .eq('id', id)
    .maybeSingle();
  return (data as unknown as OrderRow | null) ?? null;
}

function balanceOf(o: OrderRow): number {
  return balanceShown(Number(o.סך_הכל_לתשלום) || 0, o.תשלומים, vatAddedOnTop(o.לקוחות?.סוג_לקוח, o.סוג_הזמנה));
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'הזמנה לא נמצאה' }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }, { status: 400 });
  const { סכום, אמצעי_תשלום } = parsed.data;

  const supabase = createAdminClient();
  const order = await loadOrder(supabase, id);
  if (!order) return NextResponse.json({ error: 'הזמנה לא נמצאה' }, { status: 404 });

  const before = balanceOf(order);
  if (סכום > before + 0.01) {
    return NextResponse.json({ error: `הסכום גבוה מהיתרה לתשלום (${before.toFixed(2)} ₪)` }, { status: 400 });
  }

  const { error } = await supabase.from('תשלומים').insert({
    הזמנה_id: id,
    סכום: +סכום.toFixed(2),
    אמצעי_תשלום,
    סטטוס_תשלום: 'שולם',
    תאריך_תשלום: todayJerusalem(),
    הערות: 'תשלום חלקי שנרשם ידנית',
  });
  if (error) {
    console.error('[order payments] insert failed', { orderId: id, code: error.code });
    return NextResponse.json({ error: 'רישום התשלום נכשל' }, { status: 500 });
  }

  const balance = +Math.max(0, before - סכום).toFixed(2);
  if (balance > 0.01 && order.סטטוס_תשלום !== 'חלקי') {
    await supabase.from('הזמנות').update({ סטטוס_תשלום: 'חלקי', תאריך_עדכון: new Date().toISOString() }).eq('id', id);
  }

  void logActivity({
    actor: userActor(auth), module: 'orders', action: 'partial_payment_recorded', status: 'success',
    entityType: 'order', entityId: id, entityLabel: order.מספר_הזמנה,
    title: `נרשם תשלום של ${סכום.toFixed(2)} ₪ (${אמצעי_תשלום})`,
    metadata: { amount: סכום, method: אמצעי_תשלום, balance },
    request: req,
  });
  return NextResponse.json({ ok: true, balance, fullyPaid: balance <= 0.01 });
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const paymentId = req.nextUrl.searchParams.get('paymentId') ?? '';
  if (!UUID_RE.test(id) || !UUID_RE.test(paymentId)) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });

  const supabase = createAdminClient();
  const { data: removed, error } = await supabase
    .from('תשלומים').delete().eq('id', paymentId).eq('הזמנה_id', id).select('סכום').maybeSingle();
  if (error) {
    console.error('[order payments] delete failed', { orderId: id, code: error.code });
    return NextResponse.json({ error: 'מחיקת התשלום נכשלה' }, { status: 500 });
  }
  if (!removed) return NextResponse.json({ error: 'התשלום לא נמצא' }, { status: 404 });

  const order = await loadOrder(supabase, id);
  void logActivity({
    actor: userActor(auth), module: 'orders', action: 'payment_removed', status: 'success',
    entityType: 'order', entityId: id, entityLabel: order?.מספר_הזמנה ?? null,
    title: `נמחק תשלום של ${Number((removed as { סכום: number }).סכום).toFixed(2)} ₪`,
    request: req,
  });
  return NextResponse.json({ ok: true, balance: order ? balanceOf(order) : null });
}
