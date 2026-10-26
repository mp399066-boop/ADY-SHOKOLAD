export const dynamic = 'force-dynamic';

// PUBLIC route — no login. Access is by the quote's random 192-bit token
// (the link the owner sends the customer). It can do exactly two things:
// mark that quote approved, or record the customer's change request
// ({ action: 'request_change', message }) for the owner to act on. It never
// returns other data, and the customer never changes prices or items directly.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { todayJerusalem } from '@/lib/finance';
import { formatCurrency } from '@/lib/utils';
import { PUBLIC_TOKEN_RE, quoteApprovable, quoteChangeRequestable, changeRequestSchema, type QuoteStatus } from '@/lib/quotes';
import { notifyOwner } from '@/lib/owner-notify';
import { appBaseUrl } from '@/lib/app-url';
import { logActivity } from '@/lib/activity-log';

const bodySchema = z.object({ name: z.string().trim().max(120).optional() });

export async function POST(req: NextRequest, props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  if (!PUBLIC_TOKEN_RE.test(token)) return NextResponse.json({ error: 'הקישור לא תקין' }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  if (body && body.action === 'request_change') return requestChange(req, token, body);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'נתונים לא תקינים' }, { status: 400 });

  const supabase = createAdminClient();
  const { data: quote, error } = await supabase.from('הצעות_מחיר')
    .select('id, מספר_הצעה, סטטוס, תוקף_עד, סך_הכל, לקוחות(שם_פרטי, שם_משפחה)')
    .eq('טוקן', token).maybeSingle();
  if (error) {
    console.error('[public/quotes] load failed', { code: error.code });
    return NextResponse.json({ error: 'אירעה שגיאה, אפשר לנסות שוב בעוד רגע' }, { status: 500 });
  }
  if (!quote) return NextResponse.json({ error: 'ההצעה לא נמצאה' }, { status: 404 });

  const status = quote.סטטוס as QuoteStatus;
  if (status === 'אושרה' || status === 'הומרה להזמנה') return NextResponse.json({ ok: true, already: true });
  if (!quoteApprovable({ סטטוס: status, תוקף_עד: quote.תוקף_עד }, todayJerusalem())) {
    return NextResponse.json({ error: status === 'נדחתה' ? 'ההצעה כבר לא בתוקף' : 'תוקף ההצעה פג. אפשר לפנות אלינו לקבלת הצעה מעודכנת.' }, { status: 400 });
  }

  const approverName = parsed.data.name || null;
  const { data: updated, error: upErr } = await supabase.from('הצעות_מחיר')
    .update({ סטטוס: 'אושרה', תאריך_אישור: new Date().toISOString(), שם_המאשר: approverName, תאריך_עדכון: new Date().toISOString() })
    .eq('id', quote.id).in('סטטוס', ['טיוטה', 'נשלחה'])
    .select('id').maybeSingle();
  if (upErr) {
    console.error('[public/quotes] approve failed', { code: upErr.code, quote: quote.id });
    return NextResponse.json({ error: 'האישור לא נשמר, אפשר לנסות שוב' }, { status: 500 });
  }
  if (!updated) return NextResponse.json({ ok: true, already: true });

  const c = quote.לקוחות as { שם_פרטי?: string; שם_משפחה?: string } | null;
  const customerName = `${c?.שם_פרטי ?? ''} ${c?.שם_משפחה ?? ''}`.trim();
  console.log('[public/quotes] approved', { quote: quote.id });
  void logActivity({
    actor: { type: 'public_token', name: 'לקוח דרך קישור הצעה' },
    module: 'orders', action: 'quote_approved', status: 'success',
    entityType: 'quote', entityId: quote.id, entityLabel: quote.מספר_הצעה,
    title: 'לקוח אישר הצעת מחיר', request: req,
  });
  await notifyOwner({
    kind: 'quote_approved',
    subject: `הצעת מחיר ${quote.מספר_הצעה} אושרה`,
    title: 'הלקוח אישר את הצעת המחיר',
    rows: [
      ['הצעה', quote.מספר_הצעה],
      ['לקוח', customerName],
      ['אושר על ידי', approverName ?? ''],
      ['סכום', formatCurrency(Number(quote.סך_הכל) || 0)],
    ],
    link: { href: `${appBaseUrl()}/sales?tab=quotes`, label: 'פתיחה במערכת' },
  });
  return NextResponse.json({ ok: true });
}

