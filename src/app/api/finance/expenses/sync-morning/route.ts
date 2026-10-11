export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminUser, forbiddenResponse } from '@/lib/auth/requireAuthorizedUser';
import { missingColumnMessage } from '@/lib/db-error';
import { round2 } from '@/lib/finance';
import { isMissingTable, EXPENSES_MIGRATION_HINT } from '@/lib/finance-expense-schema';
import {
  fetchMorningExpenses, mapMorningExpense, MorningApiError, MorningConfigError, type MappedExpense,
} from '@/lib/morning-expenses';

// POST /api/finance/expenses/sync-morning
//   { fromDate, toDate, category, dryRun }
// Pulls supplier invoices from Morning's expenses module into "הוצאות".
//   dryRun=true  → preview only (what would be added / already exists), writes nothing.
//   dryRun=false → inserts the new ones.
// Idempotent: every row carries מזהה_חיצוני = 'morning:<id>' (unique index,
// migration 061). A Morning expense that matches an expense entered by hand
// (same date + amount + supplier + number) is reported and NOT added, so the
// same invoice is never counted twice.

const SYNC_MIGRATION_HINT =
  'שדה הסנכרון עדיין לא קיים. יש להריץ את מיגרציה 061 (supabase/migrations/061_expense_external_id.sql) ב-Supabase SQL Editor.';
const CREDENTIALS_HINT =
  'החיבור למורנינג לא מוגדר בשרת. יש להוסיף ב-Vercel (Settings → Environment Variables) את MORNING_API_ID ו-MORNING_API_SECRET — מפתח API ממורנינג: הגדרות ← כלים למפתחים ← מפתחות API.';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך לא תקין');
const bodySchema = z.object({
  fromDate: isoDate,
  toDate: isoDate,
  category: z.string().trim().min(1, 'יש לבחור קטגוריה').max(100),
  dryRun: z.boolean(),
}).refine(b => b.fromDate <= b.toDate, { message: 'תאריך ההתחלה אחרי תאריך הסיום' })
  .refine(b => (Date.parse(b.toDate) - Date.parse(b.fromDate)) / 86_400_000 <= 800, { message: 'אפשר לסנכרן עד שנתיים בכל פעם' });

