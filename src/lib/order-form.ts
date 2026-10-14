// Public order form (טופס הזמנה ללקוחות) — validation shared by the form and
// the public API route. Client-safe (zod + pure helpers only).
import { z } from 'zod';
import { waNumber } from '@/lib/whatsapp';

export const ORDER_FORM_MAX_ITEMS = 30;

const text = (max: number) => z.string().trim().max(max, 'טקסט ארוך מדי').optional().transform(v => (v ? v : null));
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export const orderFormSchema = z.object({
  שם_מלא: z.string().trim().min(2, 'יש למלא שם מלא').max(80, 'השם ארוך מדי'),
  טלפון: z.string().trim().max(30).refine(v => waNumber(v) != null, 'מספר טלפון לא תקין'),
  אימייל: z.union([z.literal(''), z.string().trim().email('כתובת מייל לא תקינה').max(120)]).optional().transform(v => (v ? v : null)),
  פריטים: z.array(z.object({
    סוג: z.enum(['מוצר', 'מארז']),
    id: z.string().uuid(),
    כמות: z.coerce.number().int('כמות לא תקינה').min(1, 'כמות לא תקינה').max(500, 'כמות גדולה מדי — לכמויות גדולות אפשר לפנות אלינו'),
    הערה: text(200),
  })).min(1, 'יש לבחור לפחות מוצר אחד').max(ORDER_FORM_MAX_ITEMS, 'יותר מדי פריטים'),
  סוג_אספקה: z.enum(['משלוח', 'איסוף עצמי']),
  תאריך_אספקה: z.string().regex(isoDate, 'יש לבחור תאריך'),
  שם_מקבל: text(80),
  טלפון_מקבל: text(30),
  כתובת: text(200),
  עיר: text(80),
  ברכה: text(300),
  הערות: text(1000),
  // Spam guards: a hidden field people never fill, and when the form opened.
  website: z.string().max(200).optional(),
  startedAt: z.coerce.number().optional(),
}).superRefine((v, ctx) => {
  if (v.סוג_אספקה === 'משלוח') {
    if (!v.כתובת) ctx.addIssue({ code: 'custom', path: ['כתובת'], message: 'יש למלא כתובת למשלוח' });
    if (!v.עיר) ctx.addIssue({ code: 'custom', path: ['עיר'], message: 'יש למלא עיר למשלוח' });
  }
  if (v.טלפון_מקבל && waNumber(v.טלפון_מקבל) == null) {
    ctx.addIssue({ code: 'custom', path: ['טלפון_מקבל'], message: 'טלפון המקבל לא תקין' });
  }
});

export type OrderFormInput = z.infer<typeof orderFormSchema>;

/** First word → first name, the rest → last name. */
export function splitFullName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  return { first: parts[0] ?? '', last: parts.slice(1).join(' ') };
}

export const REQUEST_STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  'חדשה': { bg: '#FBF0E4', fg: '#7A4820' },
  'הומרה להזמנה': { bg: '#EAF0E7', fg: '#2D6648' },
  'נדחתה': { bg: '#F0EAE8', fg: '#8A3228' },
};
