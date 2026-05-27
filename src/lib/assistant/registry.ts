// Action Registry — single source of truth for what the assistant can do.
// All 6 actions are read-only: no DB writes, no emails, no status changes.
// Each action returns AssistantResponse blocks that the UI renders directly.

import { createAdminClient } from '@/lib/supabase/server';
import { fetchOrdersForReport, resolveRange as resolveReportRange } from '@/lib/orders-report-email';
import { resolveEntity } from './entity-resolver';
import { suggestFromCatalog, catalogGrouped } from './question-catalog';
import type {
  AssistantResponse, Block, ClarifyOption, ListItem, OrderSummary,
  ParsedIntent, Range, Filters, Tone, UnknownHint, ChitchatMood,
} from './types';

const DEFAULT_SUGGESTIONS: ClarifyOption[] = [
  { label: 'כמה הזמנות יש היום?',           text: 'כמה הזמנות יש היום?' },
  { label: 'איזה סוגי פטיפורים קיימים?',    text: 'איזה סוגי פטיפורים קיימים?' },
  { label: 'איזה מארזים יש?',                text: 'איזה מארזים יש?' },
  { label: 'מה במלאי נמוך?',                 text: 'מה במלאי נמוך?' },
  { label: 'דוח הזמנות להיום',               text: 'דוח הזמנות להיום' },
];

// Follow-up suggestions shown after a successful answer.
// Picks 2-3 options that naturally extend the current intent.
function followUpsFor(intent: ParsedIntent): ClarifyOption[] {
  switch (intent.type) {
    case 'find_orders': {
      const r = rangeShort(intent.range);
      return [
        { label: 'הורידי דוח', text: `דוח הזמנות ${rangeLabel(intent.range)}` },
        ...(intent.filters.urgentOnly ? [] : [{ label: 'רק הדחופות', text: 'רק הדחופות' }]),
        ...(intent.filters.unpaidOnly ? [] : [{ label: 'רק שלא שולמו', text: 'רק שלא שולמו' }]),
        { label: `פטיפורים שהוזמנו ${r}`, text: `איזה פטיפורים הוזמנו ${r}?` },
      ].slice(0, 3);
    }
    case 'count_orders': {
      const r = rangeShort(intent.range);
      return [
        { label: 'הצגי את ההזמנות', text: `איזה הזמנות יש ${r}?` },
        { label: 'הורידי דוח', text: `דוח הזמנות ${rangeLabel(intent.range)}` },
      ];
    }
    case 'list_low_stock':
      return [
        { label: 'סוגי פטיפורים', text: 'איזה סוגי פטיפורים קיימים?' },
        { label: 'מה הוזמן היום?', text: 'איזה פטיפורים הוזמנו היום?' },
      ];
    case 'stock_query':
      return [
        { label: 'מה במלאי נמוך?',         text: 'מה במלאי נמוך?' },
        { label: 'סוגי פטיפורים',          text: 'איזה סוגי פטיפורים קיימים?' },
      ];
    case 'find_package':
      return [
        { label: 'כל המארזים',                  text: 'איזה מארזים יש?' },
        { label: 'מגשים בהזמנות היום',          text: 'כמה מגשי פטיפורים בהזמנות היום?' },
      ];
    case 'list_petit_four_types':
      return [
        { label: 'פטיפורים שהוזמנו היום', text: 'איזה פטיפורים הוזמנו היום?' },
        { label: 'מה במלאי נמוך?',          text: 'מה במלאי נמוך?' },
      ];
    case 'order_petit_four_summary': {
      const r = rangeShort(intent.range);
      return [
        { label: 'איזה הזמנות יש?',     text: `איזה הזמנות יש ${r}?` },
        { label: 'הורידי דוח',           text: `דוח הזמנות ${rangeLabel(intent.range)}` },
      ];
    }
    case 'count_order_items_by_kind': {
      const r = rangeShort(intent.range);
      return [
        { label: 'איזה הזמנות?',                 text: `איזה הזמנות יש ${r}?` },
        { label: `פטיפורים שהוזמנו ${r}`,        text: `איזה פטיפורים הוזמנו ${r}?` },
      ];
    }
    case 'revenue_query':
      return [
        { label: 'ממתין לתשלום',         text: 'כמה כסף עדיין ממתין לתשלום?' },
        { label: 'הכנסות החודש',          text: 'מה ההכנסות החודש?' },
        { label: 'תני סיכום של היום',     text: 'תני לי סיכום של היום' },
      ];
    case 'customers_top':
      return [
        { label: 'תני סיכום של היום',     text: 'תני לי סיכום של היום' },
        { label: 'מה במלאי נמוך?',         text: 'מה במלאי נמוך?' },
      ];
    case 'customer_lookup':
      return [
        { label: 'ההזמנות שלה',            text: `איזה הזמנות יש לה?` },
        { label: 'הלקוחות הכי פעילים',    text: 'מי הלקוחות הכי פעילים?' },
      ];
    case 'deliveries_open':
      return [
        { label: 'תני סיכום של היום',     text: 'תני לי סיכום של היום' },
        { label: 'הזמנות להיום',           text: 'איזה הזמנות יש היום?' },
      ];
    case 'daily_summary':
      return [
        { label: 'משלוחים פעילים',        text: 'אילו משלוחים עוד לא נמסרו?' },
        { label: 'ממתין לתשלום',          text: 'כמה כסף עדיין ממתין לתשלום?' },
        { label: 'מה במלאי נמוך?',         text: 'מה במלאי נמוך?' },
      ];
    case 'system_errors':
      return [
        { label: 'תני סיכום של היום',     text: 'תני לי סיכום של היום' },
        { label: 'מה במלאי נמוך?',         text: 'מה במלאי נמוך?' },
      ];
    case 'top_products':
      return [
        { label: 'הפטיפורים הכי נמכרים',  text: 'איזה פטיפור הכי פופולרי?' },
        { label: 'הלקוחות הכי פעילים',    text: 'מי הלקוחות הכי פעילים?' },
        { label: 'הכנסות החודש',          text: 'מה ההכנסות החודש?' },
      ];
    case 'top_petit_fours':
      return [
        { label: 'המוצרים הכי נמכרים',    text: 'איזה מוצרים הכי נמכרים?' },
        { label: 'מה במלאי נמוך?',         text: 'מה במלאי נמוך?' },
      ];
    case 'new_customers':
      return [
        { label: 'הלקוחות הכי פעילים',    text: 'מי הלקוחות הכי פעילים?' },
        { label: 'הכנסות החודש',          text: 'מה ההכנסות החודש?' },
      ];
    case 'download_orders_report':
    case 'send_orders_report':
    case 'request_report_action': {
      const r = rangeShort(intent.range);
      return [
        { label: 'איזה הזמנות?',         text: `איזה הזמנות יש ${r}?` },
        { label: `דחופות ${r}`,          text: `הזמנות דחופות ${r}` },
      ];
    }
    default:
      return [];
  }
}

function suggestionsFor(hint: UnknownHint): ClarifyOption[] {
  if (hint === 'report') return [
    { label: 'דוח הזמנות להיום',  text: 'דוח הזמנות להיום' },
    { label: 'דוח הזמנות למחר',   text: 'דוח הזמנות למחר' },
    { label: 'דוח הזמנות לשבוע',  text: 'דוח הזמנות לשבוע הקרוב' },
  ];
  if (hint === 'orders') return [
    { label: 'הזמנות להיום',           text: 'איזה הזמנות יש היום?' },
    { label: 'הזמנות למחר',            text: 'איזה הזמנות יש למחר?' },
    { label: 'הזמנות דחופות',          text: 'תראי הזמנות דחופות להיום' },
    { label: 'הזמנות שלא שולמו',       text: 'תראי הזמנות שלא שולמו' },
  ];
  if (hint === 'stock') return [
    { label: 'מה במלאי נמוך?',          text: 'מה במלאי נמוך?' },
    { label: 'סוגי פטיפורים',           text: 'איזה סוגי פטיפורים קיימים?' },
    { label: 'כמה עוגת גבינה יש?',      text: 'כמה עוגת גבינה יש במלאי?' },
  ];
  if (hint === 'petit_four') return [
    { label: 'סוגי פטיפורים',           text: 'איזה סוגי פטיפורים קיימים?' },
    { label: 'פטיפורים שהוזמנו היום',   text: 'איזה פטיפורים הוזמנו היום?' },
    { label: 'פטיפורים שהוזמנו השבוע',  text: 'איזה פטיפורים הוזמנו השבוע?' },
  ];
  if (hint === 'package') return [
    { label: 'כל המארזים',              text: 'איזה מארזים יש?' },
    { label: 'מארז של 24',              text: 'מארז של 24' },
    { label: 'מגשי פטיפורים בהזמנות',   text: 'כמה מגשי פטיפורים בהזמנות היום?' },
  ];
  return DEFAULT_SUGGESTIONS;
}

// ───── Helpers ─────────────────────────────────────────────────────────────

function sanitizeQuery(q: string): string {
  return q.replace(/[^֐-׿a-zA-Z0-9\s]/g, '').trim();
}

function rangeToReportInput(range: Range): { range: 'today' | 'tomorrow' | 'week' | 'custom'; date?: string } {
  if (range.kind === 'date') return { range: 'custom', date: range.date };
  return { range: range.kind };
}

function rangeLabel(range: Range): string {
  if (range.kind === 'today')    return 'להיום';
  if (range.kind === 'tomorrow') return 'למחר';
  if (range.kind === 'week')     return 'לשבוע הקרוב';
  return `לתאריך ${range.date}`;
}

function rangeShort(range: Range): string {
  if (range.kind === 'today')    return 'היום';
  if (range.kind === 'tomorrow') return 'מחר';
  if (range.kind === 'week')     return 'השבוע';
  return range.date;
}

// Natural-language description e.g. "דחופות להיום" / "משלוחים שלא שולמו למחר"
function describeOrders(range: Range, f: Filters): string {
  const parts: string[] = [];
  if (f.urgentOnly)   parts.push('דחופות');
  if (f.unpaidOnly)   parts.push('שלא שולמו');
  if (f.deliveryOnly) parts.push('למשלוח');
  if (f.pickupOnly)   parts.push('לאיסוף עצמי');
  const filterPart = parts.length ? `${parts.join(' ו')} ` : '';
  return `${filterPart}${rangeLabel(range)}`;
}