const norm = (s: string | null | undefined) => (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const manualKey = (r: { תאריך: string; סכום: number | string; שם_ספק: string | null; מספר_מסמך: string | null }) =>
  [r.תאריך, round2(Number(r.סכום)).toFixed(2), norm(r.שם_ספק), norm(r.מספר_מסמך)].join('|');

const REASON_LABELS: Record<string, string> = {
  'no-id': 'ללא מזהה',
  'bad-date': 'תאריך לא תקין',
  'foreign-currency': 'מטבע זר (לא ש"ח)',
  credit: 'חשבונית זיכוי (סכום שלילי)',
  zero: 'סכום 0',
};

export async function POST(req: NextRequest) {
  const auth = await requireAdminUser();
  if (!auth) return forbiddenResponse();

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }, { status: 400 });
  }
  const { fromDate, toDate, category, dryRun } = parsed.data;
  const supabase = createAdminClient();

  // Migration 061 must be in place before anything is written.
  const probe = await supabase.from('הוצאות').select('id, מזהה_חיצוני').limit(1);
  if (probe.error) {
    if (isMissingTable(probe.error)) return NextResponse.json({ error: EXPENSES_MIGRATION_HINT }, { status: 400 });
    if (missingColumnMessage(probe.error)) return NextResponse.json({ error: SYNC_MIGRATION_HINT }, { status: 400 });
    console.error('[sync-morning] probe failed', { code: probe.error.code });
    return NextResponse.json({ error: 'הסנכרון נכשל' }, { status: 500 });
  }

  // 1. Pull from Morning.
  let raw;
  try {
    raw = await fetchMorningExpenses(fromDate, toDate);
  } catch (e) {
    if (e instanceof MorningConfigError) return NextResponse.json({ error: CREDENTIALS_HINT }, { status: 503 });
    if (e instanceof MorningApiError) {
      console.error('[sync-morning] Morning API error', { step: e.message, status: e.status });
      const msg = e.status === 401 || e.status === 403
        ? 'מורנינג דחה את פרטי ההתחברות (MORNING_API_ID / MORNING_API_SECRET). יש לבדוק את מפתח ה-API.'
        : `מורנינג החזיר שגיאה (${e.status}). נסי שוב בעוד כמה דקות.`;
      return NextResponse.json({ error: msg }, { status: 502 });
    }
    console.error('[sync-morning] fetch failed', { message: e instanceof Error ? e.message : 'unknown' });
    return NextResponse.json({ error: 'לא ניתן להתחבר למורנינג כרגע' }, { status: 502 });
  }

  // 2. Map.
  const mapped: MappedExpense[] = [];
  const skipped: { label: string; reason: string }[] = [];
  for (const e of raw) {
    const r = mapMorningExpense(e, category);
    if (r.ok) mapped.push(r.row);
    else skipped.push({ label: r.label, reason: REASON_LABELS[r.reason] ?? r.reason });
  }

  // 3. What already exists: synced before (external id) or entered by hand.
  const existingIds = new Set<string>();
  const ids = mapped.map(m => m.מזהה_חיצוני);
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from('הוצאות').select('מזהה_חיצוני').in('מזהה_חיצוני', ids.slice(i, i + 200));
    if (error) {
      console.error('[sync-morning] existing ids read failed', { code: error.code });
      return NextResponse.json({ error: 'הסנכרון נכשל' }, { status: 500 });
    }
    for (const r of data ?? []) existingIds.add((r as { מזהה_חיצוני: string }).מזהה_חיצוני);
  }
  const manualKeys = new Set<string>();
  if (mapped.length) {
    const dates = mapped.map(m => m.תאריך).sort();
    const { data, error } = await supabase
      .from('הוצאות')
      .select('תאריך, סכום, שם_ספק, מספר_מסמך')
      .is('מזהה_חיצוני', null)
      .gte('תאריך', dates[0])
      .lte('תאריך', dates[dates.length - 1])
      .limit(10_000);
    if (error) {
      console.error('[sync-morning] manual rows read failed', { code: error.code });
      return NextResponse.json({ error: 'הסנכרון נכשל' }, { status: 500 });
    }
    for (const r of data ?? []) manualKeys.add(manualKey(r as never));
  }

  const { data: suppliers } = await supabase.from('ספקים').select('id, שם_ספק');
  const supplierByName = new Map<string, string>();
  for (const s of (suppliers ?? []) as { id: string; שם_ספק: string }[]) supplierByName.set(norm(s.שם_ספק), s.id);

  type Status = 'new' | 'synced' | 'manual-duplicate';
  const preview = mapped.map(m => {
    const status: Status = existingIds.has(m.מזהה_חיצוני) ? 'synced' : manualKeys.has(manualKey(m)) ? 'manual-duplicate' : 'new';
    return { ...m, status };
  });
  const toAdd = preview.filter(p => p.status === 'new');
  const counts = {
    fetched: raw.length,
    new: toAdd.length,
    synced: preview.filter(p => p.status === 'synced').length,
    manualDuplicate: preview.filter(p => p.status === 'manual-duplicate').length,
    skipped: skipped.length,
    newTotal: round2(toAdd.reduce((t, p) => t + p.סכום, 0)),
  };

  if (dryRun) {
    return NextResponse.json({ dryRun: true, counts, preview: preview.slice(0, 1000), skipped });
  }

  // 4. Insert the new ones.
  let inserted = 0;
  const rows = toAdd.map(({ status: _status, ...m }) => ({
    ...m,
    ספק_id: m.שם_ספק ? supplierByName.get(norm(m.שם_ספק)) ?? null : null,
    נוצר_על_ידי: auth.email ?? null,
  }));
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const { error } = await supabase.from('הוצאות').insert(batch);
    if (!error) { inserted += batch.length; continue; }
    if (error.code !== '23505') {
      console.error('[sync-morning] insert failed', { code: error.code, batchStart: i });
      return NextResponse.json({ error: `הסנכרון נעצר אחרי ${inserted} הוצאות. אפשר להריץ שוב — מה שכבר נקלט לא יוכפל.` }, { status: 500 });
    }
    // A parallel sync inserted some of these — add one by one, skipping duplicates.
    for (const row of batch) {
      const r = await supabase.from('הוצאות').insert(row);
      if (!r.error) inserted++;
      else if (r.error.code !== '23505') {
        console.error('[sync-morning] row insert failed', { code: r.error.code });
        return NextResponse.json({ error: `הסנכרון נעצר אחרי ${inserted} הוצאות. אפשר להריץ שוב.` }, { status: 500 });
      }
    }
  }

  console.log('[sync-morning] done', { fromDate, toDate, fetched: raw.length, inserted, synced: counts.synced, manualDuplicate: counts.manualDuplicate, skipped: skipped.length });
  return NextResponse.json({ dryRun: false, counts: { ...counts, inserted }, skipped });
}