const CHANGE_MIGRATION_CODES = new Set(['42703', '23514']); // missing column / old status CHECK

async function requestChange(req: NextRequest, token: string, body: unknown) {
  const parsed = changeRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }, { status: 400 });

  const supabase = createAdminClient();
  const { data: quote, error } = await supabase.from('הצעות_מחיר')
    .select('id, מספר_הצעה, סטטוס, סך_הכל, לקוחות(שם_פרטי, שם_משפחה)')
    .eq('טוקן', token).maybeSingle();
  if (error) {
    console.error('[public/quotes] change load failed', { code: error.code });
    return NextResponse.json({ error: 'אירעה שגיאה, אפשר לנסות שוב בעוד רגע' }, { status: 500 });
  }
  if (!quote) return NextResponse.json({ error: 'ההצעה לא נמצאה' }, { status: 404 });

  const status = quote.סטטוס as QuoteStatus;
  if (!quoteChangeRequestable(status)) {
    return NextResponse.json({ error: status === 'אושרה' || status === 'הומרה להזמנה' ? 'ההצעה כבר אושרה. לשינויים אפשר לפנות אלינו ישירות.' : 'ההצעה אינה בתוקף. אפשר לפנות אלינו לקבלת הצעה מעודכנת.' }, { status: 400 });
  }

  const name = parsed.data.name || null;
  const message = name ? `${parsed.data.message}\n— ${name}` : parsed.data.message;
  const now = new Date().toISOString();
  const { data: updated, error: upErr } = await supabase.from('הצעות_מחיר')
    .update({ סטטוס: 'בקשת שינוי', בקשת_שינוי: message, תאריך_בקשת_שינוי: now, תאריך_עדכון: now })
    .eq('id', quote.id).in('סטטוס', ['טיוטה', 'נשלחה', 'בקשת שינוי'])
    .select('id').maybeSingle();
  if (upErr) {
    console.error('[public/quotes] change request failed', { code: upErr.code, quote: quote.id });
    if (CHANGE_MIGRATION_CODES.has(upErr.code ?? '')) console.error('[public/quotes] migration 074 not applied');
    return NextResponse.json({ error: 'הבקשה לא נשמרה, אפשר לנסות שוב או לפנות אלינו ישירות' }, { status: 500 });
  }
  if (!updated) return NextResponse.json({ error: 'ההצעה השתנתה בינתיים. יש לרענן את הדף.' }, { status: 409 });

  const c = quote.לקוחות as { שם_פרטי?: string; שם_משפחה?: string } | null;
  const customerName = `${c?.שם_פרטי ?? ''} ${c?.שם_משפחה ?? ''}`.trim();
  console.log('[public/quotes] change requested', { quote: quote.id });
  void logActivity({
    actor: { type: 'public_token', name: 'לקוח דרך קישור הצעה' },
    module: 'orders', action: 'quote_change_requested', status: 'success',
    entityType: 'quote', entityId: quote.id, entityLabel: quote.מספר_הצעה,
    title: 'לקוח ביקש שינוי בהצעת מחיר', request: req,
  });
  await notifyOwner({
    kind: 'quote_change_requested',
    subject: `בקשת שינוי בהצעת מחיר ${quote.מספר_הצעה}`,
    title: 'הלקוח ביקש שינוי בהצעת המחיר',
    rows: [
      ['הצעה', quote.מספר_הצעה],
      ['לקוח', customerName],
      ['הבקשה', message],
      ['סכום נוכחי', formatCurrency(Number(quote.סך_הכל) || 0)],
    ],
    link: { href: `${appBaseUrl()}/sales?tab=quotes`, label: 'פתיחה במערכת' },
  });
  return NextResponse.json({ ok: true });
}
