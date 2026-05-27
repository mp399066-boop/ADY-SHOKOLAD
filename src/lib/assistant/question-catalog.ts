// ============================================================================
// Question Catalog — the assistant's "knowledge base" of recognised questions.
//
// Single source of truth for what the assistant knows how to answer. Each
// entry maps one or more Hebrew phrasings to a concrete ParsedIntent.
//
// Two consumers use this file:
//
//   1. parser.ts — runs `matchCatalog(text)` before its keyword-based routing
//      so a phrase listed here is recognised verbatim even if the keyword
//      rules would have routed it elsewhere.
//
//   2. registry.ts — runs `suggestFromCatalog(text)` when the parser returns
//      `unknown`. Returns the 3-5 catalog entries with the most Hebrew-word
//      overlap with the input, so the fallback message can show specific,
//      relevant "did you mean…" options instead of a generic list.
//
// No LLM, no external calls. Pure data + small token-overlap scorer.
// ============================================================================

import type { ParsedIntent, CustomerActivityScope, Range } from './types';

export type CatalogCategory =
  | 'orders'
  | 'revenue'
  | 'customers'
  | 'products'
  | 'inventory'
  | 'deliveries'
  | 'reports'
  | 'system'
  | 'production'
  | 'summary'
  // chitchat is intentionally hidden from the public help view (catalogGrouped
  // skips it) — these phrases are just conversational glue, not "questions
  // the operator wants answers to".
  | 'chitchat';

export const CATEGORY_LABEL_HE: Record<CatalogCategory, string> = {
  orders:     'הזמנות',
  revenue:    'כספים',
  customers:  'לקוחות',
  products:   'מוצרים',
  inventory:  'מלאי',
  deliveries: 'משלוחים',
  reports:    'דוחות',
  system:     'תקלות מערכת',
  production: 'ייצור / יומיומי',
  summary:    'תמונת מצב',
  chitchat:   'שיחה',
};

export interface CatalogEntry {
  // One or more triggering phrasings. The catalog matcher checks each one
  // as a substring of the normalized user text. Keep variations realistic —
  // every entry here is an entry the assistant can actually answer.
  phrases: string[];
  // Either a static intent or a factory that can inspect the input. Factory
  // returning null = "phrase matched but I can't extract the parameter, fall
  // through to keyword parser".
  intent: ParsedIntent | ((normalizedText: string) => ParsedIntent | null);
  // Used by the fallback "did you mean…" UI to group suggestions.
  category: CatalogCategory;
  // Human-friendly button label shown in suggestions and the help view.
  label: string;
}

// Small helpers used by intent factories.
const TODAY: Range     = { kind: 'today' };
const TOMORROW: Range  = { kind: 'tomorrow' };
const WEEK: Range      = { kind: 'week' };
const MONTH: CustomerActivityScope = 'month';

