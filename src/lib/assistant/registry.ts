// Action Registry — single source of truth for what the assistant can do.
// All 6 actions are read-only: no DB writes, no emails, no status changes.
// Each action returns AssistantResponse blocks that the UI renders directly.

import { createAdminClient } from '@/lib/supabase/server';
import { fetchOrdersForReport, resolveRange as resolveReportRange } from '@/lib/orders-report-email';
import { resolveEntity } from './entity-resolver';
import type {
  AssistantResponse, Block, ClarifyOption, ListItem, OrderSummary,
  ParsedIntent, Range, Filters, Tone, UnknownHint,
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
    return { kind: 'answer', blocks: [{ type: 'text', text: `לא מצאתי הזמנות ${desc} 😊` }] };
  }

  blocks.push({
    type: 'list',
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
    return { kind: 'answer', blocks: [{ type: 'text', text: `לא מצאתי הזמנות ${desc} 😊` }] };
  }

  const summaries = orders.slice(0, 20).map(toOrderSummary);
  const title = `מצאתי ${orders.length} הזמנות ${desc}`;
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
    return { kind: 'answer', blocks: [{ type: 'text', text: '🟢 הכל תקין במלאי 😊' }] };
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
    { type: 'list', title: `מצאתי ${rows.length} פריטים שדורשים תשומת לב`, items },
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
    return { kind: 'answer', blocks: [{ type: 'text', text: `לא מצאתי "${q}" במלאי 😊 נסי שם אחר?` }] };
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
    case 'unknown':
      return {
        kind: 'clarify',
        message: 'לא הבנתי. אולי אחת מאלה?',
        options: suggestionsFor(intent.hint),
      };
  }
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
