export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { dbErrorResponse } from '@/lib/api-error';
import { fetchAllPages } from '@/lib/supabase/fetch-all';
import { isMissingTable } from '@/lib/finance-expense-schema';
import { quoteInputSchema, computeQuoteTotals, generateQuoteNumber, type QuoteLine } from '@/lib/quotes';
import { resolveQuoteLines, SALES_MIGRATION_HINT, QUOTE_SELECT, normalizeQuote } from '@/lib/quotes-server';
import { newPublicToken } from '@/lib/public-token';

// GET  /api/quotes → every quote, newest first  ({ data, tableReady })
// POST /api/quotes → create a quote (status טיוטה)

export async function GET() {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  const supabase = createAdminClient();
  const { data, error } = await fetchAllPages((a, b) => supabase
    .from('הצעות_מחיר')
    .select(QUOTE_SELECT)
    .order('תאריך_יצירה', { ascending: false })
    .order('id')
    .range(a, b));
  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ data: [], tableReady: false, hint: SALES_MIGRATION_HINT });
    return dbErrorResponse(error, 'quotes GET');
  }
  return NextResponse.json({ data: (data as Record<string, unknown>[]).map(normalizeQuote), tableReady: true });
}

export async function POST(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();

  const parsed = quoteInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }, { status: 400 });
  }
  const input = parsed.data;
  const supabase = createAdminClient();

  const { data: customer, error: custErr } = await supabase
    .from('לקוחות').select('id, סוג_לקוח').eq('id', input.לקוח_id).maybeSingle();
  if (custErr) return dbErrorResponse(custErr, 'quotes POST customer');
  if (!customer) return NextResponse.json({ error: 'הלקוח לא נמצא' }, { status: 400 });

  const resolved = await resolveQuoteLines(supabase, input.פריטים as QuoteLine[], customer.סוג_לקוח);
  if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: 400 });
  const totals = computeQuoteTotals(resolved.lines, input.סוג_הנחה, input.ערך_הנחה, input.דמי_משלוח);

  // The quote number is random — retry once on the (unlikely) collision.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase
      .from('הצעות_מחיר')
      .insert({
        מספר_הצעה: generateQuoteNumber(),
        לקוח_id: input.לקוח_id,
        סטטוס: 'טיוטה',
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
        טוקן: newPublicToken(),
        נוצר_על_ידי: auth.email ?? null,
      })
      .select(QUOTE_SELECT)
      .single();
    if (!error) return NextResponse.json({ data: normalizeQuote(data as Record<string, unknown>) }, { status: 201 });
    if (isMissingTable(error)) return NextResponse.json({ error: SALES_MIGRATION_HINT }, { status: 400 });
    if (error.code !== '23505') return dbErrorResponse(error, 'quotes POST');
  }
  return NextResponse.json({ error: 'יצירת ההצעה נכשלה, נסי שוב' }, { status: 500 });
}
