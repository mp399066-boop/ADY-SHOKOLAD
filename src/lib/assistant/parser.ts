// Hebrew keyword-based intent parser. Deterministic — no LLM.
// Maps free-text Hebrew to a registry intent. Synonyms grouped at top.

import type { ParsedIntent, Range, Filters, UnknownHint } from './types';

// ───── Synonym groups ─────────────────────────────────────────────────────

const SYN_REPORT     = ['דוח', 'דו"ח', 'דוחות'];
const SYN_ORDERS     = ['הזמנות', 'הזמנה'];
const SYN_PACKAGE    = ['מארז', 'מארזים', 'חבילה', 'חבילות'];
const SYN_PETIT_FOUR = ['פטיפורים', 'פטיפור'];
const SYN_TRAY       = ['מגש', 'מגשי'];
const SYN_PRODUCT    = ['מוצר', 'מוצרים'];
const SYN_DELIVERY   = ['משלוח', 'משלוחים'];
const SYN_PICKUP     = ['איסוף'];

const SYN_TODAY      = ['היום', 'להיום', 'יומי', 'יומית'];
const SYN_TOMORROW   = ['מחר', 'למחר'];
const SYN_WEEK       = ['השבוע', 'שבוע הקרוב', 'השבוע הקרוב', 'הקרוב', 'שבוע'];

const SYN_URGENT     = ['דחוף', 'דחופ', 'בהול'];
const SYN_UNPAID     = ['לא שולמ', 'לא שילמ', 'חוב', 'חייב', 'ממתינ לתשלום', 'לא משולמ'];

const SYN_COUNT_VERB = ['כמה'];
const SYN_SHOW_VERB  = [
  'תראי', 'הראי', 'הצג', 'הציגי', 'איזה', 'אילו', 'אלו',
  'תני', 'תוציא', 'הוצא', 'תביא', 'תביאי', 'תן',
  'תורידי', 'הורידי', 'תוריד',
];
const SYN_NEED_VERB  = ['צריכה', 'צריך', 'רוצה', 'תוכלי', 'בבקשה'];
const SYN_STOCK_HINT = ['יש', 'נשאר', 'במלאי', 'מלאי', 'איפה', 'כמות'];

const SYN_TYPES_HINT  = ['סוגי', 'אילו סוגי', 'איזה סוגי', 'אלו סוגי'];
const SYN_FROM_ORDERS = ['בהזמנ', 'הוזמנ', 'מההזמנ', 'בהזמנות', 'בהזמנה'];

const SYN_LOW_STOCK = [
  'מלאי נמוך', 'מלאי קריטי', 'נמוך במלאי', 'אזל', 'נגמר',
  'מה חסר', 'מה חוסר', 'חוסרים', 'מתקרב לסיום', 'נגמרים', 'מה נגמר',
];

// Stripped from "subject" in stock queries
const STRIP_WORDS = [
  ...SYN_COUNT_VERB, ...SYN_SHOW_VERB, ...SYN_NEED_VERB, ...SYN_STOCK_HINT,
  ...SYN_TODAY, ...SYN_TOMORROW, ...SYN_WEEK,
  ...SYN_URGENT, ...SYN_UNPAID, ...SYN_DELIVERY, ...SYN_PICKUP,
  'לי', 'את', 'אני', 'מה', 'מסוג', 'סוגי', 'סוג',
];

// ───── Helpers ────────────────────────────────────────────────────────────

