export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminUser, forbiddenResponse } from '@/lib/auth/requireAuthorizedUser';
import { manualIncomeInputSchema, MANUAL_INCOME_COLUMNS, MANUAL_INCOME_MIGRATION_HINT } from '@/lib/finance-income-schema';
import { isMissingTable } from '@/lib/finance-expense-schema';
import { missingColumnMessage } from '@/lib/db-error';

// POST /api/finance/manual-income → create one manual income (הכנסה ידנית).
// The year's manual income is read by GET /api/finance/income together with
// the orders, so every income view counts it.

export async function POST(req: NextRequest) {
  const auth = await requireAdminUser();
  if (!auth) return forbiddenResponse();

  const body = await req.json().catch(() => null);
  const parsed = manualIncomeInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('הכנסות_ידניות')
    .insert({ ...parsed.data, נוצר_על_ידי: auth.email ?? null })
    .select(MANUAL_INCOME_COLUMNS)
    .single();

  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ error: MANUAL_INCOME_MIGRATION_HINT }, { status: 400 });
    const missing = missingColumnMessage(error);
    if (missing) return NextResponse.json({ error: missing }, { status: 400 });
    console.error('[finance/manual-income POST]', { code: error.code });
    return NextResponse.json({ error: 'שמירת ההכנסה נכשלה' }, { status: 500 });
  }
  return NextResponse.json({ data }, { status: 201 });
}
