export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminUser, forbiddenResponse } from '@/lib/auth/requireAuthorizedUser';
import { missingColumnMessage } from '@/lib/db-error';
import { round2, monthLabel, SALARY_CATEGORY } from '@/lib/finance';
import { isMissingTable, EXPENSES_MIGRATION_HINT } from '@/lib/finance-expense-schema';

// PUT /api/finance/salaries  { month: 'YYYY-MM', items: [{ employeeId, gross }] }
//
// Saves one month of payslips (תלושי משכורת) as expenses: one "הוצאות" row
// per employee per month (category "משכורות ועובדים", no VAT), dated the last
// day of the pay month so it lands in that month's profit & loss.
//   gross > 0          → create or update that employee's payslip for the month
//   gross 0 / empty    → remove that employee's payslip for the month
// Idempotent: saving the same month again updates in place (unique index on
// עובד_id + חודש_שכר, migration 059).

const SALARY_SOURCE = 'תלוש שכר';
const SALARIES_MIGRATION_HINT =
  'שדות תלושי השכר עדיין לא קיימים. יש להריץ את מיגרציה 059 (supabase/migrations/059_expense_salaries.sql) ב-Supabase SQL Editor.';

const bodySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'חודש לא תקין'),
  items: z.array(z.object({
    employeeId: z.string().uuid(),
    gross: z.coerce.number().finite().min(0, 'סכום לא יכול להיות שלילי').max(10_000_000).nullable().optional(),
  })).min(1, 'אין עובדים לשמירה').max(500),
});

function lastDayOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(d).padStart(2, '0')}`;
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdminUser();
  if (!auth) return forbiddenResponse();

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }, { status: 400 });
  }
  const { month, items } = parsed.data;
  const ids = Array.from(new Set(items.map(i => i.employeeId)));
  if (ids.length !== items.length) return NextResponse.json({ error: 'עובד מופיע פעמיים' }, { status: 400 });

  const supabase = createAdminClient();

  // Employees must exist; their names become the expense's display name.
  const { data: emps, error: empErr } = await supabase.from('עובדים').select('id, שם_עובד').in('id', ids);
  if (empErr) {
    console.error('[finance/salaries] employees read failed', { code: empErr.code });
    return NextResponse.json({ error: 'שמירת התלושים נכשלה' }, { status: 500 });
  }
  const nameById = new Map((emps ?? []).map((e: { id: string; שם_עובד: string }) => [e.id, e.שם_עובד]));
  if (nameById.size !== ids.length) return NextResponse.json({ error: 'עובד לא נמצא' }, { status: 400 });

  // Existing payslips of this month for these employees.
  const { data: existing, error: exErr } = await supabase
    .from('הוצאות')
    .select('id, עובד_id')
    .eq('חודש_שכר', month)
    .in('עובד_id', ids);
  if (exErr) {
    if (isMissingTable(exErr)) return NextResponse.json({ error: EXPENSES_MIGRATION_HINT }, { status: 400 });
    if (missingColumnMessage(exErr)) return NextResponse.json({ error: SALARIES_MIGRATION_HINT }, { status: 400 });
    console.error('[finance/salaries] existing read failed', { code: exErr.code });
    return NextResponse.json({ error: 'שמירת התלושים נכשלה' }, { status: 500 });
  }
  const existingByEmp = new Map((existing ?? []).map((r: { id: string; עובד_id: string }) => [r.עובד_id, r.id]));

  const date = lastDayOfMonth(month);
  let saved = 0, removed = 0;
  for (const item of items) {
    const gross = item.gross == null ? 0 : round2(item.gross);
    const existingId = existingByEmp.get(item.employeeId);
    if (gross <= 0) {
      if (existingId) {
        const { error } = await supabase.from('הוצאות').delete().eq('id', existingId);
        if (error) {
          console.error('[finance/salaries] delete failed', { code: error.code });
          return NextResponse.json({ error: 'שמירת התלושים נכשלה' }, { status: 500 });
        }
        removed++;
      }
      continue;
    }
    const row = {
      תאריך: date,
      עובד_id: item.employeeId,
      חודש_שכר: month,
      שם_ספק: nameById.get(item.employeeId)!,
      קטגוריה: SALARY_CATEGORY,
      תיאור: `תלוש שכר ${monthLabel(month)} — ברוטו`,
      סכום: gross,
      מעמ: 0,
      מקור: SALARY_SOURCE,
    };
    const { error } = existingId
      ? await supabase.from('הוצאות').update({ ...row, תאריך_עדכון: new Date().toISOString() }).eq('id', existingId)
      : await supabase.from('הוצאות').insert({ ...row, נוצר_על_ידי: auth.email ?? null });
    if (error) {
      if (missingColumnMessage(error)) return NextResponse.json({ error: SALARIES_MIGRATION_HINT }, { status: 400 });
      console.error('[finance/salaries] save failed', { code: error.code });
      return NextResponse.json({ error: 'שמירת התלושים נכשלה' }, { status: 500 });
    }
    saved++;
  }

  console.log('[finance/salaries] saved', { month, saved, removed });
  return NextResponse.json({ saved, removed });
}
