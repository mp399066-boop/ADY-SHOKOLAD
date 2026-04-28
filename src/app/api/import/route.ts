export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

const TABLE_MAP: Record<string, string> = {
  לקוחות: 'לקוחות',
  הזמנות: 'הזמנות',
  'מוצרים למכירה': 'מוצרים_למכירה',
  מארזים: 'מארזים',
  'סוגי פטיפורים': 'סוגי_פטיפורים',
  מלאי: 'מלאי_חומרי_גלם',
  מתכונים: 'מתכונים',
  משלוחים: 'משלוחים',
  חשבוניות: 'חשבוניות',
};

// Writable columns per table — excludes auto-generated id, תאריך_יצירה, תאריך_עדכון
// NOTE: מוצרים_למכירה does NOT have כמות_במלאי (only כמות_במארז)
const TABLE_SCHEMA: Record<string, Set<string>> = {
  לקוחות: new Set([
    'שם_פרטי', 'שם_משפחה', 'טלפון', 'אימייל',
    'סוג_לקוח', 'סטטוס_לקוח', 'מקור_הגעה', 'אחוז_הנחה', 'הערות',
  ]),
  הזמנות: new Set([
    'מספר_הזמנה', 'לקוח_id', 'ארכיון', 'סטטוס_הזמנה',
    'הזמנה_דחופה', 'תאריך_הזמנה', 'תאריך_אספקה', 'שעת_אספקה', 'סוג_אספקה',
    'שם_מקבל', 'טלפון_מקבל', 'כתובת_מקבל_ההזמנה', 'עיר', 'הוראות_משלוח',
    'דמי_משלוח', 'אופן_תשלום', 'סטטוס_תשלום', 'סכום_לפני_הנחה', 'סכום_הנחה',
    'סך_הכל_לתשלום', 'מקור_ההזמנה', 'ברכה_טקסט', 'הערות_להזמנה',
  ]),
  מוצרים_למכירה: new Set([
    'שם_מוצר', 'סוג_מוצר', 'מחיר', 'פעיל',
    'האם_צריך_בחירת_פטיפורים', 'כמות_במארז', 'תיאור', 'תמונה_url',
  ]),
  מארזים: new Set([
    'שם_מארז', 'גודל_מארז', 'כמה_סוגים_מותר_לבחור', 'מחיר_מארז', 'פעיל', 'הערות',
  ]),
  סוגי_פטיפורים: new Set([
    'שם_פטיפור', 'פעיל', 'כמות_במלאי', 'הערות',
  ]),
  מלאי_חומרי_גלם: new Set([
    'שם_חומר_גלם', 'כמות_במלאי', 'יחידת_מידה',
    'סף_מלאי_נמוך', 'סף_מלאי_קריטי', 'סטטוס_מלאי', 'מחיר_ליחידה', 'תאריך_תפוגה', 'הערות',
  ]),
  מתכונים: new Set([
    'שם_מתכון', 'מוצר_id', 'כמות_תוצר', 'הערות',
  ]),
  משלוחים: new Set([
    'הזמנה_id', 'סטטוס_משלוח', 'שם_שליח', 'טלפון_שליח',
    'כתובת', 'עיר', 'הוראות_משלוח', 'תאריך_משלוח', 'שעת_משלוח', 'הערות',
  ]),
  חשבוניות: new Set([
    'הזמנה_id', 'לקוח_id', 'מספר_חשבונית', 'קישור_חשבונית', 'סכום', 'סטטוס',
  ]),
};

const REQUIRED_FIELDS: Record<string, string[]> = {
  לקוחות: ['שם_פרטי', 'שם_משפחה'],
  הזמנות: ['מספר_הזמנה', 'לקוח_id'],
  מוצרים_למכירה: ['שם_מוצר'],  // סוג_מוצר and מחיר have DB defaults
  מארזים: ['שם_מארז', 'גודל_מארז', 'כמה_סוגים_מותר_לבחור'],
  סוגי_פטיפורים: ['שם_פטיפור'],
  מלאי_חומרי_גלם: ['שם_חומר_גלם'],
  מתכונים: ['שם_מתכון'],
  משלוחים: ['הזמנה_id'],
  חשבוניות: ['הזמנה_id', 'לקוח_id', 'מספר_חשבונית', 'סכום'],
};