function filtersLabel(f: Filters): string {
  const parts: string[] = [];
  if (f.urgentOnly)   parts.push('דחופות');
  if (f.unpaidOnly)   parts.push('לא שולמו');
  if (f.deliveryOnly) parts.push('משלוחים');
  if (f.pickupOnly)   parts.push('איסוף עצמי');
  return parts.length ? `(${parts.join(', ')})` : '';
}

function toneToEmoji(tone: Tone): string {
  if (tone === 'good') return '🟢';
  if (tone === 'warn') return '🟡';
  if (tone === 'bad')  return '🔴';
  return '⚪';
}

function toOrderSummary(o: Record<string, unknown>): OrderSummary {
  const cust = o['לקוחות'] as { שם_פרטי?: string | null; שם_משפחה?: string | null } | null;
  const name = cust
    ? `${cust['שם_פרטי'] || ''} ${cust['שם_משפחה'] || ''}`.trim() || 'ללא שם'
    : 'ללא שם';
  return {
    id:           String(o['id'] || ''),
    number:       String(o['מספר_הזמנה'] || ''),
    customer:     name,
    time:         (o['שעת_אספקה'] as string) || null,
    date:         String(o['תאריך_אספקה'] || ''),
    deliveryType: String(o['סוג_אספקה'] || ''),
    paymentStatus: String(o['סטטוס_תשלום'] || ''),
    urgent:       o['הזמנה_דחופה'] === true,
  };
}

// ───── Actions ─────────────────────────────────────────────────────────────

async function actionCountOrders(range: Range, filters: Filters): Promise<AssistantResponse> {
  const { startDate, endDate } = resolveReportRange(rangeToReportInput(range));
  const { summary } = await fetchOrdersForReport(startDate, endDate, filters);

  const desc = describeOrders(range, filters);
  const blocks: Block[] = [
    { type: 'stat', label: `הזמנות ${desc}`, value: String(summary.total), emoji: '📦', tone: 'neutral' },
  ];

  if (summary.total === 0) {
    return { kind: 'answer', blocks: [{ type: 'text', text: `אין הזמנות ${desc} — יום שקט 🌿` }] };
  }

  blocks.push({
    type: 'list',
    title: 'פירוט',
    items: [
      { label: 'דחופות',     value: String(summary.urgent),   emoji: '⚡', tone: summary.urgent > 0 ? 'warn' : 'neutral' },
      { label: 'משלוחים',    value: String(summary.delivery), emoji: '🚚', tone: 'neutral' },
      { label: 'איסוף עצמי', value: String(summary.pickup),   emoji: '🏬', tone: 'neutral' },
      { label: 'לא שולמו',   value: String(summary.unpaid),   emoji: '💰', tone: summary.unpaid > 0 ? 'warn' : 'neutral' },
    ],
  });

  if (summary.urgent > 0) {
    blocks.push({ type: 'insight', text: `${summary.urgent} מההזמנות דחופות`, tone: 'warn', emoji: '⚡' });
  }
  if (summary.unpaid > 0) {
    blocks.push({ type: 'insight', text: `${summary.unpaid} עוד לא שולמו`, tone: 'warn', emoji: '💰' });
  }

  return { kind: 'answer', blocks };
}

async function actionFindOrders(range: Range, filters: Filters): Promise<AssistantResponse> {
  const { startDate, endDate } = resolveReportRange(rangeToReportInput(range));
  const { orders, summary } = await fetchOrdersForReport(startDate, endDate, filters);

  const desc = describeOrders(range, filters);
  if (orders.length === 0) {
    return { kind: 'answer', blocks: [{ type: 'text', text: `אין הזמנות ${desc} — יום שקט 🌿` }] };
  }

  const summaries = orders.slice(0, 20).map(toOrderSummary);
  const title = orders.length === 1
    ? `הנה ההזמנה ${desc}`
    : `הנה ${orders.length} ההזמנות ${desc}`;
  const blocks: Block[] = [{ type: 'orders', title, orders: summaries }];

  if (!filters.urgentOnly && summary.urgent > 0) {
    blocks.push({ type: 'insight', text: `${summary.urgent} מהן דחופות`, tone: 'warn', emoji: '⚡' });
  }
  if (!filters.unpaidOnly && summary.unpaid > 0) {
    blocks.push({ type: 'insight', text: `${summary.unpaid} עוד לא שולמו`, tone: 'warn', emoji: '💰' });
  }
  if (orders.length > 20) {
    blocks.push({ type: 'text', text: `מציגה 20 הזמנות ראשונות מתוך ${orders.length}` });
  }
  return { kind: 'answer', blocks };
}

async function actionListLowStock(): Promise<AssistantResponse> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('מלאי_חומרי_גלם')
    .select('שם_חומר_גלם, כמות_במלאי, יחידת_מידה, סטטוס_מלאי')
    .in('סטטוס_מלאי', ['מלאי נמוך', 'קריטי', 'אזל מהמלאי'])
    .order('סטטוס_מלאי', { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);
  const rows = (data || []) as Record<string, unknown>[];

  if (rows.length === 0) {
    return { kind: 'answer', blocks: [{ type: 'text', text: 'הכל תקין במלאי — אין למה לדאוג 🟢' }] };
  }

  let outCount = 0;
  const items: ListItem[] = rows.map((r: Record<string, unknown>) => {
    const status = String(r['סטטוס_מלאי'] || '');
    const isOut = status === 'אזל מהמלאי';
    if (isOut) outCount++;
    const tone: Tone = isOut ? 'bad' : status === 'קריטי' ? 'bad' : 'warn';
    return {
      label: String(r['שם_חומר_גלם']),
      value: `${r['כמות_במלאי']} ${r['יחידת_מידה'] || ''}`.trim(),
      sublabel: status,
      tone,
      emoji: toneToEmoji(tone),
    };
  });

  const blocks: Block[] = [
    { type: 'list', title: `${rows.length} פריטים שדורשים תשומת לב`, items },
  ];
  if (outCount > 0) {
    blocks.push({ type: 'insight', text: `${outCount} פריטים אזלו מהמלאי`, tone: 'bad', emoji: '🔴' });
  }
  return { kind: 'answer', blocks };
}

async function actionFindPackage(rawQuery: string): Promise<AssistantResponse> {
  const q = sanitizeQuery(rawQuery);
  const supabase = createAdminClient();
  const asNumber = Number(q);
  const isSize = q && Number.isFinite(asNumber) && asNumber > 0 && /^\d+$/.test(q);

  const builder = supabase.from('מארזים')
    .select('שם_מארז, גודל_מארז, מחיר_מארז, כמה_סוגים_מותר_לבחור, פעיל')
    .eq('פעיל', true)
    .order('גודל_מארז', { ascending: true })
    .limit(20);

  const { data, error } = !q
    ? await builder
    : isSize
      ? await builder.eq('גודל_מארז', asNumber)
      : await builder.ilike('שם_מארז', `%${q}%`);

  if (error) throw new Error(error.message);
  const rows = (data || []) as Record<string, unknown>[];

  if (rows.length === 0) {
    const msg = q ? `לא מצאתי מארזים תואמים ל-"${q}"` : 'לא מצאתי מארזים פעילים במערכת';
    return { kind: 'answer', blocks: [{ type: 'text', text: msg }] };
  }

  const items: ListItem[] = rows.map((r: Record<string, unknown>) => ({
    label: String(r['שם_מארז']),
    value: `${r['גודל_מארז']} יח׳`,
    sublabel: r['כמה_סוגים_מותר_לבחור'] != null ? `עד ${r['כמה_סוגים_מותר_לבחור']} סוגי פטיפורים` : undefined,
    emoji: '📦',
  }));

  const title = q ? `${rows.length} מארזים נמצאו` : `${rows.length} מארזים פעילים`;
  return {
    kind: 'answer',
    blocks: [{ type: 'list', title, items }],
  };
}

async function actionListPetitFourTypes(): Promise<AssistantResponse> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('סוגי_פטיפורים')
    .select('שם_פטיפור, כמות_במלאי, פעיל')
    .eq('פעיל', true)
    .order('שם_פטיפור', { ascending: true })
    .limit(60);

  if (error) throw new Error(error.message);
  const rows = (data || []) as Record<string, unknown>[];

  if (rows.length === 0) {
    return { kind: 'answer', blocks: [{ type: 'text', text: 'לא מצאתי סוגי פטיפורים פעילים במערכת' }] };
  }

  let outCount = 0;
  let lowCount = 0;
  const items: ListItem[] = rows.map((r: Record<string, unknown>) => {
    const qty = Number(r['כמות_במלאי']) || 0;
    if (qty === 0) outCount++;
    else if (qty <= 3) lowCount++;
    const tone: Tone = qty === 0 ? 'bad' : qty <= 3 ? 'warn' : 'good';
    return {
      label: String(r['שם_פטיפור']),
      value: `${qty} יח׳`,
      tone,
      emoji: toneToEmoji(tone),
    };
  });

  const blocks: Block[] = [
    { type: 'list', title: `מצאתי ${rows.length} סוגי פטיפורים`, items },
  ];
  if (outCount > 0) {
    blocks.push({ type: 'insight', text: `${outCount} פטיפורים אזלו מהמלאי`, tone: 'bad', emoji: '🔴' });
  } else if (lowCount > 0) {
    blocks.push({ type: 'insight', text: `${lowCount} פטיפורים במלאי נמוך`, tone: 'warn', emoji: '🟡' });
  }
  return { kind: 'answer', blocks };
}

