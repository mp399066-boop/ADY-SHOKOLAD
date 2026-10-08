export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminUser, forbiddenResponse } from '@/lib/auth/requireAuthorizedUser';
import {
  isCountableOrder, toFinanceOrder, todayJerusalem,
  type FinanceOrderSource, type FinanceOrder,
} from '@/lib/finance';

// GET /api/finance/income?year=2026&basis=order|delivery
// Read-only. Returns every countable order of the year (money already
// computed per src/lib/finance.ts) — the page groups them by month/customer.
// basis=order (default) dates an order by תאריך_הזמנה, basis=delivery by
// תאריך_אספקה.

const SELECT =
  'id, מספר_הזמנה, תאריך_הזמנה, תאריך_אספקה, סטטוס_הזמנה, סטטוס_תשלום, סוג_הזמנה, אופן_תשלום, ' +
  'סך_הכל_לתשלום, דמי_משלוח, לקוח_id, לקוחות(שם_פרטי, שם_משפחה, סוג_לקוח, פטור_ממעמ)';

export async function GET(req: NextRequest) {
  const auth = await requireAdminUser();
  if (!auth) return forbiddenResponse();

  const { searchParams } = new URL(req.url);
  const currentYear = Number(todayJerusalem().slice(0, 4));
  const yearRaw = searchParams.get('year') ?? String(currentYear);
  const basisRaw = searchParams.get('basis') ?? 'order';

  if (!/^\d{4}$/.test(yearRaw)) {
    return NextResponse.json({ error: 'שנה לא תקינה' }, { status: 400 });
  }
  const year = Number(yearRaw);
  if (year < 2000 || year > currentYear + 1) {
    return NextResponse.json({ error: 'שנה לא תקינה' }, { status: 400 });
  }
  if (basisRaw !== 'order' && basisRaw !== 'delivery') {
    return NextResponse.json({ error: 'basis לא תקין' }, { status: 400 });
  }
  const dateColumn = basisRaw === 'delivery' ? 'תאריך_אספקה' : 'תאריך_הזמנה';

  const supabase = createAdminClient();

  try {
    // Page through — PostgREST caps a single response at 1000 rows.
    const rows: FinanceOrderSource[] = [];
    const pageSize = 1000;
    for (let offset = 0; offset < 100_000; offset += pageSize) {
      const { data, error } = await supabase
        .from('הזמנות')
        .select(SELECT)
        .gte(dateColumn, `${year}-01-01`)
        .lte(dateColumn, `${year}-12-31`)
        .order(dateColumn, { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      const page = (data ?? []) as unknown as FinanceOrderSource[];
      rows.push(...page);
      if (page.length < pageSize) break;
    }

    const orders: FinanceOrder[] = rows.filter(isCountableOrder).map(toFinanceOrder);

    // Years that have any order, for the year picker.
    const { data: first } = await supabase
      .from('הזמנות')
      .select('תאריך_הזמנה')
      .not('תאריך_הזמנה', 'is', null)
      .order('תאריך_הזמנה', { ascending: true })
      .limit(1);
    const firstYear = Number((first?.[0] as { תאריך_הזמנה?: string } | undefined)?.תאריך_הזמנה?.slice(0, 4)) || currentYear;
    const years: number[] = [];
    for (let y = currentYear; y >= Math.min(firstYear, currentYear); y--) years.push(y);

    // Orders with no delivery date can't be placed on the delivery basis —
    // report how many so the UI can say so instead of silently dropping them.
    let undatedCount = 0;
    if (basisRaw === 'delivery') {
      const { count } = await supabase
        .from('הזמנות')
        .select('id', { count: 'exact', head: true })
        .is('תאריך_אספקה', null)
        .gte('תאריך_הזמנה', `${year}-01-01`)
        .lte('תאריך_הזמנה', `${year}-12-31`)
        .not('סטטוס_הזמנה', 'in', '("בוטלה","טיוטה")');
      undatedCount = count ?? 0;
    }

    return NextResponse.json({ year, basis: basisRaw, years, orders, undatedCount });
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code ?? 'unknown';
    console.error('[finance/income] query failed', { year, basis: basisRaw, code });
    return NextResponse.json({ error: 'שגיאה בטעינת נתוני ההכנסות' }, { status: 500 });
  }
}