// Maps short/informal values to exact DB CHECK constraint values
const ENUM_NORMALIZERS: Record<string, Record<string, string>> = {
  סוג_מוצר: {
    'רגיל': 'מוצר רגיל',
    'מוצר': 'מוצר רגיל',
    'מוצר רגיל': 'מוצר רגיל',
    'מארז': 'מארז פטיפורים',
    'פטיפורים': 'מארז פטיפורים',
    'מארז פטיפורים': 'מארז פטיפורים',
  },
  סוג_לקוח: {
    'פרטי': 'פרטי',
    'חוזר': 'חוזר',
    'vip': 'VIP',
    'VIP': 'VIP',
    'מעצב': 'מעצב אירועים',
    'מעצב אירועים': 'מעצב אירועים',
  },
  סטטוס_הזמנה: {
    'חדשה': 'חדשה',
    'בהכנה': 'בהכנה',
    'מוכנה': 'מוכנה למשלוח',
    'מוכנה למשלוח': 'מוכנה למשלוח',
    'נשלחה': 'נשלחה',
    'הושלמה': 'הושלמה בהצלחה',
    'הושלמה בהצלחה': 'הושלמה בהצלחה',
    'בוטלה': 'בוטלה',
  },
};

// Safe fallback when ENUM value is null or not recognized in the map
const ENUM_SAFE_DEFAULTS: Record<string, string> = {
  סוג_מוצר: 'מוצר רגיל',
  סוג_לקוח: 'פרטי',
  סטטוס_הזמנה: 'חדשה',
};

// Field-level defaults applied AFTER coercion for NOT NULL columns with DB defaults
const FIELD_DEFAULTS: Record<string, Record<string, unknown>> = {
  מוצרים_למכירה: {
    סוג_מוצר: 'מוצר רגיל',
    מחיר: 0,
    פעיל: true,
    האם_צריך_בחירת_פטיפורים: false,
  },
};

const NUMERIC_FIELDS = new Set([
  'אחוז_הנחה', 'מחיר', 'כמות_במארז', 'כמות_במלאי', 'גודל_מארז',
  'כמה_סוגים_מותר_לבחור', 'מחיר_מארז', 'סף_מלאי_נמוך', 'סף_מלאי_קריטי',
  'מחיר_ליחידה', 'כמות_תוצר', 'דמי_משלוח', 'סכום_לפני_הנחה', 'סכום_הנחה',
  'סך_הכל_לתשלום', 'סכום',
]);

const BOOLEAN_FIELDS = new Set([
  'פעיל', 'האם_צריך_בחירת_פטיפורים', 'הזמנה_דחופה', 'ארכיון',
]);

const DATE_FIELDS = new Set([
  'תאריך_הזמנה', 'תאריך_אספקה', 'תאריך_תפוגה', 'תאריך_משלוח',
]);

