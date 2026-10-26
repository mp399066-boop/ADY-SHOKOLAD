export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { dbErrorResponse } from '@/lib/api-error';
import { quoteInputSchema, computeQuoteTotals, quoteEditable, type QuoteLine, type QuoteStatus } from '@/lib/quotes';
import { resolveQuoteLines, QUOTE_SELECT, normalizeQuote } from '@/lib/quotes-server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PATCH /api/quotes/[id]
//   { action: 'mark_sent' | 'reject' | 'reopen' }  → status change
//   { ...quote fields }                             → replace the content
// DELETE /api/quotes/[id] → delete (not once it became an order)

async function loadStatus(supabase: ReturnType<typeof createAdminClient>, id: string) {
  return supabase.from('הצעות_מחיר').select('id, סטטוס, תאריך_שליחה').eq('id', id).maybeSingle();
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  if (!UUID.test(id)) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 });

  const body = await req.json().catch(() => null);
  const supabase = createAdminClient();
  const { data: current, error: curErr } = await loadStatus(supabase, id);
  if (curErr) return dbErrorResponse(curErr, 'quotes PATCH load');
  if (!current) return NextResponse.json({ error: 'ההצעה לא נמצאה' }, { status: 404 });
  const status = current.סטטוס as QuoteStatus;

  // ── Status actions ──
  if (body && typeof body.action === 'string') {
    let patch: Record<string, unknown>;
    if (body.action === 'mark_sent') {
      if (status !== 'טיוטה' && status !== 'נשלחה' && status !== 'בקשת שינוי') return NextResponse.json({ error: 'אי אפשר לסמן את ההצעה כנשלחה במצב הנוכחי' }, { status: 400 });
      patch = { סטטוס: 'נשלחה', תאריך_שליחה: current.תאריך_שליחה ?? new Date().toISOString() };
    } else if (body.action === 'reject') {
      if (status === 'הומרה להזמנה') return NextResponse.json({ error: 'ההצעה כבר הפכה להזמנה' }, { status: 400 });
      patch = { סטטוס: 'נדחתה' };
    } else if (body.action === 'reopen') {
      if (status !== 'נדחתה' && status !== 'אושרה') return NextResponse.json({ error: 'אפשר לפתוח מחדש רק הצעה שנדחתה או אושרה' }, { status: 400 });
      patch = { סטטוס: 'נשלחה', תאריך_אישור: null, שם_המאשר: null };
    } else {
      return NextResponse.json({ error: 'פעולה לא מוכרת' }, { status: 400 });
    }
    const { data, error } = await supabase.from('הצעות_מחיר')
      .update({ ...patch, תאריך_עדכון: new Date().toISOString() })
      .eq('id', id).select(QUOTE_SELECT).single();
    if (error) return dbErrorResponse(error, 'quotes PATCH action');
    return NextResponse.json({ data: normalizeQuote(data as Record<string, unknown>) });
  }

  // ── Content edit ──
  if (!quoteEditable(status)) {
    return NextResponse.json({ error: status === 'אושרה' ? 'הלקוח כבר אישר את ההצעה. כדי לשנות אותה יש לפתוח אותה מחדש.' : 'ההצעה כבר הפכה להזמנה ואי אפשר לערוך אותה' }, { status: 400 });
  }
  const parsed = quoteInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }, { status: 400 });
  }
  const input = parsed.data;
  const { data: customer, error: custErr } = await supabase
    .from('לקוחות').select('id, סוג_לקוח').eq('id', input.לקוח_id).maybeSingle();
  if (custErr) return dbErrorResponse(custErr, 'quotes PATCH customer');
  if (!customer) return NextResponse.json({ error: 'הלקוח לא נמצא' }, { status: 400 });

  const resolved = await resolveQuoteLines(supabase, input.פריטים as QuoteLine[], customer.סוג_לקוח);
  if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: 400 });
  const totals = computeQuoteTotals(resolved.lines, input.סוג_הנחה, input.ערך_הנחה, input.דמי_משלוח);

  const { data, error } = await supabase.from('הצעות_מחיר')
    .update({
      לקוח_id: input.לקוח_id,
      פריטים: resolved.lines,
      סוג_הנחה: input.סוג_הנחה,
      ערך_הנחה: input.ערך_הנחה,
      דמי_משלוח: input.דמי_משלוח,
      סכום_לפני_הנחה: totals.subtotal,
      סכום_הנחה: totals.discount,
      סך_הכל: totals.total,
      תוקף_עד: input.תוקף_עד,
      תאריך_אספקה_מבוקש: input.תאריך_אספקה_מבוקש,
      הערות_ללקוח: input.הערות_ללקוח,
      הערות_פנימיות: input.הערות_פנימיות,
      // The owner answered the customer's change request: the updated quote is
      // back on the same link, ready to approve.
      ...(status === 'בקשת שינוי' ? { סטטוס: 'נשלחה' } : {}),
      תאריך_עדכון: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('סטטוס', status) // guards a race with an approval or a new change request
    .select(QUOTE_SELECT)
    .maybeSingle();
  if (error) return dbErrorResponse(error, 'quotes PATCH');
  if (!data) return NextResponse.json({ error: 'ההצעה השתנתה בינתיים (אולי הלקוח אישר אותה). יש לרענן את הדף.' }, { status: 409 });
  return NextResponse.json({ data: normalizeQuote(data as Record<string, unknown>) });
}

export async function DELETE(_: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  if (!UUID.test(id)) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase.from('הצעות_מחיר')
    .delete().eq('id', id).neq('סטטוס', 'הומרה להזמנה').select('id');
  if (error) return dbErrorResponse(error, 'quotes DELETE');
  if (!data?.length) return NextResponse.json({ error: 'אי אפשר למחוק הצעה שהפכה להזמנה' }, { status: 400 });
  return NextResponse.json({ ok: true });
}
