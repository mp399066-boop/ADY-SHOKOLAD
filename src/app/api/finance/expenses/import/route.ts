export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminUser, forbiddenResponse } from '@/lib/auth/requireAuthorizedUser';
import { round2 } from '@/lib/finance';
import { expenseInputSchema, isMissingTable, EXPENSES_MIGRATION_HINT } from '@/lib/finance-expense-schema';

// POST /api/finance/expenses/import  { rows: ExpenseInput[] }
// Bulk insert of expenses parsed (client-side) from a bookkeeping export.
// Idempotent: a row whose (תאריך, סכום, שם_ספק, מספר_מסמך) already exists —
// in the DB or earlier in the same file — is skipped, so importing the same
// file twice never doubles the expenses.

const MAX_ROWS = 5000;
const bodySchema = z.object({ rows: z.array(z.unknown()).min(1, 'אין שורות לייבוא').max(MAX_ROWS, `ניתן לייבא עד ${MAX_ROWS} שורות בכל פעם`) });

const norm = (s: string | null | undefined) => (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const dedupeKey = (r: { תאריך: string; סכום: number | string; שם_ספק: string | null; מספר_מסמך: string | null }) =>
  [r.תאריך, round2(Number(r.סכום)).toFixed(2), norm(r.שם_ספק), norm(r.מספר_מסמך)].join('|');

export async function POST(req: NextRequest) {
  const auth = await requireAdminUser();
  if (!auth) return forbiddenResponse();

  const body = await req.json().catch(() => null);
  const outer = bodySchema.safeParse(body);
  if (!outer.success) {
    return NextResponse.json({ error: outer.error.issues[0]?.message ?? 'נתונים לא תקינים' }, { status: 400 });
  }

  const valid: z.infer<typeof expenseInputSchema>[] = [];
  const invalid: { row: number; error: string }[] = [];
  outer.data.rows.forEach((raw, i) => {
    const p = expenseInputSchema.safeParse(raw);
    if (p.success) valid.push({ ...p.data, ספק_id: null }); // imports never trust a client-sent supplier id
    else invalid.push({ row: i + 1, error: p.error.issues[0]?.message ?? 'שורה לא תקינה' });
  });
  if (valid.length === 0) {
    return NextResponse.json({ error: 'לא נמצאו שורות תקינות לייבוא', invalid }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Existing rows in the date span of the file, for de-duplication.
  const dates = valid.map(r => r.תאריך).sort();
  const existing = new Set<string>();
  for (let offset = 0; offset < 200_000; offset += 1000) {
    const { data, error } = await supabase
      .from('הוצאות')
      .select('תאריך, סכום, שם_ספק, מספר_מסמך')
      .gte('תאריך', dates[0])
      .lte('תאריך', dates[dates.length - 1])
      .order('id', { ascending: true })
      .range(offset, offset + 999);
    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: EXPENSES_MIGRATION_HINT }, { status: 400 });
      console.error('[finance/expenses/import] dedupe read failed', { code: error.code });
      return NextResponse.json({ error: 'הייבוא נכשל' }, { status: 500 });
    }
    for (const r of data ?? []) existing.add(dedupeKey(r as never));
    if ((data ?? []).length < 1000) break;
  }

  // Match supplier names to supplier cards (exact, case/space-insensitive).
  const { data: suppliers } = await supabase.from('ספקים').select('id, שם_ספק');
  const supplierByName = new Map<string, string>();
  for (const s of (suppliers ?? []) as { id: string; שם_ספק: string }[]) supplierByName.set(norm(s.שם_ספק), s.id);

  const toInsert: Record<string, unknown>[] = [];
  let duplicates = 0;
  for (const r of valid) {
    const key = dedupeKey(r);
    if (existing.has(key)) { duplicates++; continue; }
    existing.add(key);
    toInsert.push({
      ...r,
      ספק_id: r.שם_ספק ? supplierByName.get(norm(r.שם_ספק)) ?? null : null,
      מקור: 'ייבוא',
      נוצר_על_ידי: auth.email ?? null,
    });
  }

  for (let i = 0; i < toInsert.length; i += 500) {
    const { error } = await supabase.from('הוצאות').insert(toInsert.slice(i, i + 500));
    if (error) {
      console.error('[finance/expenses/import] insert failed', { code: error.code, batchStart: i });
      return NextResponse.json({
        error: `הייבוא נעצר אחרי ${i} שורות עקב שגיאה. ניתן לייבא שוב את אותו קובץ — שורות שכבר נקלטו ידולגו.`,
      }, { status: 500 });
    }
  }

  console.log('[finance/expenses/import] done', { inserted: toInsert.length, duplicates, invalid: invalid.length });
  return NextResponse.json({ inserted: toInsert.length, duplicates, invalid });
}
