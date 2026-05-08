// Action Registry — single source of truth for what the assistant can do.
// All 6 actions are read-only: no DB writes, no emails, no status changes.
// Each action returns AssistantResponse blocks that the UI renders directly.

import { createAdminClient } from '@/lib/supabase/server';
import { fetchOrdersForReport, resolveRange as resolveReportRange } from '@/lib/orders-report-email';
import type {
  AssistantResponse, Block, ListItem, OrderSummary,
  ParsedIntent, Range, Filters, Tone,
} from './types';

const SUGGESTIONS = [
  { label: 'כמה הזמנות יש היום?',           text: 'כמה הזמנות יש היום?' },
  { label: 'איזה סוגי פטיפורים קיימים?',    text: 'איזה סוגי פטיפורים קיימים?' },
  { label: 'איזה מארזים יש?',                text: 'איזה מארזים יש?' },
  { label: 'איזה פטיפורים הוזמנו היום?',    text: 'איזה פטיפורים הוזמנו היום?' },
  { label: 'מה במלאי נמוך?',                 text: 'מה במלאי נמוך?' },
  { label: 'הזמנות דחופות להיום',            text: 'תראי הזמנות דחופות להיום' },
];

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

  const items: ListItem[] = [
    { label: 'דחופות',     value: String(summary.urgent),   emoji: '⚡', tone: summary.urgent > 0 ? 'warn' : 'neutral' },
    { label: 'משלוחים',    value: String(summary.delivery), emoji: '🚚', tone: 'neutral' },
    { label: 'איסוף עצמי', value: String(summary.pickup),   emoji: '🏬', tone: 'neutral' },
    { label: 'לא שולמו',   value: String(summary.unpaid),   emoji: '💰', tone: summary.unpaid > 0 ? 'warn' : 'neutral' },
  ];

  return {
    kind: 'answer',
    blocks: [
      { type: 'stat', label: `הזמנות ${rangeLabel(range)} ${filtersLabel(filters)}`.trim(),
        value: String(summary.total), emoji: '📦', tone: 'neutral' },
      ...(summary.total > 0 ? [{ type: 'list' as const, items }] : []),
    ],
  };
}

async function actionFindOrders(range: Range, filters: Filters): Promise<AssistantResponse> {
  const { startDate, endDate } = resolveReportRange(rangeToReportInput(range));
  const { orders } = await fetchOrdersForReport(startDate, endDate, filters);

  if (orders.length === 0) {
    return { kind: 'answer', blocks: [{ type: 'text', text: `לא נמצאו הזמנות ${rangeLabel(range)} ${filtersLabel(filters)}`.trim() }] };
  }

  const summaries = orders.slice(0, 20).map(toOrderSummary);
  const title = `${orders.length} הזמנות ${rangeLabel(range)} ${filtersLabel(filters)}`.trim();
  const blocks: Block[] = [{ type: 'orders', title, orders: summaries }];
  if (orders.length > 20) {
    blocks.push({ type: 'text', text: `מציגה 20 ראשונות מתוך ${orders.length}` });
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
    return { kind: 'answer', blocks: [{ type: 'text', text: '🟢 הכל תקין — אין חומרי גלם במלאי נמוך' }] };
  }

  const items: ListItem[] = rows.map((r: Record<string, unknown>) => {
    const status = String(r['סטטוס_מלאי'] || '');
    const isOut = status === 'אזל מהמלאי';
    const isCritical = status === 'קריטי';
    const tone: Tone = isOut ? 'bad' : isCritical ? 'bad' : 'warn';
    return {
      label: String(r['שם_חומר_גלם']),
      value: `${r['כמות_במלאי']} ${r['יחידת_מידה'] || ''}`.trim(),
      sublabel: status,
      tone,
      emoji: toneToEmoji(tone),
    };
  });

  return {
    kind: 'answer',
    blocks: [{ type: 'list', title: `${rows.length} פריטים במלאי נמוך`, items }],
  };
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

  const items: ListItem[] = rows.map((r: Record<string, unknown>) => {
    const qty = Number(r['כמות_במלאי']) || 0;
    const tone: Tone = qty === 0 ? 'bad' : qty <= 3 ? 'warn' : 'good';
    return {
      label: String(r['שם_פטיפור']),
      value: `${qty} יח׳`,
      tone,
      emoji: toneToEmoji(tone),
    };
  });

  return {
    kind: 'answer',
    blocks: [{ type: 'list', title: `${rows.length} סוגי פטיפורים`, items }],
  };
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
      {
        type: 'list',
        title: 'פירוט לפי סוג',
        items: sorted.map(([name, qty]) => ({
          label: name,
          value: `${qty} יח׳`,
          emoji: '🍬',
        })),
      },
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
  const [finishedRes, rawRes, petitFourRes] = await Promise.all([
    supabase.from('מוצרים_למכירה')
      .select('id, שם_מוצר, כמות_במלאי, פעיל')
      .ilike('שם_מוצר', `%${q}%`)
      .eq('פעיל', true)
      .limit(8),
    supabase.from('מלאי_חומרי_גלם')
      .select('שם_חומר_גלם, כמות_במלאי, יחידת_מידה, סטטוס_מלאי')
      .ilike('שם_חומר_גלם', `%${q}%`)
      .limit(8),
    supabase.from('סוגי_פטיפורים')
      .select('שם_פטיפור, כמות_במלאי, פעיל')
      .ilike('שם_פטיפור', `%${q}%`)
      .eq('פעיל', true)
      .limit(8),
  ]);

  if (finishedRes.error)  throw new Error(finishedRes.error.message);
  if (rawRes.error)       throw new Error(rawRes.error.message);
  if (petitFourRes.error) throw new Error(petitFourRes.error.message);

  const finished   = (finishedRes.data || []) as Record<string, unknown>[];
  const rawMats    = (rawRes.data || []) as Record<string, unknown>[];
  const petitFours = (petitFourRes.data || []) as Record<string, unknown>[];

  if (finished.length === 0 && rawMats.length === 0 && petitFours.length === 0) {
    return { kind: 'answer', blocks: [{ type: 'text', text: `לא מצאתי "${q}" במלאי` }] };
  }

  const blocks: Block[] = [];

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

  return { kind: 'answer', blocks };
}

// ───── Dispatcher ──────────────────────────────────────────────────────────

export async function runIntent(intent: ParsedIntent): Promise<AssistantResponse> {
  switch (intent.type) {
    case 'count_orders':              return actionCountOrders(intent.range, intent.filters);
    case 'find_orders':               return actionFindOrders(intent.range, intent.filters);
    case 'list_low_stock':            return actionListLowStock();
    case 'find_package':              return actionFindPackage(intent.query);
    case 'stock_query':               return actionStockQuery(intent.query);
    case 'list_petit_four_types':     return actionListPetitFourTypes();
    case 'order_petit_four_summary':  return actionOrderPetitFourSummary(intent.range);
    case 'count_order_items_by_kind': return actionCountOrderItemsByKind(intent.range, intent.kind);
    case 'unknown':
      return {
        kind: 'clarify',
        message: 'לא הבנתי. תוכלי לנסות:',
        options: SUGGESTIONS,
      };
  }
}

export const ASSISTANT_SUGGESTIONS = SUGGESTIONS;
