// Allowlists for PATCH on catalog/stock rows: raw materials, products for
// sale and petit-four types. Unknown keys (id, timestamps, computed סטטוס_מלאי,
// joined objects that a client sends back with the whole row) are stripped, so
// the update only ever touches editable columns. Absent keys stay absent —
// a partial PATCH never resets other fields.
import { z } from 'zod';

// Numbers may arrive as numeric strings (Postgres numeric round-trips as text),
// but never coerce null/'' into 0 — that would silently zero a stock count.
const numeric = (msg: string) => z.preprocess(
  v => (typeof v === 'string' && v.trim() !== '' ? Number(v) : v),
  z.number({ invalid_type_error: msg }).finite(msg),
);
const qty = numeric('כמות לא תקינה').pipe(z.number().min(0, 'כמות לא יכולה להיות שלילית').max(10_000_000));
const optQty = z.union([z.null(), qty]);
const price = numeric('מחיר לא תקין').pipe(z.number().min(0, 'מחיר לא יכול להיות שלילי').max(1_000_000));
const money = z.union([z.null(), price]);
const name = (label: string) => z.string().trim().min(1, `${label} הוא שדה חובה`).max(200);
const optText = (max: number) => z.union([z.null(), z.string().trim().max(max)]);
const optUuid = z.union([z.null(), z.literal(''), z.string().uuid()]);
const optDate = z.union([z.null(), z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'תאריך לא תקין')]);

export const rawMaterialPatchSchema = z.object({
  שם_חומר_גלם:      name('שם חומר גלם'),
  כמות_במלאי:       qty,
  יחידת_מידה:       z.string().trim().min(1, 'יחידת מידה היא שדה חובה').max(30),
  סף_מלאי_נמוך:     qty,
  סף_מלאי_קריטי:    qty,
  מחיר_ליחידה:      money,
  תאריך_תפוגה:      optDate,
  הערות:            optText(2000),
  ספק_מועדף_id:     optUuid,
  שם_מוצר_אצל_הספק: optText(200),
  מקט_ספק:          optText(100),
  כמות_מינימום:     qty,
  כמות_להזמנה:      optQty,
  יחידת_קניה:       optText(30),
  הערות_רכש:        optText(1000),
}).partial();

export const productPatchSchema = z.object({
  שם_מוצר:                  name('שם מוצר'),
  סוג_מוצר:                 z.enum(['מוצר רגיל', 'מארז פטיפורים']),
  מחיר:                     price,
  פעיל:                     z.boolean(),
  האם_צריך_בחירת_פטיפורים:  z.boolean(),
  לקוחות_עסקיים_בלבד:       z.boolean(),
  כמות_במארז:               optQty,
  כמות_במלאי:               qty,
  סף_מלאי_נמוך:             qty,
  סף_מלאי_קריטי:            qty,
  sku:                      optText(50),
  תיאור:                    optText(2000),
  תמונה_url:                optText(1000),
  price_availability:       optText(30),
  בהזמנה_מראש:              z.boolean(),
  קטגוריית_מוצר:            optText(50),
}).partial();

export const petitFourPatchSchema = z.object({
  שם_פטיפור:      name('שם פטיפור'),
  פעיל:           z.boolean(),
  כמות_במלאי:     qty,
  סף_מלאי_נמוך:   qty,
  סף_מלאי_קריטי:  qty,
  בהזמנה_מראש:    z.boolean(),
  הערות:          optText(2000),
}).partial();

export const customerPatchSchema = z.object({
  שם_פרטי:      name('שם פרטי'),
  שם_משפחה:     optText(100),
  טלפון:        optText(30),
  אימייל:       optText(200),
  מספר_זהות:    optText(20),
  סוג_לקוח:     z.string().trim().min(1).max(30),
  סטטוס_לקוח:   optText(30),
  מקור_הגעה:    optText(100),
  אחוז_הנחה:    z.union([z.null(), numeric('אחוז הנחה לא תקין').pipe(z.number().min(0, 'אחוז הנחה לא יכול להיות שלילי').max(100, 'אחוז הנחה עד 100'))]),
  הערות:        optText(2000),
  כתובת:        optText(500),
  עיר:          optText(100),
  הערות_כתובת:  optText(500),
  פטור_ממעמ:    z.boolean(),
}).partial();

const optIso = z.union([z.null(), z.string().max(40).refine(v => !Number.isNaN(Date.parse(v)), 'תאריך לא תקין')]);

export const deliveryPatchSchema = z.object({
  סטטוס_משלוח:      z.enum(['ממתין', 'נאסף', 'נמסר']),
  courier_id:       optUuid,
  תאריך_משלוח:      optDate,
  שעת_משלוח:        optText(20),
  כתובת:            optText(500),
  עיר:              optText(100),
  הוראות_משלוח:     optText(1000),
  הערות:            optText(2000),
  delivered_at:     optIso,
  whatsapp_sent_at: optIso,
}).partial();

// NOT NULL text columns — an emptied value is stored as '' rather than null.
const KEEP_EMPTY_STRING = new Set(['שם_חומר_גלם', 'שם_מוצר', 'שם_פטיפור', 'שם_פרטי', 'שם_משפחה']);

/**
 * Parses a PATCH body against one of the schemas above. Empty strings in
 * nullable text/uuid/date fields become null. Returns the clean update or a
 * Hebrew error message.
 */
export function parseCatalogPatch(
  schema: z.AnyZodObject,
  body: unknown,
): { data: Record<string, unknown> } | { error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'בקשה לא תקינה' };
  // A client that sends back the whole row may carry null in a NOT NULL
  // column; treat that as "not provided" rather than failing the whole save.
  const input: Record<string, unknown> = { ...(body as Record<string, unknown>) };
  for (const [k, v] of Object.entries(input)) {
    const field = schema.shape[k] as z.ZodTypeAny | undefined;
    if (v === null && field && !field.safeParse(null).success) delete input[k];
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' };
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed.data as Record<string, unknown>)) {
    if (v === undefined) continue;
    data[k] = v === '' && !KEEP_EMPTY_STRING.has(k) ? null : v;
  }
  if (Object.keys(data).length === 0) return { error: 'אין שדות לעדכון' };
  return { data };
}
