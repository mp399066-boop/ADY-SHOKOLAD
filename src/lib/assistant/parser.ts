// Hebrew keyword-based intent parser. Deterministic — no LLM.
// Returns a ParsedIntent that maps 1:1 to a registry action (or 'unknown').

import type { ParsedIntent, Range, Filters } from './types';

const RANGE_TODAY    = ['היום', 'להיום'];
const RANGE_TOMORROW = ['מחר', 'למחר'];
const RANGE_WEEK     = ['השבוע', 'הקרוב', 'שבוע הקרוב'];

const URGENT   = ['דחוף', 'דחופ', 'בהול'];
const UNPAID   = ['לא שולמ', 'לא שילמ', 'חוב', 'ממתינ לתשלום'];
const DELIVERY = ['משלוח', 'משלוחים'];
const PICKUP   = ['איסוף'];

const COUNT_VERB   = ['כמה'];
const SHOW_VERB    = ['תראי', 'הראי', 'הצג', 'הציגי', 'איזה', 'תני', 'תוציא', 'הוצא'];
const STOCK_HINT   = ['יש', 'נשאר', 'במלאי', 'מלאי', 'איפה'];

const ORDERS_NOUN     = ['הזמנות', 'הזמנה'];
const PACKAGE_NOUN    = ['מארז', 'מארזים', 'חבילה', 'חבילות'];
const DELIVERIES_NOUN = ['משלוחים'];

const LOW_STOCK_PHRASES = [
  'מלאי נמוך', 'מלאי קריטי', 'נמוך במלאי', 'אזל', 'נגמר',
  'מה חסר', 'מה חוסר', 'חוסרים', 'מתקרב לסיום', 'נגמרים',
];

// Words to strip when extracting the "subject" from a stock question.
const STRIP_WORDS = [
  ...COUNT_VERB, ...SHOW_VERB, ...STOCK_HINT,
  ...RANGE_TODAY, ...RANGE_TOMORROW, ...RANGE_WEEK,
  ...URGENT, ...UNPAID, ...DELIVERY, ...PICKUP,
  'לי', 'את', 'אני', 'רוצה', 'צריכה', 'בבקשה', 'תוכלי',
];

function normalize(text: string): string {
  return text
    .replace(/[֑-ׇ]/g, '') // strip niqqud
    .replace(/[?!.,;:"'״׳]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesAny(text: string, words: string[]): boolean {
  return words.some(w => text.includes(w));
}

function detectRange(text: string): Range {
  if (includesAny(text, RANGE_TOMORROW)) return { kind: 'tomorrow' };
  if (includesAny(text, RANGE_WEEK))     return { kind: 'week' };
  if (includesAny(text, RANGE_TODAY))    return { kind: 'today' };

  const ymd = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return { kind: 'date', date: `${ymd[1]}-${ymd[2]}-${ymd[3]}` };

  const dmy = text.match(/\b(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?\b/);
  if (dmy) {
    const d = String(dmy[1]).padStart(2, '0');
    const m = String(dmy[2]).padStart(2, '0');
    let y = dmy[3] ? Number(dmy[3]) : new Date().getFullYear();
    if (y < 100) y += 2000;
    return { kind: 'date', date: `${y}-${m}-${d}` };
  }
  return { kind: 'today' };
}

function detectFilters(text: string): Filters {
  const isDelivery = includesAny(text, DELIVERY);
  const isPickup   = includesAny(text, PICKUP);
  return {
    urgentOnly:   includesAny(text, URGENT)  || undefined,
    unpaidOnly:   includesAny(text, UNPAID)  || undefined,
    deliveryOnly: (isDelivery && !isPickup)  || undefined,
    pickupOnly:   (isPickup && !isDelivery)  || undefined,
  };
}

function extractSubject(text: string): string {
  let q = ` ${text} `;
  for (const w of STRIP_WORDS) q = q.split(w).join(' ');
  for (const w of [...ORDERS_NOUN, ...PACKAGE_NOUN, ...DELIVERIES_NOUN]) q = q.split(w).join(' ');
  return q.replace(/\s+/g, ' ').trim();
}

export function parseIntent(rawText: string): ParsedIntent {
  const text = normalize(rawText);
  if (!text) return { type: 'unknown' };

  // 1. Low stock
  if (includesAny(text, LOW_STOCK_PHRASES)) {
    return { type: 'list_low_stock' };
  }

  const hasOrdersNoun  = includesAny(text, ORDERS_NOUN);
  const hasPackageNoun = includesAny(text, PACKAGE_NOUN);
  const hasCount       = includesAny(text, COUNT_VERB);
  const hasShow        = includesAny(text, SHOW_VERB);

  // 2. Orders intents
  if (hasOrdersNoun) {
    const range = detectRange(text);
    const filters = detectFilters(text);
    if (hasCount && !hasShow) return { type: 'count_orders', range, filters };
    return { type: 'find_orders', range, filters };
  }

  // 3. Packages — extract size or name
  if (hasPackageNoun) {
    const numMatch = text.match(/\b(\d{1,3})\b/);
    const query = numMatch ? numMatch[1] : extractSubject(text);
    return { type: 'find_package', query };
  }

  // 4. Stock query — "כמה X" / "יש X" / "X במלאי" / "איפה X"
  const hasStockHint = includesAny(text, STOCK_HINT) || hasCount;
  if (hasStockHint) {
    const subject = extractSubject(text);
    if (subject.length >= 2) return { type: 'stock_query', query: subject };
  }

  return { type: 'unknown' };
}
