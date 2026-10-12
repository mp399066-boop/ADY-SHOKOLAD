export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email-transport';
import * as XLSX from 'xlsx';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminUser } from '@/lib/auth/requireAuthorizedUser';
import { fetchAllPages } from '@/lib/supabase/fetch-all';
import { dbStepErrorResponse, serverErrorResponse } from '@/lib/api-error';

// GET /api/reports/monthly-backup-export
//
// Monthly Excel backup + summary email. READ-ONLY against existing tables —
// no writes, no Morning, no WooCommerce, no invoice generation.
//
// The workbook holds two kinds of sheets:
//   • full snapshot (every row, all time): סיכום, כל הלקוחות, כל ההזמנות, מוצרים
//   • the reported month only: הזמנות החודש, פריטים, תשלומים, משלוחים, חשבוניות
//
// Auth: accepts EITHER
//   1) `Authorization: Bearer ${CRON_SECRET}` — vercel.json cron path (1st of month)
//   2) `requireAdminUser()` — manual trigger from מרכז בקרה. Admin only, because
//      the attachment is the full customer list.
// Defaults to previous calendar month; overridable via ?month= & ?year=.
// Default recipient adi548419927@gmail.com; overridable via ?to= for testing.

const ROUTE = 'backup-export';
const DEFAULT_RECIPIENT = 'adi548419927@gmail.com';
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
// Orders that never became a sale — kept in the sheets, left out of totals.
const NOT_A_SALE = new Set(['בוטלה', 'טיוטה']);
// Keeps `.in('הזמנה_id', ids)` URLs well under PostgREST's length limit.
const ID_CHUNK = 150;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const fullName = (first: string | null | undefined, last: string | null | undefined) =>
  `${first ?? ''} ${last ?? ''}`.trim();

const ils = (n: number) => `${n.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₪`;

