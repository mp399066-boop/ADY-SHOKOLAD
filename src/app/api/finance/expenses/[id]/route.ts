export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminUser, forbiddenResponse } from '@/lib/auth/requireAuthorizedUser';
import { expenseInputSchema, isMissingTable, EXPENSES_MIGRATION_HINT } from '@/lib/finance-expense-schema';

// PATCH  /api/finance/expenses/[id] → replace the editable fields of one expense
// DELETE /api/finance/expenses/[id] → delete one expense

const COLUMNS = 'id, תאריך, ספק_id, שם_ספק, קטגוריה, תיאור, סכום, מעמ, מספר_מסמך, אמצעי_תשלום, הערות, מקור, תאריך_יצירה';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdminUser();
  if (!auth) return forbiddenResponse();
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 });

  const body = await req.json().catch(() => null);
  const parsed = expenseInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }, { status: 400 });
  }
  const input = parsed.data;
  const supabase = createAdminClient();

  let supplierName = input.שם_ספק;
  if (input.ספק_id) {
    const { data: sup } = await supabase.from('ספקים').select('שם_ספק').eq('id', input.ספק_id).maybeSingle();
    if (!sup) return NextResponse.json({ error: 'הספק לא נמצא' }, { status: 400 });
    supplierName = supplierName || (sup as { שם_ספק: string }).שם_ספק;
  }

  const { data, error } = await supabase
    .from('הוצאות')
    .update({ ...input, שם_ספק: supplierName, תאריך_עדכון: new Date().toISOString() })
    .eq('id', params.id)
    .select(COLUMNS)
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ error: EXPENSES_MIGRATION_HINT }, { status: 400 });
    console.error('[finance/expenses PATCH]', { id: params.id, code: error.code });
    return NextResponse.json({ error: 'עדכון ההוצאה נכשל' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'ההוצאה לא נמצאה' }, { status: 404 });
  return NextResponse.json({ data });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdminUser();
  if (!auth) return forbiddenResponse();
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase.from('הוצאות').delete().eq('id', params.id);
  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ error: EXPENSES_MIGRATION_HINT }, { status: 400 });
    console.error('[finance/expenses DELETE]', { id: params.id, code: error.code });
    return NextResponse.json({ error: 'מחיקת ההוצאה נכשלה' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
