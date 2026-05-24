export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import sgMail from '@sendgrid/mail';
import * as XLSX from 'xlsx';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser } from '@/lib/auth/requireAuthorizedUser';

// GET /api/reports/monthly-backup-export
//
// V1 monthly Excel backup. READ-ONLY against existing tables — no writes,
// no Morning, no WooCommerce, no invoice generation. Builds one .xlsx
// workbook with six Hebrew sheets and sends it as an email attachment.
//
// Auth: accepts EITHER
//   1) `Authorization: Bearer ${CRON_SECRET}` — vercel.json cron path
//   2) `requireManagementUser()` — manual operator trigger from a browser
// Defaults to previous calendar month; overridable via ?month= & ?year=.
// Default recipient adi548419927@gmail.com; overridable via ?to= for testing.

const DEFAULT_RECIPIENT = 'adi548419927@gmail.com';

export async function GET(req: NextRequest) {
  // ── Auth: cron-bearer OR authenticated management user ────────────────
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization') || '';
  const isCron = !!(secret && authHeader === `Bearer ${secret}`);
  if (!isCron) {
    const auth = await requireManagementUser();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // ── Resolve target month ──────────────────────────────────────────────
  const { searchParams } = new URL(req.url);
  const monthParam = searchParams.get('month');
  const yearParam = searchParams.get('year');
  const toParam = searchParams.get('to');

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
    return NextResponse.json({ error: 'invalid month/year' }, { status: 400 });
  }

  const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const endDate   = new Date(Date.UTC(year, month,     1, 0, 0, 0)); // exclusive
  const startIso = startDate.toISOString();
  const endIso   = endDate.toISOString();
  const mmStr    = String(month).padStart(2, '0');

  const recipient = (toParam && toParam.includes('@')) ? toParam : DEFAULT_RECIPIENT;
  const recipientLogSafe = recipient.split('@')[0] + '@***';
  console.log(`[backup-export] started | month: ${year}-${mmStr} | recipient: ${recipientLogSafe} | isCron: ${isCron}`);

  // ── Fetch all needed data — READ-ONLY ─────────────────────────────────
  const supabase = createAdminClient();

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
    לקוחות: { שם_פרטי: string | null; שם_משפחה: string | null; טלפון: string | null } | null;
  };

  const { data: ordersData, error: ordersErr } = await supabase
    .from('הזמנות')
    .select(`
      id, מספר_הזמנה, לקוח_id, תאריך_יצירה, תאריך_אספקה, שעת_אספקה,
      סוג_אספקה, סטטוס_הזמנה, סטטוס_תשלום, סך_הכל_לתשלום, מקור_ההזמנה,
      הערות_להזמנה, שם_מקבל, טלפון_מקבל,
      לקוחות (שם_פרטי, שם_משפחה, טלפון)
    `)
    .gte('תאריך_יצירה', startIso)
    .lt('תאריך_יצירה',  endIso)
    .order('תאריך_יצירה', { ascending: true });

  if (ordersErr) {
    console.error('[backup-export] orders query failed:', ordersErr.message);
    return NextResponse.json({ error: 'orders query failed' }, { status: 500 });
  }
  const orders = (ordersData ?? []) as OrderRow[];
  const orderIds = orders.map(o => o.id);
  const orderNumByOrderId = new Map<string, string>(orders.map(o => [o.id, o.מספר_הזמנה]));
  const ordersById = new Map<string, OrderRow>(orders.map(o => [o.id, o]));
  const customerIdsFromOrders = orders.map(o => o.לקוח_id).filter((x): x is string => !!x);

  // Items (joined to monthly orders)
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
  let items: ItemRow[] = [];
  if (orderIds.length > 0) {
    const { data } = await supabase
      .from('מוצרים_בהזמנה')
      .select('הזמנה_id, סוג_שורה, גודל_מארז, כמות, מחיר_ליחידה, סהכ, הערות_לשורה, שם_פריט_מותאם, מוצרים_למכירה(שם_מוצר)')
      .in('הזמנה_id', orderIds);
    items = (data ?? []) as ItemRow[];
  }

  // Customers: created in month OR appearing in monthly orders (deduped).
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
  const { data: newCustomers } = await supabase
    .from('לקוחות')
    .select('id, שם_פרטי, שם_משפחה, טלפון, אימייל, סוג_לקוח, עיר, כתובת, תאריך_יצירה, הערות')
    .gte('תאריך_יצירה', startIso)
    .lt('תאריך_יצירה',  endIso);
  let orderCustomers: CustomerRow[] = [];
  if (customerIdsFromOrders.length > 0) {
    const { data } = await supabase
      .from('לקוחות')
      .select('id, שם_פרטי, שם_משפחה, טלפון, אימייל, סוג_לקוח, עיר, כתובת, תאריך_יצירה, הערות')
      .in('id', customerIdsFromOrders);
    orderCustomers = (data ?? []) as CustomerRow[];
  }
  const customersMap = new Map<string, CustomerRow>();
  for (const c of (newCustomers ?? []) as CustomerRow[]) customersMap.set(c.id, c);
  for (const c of orderCustomers) customersMap.set(c.id, c);
  const customers = Array.from(customersMap.values());

  // Payments for monthly orders
  type PaymentRow = {
    הזמנה_id: string;
    תאריך_תשלום: string | null;
    סכום: number | null;
    אמצעי_תשלום: string | null;
    סטטוס_תשלום: string | null;
    הערות: string | null;
  };
  let payments: PaymentRow[] = [];
  if (orderIds.length > 0) {
    const { data } = await supabase
      .from('תשלומים')
      .select('הזמנה_id, תאריך_תשלום, סכום, אמצעי_תשלום, סטטוס_תשלום, הערות')
      .in('הזמנה_id', orderIds);
    payments = (data ?? []) as PaymentRow[];
  }

  // Deliveries (with optional joined courier)
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
  let deliveries: DeliveryRow[] = [];
  if (orderIds.length > 0) {
    const { data } = await supabase
      .from('משלוחים')
      .select('הזמנה_id, כתובת, עיר, תאריך_משלוח, שעת_משלוח, סטטוס_משלוח, שם_שליח, טלפון_שליח, הוראות_משלוח, שליחים:courier_id(שם_שליח, טלפון_שליח)')
      .in('הזמנה_id', orderIds);
    deliveries = (data ?? []) as DeliveryRow[];
  }

  // Invoices (read-only)
  type InvoiceRow = {
    הזמנה_id: string;
    מספר_חשבונית: string | null;
    תאריך_יצירה: string | null;
    סכום: number | null;
    סטטוס: string | null;
    קישור_חשבונית: string | null;
    מקור: string | null;
  };
  let invoices: InvoiceRow[] = [];
  if (orderIds.length > 0) {
    const { data } = await supabase
      .from('חשבוניות')
      .select('הזמנה_id, מספר_חשבונית, תאריך_יצירה, סכום, סטטוס, קישור_חשבונית, מקור')
      .in('הזמנה_id', orderIds);
    invoices = (data ?? []) as InvoiceRow[];
  }

  // ── Build workbook ────────────────────────────────────────────────────
  // Helper: append a sheet from JSON rows, or one "אין נתונים" row when empty.
  const wb = XLSX.utils.book_new();
  const addSheet = (name: string, rows: Record<string, unknown>[]) => {
    const data = rows.length === 0 ? [{ 'הודעה': 'אין נתונים לחודש זה' }] : rows;
    const sheet = XLSX.utils.json_to_sheet(data);
    // Approximate column widths (18 chars) + RTL view.
    if (sheet['!ref']) {
      const range = XLSX.utils.decode_range(sheet['!ref']);
      const cols = [];
      for (let c = range.s.c; c <= range.e.c; c++) cols.push({ wch: 18 });
      sheet['!cols'] = cols;
    }
    sheet['!views'] = [{ RTL: true }];
    XLSX.utils.book_append_sheet(wb, sheet, name);
  };

  // Sheet 1: הזמנות
  addSheet('הזמנות', orders.map(o => {
    const cust = o.לקוחות;
    return {
      'מספר הזמנה':  o.מספר_הזמנה,
      'מזהה הזמנה':  o.id,
      'שם לקוח':     cust ? `${cust.שם_פרטי ?? ''} ${cust.שם_משפחה ?? ''}`.trim() : '',
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
  }));

  // Sheet 2: פריטים בהזמנה
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

  // Sheet 3: לקוחות
  addSheet('לקוחות', customers.map(c => ({
    'שם לקוח':     `${c.שם_פרטי ?? ''} ${c.שם_משפחה ?? ''}`.trim(),
    'טלפון':       c.טלפון ?? '',
    'אימייל':      c.אימייל ?? '',
    'סוג לקוח':    c.סוג_לקוח ?? '',
    'עיר':         c.עיר ?? '',
    'כתובת':       c.כתובת ?? '',
    'תאריך יצירה': c.תאריך_יצירה ?? '',
    'הערות':       c.הערות ?? '',
  })));

  // Sheet 4: תשלומים
  addSheet('תשלומים', payments.map(p => ({
    'מספר הזמנה':  orderNumByOrderId.get(p.הזמנה_id) ?? '',
    'תאריך תשלום': p.תאריך_תשלום ?? '',
    'סכום':        Number(p.סכום ?? 0),
    'אמצעי תשלום': p.אמצעי_תשלום ?? '',
    'סטטוס':       p.סטטוס_תשלום ?? '',
    'הערות':       p.הערות ?? '',
  })));

  // Sheet 5: משלוחים
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

  // Sheet 6: חשבוניות
  addSheet('חשבוניות', invoices.map(inv => ({
    'מספר הזמנה':    orderNumByOrderId.get(inv.הזמנה_id) ?? '',
    'מספר חשבונית':  inv.מספר_חשבונית ?? '',
    'תאריך יצירה':   inv.תאריך_יצירה ?? '',
    'סכום':          Number(inv.סכום ?? 0),
    'סטטוס':         inv.סטטוס ?? '',
    'קישור לחשבונית': inv.קישור_חשבונית ?? '',
    'מקור':          inv.מקור ?? '',
  })));

  const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const xlsxBase64 = Buffer.from(xlsxBuffer).toString('base64');

  // ── Build email + send ────────────────────────────────────────────────
  const apiKey = process.env.SENDGRID_API_KEY;
  const from   = process.env.FROM_EMAIL;
  if (!apiKey || !from) {
    console.error('[backup-export] SENDGRID_API_KEY or FROM_EMAIL not set');
    return NextResponse.json({ error: 'email service not configured' }, { status: 500 });
  }

  const fileName = `adi-chocolate-backup-${year}-${mmStr}.xlsx`;
  const subject  = `גיבוי חודשי — עדי תכשיט שוקולד — ${mmStr}/${year}`;
  const totalAmount = orders.reduce((s, o) => s + Number(o.סך_הכל_לתשלום ?? 0), 0);

  const html = `<!doctype html>
<html dir="rtl" lang="he"><head><meta charset="utf-8"></head>
<body style="font-family:Arial,Helvetica,sans-serif;direction:rtl;text-align:right;background:#FBF8F2;padding:24px;color:#2B1A10;margin:0">
  <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #EDE0CE;border-radius:12px;padding:28px">
    <h2 style="margin:0 0 8px;color:#7A4A27;font-size:18px">גיבוי חודשי — ${mmStr}/${year}</h2>
    <p style="margin:0 0 16px;font-size:14px;color:#4A2F1B">
      קובץ הגיבוי החודשי של ה-CRM עבור ${mmStr}/${year} מצורף כקובץ Excel.
      שמרי אותו כעותק חוץ-מערכתי לבטחון.
    </p>
    <table style="border-collapse:collapse;font-size:14px;margin:8px 0 0">
      <tr><td style="padding:6px 14px 6px 0;color:#8A735F">מספר הזמנות</td><td style="padding:6px 0;font-weight:600">${orders.length}</td></tr>
      <tr><td style="padding:6px 14px 6px 0;color:#8A735F">סך סכומי הזמנות</td><td style="padding:6px 0;font-weight:600">${totalAmount.toFixed(2)} ₪</td></tr>
      <tr><td style="padding:6px 14px 6px 0;color:#8A735F">מספר לקוחות</td><td style="padding:6px 0;font-weight:600">${customers.length}</td></tr>
      <tr><td style="padding:6px 14px 6px 0;color:#8A735F">מספר משלוחים</td><td style="padding:6px 0;font-weight:600">${deliveries.length}</td></tr>
      <tr><td style="padding:6px 14px 6px 0;color:#8A735F">מספר תשלומים</td><td style="padding:6px 0;font-weight:600">${payments.length}</td></tr>
      <tr><td style="padding:6px 14px 6px 0;color:#8A735F">מספר חשבוניות</td><td style="padding:6px 0;font-weight:600">${invoices.length}</td></tr>
    </table>
    <p style="margin:28px 0 0;padding-top:14px;border-top:1px solid #EDE0CE;color:#8A735F;font-size:12px">
      עדי תכשיט שוקולד · גיבוי אוטומטי חודשי
    </p>
  </div>
</body></html>`;

  sgMail.setApiKey(apiKey);
  const replyTo = 'adi548419927@gmail.com';
  console.log('[email-replyto] path: monthly-backup-export | replyTo:', replyTo);

  try {
    await sgMail.send({
      to: recipient,
      from,
      subject,
      html,
      replyTo,
      attachments: [{
        content:     xlsxBase64,
        filename:    fileName,
        type:        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        disposition: 'attachment',
      }],
    });
    console.log(`[backup-export] success | month: ${year}-${mmStr} | orders: ${orders.length} | items: ${items.length} | customers: ${customers.length} | payments: ${payments.length} | deliveries: ${deliveries.length} | invoices: ${invoices.length} | recipient: ${recipientLogSafe}`);
    return NextResponse.json({
      ok: true,
      month: `${year}-${mmStr}`,
      recipient,
      file:    fileName,
      counts: {
        orders:     orders.length,
        items:      items.length,
        customers:  customers.length,
        payments:   payments.length,
        deliveries: deliveries.length,
        invoices:   invoices.length,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[backup-export] send failed | month: ${year}-${mmStr} | recipient: ${recipientLogSafe} | error: ${msg}`);
    return NextResponse.json({ error: 'send failed', message: msg }, { status: 500 });
  }
}