function coerceValue(key: string, raw: unknown): unknown {
  if (raw === null || raw === undefined) return null;

  // Excel Date objects from xlsx library
  if (raw instanceof Date) {
    if (DATE_FIELDS.has(key)) return raw.toISOString().split('T')[0];
    return raw.toISOString();
  }

  // Excel serial number for dates
  if (typeof raw === 'number' && DATE_FIELDS.has(key)) {
    const date = new Date((raw - 25569) * 86400 * 1000);
    return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
  }

  if (typeof raw === 'boolean') {
    if (BOOLEAN_FIELDS.has(key)) return raw;
    return null;
  }

  if (typeof raw === 'number') {
    if (NUMERIC_FIELDS.has(key)) return raw;
    return String(raw);
  }

  const str = String(raw).trim();
  if (str === '') return null;

  if (BOOLEAN_FIELDS.has(key)) {
    if (['true', '1', 'כן', 'yes'].includes(str.toLowerCase())) return true;
    if (['false', '0', 'לא', 'no'].includes(str.toLowerCase())) return false;
    return null;
  }

  if (NUMERIC_FIELDS.has(key)) {
    const num = parseFloat(str.replace(/[₪,\s]/g, ''));
    return isNaN(num) ? null : num;
  }

  if (ENUM_NORMALIZERS[key]) {
    const normalizedStr = str.replace(/\s+/g, ' ');
    const mapped = ENUM_NORMALIZERS[key][normalizedStr] ?? ENUM_NORMALIZERS[key][str];
    if (mapped) return mapped;
    // Value not in map — use safe default to avoid CHECK constraint violation
    const safeDefault = ENUM_SAFE_DEFAULTS[key];
    console.warn(`[Import] ENUM fallback: שדה="${key}" ערך="${str}" → ברירת מחדל="${safeDefault}"`);
    return safeDefault ?? str;
  }

  if (DATE_FIELDS.has(key)) {
    const parsed = new Date(str);
    return isNaN(parsed.getTime()) ? null : parsed.toISOString().split('T')[0];
  }

  return str;
}

export async function POST(req: NextRequest) {
  const supabase = createAdminClient();
  const body = await req.json();
  const { entity, rows } = body;

  if (!entity || !rows?.length) {
    return NextResponse.json({ error: 'ישות ושורות הן חובה' }, { status: 400 });
  }

  const tableName = TABLE_MAP[entity];
  if (!tableName) {
    return NextResponse.json({ error: `סוג ישות לא ידוע: "${entity}"` }, { status: 400 });
  }

  const allowedCols = TABLE_SCHEMA[tableName];
  const requiredFields = REQUIRED_FIELDS[tableName] ?? [];

  let added = 0;
  const failed: { row: number; error: string }[] = [];

  console.log(`[Import] ══ התחלת ייבוא ══ טבלה: ${tableName} | שורות: ${rows.length}`);

  for (let i = 0; i < rows.length; i++) {
    const rawRow = rows[i] as Record<string, unknown>;
    const rowNum = i + 1;

    // 1. Normalize keys: spaces → underscores
    const normalized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rawRow)) {
      normalized[k.trim().replace(/ /g, '_')] = v;
    }

    // 2. Keep only columns that exist in this table's schema
    const filtered: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(normalized)) {
      if (allowedCols.has(k)) filtered[k] = v;
    }

    // 3. Coerce types (empty string → null, numbers, booleans, dates)
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(filtered)) {
      payload[k] = coerceValue(k, v);
    }

    // 4a. Apply field-level defaults for NOT NULL columns that coerced to null
    const tableDefaults = FIELD_DEFAULTS[tableName] ?? {};
    for (const [field, defaultVal] of Object.entries(tableDefaults)) {
      if (payload[field] === null || payload[field] === undefined) {
        payload[field] = defaultVal;
      }
    }

    console.log(`[Import] שורה ${rowNum} — טבלה: ${tableName} — payload לפני הכנסה:`, JSON.stringify(payload));

    // 4b. Validate required fields
    const missing = requiredFields.filter(f => payload[f] === null || payload[f] === undefined);
    if (missing.length > 0) {
      failed.push({ row: rowNum, error: `חסר שדה חובה: ${missing.join(', ')}` });
      continue;
    }

    // 5. Insert
    const { error } = await (supabase as any)
      .from(tableName)
      .insert(payload);

    if (error) {
      const detail = [
        error.message,
        error.details,
        error.hint,
        (error as any).constraint ? `constraint: ${(error as any).constraint}` : null,
        (error as any).column ? `column: ${(error as any).column}` : null,
      ].filter(Boolean).join(' | ');
      console.error(`[Import] ✗ שורה ${rowNum} נכשלה — ${detail}`, '\npayload:', JSON.stringify(payload));
      failed.push({ row: rowNum, error: detail });
    } else {
      added++;
    }
  }

  console.log(`[Import] ══ סיום ══ נוספו: ${added} | נכשלו: ${failed.length}`);

  return NextResponse.json({
    data: { added, updated: 0, failed: failed.length, errors: failed },
  });
}