function normalize(text: string): string {
  return text
    .replace(/[֑-ׇ]/g, '')          // strip niqqud
    .replace(/[?!.,;:"'״׳]/g, ' ') // strip punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

function includesAny(text: string, words: string[]): boolean {
  return words.some(w => text.includes(w));
}

function detectRangeStrict(text: string): Range | null {
  if (includesAny(text, SYN_TOMORROW)) return { kind: 'tomorrow' };
  if (includesAny(text, SYN_WEEK))     return { kind: 'week' };
  if (includesAny(text, SYN_TODAY))    return { kind: 'today' };

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
  return null;
}

function detectRange(text: string): Range {
  return detectRangeStrict(text) || { kind: 'today' };
}

function detectFilters(text: string): Filters {
  const isDelivery = includesAny(text, SYN_DELIVERY);
  const isPickup   = includesAny(text, SYN_PICKUP);
  return {
    urgentOnly:   includesAny(text, SYN_URGENT) || undefined,
    unpaidOnly:   includesAny(text, SYN_UNPAID) || undefined,
    deliveryOnly: (isDelivery && !isPickup) || undefined,
    pickupOnly:   (isPickup && !isDelivery) || undefined,
  };
}

function hasAnyFilter(f: Filters): boolean {
  return Boolean(f.urgentOnly || f.unpaidOnly || f.deliveryOnly || f.pickupOnly);
}

function extractSubject(text: string): string {
  let q = ` ${text} `;
  for (const w of STRIP_WORDS) q = q.split(w).join(' ');
  for (const w of [
    ...SYN_ORDERS, ...SYN_PACKAGE, ...SYN_PETIT_FOUR, ...SYN_TRAY, ...SYN_PRODUCT, ...SYN_REPORT,
  ]) q = q.split(w).join(' ');
  return q.replace(/\s+/g, ' ').trim();
}

// ───── Main parser ────────────────────────────────────────────────────────

export function parseIntent(rawText: string): ParsedIntent {
  const text = normalize(rawText);
  if (!text) return { type: 'unknown' };

  const hasLowStock   = includesAny(text, SYN_LOW_STOCK);
  const hasReport     = includesAny(text, SYN_REPORT);
  const hasOrders     = includesAny(text, SYN_ORDERS);
  const hasPackage    = includesAny(text, SYN_PACKAGE);
  const hasPetitFour  = includesAny(text, SYN_PETIT_FOUR);
  const hasTray       = includesAny(text, SYN_TRAY);
  const hasFromOrders = includesAny(text, SYN_FROM_ORDERS);
  const hasTypes      = includesAny(text, SYN_TYPES_HINT);
  const hasCount      = includesAny(text, SYN_COUNT_VERB);
  const hasShow       = includesAny(text, SYN_SHOW_VERB);
  const hasStockHint  = includesAny(text, SYN_STOCK_HINT) || hasCount;

  // 1. Low stock — highest priority
  if (hasLowStock) return { type: 'list_low_stock' };

  // 2. Report intent
  // "דוח יומי", "דוח להיום", "תורידי דוח", "דוח" alone, etc.
  if (hasReport) {
    const range = detectRangeStrict(text);
    if (range) return { type: 'download_orders_report', range };
    return { type: 'request_report_range' };
  }

  // 3. Petit fours (catalog / search / from-orders)
  if (hasPetitFour) {
    if (hasTypes) return { type: 'list_petit_four_types' };
    if (hasFromOrders) return { type: 'order_petit_four_summary', range: detectRange(text) };
    const subject = extractSubject(text);
    if (subject.length >= 2) return { type: 'stock_query', query: subject };
    return { type: 'list_petit_four_types' };
  }

  // 4. Trays / packages-in-orders → count items by kind
  if (hasTray || (hasPackage && hasFromOrders)) {
    return { type: 'count_order_items_by_kind', range: detectRange(text), kind: 'מארז' };
  }

  // 5. Orders
  if (hasOrders) {
    const range = detectRange(text);
    const filters = detectFilters(text);
    if (hasCount && !hasShow) return { type: 'count_orders', range, filters };
    return { type: 'find_orders', range, filters };
  }

  // 6. Packages
  if (hasPackage) {
    const numMatch = text.match(/\b(\d{1,3})\b/);
    const query = numMatch ? numMatch[1] : extractSubject(text);
    return { type: 'find_package', query };
  }

  // 7. Filter-only signals — "מה דחוף היום", "מה לא שולם" → orders
  const filters = detectFilters(text);
  if (hasAnyFilter(filters)) {
    return { type: 'find_orders', range: detectRange(text), filters };
  }

  // 8. Stock query — "כמה X", "יש X", "X במלאי", "איפה X"
  if (hasStockHint) {
    const subject = extractSubject(text);
    if (subject.length >= 2) return { type: 'stock_query', query: subject };
  }

  // 9. Smart unknown — pick the most useful suggestion bucket
  let hint: UnknownHint;
  if (hasReport)             hint = 'report';
  else if (hasPetitFour)     hint = 'petit_four';
  else if (hasPackage)       hint = 'package';
  else if (hasOrders)        hint = 'orders';
  else if (hasStockHint)     hint = 'stock';
  return { type: 'unknown', hint };
}
