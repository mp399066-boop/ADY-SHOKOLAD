// Server-side validation for manual income writes (/api/finance/manual-income*).
import { z } from 'zod';
import { round2 } from '@/lib/finance';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך לא תקין').refine(s => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}, 'תאריך לא תקין');

const optText = (max: number) =>
  z.string().trim().max(max).optional().nullable().transform(v => (v ? v : null));

const money = z.coerce.number().finite().min(0, 'סכום לא יכול להיות שלילי').max(100_000_000).transform(round2);

export const manualIncomeInputSchema = z.object({
  תאריך:       isoDate,
  שם_לקוח:     optText(200),
  קטגוריה:     z.string().trim().min(1, 'קטגוריה היא שדה חובה').max(100),
  תיאור:       optText(500),
  סכום:        money.refine(n => n > 0, 'סכום חייב להיות גדול מ-0'),
  מעמ:         money.default(0),
  מספר_מסמך:   optText(100),
  אמצעי_תשלום: optText(100),
  שולם:        z.boolean().default(true),
  הערות:       optText(1000),
}).refine(e => e.מעמ <= e.סכום, { message: 'המע"מ לא יכול להיות גדול מהסכום', path: ['מעמ'] });

export const MANUAL_INCOME_COLUMNS =
  'id, תאריך, שם_לקוח, קטגוריה, תיאור, סכום, מעמ, מספר_מסמך, אמצעי_תשלום, שולם, הערות, תאריך_יצירה';

export const MANUAL_INCOME_MIGRATION_HINT =
  'טבלת ההכנסות הידניות עדיין לא קיימת. יש להריץ את מיגרציה 063 (supabase/migrations/063_manual_income.sql) ב-Supabase SQL Editor.';
