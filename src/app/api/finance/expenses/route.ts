export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminUser, forbiddenResponse } from '@/lib/auth/requireAuthorizedUser';
import { todayJerusalem } from '@/lib/finance';
import { expenseInputSchema, isMissingTable, EXPENSES_MIGRATION_HINT } from '@/lib/finance-expense-schema';

// GET  /api/finance/expenses?year=2026 → { data, tableReady }
// POST /api/finance/expenses           → create one expense

const COLUMNS = 'id, תאריך, ספק_id, שם_ספק, קטגוריה, תיאור, סכום, מעמ, מספר_מסמך, אמצעי_תשלום, הערות, מקור, תאריך_יצירה';

export async function GET(req: NextRequest) {
  const auth = await requireAdminUser();
  if (!auth) return forbiddenResponse();

  const yearRaw = new URL(req.url).searchParams.get('year') ?? todayJerusalem().slice(0, 4);
  if (!/^\d{4}$/.test(yearRaw)) return NextResponse.json({ error: 'שנה לא תקינה' }, { status: 400 });

  const supabase = createAdminClient();
  const all: Record<string, unknown>[] = [];
  const pageSize = 1000;
  for (let offset = 0; offset < 100_000; offset += pageSize) {
    const { data, error } = await supabase
      .from('הוצאות')
      .select(COLUMNS)
      .gte('תאריך', `${yearRaw}-01-01`)
      .lte('תאריך', `${yearRaw}-12-31`)
      .order('תאריך', { ascending: false })
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ data: [], tableReady: false, hint: EXPENSES_MIGRATION_HINT });
      console.error('[finance/expenses GET]', { code: error.code });
      return NextResponse.json({ error: 'שגיאה בטעינת ההוצאות' }, { status: 500 });
    }
    all.push(...(data ?? []));
    if ((data ?? []).length < pageSize) break;
  }

  const data = all.map(r => ({ ...r, סכום: Number(r['סכום']) || 0, מעמ: Number(r['מעמ']) || 0 }));
  return NextResponse.json({ data, tableReady: true });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminUser();
  if (!auth) return forbiddenResponse();

  const body = await req.json().catch(() => null);
  const parsed = expenseInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }, { status: 400 });
  }
  const input = parsed.data;
  const supabase = createAdminClient();

  // A linked supplier must exist; its name becomes the display name if none given.
  let supplierName = input.שם_ספק;
  if (input.ספק_id) {
    const { data: sup } = await supabase.from('ספקים').select('שם_ספק').eq('id', input.ספק_id).maybeSingle();
    if (!sup) return NextResponse.json({ error: 'הספק לא נמצא' }, { status: 400 });
    supplierName = supplierName || (sup as { שם_ספק: string }).שם_ספק;
  }

  const { data, error } = await supabase
    .from('הוצאות')
    .insert({ ...input, שם_ספק: supplierName, מקור: 'ידני', נוצר_על_ידי: auth.email ?? null })
    .select(COLUMNS)
    .single();

  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ error: EXPENSES_MIGRATION_HINT }, { status: 400 });
    console.error('[finance/expenses POST]', { code: error.code });
    return NextResponse.json({ error: 'שמירת ההוצאה נכשלה' }, { status: 500 });
  }
  return NextResponse.json({ data }, { status: 201 });
}
