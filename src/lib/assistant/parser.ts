// Hebrew keyword-based intent parser. Deterministic — no LLM.
// Maps free-text Hebrew to a registry intent. Synonyms grouped at top.
// Supports follow-ups when the previous intent is provided.

import type { ParsedIntent, Range, Filters, UnknownHint } from './types';

// ───── Synonym groups ─────────────────────────────────────────────────────

const SYN_REPORT     = ['דוח', 'דו"ח', 'דו״ח', 'דוחות'];

// Verbs that pin a report intent to download (file) vs send (email).
const SYN_REPORT_DOWNLOAD = [
  'תורידי', 'הורידי', 'תוריד', 'תוציאי', 'תוציא',
  'תביאי', 'תביא',
  // English fallbacks for safety
  'download',
];
const SYN_REPORT_SEND = [
  'שלחי', 'תשלחי', 'שלח', 'לשלוח',
  'במייל', 'למייל', 'באימייל', 'לאימייל',
];

// Lenient e-mail detector — first hit wins. Strips trailing punctuation.
const EMAIL_RE = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;
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
  'יש חוסרים', 'בעיות במלאי', 'בעיה במלאי',
];

// Follow-up phrases — only meaningful when there's a lastIntent
const FOLLOWUP_REPLACE = ['ומה עם', 'ומה ', 'מה לגבי', 'גם עם', 'וגם ', 'גם '];
const FOLLOWUP_REFINE  = ['רק '];

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
    .replace(/(.)\1{2,}/g, '$1')    // collapse runs of 3+ same chars (typo: 'אאאודם' → 'אודם')
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

// ───── Follow-up handling ─────────────────────────────────────────────────

function tryFollowUp(text: string, last: ParsedIntent): ParsedIntent | null {
  // "ומה עם X" / "מה לגבי X" / "גם X" → swap subject of the previous query
  const replacePrefix = FOLLOWUP_REPLACE.find(p => text.startsWith(p));
  if (replacePrefix) {
    const tail = text.slice(replacePrefix.length).trim();
    const subject = extractSubject(tail);
    if (subject.length < 2) return null;
    if (last.type === 'stock_query')           return { type: 'stock_query', query: subject };
    if (last.type === 'find_package')          return { type: 'find_package', query: subject };
    if (last.type === 'list_petit_four_types') return { type: 'stock_query', query: subject };
    return null;
  }

  // "רק הדחופות" / "רק לא שולמו" → refine filters on the previous orders query
  if (FOLLOWUP_REFINE.some(p => text.startsWith(p)) || text === 'רק') {
    const newFilters = detectFilters(text);
    if (!hasAnyFilter(newFilters)) return null;
    if (last.type === 'find_orders') {
      return { type: 'find_orders', range: last.range, filters: { ...last.filters, ...newFilters } };
    }
    if (last.type === 'count_orders') {
      return { type: 'count_orders', range: last.range, filters: { ...last.filters, ...newFilters } };
    }
    return null;
  }

  return null;
}

// ───── Main parser ────────────────────────────────────────────────────────

export function parseIntent(rawText: string, lastIntent?: ParsedIntent | null): ParsedIntent {
  const text = normalize(rawText);
  if (!text) return { type: 'unknown' };

  if (lastIntent) {
    const fu = tryFollowUp(text, lastIntent);
    if (fu) return fu;
  }

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
  // "דוח יומי" / "דוח להיום" / "תורידי דוח" / "שלחי דוח למייל X" etc.
  if (hasReport) {
    const range = detectRangeStrict(text);
    if (!range) return { type: 'request_report_range' };

    const filters = detectFilters(text);
    const wantsSend = includesAny(text, SYN_REPORT_SEND);
    const wantsDownload = includesAny(text, SYN_REPORT_DOWNLOAD);
    const emailMatch = text.match(EMAIL_RE);
    const recipientEmail = emailMatch ? emailMatch[1] : undefined;

    // Send wins when both verbs/cues appear (more specific intent — "שלחי
    // דוח להוריד" reads as "send"). Email in text → definitely send.
    if (wantsSend || recipientEmail) {
      return { type: 'send_orders_report', range, filters, recipientEmail };
    }
    if (wantsDownload) {
      return { type: 'download_orders_report', range, filters };
    }
    // Range known but action ambiguous — registry will offer both buttons.
    return { type: 'request_report_action', range, filters };
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

  // 8. Explicit range + show verb without other context → orders for that range
  // "תראי מה יש מחר", "תני לי מה יש היום"
  const explicitRange = detectRangeStrict(text);
  if (explicitRange && (hasShow || hasCount)) {
    return { type: 'find_orders', range: explicitRange, filters: {} };
  }

  // 9. Stock query — "כמה X", "יש X", "X במלאי", "איפה X"
  if (hasStockHint) {
    const subject = extractSubject(text);
    if (subject.length >= 2) return { type: 'stock_query', query: subject };
  }

  // 10. Smart unknown — pick the most useful suggestion bucket
  let hint: UnknownHint;
  if (hasReport)             hint = 'report';
  else if (hasPetitFour)     hint = 'petit_four';
  else if (hasPackage)       hint = 'package';
  else if (hasOrders)        hint = 'orders';
  else if (hasStockHint)     hint = 'stock';
  return { type: 'unknown', hint };
}