export async function GET(req: NextRequest) {
  // ── Auth: cron-bearer OR authenticated admin ──────────────────────────
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization') || '';
  const isCron = !!(secret && authHeader === `Bearer ${secret}`);
  if (!isCron) {
    const auth = await requireAdminUser();
    if (!auth) {
      if (authHeader) console.warn(`[${ROUTE}] unauthorized cron call (CRON_SECRET ${secret ? 'mismatch' : 'not configured'})`);
      return NextResponse.json({ error: 'שליחת הגיבוי מותרת לאדמין בלבד.' }, { status: 401 });
    }
  }

  // ── Resolve target month ──────────────────────────────────────────────
  const { searchParams } = new URL(req.url);
  const monthParam = searchParams.get('month');
  const yearParam = searchParams.get('year');
  const toParam = searchParams.get('to')?.trim() ?? '';

  let year: number;
  let month: number; // 1-12
  if (monthParam && yearParam) {
    month = parseInt(monthParam, 10);
    year = parseInt(yearParam, 10);
  } else {
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    year = prev.getFullYear();
    month = prev.getMonth() + 1;
  }
  if (!Number.isFinite(month) || month < 1 || month > 12 ||
      !Number.isFinite(year)  || year  < 2020 || year > 2100) {
    return NextResponse.json({ error: 'חודש או שנה לא תקינים' }, { status: 400 });
  }
  if (toParam && !EMAIL_RE.test(toParam)) {
    return NextResponse.json({ error: 'כתובת המייל לא תקינה' }, { status: 400 });
  }

  const startMs = Date.UTC(year, month - 1, 1, 0, 0, 0);
  const endMs   = Date.UTC(year, month,     1, 0, 0, 0); // exclusive
  const mmStr   = String(month).padStart(2, '0');
  const inMonth = (iso: string | null | undefined) => {
    if (!iso) return false;
    const t = Date.parse(iso);
    return t >= startMs && t < endMs;
  };

  const recipient = toParam || DEFAULT_RECIPIENT;
  const recipientLogSafe = recipient.split('@')[0].slice(0, 3) + '***@***';
  console.log(`[${ROUTE}] started | month: ${year}-${mmStr} | recipient: ${recipientLogSafe} | isCron: ${isCron}`);

  const from = process.env.FROM_EMAIL;
  if (!process.env.RESEND_API_KEY || !from) {
    console.error(`[${ROUTE}] RESEND_API_KEY or FROM_EMAIL not set`);
    return NextResponse.json({ error: 'שירות המייל לא מוגדר' }, { status: 500 });
  }

  try {
    const supabase = createAdminClient();

    // ── Full snapshot: customers, orders, products ──────────────────────
    type CustomerRow = {
      id: string;
      שם_פרטי: string | null;
      שם_משפחה: string | null;
      טלפון: string | null;
      אימייל: string | null;
      סוג_לקוח: string | null;
      עיר: string | null;
      כתובת: string | null;
      תאריך_יצירה: string | null;
      הערות: string | null;
    };
    const { data: customers, error: custErr } = await fetchAllPages<CustomerRow>((a, b) =>
      supabase
        .from('לקוחות')
        .select('id, שם_פרטי, שם_משפחה, טלפון, אימייל, סוג_לקוח, עיר, כתובת, תאריך_יצירה, הערות')
        .order('id')
        .range(a, b),
    );
    if (custErr) return dbStepErrorResponse(custErr, ROUTE, 'טעינת הלקוחות לגיבוי נכשלה');

    type OrderRow = {
      id: string;
      מספר_הזמנה: string;
      לקוח_id: string | null;
      תאריך_יצירה: string;
      תאריך_אספקה: string | null;
      שעת_אספקה: string | null;
      סוג_אספקה: string | null;
      סטטוס_הזמנה: string | null;
      סטטוס_תשלום: string | null;
      סך_הכל_לתשלום: number | null;
      מקור_ההזמנה: string | null;
      הערות_להזמנה: string | null;
      שם_מקבל: string | null;
      טלפון_מקבל: string | null;
    };
    const { data: allOrders, error: ordersErr } = await fetchAllPages<OrderRow>((a, b) =>
      supabase
        .from('הזמנות')
        .select(`
          id, מספר_הזמנה, לקוח_id, תאריך_יצירה, תאריך_אספקה, שעת_אספקה,
          סוג_אספקה, סטטוס_הזמנה, סטטוס_תשלום, סך_הכל_לתשלום, מקור_ההזמנה,
          הערות_להזמנה, שם_מקבל, טלפון_מקבל
        `)
        .order('id')
        .range(a, b),
    );
    if (ordersErr) return dbStepErrorResponse(ordersErr, ROUTE, 'טעינת ההזמנות לגיבוי נכשלה');
    allOrders.sort((x, y) => Date.parse(x.תאריך_יצירה) - Date.parse(y.תאריך_יצירה));

    type ProductRow = {
      id: string;
      שם_מוצר: string | null;
      מחיר: number | null;
      פעיל: boolean | null;
      כמות_במלאי: number | null;
    };
    const { data: products, error: prodErr } = await fetchAllPages<ProductRow>((a, b) =>
      supabase
        .from('מוצרים_למכירה')
        .select('id, שם_מוצר, מחיר, פעיל, כמות_במלאי')
        .order('id')
        .range(a, b),
    );
    if (prodErr) return dbStepErrorResponse(prodErr, ROUTE, 'טעינת המוצרים לגיבוי נכשלה');

    const customersById = new Map(customers.map(c => [c.id, c]));
    const customerName = (id: string | null) => {
      const c = id ? customersById.get(id) : undefined;
      return c ? fullName(c.שם_פרטי, c.שם_משפחה) : '';
    };

    // Per-customer lifetime stats (sales only — no cancelled/draft orders).
    type Stats = { count: number; total: number; last: string | null };
    const statsByCustomer = new Map<string, Stats>();
    for (const o of allOrders) {
      if (!o.לקוח_id || NOT_A_SALE.has(o.סטטוס_הזמנה ?? '')) continue;
      const s = statsByCustomer.get(o.לקוח_id) ?? { count: 0, total: 0, last: null };
      s.count += 1;
      s.total += Number(o.סך_הכל_לתשלום ?? 0);
      if (!s.last || Date.parse(o.תאריך_יצירה) > Date.parse(s.last)) s.last = o.תאריך_יצירה;
      statsByCustomer.set(o.לקוח_id, s);
    }

    // ── The reported month ──────────────────────────────────────────────
    const orders = allOrders.filter(o => inMonth(o.תאריך_יצירה));
    const orderIds = orders.map(o => o.id);
    const orderNumByOrderId = new Map<string, string>(orders.map(o => [o.id, o.מספר_הזמנה]));
    const ordersById = new Map<string, OrderRow>(orders.map(o => [o.id, o]));

    // Child rows of the month's orders, read in id chunks, every page.
    async function fetchForOrders<T>(table: string, columns: string): Promise<{ data: T[]; error: { message: string; code?: string } | null }> {
      const out: T[] = [];
      for (const ids of chunk(orderIds, ID_CHUNK)) {
        const { data, error } = await fetchAllPages<T>((a, b) =>
          supabase.from(table).select(columns).in('הזמנה_id', ids).order('id').range(a, b) as unknown as PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>,
        );
        if (error) return { data: out, error };
        out.push(...data);
      }
      return { data: out, error: null };
    }

    type ItemRow = {
      הזמנה_id: string;
      סוג_שורה: string | null;
      גודל_מארז: number | null;
      כמות: number | null;
      מחיר_ליחידה: number | null;
      סהכ: number | null;
      הערות_לשורה: string | null;
      שם_פריט_מותאם: string | null;
      מוצרים_למכירה: { שם_מוצר: string | null } | null;
    };
    const { data: items, error: itemsErr } = await fetchForOrders<ItemRow>(
      'מוצרים_בהזמנה',
      'הזמנה_id, סוג_שורה, גודל_מארז, כמות, מחיר_ליחידה, סהכ, הערות_לשורה, שם_פריט_מותאם, מוצרים_למכירה(שם_מוצר)',
    );
    if (itemsErr) return dbStepErrorResponse(itemsErr, ROUTE, 'טעינת פריטי ההזמנות לגיבוי נכשלה');

    type PaymentRow = {
      הזמנה_id: string;
      תאריך_תשלום: string | null;
      סכום: number | null;
      אמצעי_תשלום: string | null;
      סטטוס_תשלום: string | null;
      הערות: string | null;
    };
    const { data: payments, error: payErr } = await fetchForOrders<PaymentRow>(
      'תשלומים',
      'הזמנה_id, תאריך_תשלום, סכום, אמצעי_תשלום, סטטוס_תשלום, הערות',
    );
    if (payErr) return dbStepErrorResponse(payErr, ROUTE, 'טעינת התשלומים לגיבוי נכשלה');

    type DeliveryRow = {
      הזמנה_id: string;
      כתובת: string | null;
      עיר: string | null;
      תאריך_משלוח: string | null;
      שעת_משלוח: string | null;
      סטטוס_משלוח: string | null;
      שם_שליח: string | null;
      טלפון_שליח: string | null;
      הוראות_משלוח: string | null;
      שליחים?: { שם_שליח: string | null; טלפון_שליח: string | null } | null;
    };
    const { data: deliveries, error: delErr } = await fetchForOrders<DeliveryRow>(
      'משלוחים',
      'הזמנה_id, כתובת, עיר, תאריך_משלוח, שעת_משלוח, סטטוס_משלוח, שם_שליח, טלפון_שליח, הוראות_משלוח, שליחים:courier_id(שם_שליח, טלפון_שליח)',
    );
    if (delErr) return dbStepErrorResponse(delErr, ROUTE, 'טעינת המשלוחים לגיבוי נכשלה');

    type InvoiceRow = {
      הזמנה_id: string;
      מספר_חשבונית: string | null;
      תאריך_יצירה: string | null;
      סכום: number | null;
      סטטוס: string | null;
      קישור_חשבונית: string | null;
      מקור: string | null;
    };
    const { data: invoices, error: invErr } = await fetchForOrders<InvoiceRow>(
      'חשבוניות',
      'הזמנה_id, מספר_חשבונית, תאריך_יצירה, סכום, סטטוס, קישור_חשבונית, מקור',
    );
    if (invErr) return dbStepErrorResponse(invErr, ROUTE, 'טעינת החשבוניות לגיבוי נכשלה');

    // ── Summary numbers ─────────────────────────────────────────────────
    const monthSales = orders.filter(o => !NOT_A_SALE.has(o.סטטוס_הזמנה ?? ''));
    const monthTotal = monthSales.reduce((s, o) => s + Number(o.סך_הכל_לתשלום ?? 0), 0);
    const monthCancelled = orders.filter(o => o.סטטוס_הזמנה === 'בוטלה').length;
    const newCustomers = customers.filter(c => inMonth(c.תאריך_יצירה)).length;
    const activeCustomerIds = new Set(monthSales.map(o => o.לקוח_id).filter((x): x is string => !!x));
    const unpaid = monthSales.filter(o => o.סטטוס_תשלום === 'ממתין' || o.סטטוס_תשלום === 'חלקי');
    const unpaidTotal = unpaid.reduce((s, o) => s + Number(o.סך_הכל_לתשלום ?? 0), 0);

    const monthByCustomer = new Map<string, { count: number; total: number }>();
    for (const o of monthSales) {
      if (!o.לקוח_id) continue;
      const s = monthByCustomer.get(o.לקוח_id) ?? { count: 0, total: 0 };
      s.count += 1;
      s.total += Number(o.סך_הכל_לתשלום ?? 0);
      monthByCustomer.set(o.לקוח_id, s);
    }
    const topCustomers = Array.from(monthByCustomer.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 5)
      .map(([id, s]) => ({ name: customerName(id) || 'לקוח ללא שם', ...s }));

    const summaryRows: [string, string | number][] = [
      ['חודש הדוח',                   `${mmStr}/${year}`],
      ['הזמנות בחודש (ללא בוטלו/טיוטות)', monthSales.length],
      ['סך הזמנות בחודש',               Math.round(monthTotal * 100) / 100],
      ['הזמנות שבוטלו בחודש',            monthCancelled],
      ['הזמנות בחודש שלא שולמו במלואן',   unpaid.length],
      ['סכום פתוח לגבייה (מהחודש)',       Math.round(unpaidTotal * 100) / 100],
      ['לקוחות שהזמינו בחודש',            activeCustomerIds.size],
      ['לקוחות חדשים בחודש',              newCustomers],
      ['סה״כ לקוחות במערכת',              customers.length],
      ['סה״כ הזמנות במערכת',              allOrders.length],
      ['סה״כ מוצרים במערכת',              products.length],
    ];

    // ── Build workbook ──────────────────────────────────────────────────
    const wb = XLSX.utils.book_new();
    const addSheet = (name: string, rows: Record<string, unknown>[], emptyText = 'אין נתונים לחודש זה') => {
      const data = rows.length === 0 ? [{ 'הודעה': emptyText }] : rows;
      const sheet = XLSX.utils.json_to_sheet(data);
      if (sheet['!ref']) {
        const range = XLSX.utils.decode_range(sheet['!ref']);
        const cols = [];
        for (let c = range.s.c; c <= range.e.c; c++) cols.push({ wch: 18 });
        sheet['!cols'] = cols;
      }
      sheet['!views'] = [{ RTL: true }];
      XLSX.utils.book_append_sheet(wb, sheet, name);
    };

    addSheet('סיכום', summaryRows.map(([k, v]) => ({ 'נתון': k, 'ערך': v })));

    addSheet('כל הלקוחות', customers
      .map(c => {
        const s = statsByCustomer.get(c.id);
        return {
          'שם לקוח':        fullName(c.שם_פרטי, c.שם_משפחה),
          'טלפון':          c.טלפון ?? '',
          'אימייל':         c.אימייל ?? '',
          'סוג לקוח':       c.סוג_לקוח ?? '',
          'עיר':            c.עיר ?? '',
          'כתובת':          c.כתובת ?? '',
          'מספר הזמנות':    s?.count ?? 0,
          'סך קניות':       Math.round((s?.total ?? 0) * 100) / 100,
          'הזמנה אחרונה':   s?.last ?? '',
          'תאריך הצטרפות':  c.תאריך_יצירה ?? '',
          'הערות':          c.הערות ?? '',
        };
      })
      .sort((a, b) => a['שם לקוח'].localeCompare(b['שם לקוח'], 'he')),
      'אין לקוחות במערכת');

    const orderSheetRow = (o: OrderRow) => {
      const cust = o.לקוח_id ? customersById.get(o.לקוח_id) : undefined;
      return {
        'מספר הזמנה':  o.מספר_הזמנה,
        'שם לקוח':     cust ? fullName(cust.שם_פרטי, cust.שם_משפחה) : '',
        'טלפון לקוח':  cust?.טלפון ?? '',
        'תאריך יצירה': o.תאריך_יצירה,
        'תאריך אספקה': o.תאריך_אספקה ?? '',
        'שעת אספקה':   o.שעת_אספקה ?? '',
        'סוג אספקה':   o.סוג_אספקה ?? '',
        'סטטוס הזמנה': o.סטטוס_הזמנה ?? '',
        'סטטוס תשלום': o.סטטוס_תשלום ?? '',
        'סכום כולל':   Number(o.סך_הכל_לתשלום ?? 0),
        'מקור הזמנה':  o.מקור_ההזמנה ?? '',
        'הערות':       o.הערות_להזמנה ?? '',
      };
    };

    addSheet('כל ההזמנות', allOrders.map(orderSheetRow), 'אין הזמנות במערכת');

    addSheet('מוצרים', products
      .map(p => ({
        'שם מוצר':     p.שם_מוצר ?? '',
        'מחיר':        Number(p.מחיר ?? 0),
        'פעיל':        p.פעיל ? 'כן' : 'לא',
        'כמות במלאי':  Number(p.כמות_במלאי ?? 0),
      }))
      .sort((a, b) => a['שם מוצר'].localeCompare(b['שם מוצר'], 'he')),
      'אין מוצרים במערכת');

    addSheet('הזמנות החודש', orders.map(orderSheetRow));

    addSheet('פריטים בהזמנה', items.map(it => {
      let productName = '';
      if (it.סוג_שורה === 'מארז' && it.גודל_מארז) {
        productName = `מארז פטיפורים ${it.גודל_מארז} יחידות`;
      } else if (it.סוג_שורה === 'מוצר_ידני' || it.סוג_שורה === 'תוספת_תשלום') {
        productName = it.שם_פריט_מותאם || 'פריט';
      } else {
        productName = it.מוצרים_למכירה?.שם_מוצר || 'פריט';
      }
      return {
        'מספר הזמנה':  orderNumByOrderId.get(it.הזמנה_id) ?? '',
        'שם מוצר':     productName,
        'כמות':        Number(it.כמות ?? 0),
        'מחיר יחידה':  Number(it.מחיר_ליחידה ?? 0),
        'סה״כ שורה':   Number(it.סהכ ?? 0),
        'הערות':       it.הערות_לשורה ?? '',
      };
    }));

    addSheet('תשלומים', payments.map(p => ({
      'מספר הזמנה':  orderNumByOrderId.get(p.הזמנה_id) ?? '',
      'תאריך תשלום': p.תאריך_תשלום ?? '',
      'סכום':        Number(p.סכום ?? 0),
      'אמצעי תשלום': p.אמצעי_תשלום ?? '',
      'סטטוס':       p.סטטוס_תשלום ?? '',
      'הערות':       p.הערות ?? '',
    })));

    addSheet('משלוחים', deliveries.map(d => {
      const o = ordersById.get(d.הזמנה_id);
      const courierJoin = d.שליחים ?? null;
      return {
        'מספר הזמנה':   orderNumByOrderId.get(d.הזמנה_id) ?? '',
        'שם מקבל':      o?.שם_מקבל ?? '',
        'טלפון מקבל':   o?.טלפון_מקבל ?? '',
        'כתובת':        d.כתובת ?? '',
        'עיר':          d.עיר ?? '',
        'תאריך משלוח':  d.תאריך_משלוח ?? '',
        'שעת משלוח':    d.שעת_משלוח ?? '',
        'סטטוס משלוח':  d.סטטוס_משלוח ?? '',
        'שם שליח':      courierJoin?.שם_שליח ?? d.שם_שליח ?? '',
        'טלפון שליח':   courierJoin?.טלפון_שליח ?? d.טלפון_שליח ?? '',
        'הוראות משלוח': d.הוראות_משלוח ?? '',
      };
    }));

    addSheet('חשבוניות', invoices.map(inv => ({
      'מספר הזמנה':     orderNumByOrderId.get(inv.הזמנה_id) ?? '',
      'מספר חשבונית':   inv.מספר_חשבונית ?? '',
      'תאריך יצירה':    inv.תאריך_יצירה ?? '',
      'סכום':           Number(inv.סכום ?? 0),
      'סטטוס':          inv.סטטוס ?? '',
      'קישור לחשבונית': inv.קישור_חשבונית ?? '',
      'מקור':           inv.מקור ?? '',
    })));

    const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const xlsxBase64 = Buffer.from(xlsxBuffer).toString('base64');

    // ── Summary email ───────────────────────────────────────────────────
    const fileName = `adi-chocolate-backup-${year}-${mmStr}.xlsx`;
    const subject  = `סיכום חודשי וגיבוי — עדי תכשיט שוקולד — ${mmStr}/${year}`;

    const row = (label: string, value: string | number) =>
      `<tr><td style="padding:6px 14px 6px 0;color:#8A735F">${label}</td><td style="padding:6px 0;font-weight:600">${value}</td></tr>`;

    const topHtml = topCustomers.length === 0 ? '' : `
    <h3 style="margin:22px 0 6px;color:#7A4A27;font-size:15px">הלקוחות המובילים בחודש</h3>
    <table style="border-collapse:collapse;font-size:14px">
      ${topCustomers.map(t => row(escapeHtml(t.name), `${ils(t.total)} · ${t.count} הזמנות`)).join('')}
    </table>`;

    const html = `<!doctype html>
<html dir="rtl" lang="he"><head><meta charset="utf-8"></head>
<body style="font-family:Arial,Helvetica,sans-serif;direction:rtl;text-align:right;background:#FBF8F2;padding:24px;color:#2B1A10;margin:0">
  <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #EDE0CE;border-radius:12px;padding:28px">
    <h2 style="margin:0 0 8px;color:#7A4A27;font-size:18px">סיכום חודשי — ${mmStr}/${year}</h2>
    <p style="margin:0 0 16px;font-size:14px;color:#4A2F1B">
      מצורף קובץ Excel עם גיבוי מלא: כל הלקוחות, כל ההזמנות, המוצרים, ופירוט החודש
      (פריטים, תשלומים, משלוחים, חשבוניות). כדאי לשמור אותו כעותק מחוץ למערכת.
    </p>
    <h3 style="margin:0 0 6px;color:#7A4A27;font-size:15px">החודש</h3>
    <table style="border-collapse:collapse;font-size:14px">
      ${row('הזמנות', monthSales.length)}
      ${row('סך הזמנות', ils(monthTotal))}
      ${row('לקוחות שהזמינו', activeCustomerIds.size)}
      ${row('לקוחות חדשים', newCustomers)}
      ${row('הזמנות שבוטלו', monthCancelled)}
      ${row('לא שולמו במלואן', `${unpaid.length} (${ils(unpaidTotal)})`)}
    </table>${topHtml}
    <h3 style="margin:22px 0 6px;color:#7A4A27;font-size:15px">במערכת כולה</h3>
    <table style="border-collapse:collapse;font-size:14px">
      ${row('לקוחות', customers.length)}
      ${row('הזמנות', allOrders.length)}
      ${row('מוצרים', products.length)}
    </table>
    <p style="margin:28px 0 0;padding-top:14px;border-top:1px solid #EDE0CE;color:#8A735F;font-size:12px">
      עדי תכשיט שוקולד · נשלח אוטומטית ב-1 לכל חודש
    </p>
  </div>
</body></html>`;

    try {
      await sendEmail({
        to: recipient,
        from,
        fromName: 'עדי תכשיט שוקולד',
        subject,
        html,
        replyTo: DEFAULT_RECIPIENT,
        attachments: [{ filename: fileName, base64: xlsxBase64 }],
      });
    } catch (err) {
      console.error(`[${ROUTE}] send failed | month: ${year}-${mmStr} | recipient: ${recipientLogSafe} | error: ${err instanceof Error ? err.message : String(err)}`);
      return NextResponse.json({ error: 'שליחת המייל נכשלה. נסו שוב בעוד כמה דקות.' }, { status: 502 });
    }

    console.log(`[${ROUTE}] success | month: ${year}-${mmStr} | orders: ${orders.length}/${allOrders.length} | customers: ${customers.length} | items: ${items.length} | payments: ${payments.length} | deliveries: ${deliveries.length} | invoices: ${invoices.length} | recipient: ${recipientLogSafe}`);
    return NextResponse.json({
      ok: true,
      month: `${year}-${mmStr}`,
      file:  fileName,
      counts: {
        customers:   customers.length,
        all_orders:  allOrders.length,
        products:    products.length,
        orders:      orders.length,
        items:       items.length,
        payments:    payments.length,
        deliveries:  deliveries.length,
        invoices:    invoices.length,
      },
    });
  } catch (err) {
    return serverErrorResponse(err, ROUTE);
  }
}