async function actionOrderPetitFourSummary(range: Range): Promise<AssistantResponse> {
  const { startDate, endDate } = resolveReportRange(rangeToReportInput(range));
  const supabase = createAdminClient();

  const { data: orders, error: ordersErr } = await supabase
    .from('הזמנות')
    .select('id')
    .gte('תאריך_אספקה', startDate)
    .lte('תאריך_אספקה', endDate)
    .neq('סטטוס_הזמנה', 'בוטלה')
    .neq('סטטוס_הזמנה', 'טיוטה');
  if (ordersErr) throw new Error(ordersErr.message);

  const orderIds = ((orders || []) as Record<string, unknown>[]).map(o => String(o['id']));
  if (orderIds.length === 0) {
    return { kind: 'answer', blocks: [{ type: 'text', text: `אין הזמנות ${rangeLabel(range)}` }] };
  }

  const { data: items, error: itemsErr } = await supabase
    .from('מוצרים_בהזמנה')
    .select('id')
    .in('הזמנה_id', orderIds)
    .eq('סוג_שורה', 'מארז');
  if (itemsErr) throw new Error(itemsErr.message);

  const itemIds = ((items || []) as Record<string, unknown>[]).map(i => String(i['id']));
  if (itemIds.length === 0) {
    return { kind: 'answer', blocks: [{ type: 'text', text: `אין מארזי פטיפורים בהזמנות ${rangeLabel(range)}` }] };
  }

  const { data: selections, error: selErr } = await supabase
    .from('בחירת_פטיפורים_בהזמנה')
    .select('כמות, סוגי_פטיפורים(שם_פטיפור)')
    .in('שורת_הזמנה_id', itemIds);
  if (selErr) throw new Error(selErr.message);

  const totals = new Map<string, number>();
  for (const sel of ((selections || []) as Record<string, unknown>[])) {
    const pf = sel['סוגי_פטיפורים'] as { שם_פטיפור?: string | null } | null;
    const name = pf?.['שם_פטיפור'] || 'לא ידוע';
    const qty = Number(sel['כמות']) || 0;
    totals.set(name, (totals.get(name) || 0) + qty);
  }

  if (totals.size === 0) {
    return { kind: 'answer', blocks: [{ type: 'text', text: `לא נבחרו פטיפורים בהזמנות ${rangeLabel(range)}` }] };
  }

  const sorted = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]).slice(0, 30);
  const grandTotal = sorted.reduce((s, [, q]) => s + q, 0);

  return {
    kind: 'answer',
    blocks: [
      { type: 'stat', label: `סה"כ פטיפורים שהוזמנו ${rangeLabel(range)}`, value: `${grandTotal} יח׳`, emoji: '🍬', tone: 'neutral' },
      { type: 'list', title: `פירוט לפי סוג (${sorted.length} סוגים)`, items: sorted.map(([name, qty]) => ({
        label: name,
        value: `${qty} יח׳`,
        emoji: '🍬',
      })) },
    ],
  };
}

async function actionCountOrderItemsByKind(range: Range, kind: 'מארז' | 'מוצר'): Promise<AssistantResponse> {
  const { startDate, endDate } = resolveReportRange(rangeToReportInput(range));
  const supabase = createAdminClient();

  const { data: orders, error: ordersErr } = await supabase
    .from('הזמנות')
    .select('id')
    .gte('תאריך_אספקה', startDate)
    .lte('תאריך_אספקה', endDate)
    .neq('סטטוס_הזמנה', 'בוטלה')
    .neq('סטטוס_הזמנה', 'טיוטה');
  if (ordersErr) throw new Error(ordersErr.message);

  const orderIds = ((orders || []) as Record<string, unknown>[]).map(o => String(o['id']));
  if (orderIds.length === 0) {
    return { kind: 'answer', blocks: [{ type: 'text', text: `אין הזמנות ${rangeLabel(range)}` }] };
  }

  const { data: items, error: itemsErr } = await supabase
    .from('מוצרים_בהזמנה')
    .select('כמות')
    .in('הזמנה_id', orderIds)
    .eq('סוג_שורה', kind);
  if (itemsErr) throw new Error(itemsErr.message);

  const total = ((items || []) as Record<string, unknown>[])
    .reduce((sum, it) => sum + (Number(it['כמות']) || 0), 0);

  const lineCount = ((items || []) as unknown[]).length;
  const label = kind === 'מארז' ? 'מארזי פטיפורים' : 'מוצרים';
  const emoji = kind === 'מארז' ? '📦' : '🍰';

  return {
    kind: 'answer',
    blocks: [
      { type: 'stat', label: `${label} ${rangeLabel(range)}`, value: `${total} יח׳`, sublabel: `${lineCount} שורות`, emoji, tone: 'neutral' },
    ],
  };
}