export const QUESTION_CATALOG: CatalogEntry[] = [
  // ── Summary / snapshot ─────────────────────────────────────────────────
  {
    phrases: [
      'תני סיכום', 'סיכום של היום', 'תני לי סיכום של היום', 'סיכום היום',
      'תמונת מצב', 'תמונת מצב כללית', 'מה המצב היום', 'איך נראה היום',
      'סיכום יומי', 'מה קורה היום', 'מה יש לי היום', 'מה יום היום נראה',
      'מה המצב', 'מה חדש',
    ],
    intent: { type: 'daily_summary' },
    category: 'summary',
    label: 'תני לי סיכום של היום',
  },

  // ── Orders ─────────────────────────────────────────────────────────────
  {
    phrases: [
      'כמה הזמנות יש היום', 'כמה הזמנות להיום', 'כמה הזמנות יש לי היום',
      'כמה הזמנות היום', 'כמה הזמנות יש לי', 'כמה הזמנות נשארו היום',
      'כמה יש לי היום',
    ],
    intent: { type: 'count_orders', range: TODAY, filters: {} },
    category: 'orders',
    label: 'כמה הזמנות יש היום?',
  },
  {
    phrases: [
      'כמה הזמנות יש מחר', 'כמה הזמנות למחר', 'כמה הזמנות יש לי מחר',
      'כמה הזמנות מחר', 'כמה יש לי מחר', 'מה ההיקף של מחר',
    ],
    intent: { type: 'count_orders', range: TOMORROW, filters: {} },
    category: 'orders',
    label: 'כמה הזמנות יש מחר?',
  },
  {
    phrases: ['כמה הזמנות יש השבוע', 'כמה הזמנות יש לי השבוע', 'כמה הזמנות לשבוע'],
    intent: { type: 'count_orders', range: WEEK, filters: {} },
    category: 'orders',
    label: 'כמה הזמנות יש השבוע?',
  },
  {
    phrases: ['איזה הזמנות יש היום', 'אילו הזמנות יש היום', 'תראי הזמנות היום', 'הזמנות להיום'],
    intent: { type: 'find_orders', range: TODAY, filters: {} },
    category: 'orders',
    label: 'אילו הזמנות יש היום?',
  },
  {
    phrases: ['איזה הזמנות יש מחר', 'אילו הזמנות יש מחר', 'תראי הזמנות מחר', 'הזמנות למחר'],
    intent: { type: 'find_orders', range: TOMORROW, filters: {} },
    category: 'orders',
    label: 'אילו הזמנות יש מחר?',
  },
  {
    phrases: [
      'הזמנות דחופות', 'הזמנות הדחופות', 'מה הזמנות דחופות', 'תראי לי דחופות',
      'מה דחוף היום', 'מה דחוף', 'איזה הזמנות דחופות', 'מה צריך עכשיו',
      'מה ההזמנות הדחופות', 'תראי דחופות',
    ],
    intent: { type: 'find_orders', range: TODAY, filters: { urgentOnly: true } },
    category: 'orders',
    label: 'הזמנות דחופות להיום',
  },
  {
    phrases: [
      'הזמנות שלא שולמו', 'הזמנות לא שולמו', 'הזמנות שלא משולמות',
      'מי לא שילם', 'מי עוד לא שילם', 'מי חייב לי', 'מי חייבת לי', 'מי חייבים',
      'הזמנות חייבות', 'הזמנות בחוב', 'הזמנות במחיקה',
    ],
    intent: { type: 'find_orders', range: WEEK, filters: { unpaidOnly: true } },
    category: 'orders',
    label: 'הזמנות שעוד לא שולמו',
  },
  {
    phrases: ['הזמנות לאיסוף', 'הזמנות לאיסוף עצמי', 'איזה הזמנות לאיסוף', 'מי בא לאסוף היום'],
    intent: { type: 'find_orders', range: TODAY, filters: { pickupOnly: true } },
    category: 'orders',
    label: 'הזמנות לאיסוף עצמי היום',
  },
  {
    phrases: ['הזמנות למשלוח', 'הזמנות שצריך לשלוח', 'איזה משלוחים יש היום'],
    intent: { type: 'find_orders', range: TODAY, filters: { deliveryOnly: true } },
    category: 'orders',
    label: 'הזמנות למשלוח היום',
  },

  // ── Revenue ────────────────────────────────────────────────────────────
  {
    phrases: [
      'כמה הכנסתי החודש', 'מה ההכנסות החודש', 'הכנסות החודש', 'מכירות החודש',
      'כמה כסף נכנס החודש', 'סך מכירות החודש', 'כמה הרווחתי החודש',
      'מה ההכנסה החודש', 'כמה הכנסתי', 'מחזור החודש',
    ],
    intent: { type: 'revenue_query', scope: 'month' },
    category: 'revenue',
    label: 'מה ההכנסות החודש?',
  },
  {
    phrases: ['כמה הכנסתי היום', 'הכנסות היום', 'כמה כסף נכנס היום', 'מכירות היום'],
    intent: { type: 'revenue_query', scope: 'today' },
    category: 'revenue',
    label: 'כמה הכנסתי היום?',
  },
  {
    phrases: ['כמה הכנסתי השבוע', 'הכנסות השבוע', 'מכירות השבוע'],
    intent: { type: 'revenue_query', scope: 'week' },
    category: 'revenue',
    label: 'הכנסות השבוע',
  },
  {
    phrases: ['כמה כסף ממתין', 'כמה כסף עדיין ממתין', 'כמה חובות יש לי', 'כמה עוד חייבים לי', 'מה היתרה הפתוחה', 'כסף שלא שולם'],
    intent: { type: 'revenue_query', scope: 'pending' },
    category: 'revenue',
    label: 'כמה כסף ממתין לתשלום?',
  },

  // ── Customers ──────────────────────────────────────────────────────────
  {
    phrases: [
      'מי הלקוחות הכי פעילים', 'הלקוחות הכי פעילים',
      'מי הלקוחות הכי גדולים', 'מי הזמין הכי הרבה',
      'לקוחות מובילים', 'לקוחות vip', 'לקוחות VIP',
      'מי הלקוחות שמזמינים הכי הרבה', 'מי הקבועים שלי',
      'מי הלקוחות הטובים שלי', 'מי קונה הכי הרבה', 'מי מזמין הכי הרבה',
    ],
    intent: { type: 'customers_top', scope: MONTH },
    category: 'customers',
    label: 'מי הלקוחות הכי פעילים',
  },
  {
    phrases: [
      'לקוחות חדשים', 'לקוחה חדשה', 'לקוח חדש',
      'מי הלקוחות החדשים', 'כמה לקוחות חדשים יש',
      'לקוחות שהצטרפו לאחרונה', 'מי נרשם החודש',
      'מי הצטרף', 'איזה לקוחות חדשים', 'מי קונים חדשים',
    ],
    intent: { type: 'new_customers' },
    category: 'customers',
    label: 'לקוחות חדשים (30 ימים)',
  },
  {
    // Customer lookup needs to extract a name from the user text — handled
    // by the existing keyword parser via SYN_CUSTOMER_LOOKUP. We list the
    // common openers here so the catalog matcher recognises them, then the
    // factory returns null to defer name extraction to the parser.
    phrases: ['פרטים על הלקוח', 'פרטים על הלקוחה', 'תני פרטים על', 'מתי הזמינה'],
    intent: () => null,
    category: 'customers',
    label: 'פרטים על לקוח לפי שם',
  },

  // ── Products ───────────────────────────────────────────────────────────
  {
    phrases: [
      'המוצרים הכי נמכרים', 'מה המוצר הכי פופולרי',
      'איזה מוצרים נמכרים הכי הרבה', 'מה הכי נמכר', 'מה נמכר הכי הרבה',
      'טופ מוצרים', 'מוצרים מובילים', 'הכי פופולרי',
      'איזה מוצרים מובילים החודש', 'הלהיט של החודש',
    ],
    intent: { type: 'top_products', scope: MONTH },
    category: 'products',
    label: 'המוצרים הכי נמכרים החודש',
  },
  {
    phrases: ['איזה פטיפור הכי פופולרי', 'הפטיפור הכי פופולרי', 'איזה פטיפורים הכי נמכרים', 'הפטיפורים הכי נמכרים', 'איזה טעם הכי פופולרי'],
    intent: { type: 'top_petit_fours', scope: MONTH },
    category: 'products',
    label: 'הפטיפורים הכי נמכרים החודש',
  },
  {
    phrases: ['איזה סוגי פטיפורים יש', 'אילו סוגי פטיפורים יש', 'איזה פטיפורים יש לי', 'רשימת פטיפורים', 'סוגי פטיפורים'],
    intent: { type: 'list_petit_four_types' },
    category: 'products',
    label: 'אילו סוגי פטיפורים יש',
  },
  {
    phrases: ['איזה מארזים יש', 'אילו מארזים יש', 'רשימת מארזים', 'כל המארזים'],
    intent: { type: 'find_package', query: '' },
    category: 'products',
    label: 'אילו מארזים יש',
  },
  {
    phrases: ['איזה פטיפורים הוזמנו היום', 'אילו פטיפורים הוזמנו היום', 'מה הוזמן היום', 'פטיפורים שהוזמנו היום'],
    intent: { type: 'order_petit_four_summary', range: TODAY },
    category: 'production',
    label: 'אילו פטיפורים הוזמנו היום',
  },
  {
    phrases: ['איזה פטיפורים הוזמנו השבוע', 'אילו פטיפורים הוזמנו השבוע', 'פטיפורים שהוזמנו השבוע'],
    intent: { type: 'order_petit_four_summary', range: WEEK },
    category: 'production',
    label: 'פטיפורים שהוזמנו השבוע',
  },
  {
    phrases: ['כמה מארזים בהזמנות היום', 'כמה מארזים יש בהזמנות', 'כמה מגשי פטיפורים יש היום', 'כמה מגשים יש היום'],
    intent: { type: 'count_order_items_by_kind', range: TODAY, kind: 'מארז' },
    category: 'production',
    label: 'כמה מארזים בהזמנות היום',
  },

  // ── Inventory ──────────────────────────────────────────────────────────
  {
    phrases: [
      'מה במלאי נמוך', 'מה חסר במלאי', 'מה אזל', 'מה נגמר',
      'חוסרים במלאי', 'מלאי קריטי', 'מה מתקרב לסיום במלאי',
      'מה צריך להזמין', 'מה צריך לקנות', 'מה אזל לי',
      'איזה חומרים נגמרו', 'מה ברמה נמוכה',
    ],
    intent: { type: 'list_low_stock' },
    category: 'inventory',
    label: 'מה במלאי נמוך',
  },

  // ── Deliveries ─────────────────────────────────────────────────────────
  {
    phrases: [
      'משלוחים פתוחים', 'אילו משלוחים פתוחים', 'משלוחים שלא נמסרו',
      'משלוחים בדרך', 'משלוחים פעילים', 'מי השליחים',
      'איזה משלוחים בדרך', 'מי בדרך', 'מי השליחים עכשיו',
      'איפה המשלוחים', 'מה קורה במשלוחים', 'מי צריך לקבל משלוח',
    ],
    intent: { type: 'deliveries_open' },
    category: 'deliveries',
    label: 'אילו משלוחים עוד לא נמסרו',
  },

  // ── Reports ────────────────────────────────────────────────────────────
  {
    phrases: ['דוח הזמנות להיום', 'דוח להיום', 'דוח של היום', 'תני דוח להיום'],
    intent: { type: 'request_report_action', range: TODAY, filters: {} },
    category: 'reports',
    label: 'דוח הזמנות להיום',
  },
  {
    phrases: ['דוח הזמנות למחר', 'דוח למחר', 'דוח של מחר', 'תני דוח למחר'],
    intent: { type: 'request_report_action', range: TOMORROW, filters: {} },
    category: 'reports',
    label: 'דוח הזמנות למחר',
  },
  {
    phrases: ['דוח הזמנות לשבוע', 'דוח לשבוע', 'דוח שבועי', 'דוח לשבוע הקרוב'],
    intent: { type: 'request_report_action', range: WEEK, filters: {} },
    category: 'reports',
    label: 'דוח הזמנות לשבוע',
  },

  // ── System / errors ────────────────────────────────────────────────────
  {
    phrases: [
      'יש שגיאות', 'מה שגיאות', 'תראי לי שגיאות', 'תקלות במערכת',
      'מה לא עובד', 'מה נכשל', 'באגים', 'מה השתבש', 'איפה נכשל',
      'תקלות', 'בעיות במערכת', 'מה הבעיות', 'איפה הבעיות',
      'מה לא הצליח', 'מה נדחה',
    ],
    intent: { type: 'system_errors' },
    category: 'system',
    label: 'יש שגיאות במערכת?',
  },

  // ── Chitchat — conversational glue. Catches short social utterances so
  //     the assistant doesn't robotically reply "לא הבנתי" to "תודה" /
  //     "מצוין" / "היי". Each entry maps to a chitchat mood; registry picks
  //     one of several warm Hebrew replies at random. ───────────────────
  {
    phrases: ['תודה', 'תודה רבה', 'תודה לך', 'תודה רבה לך', 'thanks', 'thank you'],
    intent: { type: 'chitchat', mood: 'thanks' },
    category: 'chitchat',
    label: 'תודה',
  },
  {
    phrases: [
      'מצוין', 'מצויין', 'יפה', 'יופי', 'כל הכבוד', 'אחלה', 'מעולה',
      'אהבתי', 'נהדר', 'אדיר', 'סבבה', 'מושלם', 'פשוט מעולה',
    ],
    intent: { type: 'chitchat', mood: 'praise' },
    category: 'chitchat',
    label: 'מצוין',
  },
  {
    phrases: ['כן', 'נכון', 'בטח', 'אוקיי', 'בסדר', 'אוקי', 'אישור'],
    intent: { type: 'chitchat', mood: 'agree' },
    category: 'chitchat',
    label: 'כן',
  },
  {
    phrases: ['לא', 'לא נכון', 'לא תודה', 'לא צריך'],
    intent: { type: 'chitchat', mood: 'disagree' },
    category: 'chitchat',
    label: 'לא',
  },
  {
    phrases: ['היי', 'שלום', 'הי', 'בוקר טוב', 'ערב טוב', 'צהריים טובים', 'לילה טוב', 'הלו'],
    intent: { type: 'chitchat', mood: 'greeting' },
    category: 'chitchat',
    label: 'שלום',
  },
  {
    phrases: ['ביי', 'להתראות', 'נתראה', 'תודה ביי', 'סיימנו'],
    intent: { type: 'chitchat', mood: 'farewell' },
    category: 'chitchat',
    label: 'ביי',
  },
  {
    phrases: ['מה שלומך', 'מה נשמע', 'איך הולך', 'הכל בסדר'],
    intent: { type: 'chitchat', mood: 'how_are_you' },
    category: 'chitchat',
    label: 'מה שלומך',
  },
  {
    phrases: ['סליחה', 'סורי', 'סלחי', 'התנצלות'],
    intent: { type: 'chitchat', mood: 'apology' },
    category: 'chitchat',
    label: 'סליחה',
  },
];

