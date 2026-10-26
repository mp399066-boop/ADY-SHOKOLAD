// Price quotes (הצעות מחיר) — shared types, validation and money math.
// The totals follow the order rules (orders/create-full):
//   subtotal = Σ qty × unit price
//   discount = % of subtotal, or a fixed amount capped at the subtotal
//   total    = subtotal − discount + delivery fee
// For a business customer the amounts are before VAT (like orders); for
// everyone else they include VAT.

import { z } from 'zod';
import { round2, BUSINESS_CUSTOMER_TYPES } from '@/lib/finance';

export const QUOTE_STATUSES = ['טיוטה', 'נשלחה', 'בקשת שינוי', 'אושרה', 'נדחתה', 'הומרה להזמנה'] as const;
export type QuoteStatus = typeof QUOTE_STATUSES[number];

export type QuoteLineKind = 'מוצר' | 'מארז' | 'ידני';

export interface QuoteLine {
  סוג: QuoteLineKind;
  מוצר_id: string | null;
  גודל_מארז: number | null;
  שם: string;
  כמות: number;
  מחיר_ליחידה: number;
  הערה: string | null;
}

export interface Quote {
  id: string;
  מספר_הצעה: string;
  לקוח_id: string;
  סטטוס: QuoteStatus;
  פריטים: QuoteLine[];
  סוג_הנחה: 'ללא' | 'אחוז' | 'סכום';
  ערך_הנחה: number;
  דמי_משלוח: number;
  סכום_לפני_הנחה: number;
  סכום_הנחה: number;
  סך_הכל: number;
  תוקף_עד: string | null;
  תאריך_אספקה_מבוקש: string | null;
  הערות_ללקוח: string | null;
  הערות_פנימיות: string | null;
  טוקן: string;
  תאריך_שליחה: string | null;
  תאריך_אישור: string | null;
  שם_המאשר: string | null;
  /** What the customer asked to change, from the quote link (migration 074). */
  בקשת_שינוי?: string | null;
  תאריך_בקשת_שינוי?: string | null;
  הזמנה_id: string | null;
  תאריך_יצירה: string;
  תאריך_עדכון: string;
  לקוחות?: { id: string; שם_פרטי: string; שם_משפחה: string; טלפון: string | null; אימייל: string | null; סוג_לקוח: string | null; פטור_ממעמ: boolean | null } | null;
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך לא תקין');
const optDate = z.union([isoDate, z.literal(''), z.null()]).optional().transform(v => (v ? v : null));
const optText = (max: number) => z.string().trim().max(max, 'טקסט ארוך מדי').optional().nullable().transform(v => (v ? v : null));
const money = z.coerce.number().finite('מחיר לא תקין').min(0, 'מחיר לא יכול להיות שלילי').max(1_000_000, 'מחיר לא תקין');

export const quoteLineSchema = z.object({
  סוג: z.enum(['מוצר', 'מארז', 'ידני']),
  מוצר_id: z.string().uuid().optional().nullable().transform(v => v ?? null),
  גודל_מארז: z.coerce.number().int().positive().max(1000).optional().nullable().transform(v => v ?? null),
  שם: z.string().trim().max(200).optional().default(''),
  כמות: z.coerce.number().finite().gt(0, 'כמות חייבת להיות גדולה מ-0').max(100_000),
  מחיר_ליחידה: money,
  הערה: optText(500),
}).superRefine((l, ctx) => {
  if (l.סוג === 'מוצר' && !l.מוצר_id) ctx.addIssue({ code: 'custom', message: 'יש לבחור מוצר' });
  if (l.סוג === 'מארז' && !l.גודל_מארז) ctx.addIssue({ code: 'custom', message: 'יש לבחור גודל מארז' });
  if (l.סוג === 'ידני' && !l.שם) ctx.addIssue({ code: 'custom', message: 'יש לכתוב שם לפריט' });
});

export const quoteInputSchema = z.object({
  לקוח_id: z.string().uuid('יש לבחור לקוח'),
  פריטים: z.array(quoteLineSchema).min(1, 'יש להוסיף לפחות פריט אחד').max(80, 'יותר מדי פריטים'),
  סוג_הנחה: z.enum(['ללא', 'אחוז', 'סכום']).default('ללא'),
  ערך_הנחה: z.coerce.number().finite().min(0, 'הנחה לא יכולה להיות שלילית').max(1_000_000).default(0),
  דמי_משלוח: money.default(0),
  תוקף_עד: optDate,
  תאריך_אספקה_מבוקש: optDate,
  הערות_ללקוח: optText(2000),
  הערות_פנימיות: optText(2000),
}).refine(q => q.סוג_הנחה !== 'אחוז' || q.ערך_הנחה <= 100, { message: 'הנחה באחוזים לא יכולה לעלות על 100', path: ['ערך_הנחה'] });

export type QuoteInput = z.infer<typeof quoteInputSchema>;

export function lineTotal(l: Pick<QuoteLine, 'כמות' | 'מחיר_ליחידה'>): number {
  return round2((Number(l.כמות) || 0) * (Number(l.מחיר_ליחידה) || 0));
}

export function computeQuoteTotals(
  lines: Pick<QuoteLine, 'כמות' | 'מחיר_ליחידה'>[],
  discountType: 'ללא' | 'אחוז' | 'סכום',
  discountValue: number,
  shipping: number,
): { subtotal: number; discount: number; total: number } {
  const subtotal = round2(lines.reduce((s, l) => s + lineTotal(l), 0));
  const v = Math.max(0, Number(discountValue) || 0);
  const discount = discountType === 'אחוז' ? round2(subtotal * Math.min(v, 100) / 100)
    : discountType === 'סכום' ? round2(Math.min(subtotal, v))
    : 0;
  const total = round2(Math.max(0, subtotal - discount + Math.max(0, Number(shipping) || 0)));
  return { subtotal, discount, total };
}

/** Business customers see (and are quoted) pre-VAT amounts, like their orders. */
export function quoteIsPreVat(customerType: string | null | undefined, vatExempt: boolean | null | undefined): boolean {
  return !vatExempt && BUSINESS_CUSTOMER_TYPES.has(customerType ?? '');
}

/** Can the owner still edit the quote's content? */
export function quoteEditable(status: QuoteStatus): boolean {
  return status === 'טיוטה' || status === 'נשלחה' || status === 'בקשת שינוי' || status === 'נדחתה';
}

/** Can the customer approve it from the link? */
export function quoteApprovable(q: Pick<Quote, 'סטטוס' | 'תוקף_עד'>, today: string): boolean {
  if (q.סטטוס !== 'נשלחה' && q.סטטוס !== 'טיוטה') return false;
  return !q.תוקף_עד || q.תוקף_עד >= today;
}

/** Can the customer ask for changes from the link? Also after the quote expired —
 *  that is exactly when they need an updated one. */
export function quoteChangeRequestable(status: QuoteStatus): boolean {
  return status === 'טיוטה' || status === 'נשלחה' || status === 'בקשת שינוי';
}

export const changeRequestSchema = z.object({
  action: z.literal('request_change'),
  message: z.string().trim().min(2, 'נא לכתוב מה לשנות').max(2000, 'הבקשה ארוכה מדי'),
  name: z.string().trim().max(120).optional(),
});

export function generateQuoteNumber(now = new Date()): string {
  const y = String(now.getFullYear()).slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `Q-${y}${m}${d}-${Math.floor(Math.random() * 9000) + 1000}`;
}

/** Public link tokens: long random strings, base64url. */
export const PUBLIC_TOKEN_RE = /^[A-Za-z0-9_-]{24,64}$/;

export const QUOTE_STATUS_STYLE: Record<QuoteStatus, { bg: string; fg: string }> = {
  'טיוטה': { bg: '#F0EAE0', fg: '#7B604D' },
  'נשלחה': { bg: '#E8EEF5', fg: '#2A4E6B' },
  'בקשת שינוי': { bg: '#FBEFD9', fg: '#8A5A12' },
  'אושרה': { bg: '#EAF0E7', fg: '#2D6648' },
  'נדחתה': { bg: '#F0EAE8', fg: '#8A3228' },
  'הומרה להזמנה': { bg: '#FBF0E4', fg: '#7A4820' },
};
