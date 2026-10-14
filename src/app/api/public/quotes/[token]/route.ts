export const dynamic = 'force-dynamic';

// PUBLIC route — no login. Access is by the quote's random 192-bit token
// (the link the owner sends the customer). It can do exactly one thing:
// mark that quote approved. It never returns other data.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { todayJerusalem } from '@/lib/finance';
import { formatCurrency } from '@/lib/utils';
import { PUBLIC_TOKEN_RE, quoteApprovable, type QuoteStatus } from '@/lib/quotes';
import { notifyOwner } from '@/lib/owner-notify';
import { appBaseUrl } from '@/lib/app-url';
import { logActivity } from '@/lib/activity-log';

const bodySchema = z.object({ name: z.string().trim().max(120).optional() });

export async function POST(req: NextRequest, props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  if (!PUBLIC_TOKEN_RE.test(token)) return NextResponse.json({ error: 'הקישור לא תקין' }, { status: 404 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
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