async function actionStockQuery(rawQuery: string): Promise<AssistantResponse> {
  const q = sanitizeQuery(rawQuery);
  if (!q || q.length < 2) {
    return { kind: 'clarify', message: 'איזה מוצר או חומר גלם תרצי לבדוק?' };
  }

  const supabase = createAdminClient();

  // Phase 2.2 — let the entity resolver score and rank candidates across
  // petit fours / products / raw materials using normalized Hebrew matching
  // (NFC + geresh/gershayim/hyphens stripped). Drops false positives that
  // the old per-table `.ilike(%q%)` produced and gives the user the most
  // relevant matches first. Packages are excluded — "stock" semantics don't
  // apply to them.
  const resolveResult = await resolveEntity(q, supabase, {
    kinds: ['פטיפור', 'מוצר', 'חומר_גלם'],
    minScore: 0.5,
    limit: 8,
  });

  if (resolveResult.alternatives.length === 0) {
    // Stock-query that didn't match a real item is the cold-feedback path
    // operators ran into the most ("לא מצאתי 'חשבוניות' במלאי 😊"). Give
    // a warmer message and a few targeted next steps that match the most
    // common categories the search term might *actually* belong to.
    return {
      kind: 'answer',
      blocks: [
        {
          type: 'text',
          text: `לא הצלחתי לקשר את "${q}" לפריט במלאי. אולי התכוונת לאחת מאלה?`,
        },
        {
          type: 'suggestions',
          title: 'קטגוריות קרובות',
          items: [
            { label: 'מה במלאי נמוך',                text: 'מה במלאי נמוך?' },
            { label: 'אילו סוגי פטיפורים יש',         text: 'איזה סוגי פטיפורים קיימים?' },
            { label: 'מה יש במוגמרים',                text: 'מה יש במוגמרים?' },
            { label: 'מה אני יכולה לשאול אותך?',      text: 'עזרה' },
          ],
        },
      ],
    };
  }

  // Group resolved IDs by kind so we can pull live stock data with a
  // targeted query per table (one round-trip each, not per-row).
  const idsByKind: Record<'פטיפור' | 'מוצר' | 'חומר_גלם', string[]> = {
    'פטיפור': [], 'מוצר': [], 'חומר_גלם': [],
  };
  for (const e of resolveResult.alternatives) {
    if (e.kind === 'פטיפור' || e.kind === 'מוצר' || e.kind === 'חומר_גלם') {
      idsByKind[e.kind].push(e.id);
    }
  }

  const [finishedRes, rawRes, petitFourRes] = await Promise.all([
    idsByKind['מוצר'].length > 0
      ? supabase.from('מוצרים_למכירה')
          .select('id, שם_מוצר, כמות_במלאי, פעיל')
          .in('id', idsByKind['מוצר'])
      : Promise.resolve({ data: [], error: null }),
    idsByKind['חומר_גלם'].length > 0
      ? supabase.from('מלאי_חומרי_גלם')
          .select('id, שם_חומר_גלם, כמות_במלאי, יחידת_מידה, סטטוס_מלאי')
          .in('id', idsByKind['חומר_גלם'])
      : Promise.resolve({ data: [], error: null }),
    idsByKind['פטיפור'].length > 0
      ? supabase.from('סוגי_פטיפורים')
          .select('id, שם_פטיפור, כמות_במלאי, פעיל')
          .in('id', idsByKind['פטיפור'])
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (finishedRes.error)  throw new Error(finishedRes.error.message);
  if (rawRes.error)       throw new Error(rawRes.error.message);
  if (petitFourRes.error) throw new Error(petitFourRes.error.message);

  // Re-order results by the resolver's score (best match first within each
  // section). Sort by the position the id appears in the resolver output.
  const scoreOrder = new Map(resolveResult.alternatives.map((e, i) => [e.id, i]));
  const byScore = (a: Record<string, unknown>, b: Record<string, unknown>) =>
    (scoreOrder.get(String(a.id)) ?? 999) - (scoreOrder.get(String(b.id)) ?? 999);

  const finished   = ((finishedRes.data || []) as Record<string, unknown>[]).sort(byScore);
  const rawMats    = ((rawRes.data || []) as Record<string, unknown>[]).sort(byScore);
  const petitFours = ((petitFourRes.data || []) as Record<string, unknown>[]).sort(byScore);

  const blocks: Block[] = [];
  let outOfStock = 0;
  for (const r of finished) if (Number(r['כמות_במלאי']) === 0) outOfStock++;
  for (const r of petitFours) if (Number(r['כמות_במלאי']) === 0) outOfStock++;
  for (const r of rawMats) if (String(r['סטטוס_מלאי']) === 'אזל מהמלאי') outOfStock++;

  if (petitFours.length > 0) {
    const items: ListItem[] = petitFours.map((r: Record<string, unknown>) => {
      const qty = Number(r['כמות_במלאי']) || 0;
      const tone: Tone = qty === 0 ? 'bad' : qty <= 3 ? 'warn' : 'good';
      return {
        label: String(r['שם_פטיפור']),
        value: `${qty} יח׳`,
        tone,
        emoji: toneToEmoji(tone),
      };
    });
    blocks.push({ type: 'list', title: 'פטיפורים', items });
  }

  if (finished.length > 0) {
    const items: ListItem[] = finished.map((r: Record<string, unknown>) => {
      const qty = Number(r['כמות_במלאי']) || 0;
      const tone: Tone = qty === 0 ? 'bad' : qty <= 3 ? 'warn' : 'good';
      return {
        label: String(r['שם_מוצר']),
        value: `${qty} יח׳`,
        tone,
        emoji: toneToEmoji(tone),
      };
    });
    blocks.push({ type: 'list', title: 'מוצרים מוגמרים', items });
  }

  if (rawMats.length > 0) {
    const items: ListItem[] = rawMats.map((r: Record<string, unknown>) => {
      const status = String(r['סטטוס_מלאי'] || '');
      const tone: Tone = status === 'תקין' ? 'good'
                       : status === 'אזל מהמלאי' ? 'bad'
                       : 'warn';
      return {
        label: String(r['שם_חומר_גלם']),
        value: `${r['כמות_במלאי']} ${r['יחידת_מידה'] || ''}`.trim(),
        sublabel: status,
        tone,
        emoji: toneToEmoji(tone),
      };
    });
    blocks.push({ type: 'list', title: 'חומרי גלם', items });
  }

  if (outOfStock > 0) {
    blocks.push({ type: 'insight', text: `${outOfStock} פריטים אזלו מהמלאי`, tone: 'bad', emoji: '🔴' });
  }

  return { kind: 'answer', blocks };
}

// Both download and send go through the SAME preview-first flow now: the
// action returns a `report_preview` block which the UI uses to fetch a
// summary + sample orders, render them in a card, and then POST to the
// real /download or /send endpoint only after the user confirms inside
// the card. No download starts and no email leaves until the confirm.

async function actionDownloadOrdersReport(range: Range, filters: Filters): Promise<AssistantResponse> {
  const reportRange = rangeToReportInput(range);
  const cleaned = sanitizeFiltersForApi(filters);
  return {
    kind: 'answer',
    blocks: [
      {
        type: 'report_preview',
        rangeLabel: rangeLabel(range),
        filtersLabel: filtersLabel(filters),
        query: {
          range: reportRange.range,
          ...(reportRange.date ? { date: reportRange.date } : {}),
          ...(cleaned ? { filters: cleaned } : {}),
        },
        preferredAction: 'download',
      },
    ],
  };
}

async function actionSendOrdersReport(
  range: Range,
  filters: Filters,
  recipientEmail?: string,
): Promise<AssistantResponse> {
  // Email is still optional at this stage — the preview card itself will
  // surface the recipient field. We do try to fill in DAILY_ORDERS_REPORT_EMAIL
  // so the user only has to confirm, not type.
  const fallback = process.env.DAILY_ORDERS_REPORT_EMAIL?.trim();
  const email = recipientEmail || fallback;

  const reportRange = rangeToReportInput(range);
  const cleaned = sanitizeFiltersForApi(filters);
  return {
    kind: 'answer',
    blocks: [
      {
        type: 'report_preview',
        rangeLabel: rangeLabel(range),
        filtersLabel: filtersLabel(filters),
        recipientEmail: email,
        query: {
          range: reportRange.range,
          ...(reportRange.date ? { date: reportRange.date } : {}),
          ...(cleaned ? { filters: cleaned } : {}),
        },
        preferredAction: 'send',
      },
    ],
  };
}

// User asked for "דוח הזמנות להיום" without saying download or send.
// Offer both as suggestions — each routes back through the parser.
async function actionRequestReportAction(range: Range, filters: Filters): Promise<AssistantResponse> {
  const fSuffix = filtersLabel(filters) ? ` ${filtersLabel(filters)}` : '';
  const r = rangeShort(range);
  return {
    kind: 'clarify',
    message: `דוח הזמנות${fSuffix} ${rangeLabel(range)} — להוריד או לשלוח במייל?`,
    options: [
      { label: 'הורידי דוח',  text: `תורידי דוח הזמנות${fSuffix} ${r}` },
      { label: 'שלחי במייל',  text: `שלחי דוח הזמנות${fSuffix} ${r} במייל` },
    ],
  };
}

async function actionRequestReportRange(): Promise<AssistantResponse> {
  return {
    kind: 'clarify',
    message: 'איזה דוח תרצי?',
    options: [
      { label: 'דוח הזמנות להיום',  text: 'דוח הזמנות להיום' },
      { label: 'דוח הזמנות למחר',   text: 'דוח הזמנות למחר' },
      { label: 'דוח הזמנות לשבוע',  text: 'דוח הזמנות לשבוע הקרוב' },
    ],
  };
}

// ────────────────────────────────────────────────────────────────────────
// Additive read-only actions (May 2026) — revenue / customers / deliveries
// / daily summary. All four reuse the existing Block types (stat / list /
// insight / orders) so the AssistantDrawer renders them without any new
// rendering code. None mutates DB.
// ────────────────────────────────────────────────────────────────────────

function fmtCurrency(n: number): string {
  return `₪${n.toLocaleString('he-IL', { maximumFractionDigits: 0 })}`;
}

function fmtDateHe(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return iso; }
}

function todayInTZ(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

function startOfMonthISO(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

function nDaysAgoISO(days: number): string {
  const d = new Date(Date.now() - days * 86_400_000);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

async function actionRevenueQuery(scope: 'today' | 'week' | 'month' | 'pending'): Promise<AssistantResponse> {
  const supabase = createAdminClient();
  const today = todayInTZ();

  // ── Pending receivables — sum of unpaid + partial outside cancelled/draft.
  if (scope === 'pending') {
    const { data, error } = await supabase
      .from('הזמנות')
      .select('סך_הכל_לתשלום')
      .in('סטטוס_תשלום', ['ממתין', 'חלקי'])
      .neq('סטטוס_הזמנה', 'בוטלה')
      .neq('סטטוס_הזמנה', 'טיוטה')
      .neq('סטטוס_הזמנה', 'הושלמה בהצלחה');
    if (error) throw new Error(error.message);
    const rows = (data || []) as Record<string, unknown>[];
    const total = rows.reduce((s, r) => s + Number(r['סך_הכל_לתשלום'] || 0), 0);
    return {
      kind: 'answer',
      blocks: [
        { type: 'stat', label: 'ממתין לתשלום', value: fmtCurrency(total), sublabel: `${rows.length} הזמנות פתוחות`, emoji: '💰', tone: rows.length > 0 ? 'warn' : 'good' },
      ],
    };
  }

  // ── Income window — paid orders by delivery date.
  const from =
    scope === 'today' ? today
    : scope === 'week' ? nDaysAgoISO(6)
    : startOfMonthISO();
  const scopeLabel = scope === 'today' ? 'היום' : scope === 'week' ? 'השבוע' : 'החודש';

  const { data, error } = await supabase
    .from('הזמנות')
    .select('סך_הכל_לתשלום')
    .eq('סטטוס_תשלום', 'שולם')
    .gte('תאריך_אספקה', from)
    .lte('תאריך_אספקה', today);
  if (error) throw new Error(error.message);
  const rows = (data || []) as Record<string, unknown>[];
  const total = rows.reduce((s, r) => s + Number(r['סך_הכל_לתשלום'] || 0), 0);

  if (rows.length === 0) {
    return { kind: 'answer', blocks: [{ type: 'text', text: `לא מצאתי הכנסות ${scopeLabel} 😊` }] };
  }
  return {
    kind: 'answer',
    blocks: [
      { type: 'stat', label: `הכנסות ${scopeLabel}`, value: fmtCurrency(total), sublabel: `${rows.length} הזמנות שולמו`, emoji: '💸', tone: 'good' },
    ],
  };
}

async function actionCustomersTop(scope: 'month' | 'all'): Promise<AssistantResponse> {
  const supabase = createAdminClient();
  // Default scope is "last 30 days". 'all' lifts the date filter for owner
  // questions like "מי הלקוחות הכי טובים בכלל".
  const from = scope === 'all' ? null : nDaysAgoISO(30);
  let q = supabase
    .from('הזמנות')
    .select('לקוח_id, סך_הכל_לתשלום, לקוחות(שם_פרטי, שם_משפחה)')
    .neq('סטטוס_הזמנה', 'בוטלה')
    .neq('סטטוס_הזמנה', 'טיוטה');
  if (from) q = q.gte('תאריך_אספקה', from);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  type Row = { לקוח_id: string; סך_הכל_לתשלום: number | null; לקוחות?: { שם_פרטי?: string; שם_משפחה?: string } | null };
  const rows = (data || []) as unknown as Row[];

  const byCust = new Map<string, { id: string; name: string; orderCount: number; total: number }>();
  for (const r of rows) {
    if (!r.לקוח_id) continue;
    const cur = byCust.get(r.לקוח_id) || {
      id: r.לקוח_id,
      name: r.לקוחות ? `${r.לקוחות.שם_פרטי || ''} ${r.לקוחות.שם_משפחה || ''}`.trim() : 'לקוח',
      orderCount: 0,
      total: 0,
    };
    cur.orderCount += 1;
    cur.total += Number(r.סך_הכל_לתשלום || 0);
    byCust.set(r.לקוח_id, cur);
  }

  const ranked = Array.from(byCust.values()).sort((a, b) => b.orderCount - a.orderCount || b.total - a.total).slice(0, 8);
  if (ranked.length === 0) {
    return { kind: 'answer', blocks: [{ type: 'text', text: 'לא מצאתי הזמנות בטווח שביקשת.' }] };
  }
  const items: ListItem[] = ranked.map((c, idx) => ({
    label: `${idx + 1}. ${c.name || 'ללא שם'}`,
    value: `${c.orderCount} הזמנות · ${fmtCurrency(c.total)}`,
    tone: 'neutral',
  }));
  const scopeLabel = scope === 'all' ? 'בכלל' : 'ב-30 הימים האחרונים';
  return {
    kind: 'answer',
    blocks: [
      { type: 'list', title: `הלקוחות הכי פעילים ${scopeLabel}`, items },
    ],
  };
}

async function actionCustomerLookup(query: string): Promise<AssistantResponse> {
  const q = sanitizeQuery(query);
  if (q.length < 2) {
    return { kind: 'clarify', message: 'את מי לחפש?', options: [{ label: 'הלקוחות הכי פעילים', text: 'מי הלקוחות הכי פעילים?' }] };
  }
  const supabase = createAdminClient();
  const like = `%${q}%`;
  const { data: customers } = await supabase
    .from('לקוחות')
    .select('id, שם_פרטי, שם_משפחה, טלפון, אימייל, סוג_לקוח')
    .or(`שם_פרטי.ilike.${like},שם_משפחה.ilike.${like}`)
    .limit(5);

  type CustRow = { id: string; שם_פרטי?: string | null; שם_משפחה?: string | null; טלפון?: string | null; אימייל?: string | null; סוג_לקוח?: string | null };
  const found = (customers || []) as CustRow[];
  if (found.length === 0) {
    return { kind: 'answer', blocks: [{ type: 'text', text: `לא מצאתי לקוחה בשם "${q}" 😊` }] };
  }
  if (found.length > 1) {
    return {
      kind: 'clarify',
      message: 'מצאתי כמה לקוחות. את מי לפתוח?',
      options: found.map(c => {
        const name = `${c.שם_פרטי || ''} ${c.שם_משפחה || ''}`.trim() || 'ללא שם';
        return { label: `${name}${c.טלפון ? ` · ${c.טלפון}` : ''}`, text: `פרטים על לקוחה ${name}` };
      }),
    };
  }

  const c = found[0];
  const { data: orders } = await supabase
    .from('הזמנות')
    .select('מספר_הזמנה, תאריך_אספקה, סך_הכל_לתשלום, סטטוס_הזמנה, סטטוס_תשלום')
    .eq('לקוח_id', c.id)
    .order('תאריך_אספקה', { ascending: false });

  type OrderRow = { מספר_הזמנה?: string; תאריך_אספקה?: string | null; סך_הכל_לתשלום?: number | null; סטטוס_הזמנה?: string; סטטוס_תשלום?: string };
  const orderList = (orders || []) as OrderRow[];
  const total = orderList.reduce((s, o) => s + Number(o.סך_הכל_לתשלום || 0), 0);
  const lastOrder = orderList[0];
  const fullName = `${c.שם_פרטי || ''} ${c.שם_משפחה || ''}`.trim() || 'לקוחה';

  const blocks: Block[] = [
    {
      type: 'list',
      title: fullName,
      items: [
        ...(c.טלפון  ? [{ label: 'טלפון', value: c.טלפון } as ListItem] : []),
        ...(c.אימייל ? [{ label: 'אימייל', value: c.אימייל } as ListItem] : []),
        { label: 'סוג לקוחה', value: c.סוג_לקוח || 'פרטי' },
        { label: 'סך הכל הזמנות', value: String(orderList.length) },
        { label: 'סך כל הסכומים', value: fmtCurrency(total) },
        ...(lastOrder?.תאריך_אספקה ? [{ label: 'הזמנה אחרונה', value: `${fmtDateHe(lastOrder.תאריך_אספקה)} · ${fmtCurrency(Number(lastOrder.סך_הכל_לתשלום || 0))}` } as ListItem] : []),
      ],
    },
  ];
  return { kind: 'answer', blocks };
}

async function actionDeliveriesOpen(): Promise<AssistantResponse> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('משלוחים')
    .select('id, סטטוס_משלוח, תאריך_משלוח, שעת_משלוח, כתובת, עיר, הזמנות!inner(מספר_הזמנה, שם_מקבל, סטטוס_הזמנה, לקוחות(שם_פרטי, שם_משפחה)), שליחים!courier_id(שם_שליח)')
    .neq('סטטוס_משלוח', 'נמסר')
    .neq('הזמנות.סטטוס_הזמנה', 'בוטלה')
    .order('תאריך_משלוח', { ascending: true })
    .limit(30);
  if (error) throw new Error(error.message);

  type DeliveryRow = {
    id: string;
    סטטוס_משלוח: string;
    תאריך_משלוח: string | null;
    שעת_משלוח: string | null;
    כתובת: string | null;
    עיר: string | null;
    הזמנות?: { מספר_הזמנה?: string; שם_מקבל?: string | null; לקוחות?: { שם_פרטי?: string; שם_משפחה?: string } | null } | null;
    שליחים?: { שם_שליח?: string } | null;
  };
  const rows = ((data || []) as unknown as DeliveryRow[]).filter(d => d.הזמנות != null);

  if (rows.length === 0) {
    return { kind: 'answer', blocks: [{ type: 'text', text: 'אין משלוחים פעילים כרגע 🟢' }] };
  }

  const items: ListItem[] = rows.slice(0, 15).map(d => {
    const o = d.הזמנות;
    const cust = o?.שם_מקבל
      || (o?.לקוחות ? `${o.לקוחות.שם_פרטי || ''} ${o.לקוחות.שם_משפחה || ''}`.trim() : '')
      || 'לקוח';
    const addr = [d.כתובת, d.עיר].filter(Boolean).join(', ');
    const courier = d.שליחים?.שם_שליח ? ` · שליח: ${d.שליחים.שם_שליח}` : '';
    const tone: Tone = d.סטטוס_משלוח === 'נאסף' ? 'warn' : 'neutral';
    return {
      label: `${cust}${o?.מספר_הזמנה ? ` · ${o.מספר_הזמנה}` : ''}`,
      value: d.סטטוס_משלוח,
      sublabel: `${addr || '—'}${courier}`,
      tone,
      emoji: tone === 'warn' ? '🟡' : '⚪',
    };
  });
  const blocks: Block[] = [
    { type: 'list', title: `${rows.length} משלוחים פעילים`, items },
  ];
  if (rows.length > 15) {
    blocks.push({ type: 'text', text: `מציגה 15 ראשונים מתוך ${rows.length}` });
  }
  return { kind: 'answer', blocks };
}

async function actionDailySummary(): Promise<AssistantResponse> {
  const supabase = createAdminClient();
  const today = todayInTZ();

  // 5 lightweight reads in parallel — no joins, no big payloads.
  const [
    { count: ordersToday },
    { count: urgentToday },
    { count: unpaidActive },
    { data: revenueRows },
    { count: deliveriesActive },
    { count: lowStockCount },
  ] = await Promise.all([
    supabase.from('הזמנות').select('*', { count: 'exact', head: true }).eq('תאריך_אספקה', today).neq('סטטוס_הזמנה', 'בוטלה').neq('סטטוס_הזמנה', 'טיוטה'),
    supabase.from('הזמנות').select('*', { count: 'exact', head: true }).eq('תאריך_אספקה', today).eq('הזמנה_דחופה', true).neq('סטטוס_הזמנה', 'בוטלה').neq('סטטוס_הזמנה', 'טיוטה'),
    supabase.from('הזמנות').select('*', { count: 'exact', head: true }).in('סטטוס_תשלום', ['ממתין', 'חלקי']).neq('סטטוס_הזמנה', 'בוטלה').neq('סטטוס_הזמנה', 'טיוטה').neq('סטטוס_הזמנה', 'הושלמה בהצלחה'),
    supabase.from('הזמנות').select('סך_הכל_לתשלום').eq('תאריך_אספקה', today).eq('סטטוס_תשלום', 'שולם'),
    supabase.from('משלוחים').select('*', { count: 'exact', head: true }).eq('תאריך_משלוח', today).neq('סטטוס_משלוח', 'נמסר'),
    supabase.from('מלאי_חומרי_גלם').select('*', { count: 'exact', head: true }).in('סטטוס_מלאי', ['מלאי נמוך', 'קריטי', 'אזל מהמלאי']),
  ]);

  const revenueToday = ((revenueRows || []) as Record<string, unknown>[])
    .reduce((s, r) => s + Number(r['סך_הכל_לתשלום'] || 0), 0);

  const blocks: Block[] = [
    { type: 'stat', label: 'הזמנות להיום', value: String(ordersToday ?? 0), emoji: '🧾', tone: 'neutral' },
    {
      type: 'list',
      title: 'תמונת מצב',
      items: [
        { label: 'דחופות היום',         value: String(urgentToday ?? 0),       emoji: '⚡', tone: (urgentToday ?? 0) > 0 ? 'warn' : 'neutral' },
        { label: 'ממתין לתשלום (פעיל)', value: String(unpaidActive ?? 0),      emoji: '💰', tone: (unpaidActive ?? 0) > 0 ? 'warn' : 'good' },
        { label: 'הכנסות היום',          value: fmtCurrency(revenueToday),      emoji: '💸', tone: 'good' },
        { label: 'משלוחים פעילים',       value: String(deliveriesActive ?? 0),  emoji: '🚚', tone: 'neutral' },
        { label: 'מלאי בעייתי',          value: String(lowStockCount ?? 0),     emoji: '📦', tone: (lowStockCount ?? 0) > 0 ? 'warn' : 'good' },
      ],
    },
  ];

  if ((urgentToday ?? 0) > 0) {
    blocks.push({ type: 'insight', text: `${urgentToday} הזמנות דחופות היום — שווה להתחיל מהן`, tone: 'warn', emoji: '⚡' });
  }
  if ((lowStockCount ?? 0) > 0) {
    blocks.push({ type: 'insight', text: `${lowStockCount} פריטים במלאי דורשים תשומת לב`, tone: 'warn', emoji: '📦' });
  }
  return { kind: 'answer', blocks };
}

// ── New (May 2026 expansion) — system errors, top products / petit-fours,
//     new customers. All read-only. ───────────────────────────────────────

const SYSTEM_ERRORS_WINDOW_DAYS = 7;

async function actionSystemErrors(): Promise<AssistantResponse> {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - SYSTEM_ERRORS_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error, count } = await supabase
    .from('system_activity_logs')
    .select('title, description, error_message, created_at, module, service_key, entity_label, entity_type', { count: 'exact' })
    .eq('status', 'failed')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(15);
  if (error) throw new Error(error.message);

  type Row = {
    title: string; description: string | null; error_message: string | null;
    created_at: string; module: string; service_key: string | null;
    entity_label: string | null; entity_type: string | null;
  };
  const rows = (data || []) as Row[];

  if (rows.length === 0) {
    return {
      kind: 'answer',
      blocks: [{ type: 'text', text: '🟢 הכל עובד תקין! לא היו שגיאות ב-7 הימים האחרונים.' }],
    };
  }

  const total = count ?? rows.length;
  const items: ListItem[] = rows.map(r => {
    const when = fmtDateHe(r.created_at);
    const subParts: string[] = [];
    if (r.module) subParts.push(r.module);
    if (r.entity_label) subParts.push(r.entity_label);
    const sub = subParts.join(' · ');
    return {
      label:    r.title,
      value:    when,
      sublabel: r.error_message
        ? `${sub ? sub + ' — ' : ''}${r.error_message.slice(0, 90)}`
        : (sub || (r.description ? r.description.slice(0, 90) : null) || undefined),
      tone:     'bad',
      emoji:    '✗',
    };
  });

  const blocks: Block[] = [
    {
      type:  'stat',
      label: `שגיאות ב-${SYSTEM_ERRORS_WINDOW_DAYS} הימים האחרונים`,
      value: String(total),
      emoji: '⚠',
      tone:  'bad',
    },
    {
      type:  'list',
      title: rows.length < total ? `מציגה ${rows.length} אחרונות מתוך ${total}` : 'השגיאות האחרונות',
      items,
    },
    {
      type:  'insight',
      text:  'לפרטים מלאים — היכנסי להגדרות → לוגים',
      tone:  'neutral',
      emoji: '🔎',
    },
  ];
  return { kind: 'answer', blocks };
}

// Best-selling regular products (line items where סוג_שורה != 'מארז').
// We aggregate quantity sold per product across orders in the scope window.
async function actionTopProducts(): Promise<AssistantResponse> {
  const supabase = createAdminClient();
  const since = startOfMonthISO(); // current calendar month

  // Step 1: order ids in window (excluding cancelled / draft).
  const { data: orderRows, error: ordersErr } = await supabase
    .from('הזמנות')
    .select('id')
    .gte('תאריך_הזמנה', since)
    .neq('סטטוס_הזמנה', 'בוטלה')
    .neq('סטטוס_הזמנה', 'טיוטה');
  if (ordersErr) throw new Error(ordersErr.message);
  const orderIds = ((orderRows || []) as Array<{ id: string }>).map(r => r.id);

  if (orderIds.length === 0) {
    return { kind: 'answer', blocks: [{ type: 'text', text: 'אין הזמנות בחודש הנוכחי 📭' }] };
  }

  // Step 2: line items for those orders, only regular products (not packages).
  // Limit defensively — even very busy months should fit well under 2k items.
  const { data: itemRows, error: itemsErr } = await supabase
    .from('מוצרים_בהזמנה')
    .select('כמות, סוג_שורה, מוצרים_למכירה(שם_מוצר)')
    .in('הזמנה_id', orderIds)
    .limit(2000);
  if (itemsErr) throw new Error(itemsErr.message);

  type ItemRow = {
    כמות: number | null;
    סוג_שורה: string | null;
    מוצרים_למכירה: { שם_מוצר?: string | null } | null;
  };
  const tally = new Map<string, number>();
  for (const row of ((itemRows || []) as unknown as ItemRow[])) {
    if (row.סוג_שורה === 'מארז') continue; // packages handled separately
    const name = row.מוצרים_למכירה?.שם_מוצר?.trim();
    if (!name) continue;
    tally.set(name, (tally.get(name) || 0) + Number(row.כמות || 0));
  }
  const top = Array.from(tally.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (top.length === 0) {
    return { kind: 'answer', blocks: [{ type: 'text', text: 'אין נתוני מכירות מוצרים לחודש הנוכחי 📭' }] };
  }

  const items: ListItem[] = top.map(([name, qty], i) => ({
    label:    name,
    value:    `${qty} יח'`,
    sublabel: i === 0 ? 'המוביל החודש' : undefined,
    tone:     i === 0 ? 'good' : 'neutral',
    emoji:    i === 0 ? '🏆' : '🍫',
  }));

  return {
    kind: 'answer',
    blocks: [
      { type: 'list', title: 'המוצרים הכי נמכרים החודש', items },
      { type: 'insight', text: `המוצר המוביל: ${top[0][0]} (${top[0][1]} יח')`, tone: 'good', emoji: '🏆' },
    ],
  };
}

// Best-selling petit-four flavours by quantity in the current month.
async function actionTopPetitFours(): Promise<AssistantResponse> {
  const supabase = createAdminClient();
  const since = startOfMonthISO();

  const { data: orderRows, error: ordersErr } = await supabase
    .from('הזמנות')
    .select('id')
    .gte('תאריך_הזמנה', since)
    .neq('סטטוס_הזמנה', 'בוטלה')
    .neq('סטטוס_הזמנה', 'טיוטה');
  if (ordersErr) throw new Error(ordersErr.message);
  const orderIds = ((orderRows || []) as Array<{ id: string }>).map(r => r.id);

  if (orderIds.length === 0) {
    return { kind: 'answer', blocks: [{ type: 'text', text: 'אין הזמנות בחודש הנוכחי 📭' }] };
  }

  // Find line items in those orders, then their petit-four selections.
  const { data: itemRows, error: itemsErr } = await supabase
    .from('מוצרים_בהזמנה')
    .select('id')
    .in('הזמנה_id', orderIds)
    .eq('סוג_שורה', 'מארז');
  if (itemsErr) throw new Error(itemsErr.message);
  const itemIds = ((itemRows || []) as Array<{ id: string }>).map(r => r.id);

  if (itemIds.length === 0) {
    return { kind: 'answer', blocks: [{ type: 'text', text: 'לא נמכרו מארזי פטיפורים החודש 📭' }] };
  }

  const { data: selRows, error: selErr } = await supabase
    .from('בחירת_פטיפורים_בהזמנה')
    .select('כמות, סוגי_פטיפורים(שם_פטיפור)')
    .in('שורת_הזמנה_id', itemIds)
    .limit(5000);
  if (selErr) throw new Error(selErr.message);

  type SelRow = { כמות: number | null; סוגי_פטיפורים: { שם_פטיפור?: string | null } | null };
  const tally = new Map<string, number>();
  for (const r of ((selRows || []) as unknown as SelRow[])) {
    const name = r.סוגי_פטיפורים?.שם_פטיפור?.trim();
    if (!name) continue;
    tally.set(name, (tally.get(name) || 0) + Number(r.כמות || 0));
  }
  const top = Array.from(tally.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);

  if (top.length === 0) {
    return { kind: 'answer', blocks: [{ type: 'text', text: 'אין נתוני מכירות פטיפורים לחודש הנוכחי 📭' }] };
  }

  const items: ListItem[] = top.map(([name, qty], i) => ({
    label: name,
    value: `${qty} יח'`,
    sublabel: i === 0 ? 'המוביל החודש' : undefined,
    tone:  i === 0 ? 'good' : 'neutral',
    emoji: i === 0 ? '🏆' : '🍬',
  }));

  return {
    kind: 'answer',
    blocks: [
      { type: 'list', title: 'הפטיפורים הכי נמכרים החודש', items },
      { type: 'insight', text: `הטעם המוביל: ${top[0][0]} (${top[0][1]} יח')`, tone: 'good', emoji: '🏆' },
    ],
  };
}

// New customers in the last 30 days.
async function actionNewCustomers(): Promise<AssistantResponse> {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error, count } = await supabase
    .from('לקוחות')
    .select('id, שם_פרטי, שם_משפחה, טלפון, אימייל, תאריך_יצירה, סוג_לקוח', { count: 'exact' })
    .gte('תאריך_יצירה', since)
    .order('תאריך_יצירה', { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);

  type Row = {
    id: string;
    שם_פרטי: string | null; שם_משפחה: string | null;
    טלפון: string | null; אימייל: string | null;
    תאריך_יצירה: string | null; סוג_לקוח: string | null;
  };
  const rows = (data || []) as Row[];
  const total = count ?? rows.length;

  if (rows.length === 0) {
    return { kind: 'answer', blocks: [{ type: 'text', text: 'לא נוספו לקוחות חדשים ב-30 הימים האחרונים 😊' }] };
  }

  const items: ListItem[] = rows.map(r => {
    const name = `${r.שם_פרטי || ''} ${r.שם_משפחה || ''}`.trim() || 'ללא שם';
    const sub = [r.טלפון, r.אימייל].filter(Boolean).join(' · ');
    return {
      label:    name,
      value:    fmtDateHe(r.תאריך_יצירה),
      sublabel: r.סוג_לקוח ? `${r.סוג_לקוח}${sub ? ' · ' + sub : ''}` : (sub || undefined),
      tone:     'good',
      emoji:    '✨',
    };
  });

  return {
    kind: 'answer',
    blocks: [
      { type: 'stat', label: 'לקוחות חדשים (30 ימים)', value: String(total), emoji: '✨', tone: 'good' },
      { type: 'list', title: rows.length < total ? `מציגה ${rows.length} אחרונים מתוך ${total}` : 'הלקוחות החדשים', items },
    ],
  };
}

// ── v2 expansion (May 2026) — suppliers / business customers / kitchen /
//     invoices / finished-products stock. All read-only. ──────────────────

async function actionCountSuppliers(): Promise<AssistantResponse> {
  const supabase = createAdminClient();
  const { data, error, count } = await supabase
    .from('ספקים')
    .select('id, שם_ספק, טלפון, איש_קשר, פעיל, הערות', { count: 'exact' })
    .order('שם_ספק', { ascending: true })
    .limit(50);
  if (error) throw new Error(error.message);

  type Row = { id: string; שם_ספק: string | null; טלפון: string | null; איש_קשר: string | null; פעיל: boolean | null; הערות: string | null };
  const rows = (data || []) as Row[];
  const total = count ?? rows.length;
  const active = rows.filter(r => r.פעיל !== false).length;

  if (total === 0) {
    return { kind: 'answer', blocks: [{ type: 'text', text: 'עוד אין ספקים רשומים אצלך 📋' }] };
  }

  const items: ListItem[] = rows.slice(0, 20).map(r => ({
    label: r.שם_ספק || 'ללא שם',
    value: r.פעיל === false ? 'לא פעיל' : 'פעיל',
    sublabel: [r.איש_קשר, r.טלפון].filter(Boolean).join(' · ') || undefined,
    tone:  r.פעיל === false ? 'neutral' : 'good',
    emoji: r.פעיל === false ? '⚪' : '🟢',
  }));

  return {
    kind: 'answer',
    blocks: [
      { type: 'stat', label: 'ספקים פעילים', value: `${active} / ${total}`, emoji: '📋', tone: 'neutral' },
      { type: 'list', title: rows.length < total ? `מציגה ${rows.length} מתוך ${total}` : 'הספקים שלך', items },
    ],
  };
}

async function actionListBusinessCustomers(): Promise<AssistantResponse> {
  const supabase = createAdminClient();
  const { data, error, count } = await supabase
    .from('לקוחות')
    .select('id, שם_פרטי, שם_משפחה, טלפון, אימייל, סוג_לקוח', { count: 'exact' })
    .in('סוג_לקוח', ['עסקי', 'עסקי - קבוע', 'עסקי - כמות'])
    .order('שם_משפחה', { ascending: true })
    .limit(30);
  if (error) throw new Error(error.message);

  type Row = { id: string; שם_פרטי: string | null; שם_משפחה: string | null; טלפון: string | null; אימייל: string | null; סוג_לקוח: string | null };
  const rows = (data || []) as Row[];
  const total = count ?? rows.length;

  if (total === 0) {
    return {
      kind: 'answer',
      blocks: [{ type: 'text', text: 'אין כרגע לקוחות עסקיים רשומים אצלך 📋' }],
    };
  }

  const items: ListItem[] = rows.map(r => {
    const name = `${r.שם_פרטי || ''} ${r.שם_משפחה || ''}`.trim() || 'ללא שם';
    const contact = [r.טלפון, r.אימייל].filter(Boolean).join(' · ');
    return {
      label:    name,
      value:    r.סוג_לקוח || 'עסקי',
      sublabel: contact || undefined,
      tone:     'neutral',
      emoji:    '🏢',
    };
  });

  return {
    kind: 'answer',
    blocks: [
      { type: 'stat', label: 'לקוחות עסקיים', value: String(total), emoji: '🏢', tone: 'neutral' },
      { type: 'list', title: rows.length < total ? `מציגה ${rows.length} מתוך ${total}` : 'הלקוחות העסקיים שלך', items },
    ],
  };
}

async function actionKitchenAttendanceToday(): Promise<AssistantResponse> {
  const supabase = createAdminClient();
  const today = todayInTZ();
  const { data, error } = await supabase
    .from('נוכחות_עובדות')
    .select('id, שעת_כניסה, שעת_יציאה, סהכ_שעות, סטטוס, עובדות_מטבח(שם_עובדת, תפקיד)')
    .eq('תאריך', today)
    .order('שעת_כניסה', { ascending: true });
  if (error) throw new Error(error.message);

  type Row = {
    id: string; שעת_כניסה: string | null; שעת_יציאה: string | null;
    סהכ_שעות: number | null; סטטוס: string | null;
    עובדות_מטבח?: { שם_עובדת?: string | null; תפקיד?: string | null } | null;
  };
  const rows = (data || []) as Row[];

  if (rows.length === 0) {
    return { kind: 'answer', blocks: [{ type: 'text', text: 'עוד אף אחת לא נרשמה היום במטבח 👩‍🍳' }] };
  }

  const items: ListItem[] = rows.map(r => {
    const name  = r.עובדות_מטבח?.שם_עובדת || 'עובדת';
    const role  = r.עובדות_מטבח?.תפקיד    || '';
    const into  = r.שעת_כניסה?.slice(0, 5) || '';
    const out   = r.שעת_יציאה?.slice(0, 5) || '';
    const hours = r.סהכ_שעות != null ? `${Number(r.סהכ_שעות).toFixed(1)} ש'` : '';
    return {
      label:    role ? `${name} · ${role}` : name,
      value:    out ? `${into}–${out}${hours ? ' · ' + hours : ''}` : (into ? `${into} (פתוח)` : '—'),
      sublabel: r.סטטוס || undefined,
      tone:     r.סטטוס === 'הושלם' ? 'good' : r.סטטוס === 'חסרה יציאה' ? 'warn' : 'neutral',
      emoji:    '👩‍🍳',
    };
  });

  return {
    kind: 'answer',
    blocks: [
      { type: 'stat', label: 'עובדות שהיו היום', value: String(rows.length), emoji: '👩‍🍳', tone: 'good' },
      { type: 'list', title: 'נוכחות מטבח להיום', items },
    ],
  };
}

async function actionKitchenPrepSummary(range: Range): Promise<AssistantResponse> {
  // The kitchen-prep endpoint expects no range query param — it always
  // returns the upcoming 14-day window with status banding. We filter on
  // the client (here) by earliestDispatchISO against the requested range.
  // Bypassing fetch keeps this purely server-side; we replicate the same
  // Supabase reads the dashboard endpoint does, but at a much lower depth.

  const supabase = createAdminClient();
  const today = todayInTZ();
  const horizon = (() => {
    if (range.kind === 'today')    return today;
    if (range.kind === 'tomorrow') {
      const d = new Date(today + 'T00:00:00+03:00');
      d.setDate(d.getDate() + 1);
      return d.toISOString().slice(0, 10);
    }
    if (range.kind === 'week') {
      const d = new Date(today + 'T00:00:00+03:00');
      d.setDate(d.getDate() + 7);
      return d.toISOString().slice(0, 10);
    }
    return range.date;
  })();

  // Pull active orders in the window, then sum line items by product/package.
  const { data: orderRows, error: ordersErr } = await supabase
    .from('הזמנות')
    .select('id, תאריך_אספקה')
    .gte('תאריך_אספקה', range.kind === 'tomorrow' ? horizon : today)
    .lte('תאריך_אספקה', horizon)
    .neq('סטטוס_הזמנה', 'בוטלה')
    .neq('סטטוס_הזמנה', 'טיוטה');
  if (ordersErr) throw new Error(ordersErr.message);

  const orderIds = ((orderRows || []) as Array<{ id: string }>).map(r => r.id);
  const rangeDesc = range.kind === 'today' ? 'היום'
                  : range.kind === 'tomorrow' ? 'מחר'
                  : range.kind === 'week' ? 'השבוע'
                  : `לתאריך ${range.date}`;

  if (orderIds.length === 0) {
    return { kind: 'answer', blocks: [{ type: 'text', text: `אין הזמנות לייצור ${rangeDesc} 🌿` }] };
  }

  const { data: itemRows, error: itemsErr } = await supabase
    .from('מוצרים_בהזמנה')
    .select('כמות, סוג_שורה, גודל_מארז, מוצרים_למכירה(שם_מוצר)')
    .in('הזמנה_id', orderIds)
    .limit(2000);
  if (itemsErr) throw new Error(itemsErr.message);

  type ItemRow = {
    כמות: number | null;
    סוג_שורה: string | null;
    גודל_מארז: number | null;
    מוצרים_למכירה: { שם_מוצר?: string | null } | null;
  };

  // Tally cakes/products + packages separately.
  const productTally = new Map<string, number>();
  const packageTally = new Map<string, number>();
  for (const it of ((itemRows || []) as unknown as ItemRow[])) {
    const qty = Number(it.כמות || 0);
    if (qty <= 0) continue;
    if (it.סוג_שורה === 'מארז') {
      const key = `מארז ${it.גודל_מארז ?? ''} פטיפורים`.trim();
      packageTally.set(key, (packageTally.get(key) || 0) + qty);
    } else {
      const name = it.מוצרים_למכירה?.שם_מוצר?.trim();
      if (!name) continue;
      productTally.set(name, (productTally.get(name) || 0) + qty);
    }
  }

  const productItems: ListItem[] = Array.from(productTally.entries())
    .sort((a, b) => b[1] - a[1]).slice(0, 15)
    .map(([name, qty]) => ({ label: name, value: `${qty} יח'`, tone: 'neutral', emoji: '🧁' }));
  const packageItems: ListItem[] = Array.from(packageTally.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, qty]) => ({ label: name, value: `${qty} מארזים`, tone: 'neutral', emoji: '📦' }));

  const blocks: Block[] = [
    { type: 'stat', label: `הזמנות לייצור ${rangeDesc}`, value: String(orderIds.length), emoji: '👩‍🍳', tone: 'neutral' },
  ];
  if (productItems.length > 0) blocks.push({ type: 'list', title: 'עוגות ומוצרים', items: productItems });
  if (packageItems.length > 0) blocks.push({ type: 'list', title: 'מארזי פטיפורים', items: packageItems });
  if (productItems.length === 0 && packageItems.length === 0) {
    blocks.push({ type: 'text', text: 'יש הזמנות אבל בלי פריטים לייצור 🤔' });
  }
  return { kind: 'answer', blocks };
}

async function actionInvoicesRecent(): Promise<AssistantResponse> {
  const supabase = createAdminClient();
  const sinceMonth = startOfMonthISO();
  const sinceErrors = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [invoiceRes, failedRes] = await Promise.all([
    supabase
      .from('חשבוניות')
      .select('id, מספר_חשבונית, סכום, סטטוס, תאריך_יצירה, לקוחות(שם_פרטי, שם_משפחה)', { count: 'exact' })
      .gte('תאריך_יצירה', sinceMonth)
      .order('תאריך_יצירה', { ascending: false })
      .limit(15),
    supabase
      .from('system_activity_logs')
      .select('title, error_message, created_at', { count: 'exact' })
      .eq('service_key', 'morning_documents')
      .eq('status', 'failed')
      .gte('created_at', sinceErrors)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);
  if (invoiceRes.error) throw new Error(invoiceRes.error.message);

  type InvRow = {
    id: string; מספר_חשבונית: string | null; סכום: number | string | null;
    סטטוס: string | null; תאריך_יצירה: string | null;
    לקוחות?: { שם_פרטי?: string | null; שם_משפחה?: string | null } | null;
  };
  const invoices = (invoiceRes.data || []) as InvRow[];
  const invoiceTotal = invoiceRes.count ?? invoices.length;
  const failedCount = failedRes.count ?? 0;

  if (invoiceTotal === 0 && failedCount === 0) {
    return { kind: 'answer', blocks: [{ type: 'text', text: 'עוד לא הופקו חשבוניות החודש 🧾' }] };
  }

  const blocks: Block[] = [
    { type: 'stat', label: 'חשבוניות החודש', value: String(invoiceTotal), emoji: '🧾', tone: 'neutral' },
  ];

  if (failedCount > 0) {
    blocks.push({
      type: 'insight',
      text: `${failedCount} הפקות חשבונית נכשלו ב-7 ימים האחרונים — שווה לבדוק בלוגים`,
      tone: 'warn',
      emoji: '⚠',
    });
  }

  if (invoices.length > 0) {
    const items: ListItem[] = invoices.map(inv => {
      const c = inv.לקוחות;
      const name = c ? `${c.שם_פרטי || ''} ${c.שם_משפחה || ''}`.trim() : '';
      return {
        label:    inv.מספר_חשבונית ? `#${inv.מספר_חשבונית}` : 'חשבונית',
        value:    fmtCurrency(Number(inv.סכום || 0)),
        sublabel: [name || null, fmtDateHe(inv.תאריך_יצירה), inv.סטטוס].filter(Boolean).join(' · '),
        tone:     inv.סטטוס === 'בוטלה' ? 'bad' : 'neutral',
        emoji:    '🧾',
      };
    });
    blocks.push({
      type: 'list',
      title: invoices.length < invoiceTotal ? `מציגה ${invoices.length} אחרונות מתוך ${invoiceTotal}` : 'החשבוניות החודש',
      items,
    });
  }

  return { kind: 'answer', blocks };
}

async function actionFinishedProductsStock(): Promise<AssistantResponse> {
  const supabase = createAdminClient();
  const { data, error, count } = await supabase
    .from('מוצרים_למכירה')
    .select('שם_מוצר, כמות_במלאי, פעיל', { count: 'exact' })
    .eq('פעיל', true)
    .order('כמות_במלאי', { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);

  type Row = { שם_מוצר: string | null; כמות_במלאי: number | null; פעיל: boolean | null };
  const rows = (data || []) as Row[];
  const total = count ?? rows.length;

  if (total === 0) {
    return { kind: 'answer', blocks: [{ type: 'text', text: 'אין כרגע מוצרים מוכנים במלאי 📦' }] };
  }

  const inStock = rows.filter(r => Number(r.כמות_במלאי || 0) > 0);
  const items: ListItem[] = inStock.slice(0, 20).map(r => {
    const qty = Number(r.כמות_במלאי || 0);
    const tone: Tone = qty > 5 ? 'good' : qty > 0 ? 'warn' : 'bad';
    return {
      label: r.שם_מוצר || 'מוצר',
      value: `${qty} יח'`,
      tone,
      emoji: tone === 'good' ? '🟢' : tone === 'warn' ? '🟡' : '🔴',
    };
  });

  return {
    kind: 'answer',
    blocks: [
      { type: 'stat', label: 'מוצרים מוכנים פעילים', value: `${inStock.length} / ${total}`, emoji: '📦', tone: 'neutral' },
      { type: 'list', title: inStock.length < total ? `מציגה ${inStock.length} עם מלאי` : 'המוצרים המוכנים שלך', items },
    ],
  };
}

// Strip undefined/false flags so the JSON payload sent to the API stays
// minimal. Returns undefined when no filter is active so the API receives
// no `filters` key at all.
function sanitizeFiltersForApi(f: Filters): Record<string, boolean> | undefined {
  const out: Record<string, boolean> = {};
  if (f.urgentOnly)   out.urgentOnly   = true;
  if (f.unpaidOnly)   out.unpaidOnly   = true;
  if (f.deliveryOnly) out.deliveryOnly = true;
  if (f.pickupOnly)   out.pickupOnly   = true;
  return Object.keys(out).length > 0 ? out : undefined;
}

// ───── Dispatcher ──────────────────────────────────────────────────────────

async function dispatch(intent: ParsedIntent): Promise<AssistantResponse> {
  switch (intent.type) {
    case 'count_orders':              return actionCountOrders(intent.range, intent.filters);
    case 'find_orders':               return actionFindOrders(intent.range, intent.filters);
    case 'list_low_stock':            return actionListLowStock();
    case 'find_package':              return actionFindPackage(intent.query);
    case 'stock_query':               return actionStockQuery(intent.query);
    case 'list_petit_four_types':     return actionListPetitFourTypes();
    case 'order_petit_four_summary':  return actionOrderPetitFourSummary(intent.range);
    case 'count_order_items_by_kind': return actionCountOrderItemsByKind(intent.range, intent.kind);
    case 'download_orders_report':    return actionDownloadOrdersReport(intent.range, intent.filters);
    case 'send_orders_report':        return actionSendOrdersReport(intent.range, intent.filters, intent.recipientEmail);
    case 'request_report_action':     return actionRequestReportAction(intent.range, intent.filters);
    case 'request_report_range':      return actionRequestReportRange();
    case 'revenue_query':             return actionRevenueQuery(intent.scope);
    case 'customers_top':             return actionCustomersTop(intent.scope);
    case 'customer_lookup':           return actionCustomerLookup(intent.query);
    case 'deliveries_open':           return actionDeliveriesOpen();
    case 'daily_summary':             return actionDailySummary();
    case 'system_errors':             return actionSystemErrors();
    case 'top_products':              return actionTopProducts();
    case 'top_petit_fours':           return actionTopPetitFours();
    case 'new_customers':             return actionNewCustomers();
    case 'count_suppliers':           return actionCountSuppliers();
    case 'list_business_customers':   return actionListBusinessCustomers();
    case 'kitchen_attendance_today':  return actionKitchenAttendanceToday();
    case 'kitchen_prep_summary':      return actionKitchenPrepSummary(intent.range);
    case 'invoices_recent':           return actionInvoicesRecent();
    case 'finished_products_stock':   return actionFinishedProductsStock();
    case 'help':                      return actionHelp();
    case 'chitchat':                  return actionChitchat(intent.mood);
    case 'unknown': {
      // Prefer catalog-driven suggestions when we have user text — those are
      // scored by Hebrew-token overlap with what the user actually typed.
      // Falls back to the hint-bucket suggestions when the input was too
      // generic for any catalog phrase to share tokens with it.
      const fromCatalog = intent.userText ? suggestFromCatalog(intent.userText, 5) : [];
      const options: ClarifyOption[] = fromCatalog.length > 0
        ? fromCatalog.map(s => ({ label: s.label, text: s.text }))
        : suggestionsFor(intent.hint);
      // Always offer the catalog browser as a final fallback so the operator
      // can discover everything the assistant knows.
      options.push({ label: 'מה אני יכולה לשאול אותך?', text: 'עזרה' });
      return {
        kind: 'clarify',
        message: fromCatalog.length > 0
          ? 'לא לגמרי בטוחה — אולי התכוונת לאחת מאלה?'
          : 'לא הבנתי. אולי אחת מאלה?',
        options,
      };
    }
  }
}

// Conversational glue. Returns a warm one-liner instead of robotically
// replying "לא הבנתי" to common social utterances. Picks one of several
// variations at random so repeats don't feel canned. Also offers a couple
// of natural follow-ups for moods where it makes sense (greeting,
// how_are_you, praise) so the operator has somewhere to go next without
// having to start from scratch.
// Hebrew greeting by Asia/Jerusalem local hour — kept consistent with the
// welcome-state greeting on the client. Replicated here (not imported) so
// the server-only registry has no client dependency.
function timeAwareHelloHe(): string {
  try {
    const hourStr = new Date().toLocaleString('en-US', {
      timeZone: 'Asia/Jerusalem', hour: 'numeric', hour12: false,
    });
    const h = parseInt(hourStr, 10);
    if (Number.isNaN(h))   return 'היי';
    if (h >= 5  && h < 12) return 'בוקר טוב';
    if (h >= 12 && h < 17) return 'צהריים טובים';
    if (h >= 17 && h < 22) return 'ערב טוב';
    return 'לילה טוב';
  } catch { return 'היי'; }
}

async function actionChitchat(mood: ChitchatMood): Promise<AssistantResponse> {
  const hello = timeAwareHelloHe();

  const replies: Record<ChitchatMood, string[]> = {
    thanks: [
      'בכיף 😊',
      'אין על מה, תמיד לשירותך',
      'שמחה לעזור 🤍',
      'בשמחה, פה בשבילך',
    ],
    praise: [
      'תודה רבה 🥰 שמחה שעזרתי',
      'איזה כיף לשמוע 🙏',
      'תודה לך! מעריכה את זה',
      'אהבתי, תודה ❤️',
    ],
    agree: [
      'מעולה ✨',
      'בכיף, ממשיכות הלאה',
      'אוקיי, מה הלאה?',
    ],
    disagree: [
      'בסדר גמור, נסי לנסח אחרת ואני אנסה שוב',
      'אוקיי. אולי תרצי לראות מה אני יודעת לענות? כתבי "עזרה"',
    ],
    greeting: [
      `${hello}! 👋 איך אני יכולה לעזור?`,
      `${hello} 😊 על מה תרצי לדעת?`,
      `${hello}, ברוכה הבאה. תרצי תמונת מצב של היום?`,
    ],
    farewell: [
      'להתראות! 👋 אני פה כשתצטרכי',
      'ביי, יום מתוק! 🍫',
      'נתראה, בהצלחה עם ההזמנות',
    ],
    how_are_you: [
      'מצוין, תודה ששאלת 💛 ואצלך?',
      'הכל טוב, מוכנה לעזור. על מה נדבר?',
      'תודה! פה ובמלוא הכוננות. מה רצית לשאול?',
    ],
    apology: [
      'אין על מה, הכל בסדר 🙂',
      'לא קרה כלום, בואי ננסה שוב',
    ],
  };

  const arr = replies[mood];
  const choice = arr[Math.floor(Math.random() * arr.length)];

  const blocks: Block[] = [{ type: 'text', text: choice }];

  // Soft follow-ups only for moods where they feel natural.
  if (mood === 'greeting' || mood === 'how_are_you') {
    blocks.push({
      type: 'suggestions',
      title: 'אפשרויות מהירות',
      items: [
        { label: 'תני סיכום של היום',     text: 'תני לי סיכום של היום' },
        { label: 'הכנסות החודש',          text: 'מה ההכנסות החודש?' },
        { label: 'מה אני יכולה לשאול?',   text: 'עזרה' },
      ],
    });
  }
  if (mood === 'praise' || mood === 'thanks') {
    blocks.push({
      type: 'suggestions',
      title: 'עוד משהו?',
      items: [
        { label: 'תני סיכום של היום',     text: 'תני לי סיכום של היום' },
        { label: 'משלוחים פתוחים',        text: 'אילו משלוחים עוד לא נמסרו?' },
      ],
    });
  }

  return { kind: 'answer', blocks };
}

// "מה אני יכולה לשאול אותך" — surfaces the full question catalog grouped
// by category. The UI renders one list block per category, each holding the
// labels from question-catalog.ts so the operator can browse + tap any
// suggestion to fire it immediately.
async function actionHelp(): Promise<AssistantResponse> {
  const groups = catalogGrouped();
  const blocks: Block[] = [
    {
      type: 'text',
      text: 'הנה כל סוגי השאלות שאני יודעת לענות עליהן. לחצי על אחת כדי לשאול אותה.',
    },
  ];
  for (const g of groups) {
    blocks.push({
      type: 'suggestions',
      title: g.label,
      items: g.entries.map(e => ({ label: e.label, text: e.phrases[0] || e.label })),
    });
  }
  return { kind: 'answer', blocks };
}

export async function runIntent(intent: ParsedIntent): Promise<AssistantResponse> {
  const response = await dispatch(intent);
  // Echo intent back so the client can use it as lastIntent next round
  if (response.kind === 'answer' || response.kind === 'clarify') {
    response.intent = intent;
  }
  // Append a follow-up suggestions block to answers (when meaningful)
  if (response.kind === 'answer') {
    const fus = followUpsFor(intent);
    if (fus.length > 0) {
      response.blocks.push({ type: 'suggestions', title: 'פעולות קשורות', items: fus });
    }
  }
  return response;
}

export const ASSISTANT_SUGGESTIONS = DEFAULT_SUGGESTIONS;
