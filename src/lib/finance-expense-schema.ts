// Server-side validation for expense writes (/api/finance/expenses*).
import { z } from 'zod';
import { round2 } from '@/lib/finance';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך לא תקין').refine(s => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}, 'תאריך לא תקין');

const optText = (max: number) =>
  z.string().trim().max(max).optional().nullable().transform(v => (v ? v : null));

const money = z.coerce.number().finite().min(0, 'סכום לא יכול להיות שלילי').max(100_000_000).transform(round2);

export const expenseInputSchema = z.object({
  תאריך:       isoDate,
  ספק_id:      z.string().uuid().optional().nullable().transform(v => v ?? null),
  שם_ספק:      optText(200),
  קטגוריה:     z.string().trim().min(1, 'קטגוריה היא שדה חובה').max(100),
  תיאור:       optText(500),
  סכום:        money.refine(n => n > 0, 'סכום חייב להיות גדול מ-0'),
  מעמ:         money.default(0),
  מספר_מסמך:   optText(100),
  אמצעי_תשלום: optText(100),
  הערות:       optText(1000),
}).refine(e => e.מעמ <= e.סכום, { message: 'המע"מ לא יכול להיות גדול מהסכום', path: ['מעמ'] });

export type ExpenseInput = z.infer<typeof expenseInputSchema>;

export const EXPENSES_MIGRATION_HINT =
  'טבלת ההוצאות עדיין לא קיימת. יש להריץ את מיגרציה 057 (supabase/migrations/057_expenses.sql) ב-Supabase SQL Editor.';

/** True when PostgREST/Postgres says the table doesn't exist yet. */
export function isMissingTable(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  return error.code === '42P01' || error.code === 'PGRST205' ||
    /could not find the table|relation .* does not exist/i.test(error.message ?? '');
}