// Phrase normalisation must mirror parser.ts:normalize() so a match here is
// guaranteed to match there too. Kept tiny on purpose.
function normalize(text: string): string {
  return text
    .replace(/[֑-ׇ]/g, '')
    .replace(/[?!.,;:"'״׳]/g, ' ')
    .replace(/(.)\1{2,}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

// First-pass exact match. Returns the intent of the first catalog entry
// whose phrase is found as a substring of the normalized input. Factory
// entries that return null defer to the keyword parser (same as a non-match).
export function matchCatalog(rawText: string): ParsedIntent | null {
  const text = normalize(rawText);
  if (!text) return null;
  for (const entry of QUESTION_CATALOG) {
    for (const phrase of entry.phrases) {
      const p = normalize(phrase);
      if (!p) continue;
      if (text === p || text.includes(p)) {
        if (typeof entry.intent === 'function') {
          const out = entry.intent(text);
          if (out) return out;
          // Factory bowed out — try the next entry / phrase instead of
          // declaring "no match" prematurely.
          continue;
        }
        return entry.intent;
      }
    }
  }
  return null;
}

// Token-overlap "did you mean…" scoring. Splits the input into Hebrew
// tokens, counts intersections with each catalog phrase's tokens, returns
// the top N entries.
//
// Pure heuristic — never returns more than `limit` items, and never returns
// any entry with zero shared tokens.
export function suggestFromCatalog(
  rawText: string,
  limit = 5,
): { label: string; text: string; category: CatalogCategory }[] {
  const text = normalize(rawText);
  if (!text) return [];

  const tokens = new Set(text.split(' ').filter(t => t.length >= 2));
  if (tokens.size === 0) return [];

  type Scored = { entry: CatalogEntry; phrase: string; score: number };
  const scored: Scored[] = [];

  for (const entry of QUESTION_CATALOG) {
    // Skip chitchat entries — "תודה" isn't a useful "did you mean" suggestion
    // for an unknown query.
    if (entry.category === 'chitchat') continue;

    let bestScore = 0;
    let bestPhrase = entry.phrases[0] || entry.label;
    for (const phrase of entry.phrases) {
      const pTokens = normalize(phrase).split(' ').filter(t => t.length >= 2);
      let s = 0;
      for (const t of pTokens) if (tokens.has(t)) s++;
      if (s > bestScore) { bestScore = s; bestPhrase = phrase; }
    }
    if (bestScore > 0) scored.push({ entry, phrase: bestPhrase, score: bestScore });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(s => ({
    label:    s.entry.label,
    text:     s.phrase,
    category: s.entry.category,
  }));
}

// Grouped catalog for the "what can you ask me?" help view. Order categories
// by likely usage frequency so the operator sees orders/summary first.
export function catalogGrouped(): { category: CatalogCategory; label: string; entries: CatalogEntry[] }[] {
  // chitchat is intentionally omitted — "תודה" / "היי" aren't browseable
  // help entries, they're conversational glue.
  const order: CatalogCategory[] = [
    'summary', 'orders', 'revenue', 'customers',
    'products', 'inventory', 'deliveries', 'production', 'reports', 'system',
  ];
  const byCat = new Map<CatalogCategory, CatalogEntry[]>();
  for (const e of QUESTION_CATALOG) {
    const list = byCat.get(e.category) || [];
    list.push(e);
    byCat.set(e.category, list);
  }
  return order
    .map(cat => ({ category: cat, label: CATEGORY_LABEL_HE[cat], entries: byCat.get(cat) || [] }))
    .filter(g => g.entries.length > 0);
}
