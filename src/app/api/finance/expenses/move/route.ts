export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminUser, forbiddenResponse } from '@/lib/auth/requireAuthorizedUser';
import { EXPENSE_BOXES } from '@/lib/finance';
import { isMissingTable, isBoxConstraintError, EXPENSES_MIGRATION_HINT, HOME_BOX_MIGRATION_HINT } from '@/lib/finance-expense-schema';
import { missingColumnMessage } from '@/lib/db-error';

// POST /api/finance/expenses/move { ids, קופה } → move expenses to another box
// (קופת העסק / קופת קורסים / קופת בית). Only the box changes — amounts stay as they are.

const moveSchema = z.object({
  ids: z.array(z.string().uuid('מזהה לא תקין')).min(1, 'לא נבחרו הוצאות').max(1000, 'אפשר להעביר עד 1000 הוצאות בפעם אחת'),
  קופה: z.enum(EXPENSE_BOXES, { message: 'קופה לא תקינה' }),
});

export async function POST(req: NextRequest) {
  const auth = await requireAdminUser();
  if (!auth) return forbiddenResponse();

  const body = await req.json().catch(() => null);
  const parsed = moveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }, { status: 400 });
  }
  const ids = Array.from(new Set(parsed.data.ids));
  const box = parsed.data.קופה;
  const supabase = createAdminClient();

  let moved = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from('הוצאות')
      .update({ קופה: box, תאריך_עדכון: new Date().toISOString() })
      .in('id', ids.slice(i, i + 200))
      .select('id');
    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: EXPENSES_MIGRATION_HINT }, { status: 400 });
      if (isBoxConstraintError(error)) return NextResponse.json({ error: HOME_BOX_MIGRATION_HINT }, { status: 400 });
      const missing = missingColumnMessage(error);
      if (missing) return NextResponse.json({ error: missing }, { status: 400 });
      console.error('[finance/expenses/move POST]', { box, count: ids.length, code: error.code });
      return NextResponse.json({ error: 'העברת ההוצאות נכשלה' }, { status: 500 });
    }
    moved += (data ?? []).length;
  }
  return NextResponse.json({ moved });
}
