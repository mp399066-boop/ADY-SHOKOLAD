// Builds and sends a styled HTML report of orders within a date range.
// Read-only: never updates DB, never creates invoices, never changes statuses.

import sgMail from '@sendgrid/mail';
import { createAdminClient } from '@/lib/supabase/server';

export type ReportRange = 'today' | 'tomorrow' | 'week' | 'custom';

export interface ReportFilters {
  urgentOnly?: boolean;
  unpaidOnly?: boolean;
  deliveryOnly?: boolean;
  pickupOnly?: boolean;
}

export interface ReportInput {
  range: ReportRange;
  date?: string | null;
  filters?: ReportFilters;
}

export interface ReportSummary {
  total: number;
  urgent: number;
  delivery: number;
  pickup: number;
  unpaid: number;
  startDate: string;
  endDate: string;
  rangeLabel: string;
}

const TZ = 'Asia/Jerusalem';
const BUSINESS = 'עדי תכשיט שוקולד';

function todayInTZ(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function formatHebrewDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

function rangeLabel(range: ReportRange, start: string, end: string): string {
  if (range === 'today') return `היום (${formatHebrewDate(start)})`;
  if (range === 'tomorrow') return `מחר (${formatHebrewDate(start)})`;
  if (range === 'week') return `השבוע הקרוב (${formatHebrewDate(start)} – ${formatHebrewDate(end)})`;
  return `תאריך ${formatHebrewDate(start)}`;
}

export function resolveRange(input: ReportInput): { startDate: string; endDate: string; label: string } {
  const today = todayInTZ();
  let startDate: string;
  let endDate: string;
  if (input.range === 'today') {
    startDate = today;
    endDate = today;
  } else if (input.range === 'tomorrow') {
    startDate = addDaysISO(today, 1);
    endDate = startDate;
  } else if (input.range === 'week') {
    startDate = today;
    endDate = addDaysISO(today, 6);
  } else {
    if (!input.date || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
      throw new Error('תאריך לא תקין — נדרש YYYY-MM-DD');
    }
    startDate = input.date;
    endDate = input.date;
  }
  return { startDate, endDate, label: rangeLabel(input.range, startDate, endDate) };
}

type RawOrder = Record<string, unknown> & { לקוחות?: Record<string, unknown> | null };

export async function fetchOrdersForReport(
  startDate: string,
  endDate: string,
  filters: ReportFilters,
): Promise<{ orders: RawOrder[]; itemsByOrder: Record<string, Record<string, unknown>[]>; summary: Omit<ReportSummary, 'rangeLabel' | 'startDate' | 'endDate'> }> {
  const supabase = createAdminClient();

  let q = supabase
    .from('הזמנות')
    .select('*, לקוחות(*)')
    .gte('תאריך_אספקה', startDate)
    .lte('תאריך_אספקה', endDate)
    .neq('סטטוס_הזמנה', 'בוטלה')
    .neq('סטטוס_הזמנה', 'טיוטה')
    .order('תאריך_אספקה', { ascending: true })
    .order('שעת_אספקה', { ascending: true, nullsFirst: false });

  if (filters.urgentOnly) q = q.eq('הזמנה_דחופה', true);
  if (filters.unpaidOnly) q = q.eq('סטטוס_תשלום', 'ממתין');
  if (filters.deliveryOnly) q = q.eq('סוג_אספקה', 'משלוח');
  if (filters.pickupOnly) q = q.eq('סוג_אספקה', 'איסוף עצמי');

  const { data: orders, error } = await q;
  if (error) throw new Error(`שגיאה בטעינת הזמנות: ${error.message}`);
  const list = (orders || []) as RawOrder[];

  const ids = list.map(o => String(o.id));
  let itemsByOrder: Record<string, Record<string, unknown>[]> = {};
  if (ids.length > 0) {
    const { data: items, error: itemsErr } = await supabase
      .from('מוצרים_בהזמנה')
      .select('*, מוצרים_למכירה(*), בחירת_פטיפורים_בהזמנה(*, סוגי_פטיפורים(*))')
      .in('הזמנה_id', ids);
    if (itemsErr) throw new Error(`שגיאה בטעינת פריטי הזמנה: ${itemsErr.message}`);
    for (const it of (items || []) as Record<string, unknown>[]) {
      const oid = String(it['הזמנה_id']);
      (itemsByOrder[oid] ||= []).push(it);
    }
  }

  const summary = {
    total: list.length,
    urgent: list.filter(o => o['הזמנה_דחופה'] === true).length,
    delivery: list.filter(o => o['סוג_אספקה'] === 'משלוח').length,
    pickup: list.filter(o => o['סוג_אספקה'] === 'איסוף עצמי').length,
    unpaid: list.filter(o => o['סטטוס_תשלום'] === 'ממתין').length,
  };

  return { orders: list, itemsByOrder, summary };
}

function esc(s: unknown): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Fallback for product name when מוצרים_למכירה join didn't resolve. WC
// orders that landed before auto-create stored the public name inside
// הערות_לשורה as `מוצר מהאתר: <name> (SKU ...)`. Surface that so the
// report doesn't show "פריט" / "—" for those legacy lines.
function deriveItemName(item: Record<string, unknown>): string {
  const prod = item['מוצרים_למכירה'] as Record<string, unknown> | null;
  if (prod?.['שם_מוצר']) return String(prod['שם_מוצר']);
  const note = (item['הערות_לשורה'] as string | null) || '';
  const wcMatch = note.match(/^מוצר מהאתר:\s*(.+?)(?:\s*\(SKU\b|$)/);
  if (wcMatch) return wcMatch[1].trim();
  return 'פריט';
}

function itemLine(item: Record<string, unknown>): string {
  const pfSelections = item['בחירת_פטיפורים_בהזמנה'] as Record<string, unknown>[] | null;
  const pfNames = pfSelections?.map(s => {
    const pf = s['סוגי_פטיפורים'] as Record<string, string> | null;
    return pf ? `${pf['שם_פטיפור']} ×${s['כמות']}` : '';
  }).filter(Boolean).join(', ');

  const name = item['סוג_שורה'] === 'מארז'
    ? `מארז ${item['גודל_מארז'] || ''} יח׳${pfNames ? ` (${pfNames})` : ''}`
    : deriveItemName(item);

  // הערות_לשורה for non-WC lines is a real per-line note (the WC fallback
  // was already consumed by deriveItemName so we strip that prefix).
  const rawNote = (item['הערות_לשורה'] as string | null) || '';
  const isWcFallback = /^מוצר מהאתר:/.test(rawNote);
  const lineNote = isWcFallback ? '' : rawNote;

  return `<li style="padding:4px 0;font-size:13px;color:#2B1A10">
    <span style="font-weight:600">${esc(item['כמות'])}×</span>
    <span style="margin-right:6px">${esc(name)}</span>
    ${lineNote ? `<div style="margin-right:22px;font-size:11.5px;color:#8A7664;font-style:italic">· ${esc(lineNote)}</div>` : ''}
  </li>`;
}

function statusBadge(status: string): string {
  const map: Record<string, { bg: string; fg: string }> = {
    'חדשה':         { bg: '#EAF2FB', fg: '#1E4E8C' },
    'בהכנה':        { bg: '#FFF4E0', fg: '#8A5A18' },
    'מוכנה למשלוח': { bg: '#E8F4EC', fg: '#1F6B3E' },
    'נשלחה':         { bg: '#EDE6F4', fg: '#5A3A8B' },
    'הושלמה בהצלחה': { bg: '#E5F2EA', fg: '#1F6B3E' },
  };
  const c = map[status] || { bg: '#F0EAE0', fg: '#5C4A38' };
  return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;background:${c.bg};color:${c.fg}">${esc(status)}</span>`;
}

function paymentBadge(status: string): string {
  const map: Record<string, { bg: string; fg: string }> = {
    'שולם':   { bg: '#E5F2EA', fg: '#1F6B3E' },
    'ממתין':   { bg: '#FBE9E7', fg: '#A03C2C' },
    'חלקי':    { bg: '#FFF4E0', fg: '#8A5A18' },
    'בארטר':  { bg: '#F0EAE0', fg: '#5C4A38' },
    'בוטל':    { bg: '#F0EAE0', fg: '#8E7D6A' },
  };
  const c = map[status] || { bg: '#F0EAE0', fg: '#5C4A38' };
  return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;background:${c.bg};color:${c.fg}">${esc(status)}</span>`;
}

function orderCard(order: RawOrder, items: Record<string, unknown>[]): string {
  const customer = order['לקוחות'] as Record<string, unknown> | null;
  const customerName = customer
    ? `${esc(customer['שם_פרטי'] || '')} ${esc(customer['שם_משפחה'] || '')}`.trim() || 'ללא שם'
    : 'ללא שם';
  const customerPhone = (customer?.['טלפון'] as string | null) || '';

  const isDelivery = order['סוג_אספקה'] === 'משלוח';
  const urgent = order['הזמנה_דחופה'] === true;
  const itemsHtml = items.length
    ? `<ul style="margin:6px 0 0;padding:0;list-style:none">${items.map(itemLine).join('')}</ul>`
    : `<div style="font-size:12px;color:#B0A090;font-style:italic">אין פריטים</div>`;

  const addressLine = isDelivery && order['כתובת_מקבל_ההזמנה']
    ? `<tr><td style="padding:4px 10px;color:#8E7D6A;width:38%">כתובת</td><td style="padding:4px 10px;color:#2B1A10;font-weight:600">${esc(order['כתובת_מקבל_ההזמנה'])}${order['עיר'] ? ', ' + esc(order['עיר']) : ''}</td></tr>`
    : '';
  const recipientLine = isDelivery && order['שם_מקבל']
    ? `<tr><td style="padding:4px 10px;color:#8E7D6A">שם מקבל</td><td style="padding:4px 10px;color:#2B1A10;font-weight:600">${esc(order['שם_מקבל'])}${order['טלפון_מקבל'] ? ` · ${esc(order['טלפון_מקבל'])}` : ''}</td></tr>`
    : '';
  // Pickup orders carry the same שעת_אספקה field but operationally that's
  // when the customer arrives — relabel so the report reads correctly.
  const timeLabel = isDelivery ? 'שעת אספקה' : 'שעת איסוף';
  const timeLine = order['שעת_אספקה']
    ? `<tr><td style="padding:4px 10px;color:#8E7D6A">${timeLabel}</td><td style="padding:4px 10px;color:#2B1A10;font-weight:700">${esc(order['שעת_אספקה'])}</td></tr>`
    : '';
  const deliveryInstructionsLine = isDelivery && order['הוראות_משלוח']
    ? `<tr><td style="padding:4px 10px;color:#8E7D6A">הוראות משלוח</td><td style="padding:4px 10px;color:#5C3D22">${esc(order['הוראות_משלוח'])}</td></tr>`
    : '';

  const notesLine = order['הערות_להזמנה']
    ? `<div style="margin-top:10px;padding:8px 12px;background:#FFF8EE;border-right:3px solid #C9A46A;border-radius:6px;font-size:12px;color:#5C3D22">📝 ${esc(order['הערות_להזמנה'])}</div>`
    : '';
  const greetingLine = order['ברכה_טקסט']
    ? `<div style="margin-top:8px;padding:8px 12px;background:#FAF7F0;border-right:3px solid #B8956A;border-radius:6px;font-size:12px;color:#5C3D22"><em>💝 ${esc(order['ברכה_טקסט'])}</em></div>`
    : '';

  const urgentBadge = urgent
    ? `<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;background:#FBE9E7;color:#A03C2C;margin-right:6px">⚡ דחוף</span>`
    : '';

  return `
  <div class="report-card" style="background:#FFFFFF;border:1px solid ${urgent ? '#E8B5A8' : '#EDE0CE'};border-radius:10px;padding:16px 18px;margin-bottom:12px${urgent ? ';box-shadow:0 0 0 1px rgba(160,60,44,0.06)' : ''}">

    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;margin-bottom:8px">
      <div>
        <div style="font-size:11px;color:#8E7D6A;letter-spacing:0.04em">הזמנה</div>
        <div style="font-size:15px;font-weight:700;color:#2B1A10">${esc(order['מספר_הזמנה'])}</div>
      </div>
      <div style="text-align:left">
        ${urgentBadge}${statusBadge(String(order['סטטוס_הזמנה'] || ''))} ${paymentBadge(String(order['סטטוס_תשלום'] || ''))}
      </div>
    </div>

    <div style="font-size:14px;font-weight:600;color:#2B1A10;margin-bottom:2px">${customerName}</div>
    ${customerPhone ? `<div style="font-size:12px;color:#8A7664;margin-bottom:10px">${esc(customerPhone)}</div>` : '<div style="margin-bottom:10px"></div>'}

    <table style="width:100%;border-collapse:collapse;font-size:12px;background:#FAF7F0;border-radius:6px;padding:6px 10px;margin-bottom:6px">
      <tr><td style="padding:4px 10px;color:#8E7D6A;width:38%">תאריך אספקה</td><td style="padding:4px 10px;color:#2B1A10;font-weight:600">${esc(formatHebrewDate(String(order['תאריך_אספקה'] || '')))}</td></tr>
      ${timeLine}
      <tr><td style="padding:4px 10px;color:#8E7D6A">סוג אספקה</td><td style="padding:4px 10px;color:#2B1A10;font-weight:600">${esc(order['סוג_אספקה'])}</td></tr>
      ${recipientLine}
      ${addressLine}
      ${deliveryInstructionsLine}
    </table>

    <div style="font-size:11px;font-weight:700;color:#8E7D6A;letter-spacing:0.06em;margin-top:10px">פריטים</div>
    ${itemsHtml}

    ${notesLine}
    ${greetingLine}
  </div>`;
}

export function buildReportHtml(
  summary: ReportSummary,
  orders: RawOrder[],
  itemsByOrder: Record<string, Record<string, unknown>[]>,
  forDownload = false,
): string {
  const cards = orders.length
    ? orders.map(o => orderCard(o, itemsByOrder[String(o.id)] || [])).join('')
    : `<div style="background:#FFFFFF;border:1px dashed #EDE0CE;border-radius:10px;padding:32px;text-align:center;color:#8E7D6A;font-size:14px">אין הזמנות בטווח שנבחר</div>`;

  // Print-friendly toolbar + @media print rules — only injected for download mode
  const printExtras = forDownload ? `
  <style>
    @media print {
      .no-print { display: none !important; }
      body { background: #FFFFFF !important; }
      .report-card { break-inside: avoid; page-break-inside: avoid; }
    }
    @page { size: A4; margin: 14mm; }
  </style>
  <div class="no-print" style="position:sticky;top:0;z-index:10;background:#FFFFFF;border-bottom:1px solid #EDE0CE;padding:10px 16px;text-align:center;box-shadow:0 1px 3px rgba(58,42,26,0.06)">
    <button onclick="window.print()" style="background:#8B5E34;color:#FFFFFF;border:none;border-radius:8px;padding:8px 18px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit">🖨️ הדפס / שמור כ-PDF</button>
    <span style="display:inline-block;margin-right:12px;font-size:12px;color:#8A7664">בדיאלוג ההדפסה — בחר "Save as PDF" כדי לשמור</span>
  </div>` : '';

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>דוח הזמנות — ${esc(summary.rangeLabel)}</title></head>
<body style="margin:0;padding:0;background:#F5F1EB;font-family:Arial,Helvetica,sans-serif;direction:rtl;color:#2B1A10">
  ${printExtras}
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F1EB;padding:24px 12px">
    <tr><td align="center">
      <table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;margin:0 auto">

        <!-- Header -->
        <tr><td style="background:#7C5230;color:#FAF7F0;padding:24px 28px;border-radius:12px 12px 0 0;text-align:center">
          <div style="font-size:11px;letter-spacing:0.12em;opacity:0.78">${esc(BUSINESS)}</div>
          <h1 style="margin:6px 0 4px;font-size:22px;font-weight:700;letter-spacing:0.5px">דוח הזמנות</h1>
          <div style="font-size:13px;opacity:0.9">${esc(summary.rangeLabel)}</div>
        </td></tr>

        <!-- Summary -->
        <tr><td style="background:#FFFFFF;border-right:1px solid #EDE0CE;border-left:1px solid #EDE0CE;padding:18px 24px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:10px 8px;text-align:center;background:#FAF7F0;border-radius:8px">
                <div style="font-size:11px;color:#8E7D6A;letter-spacing:0.05em">סך הזמנות</div>
                <div style="font-size:22px;font-weight:700;color:#7C5230;margin-top:2px">${summary.total}</div>
              </td>
              <td style="width:8px"></td>
              <td style="padding:10px 8px;text-align:center;background:${summary.urgent > 0 ? '#FBE9E7' : '#FAF7F0'};border-radius:8px">
                <div style="font-size:11px;color:${summary.urgent > 0 ? '#A03C2C' : '#8E7D6A'};letter-spacing:0.05em">דחופות</div>
                <div style="font-size:22px;font-weight:700;color:${summary.urgent > 0 ? '#A03C2C' : '#7C5230'};margin-top:2px">${summary.urgent}</div>
              </td>
              <td style="width:8px"></td>
              <td style="padding:10px 8px;text-align:center;background:#FAF7F0;border-radius:8px">
                <div style="font-size:11px;color:#8E7D6A;letter-spacing:0.05em">משלוחים</div>
                <div style="font-size:22px;font-weight:700;color:#7C5230;margin-top:2px">${summary.delivery}</div>
              </td>
              <td style="width:8px"></td>
              <td style="padding:10px 8px;text-align:center;background:#FAF7F0;border-radius:8px">
                <div style="font-size:11px;color:#8E7D6A;letter-spacing:0.05em">איסוף</div>
                <div style="font-size:22px;font-weight:700;color:#7C5230;margin-top:2px">${summary.pickup}</div>
              </td>
              <td style="width:8px"></td>
              <td style="padding:10px 8px;text-align:center;background:${summary.unpaid > 0 ? '#FFF4E0' : '#FAF7F0'};border-radius:8px">
                <div style="font-size:11px;color:${summary.unpaid > 0 ? '#8A5A18' : '#8E7D6A'};letter-spacing:0.05em">לא שולמו</div>
                <div style="font-size:22px;font-weight:700;color:${summary.unpaid > 0 ? '#8A5A18' : '#7C5230'};margin-top:2px">${summary.unpaid}</div>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Orders -->
        <tr><td style="background:#F5F1EB;border-right:1px solid #EDE0CE;border-left:1px solid #EDE0CE;padding:14px 16px">
          ${cards}
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#FDFAF5;border:1px solid #EDE0CE;border-top:none;border-radius:0 0 12px 12px;padding:16px 24px;text-align:center">
          <div style="font-size:12px;color:#8A7664">דוח אוטומטי — ${esc(BUSINESS)}</div>
          <div style="font-size:11px;color:#B0A090;margin-top:3px">דוח קריאה בלבד — לא בוצעו שינויים במערכת</div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
}

// Shared by send + download — fetches data and builds the styled HTML.
// Pass forDownload=true to inject the print toolbar and @media print rules.
export async function generateOrdersReport(
  input: ReportInput,
  opts: { forDownload?: boolean } = {},
): Promise<{ html: string; summary: ReportSummary; subject: string }> {
  const { startDate, endDate, label } = resolveRange(input);
  const filters = input.filters || {};
  const { orders, itemsByOrder, summary: counts } = await fetchOrdersForReport(startDate, endDate, filters);

  const summary: ReportSummary = { ...counts, startDate, endDate, rangeLabel: label };
  const html = buildReportHtml(summary, orders, itemsByOrder, opts.forDownload === true);
  const subject = `דוח הזמנות — ${label} — ${BUSINESS}`;
  return { html, summary, subject };
}

export async function sendOrdersReport(
  recipientEmail: string,
  input: ReportInput,
): Promise<{ summary: ReportSummary; subject: string }> {
  const { html, summary, subject } = await generateOrdersReport(input);

  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.FROM_EMAIL;
  if (!apiKey || !from) {
    throw new Error('שירות המייל אינו מוגדר בשרת (חסר SENDGRID_API_KEY או FROM_EMAIL)');
  }

  sgMail.setApiKey(apiKey);
  await sgMail.send({
    to: recipientEmail,
    from: { email: from, name: BUSINESS },
    subject,
    html,
  });

  return { summary, subject };
}
