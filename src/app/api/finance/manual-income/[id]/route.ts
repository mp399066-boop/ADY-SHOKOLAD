export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminUser, forbiddenResponse } from '@/lib/auth/requireAuthorizedUser';
import { manualIncomeInputSchema, MANUAL_INCOME_COLUMNS, MANUAL_INCOME_MIGRATION_HINT } from '@/lib/finance-income-schema';
import { isMissingTable } from '@/lib/finance-expense-schema';
import { missingColumnMessage } from '@/lib/db-error';

// PATCH  /api/finance/manual-income/[id] → replace the editable fields of one manual income
// DELETE /api/finance/manual-income/[id] → delete one manual income

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdminUser();
  if (!auth) return forbiddenResponse();
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 });

  const body = await req.json().catch(() => null);
  const parsed = manualIncomeInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('הכנסות_ידניות')
    .update({ ...parsed.data, תאריך_עדכון: new Date().toISOString() })
    .eq('id', params.id)
    .select(MANUAL_INCOME_COLUMNS)
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ error: MANUAL_INCOME_MIGRATION_HINT }, { status: 400 });
    const missing = missingColumnMessage(error);
    if (missing) return NextResponse.json({ error: missing }, { status: 400 });
    console.error('[finance/manual-income PATCH]', { id: params.id, code: error.code });
    return NextResponse.json({ error: 'עדכון ההכנסה נכשל' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'ההכנסה לא נמצאה' }, { status: 404 });
  return NextResponse.json({ data });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdminUser();
  if (!auth) return forbiddenResponse();
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase.from('הכנסות_ידניות').delete().eq('id', params.id);
  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ error: MANUAL_INCOME_MIGRATION_HINT }, { status: 400 });
    console.error('[finance/manual-income DELETE]', { id: params.id, code: error.code });
    return NextResponse.json({ error: 'מחיקת ההכנסה נכשלה' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
