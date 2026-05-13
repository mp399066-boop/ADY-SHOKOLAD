import sgMail from '@sendgrid/mail';
import { createAdminClient } from '@/lib/supabase/server';

// Internal "new order received" notification to the business owner.
// Visual language mirrors the customer-facing email (src/lib/email.ts) —
// warm cream background, white card, premium typography — so the owner sees
// a polished document instead of plain text. Only sent on a real new order;
// finalize-draft is intentionally silent (no duplicate notification).

const ADMIN_TO = 'adi548419927@gmail.com';
const BUSINESS = 'עדי תכשיט שוקולד';

type AlertItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  isPackage: boolean;
  // For package items — list of "ברקת ×6" strings to show under the row
  petitFours: string[];
  note: string | null;
};

function fmt(n: number): string {
  return `${n.toFixed(2)} ₪`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHtml(args: {
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  deliveryDate: string;
  deliveryTime: string;
  deliveryType: string;
  paymentStatus: string;
  paymentMethod: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  recipientCity: string;
  deliveryInstructions: string;
  notes: string;
  items: AlertItem[];
  total: number;
  isUrgent: boolean;
  // Source attribution — set by callers like the WC webhook so the email
  // explicitly says "נכנסה הזמנה חדשה מהאתר" instead of generic "new order".
  source?: string | null;            // e.g. 'WooCommerce'
  sourceOrderNumber?: string | null; // e.g. WC order # 4750
  // Products that were auto-created in this webhook run. Surfaces a callout
  // so the operator immediately knows new SKUs entered the catalog.
  newProducts?: { id: string; name: string }[];
}): string {
  const a = args;

  // ── Items table rows ───────────────────────────────────────────────────────
  const itemRows = a.items.length === 0
    ? `<tr><td colspan="4" style="padding:18px 0;text-align:center;color:#B0A090;font-size:13px">אין פריטים</td></tr>`
    : a.items.map((item, i) => {
        const sep = i < a.items.length - 1 ? 'border-bottom:1px solid #F0EAE0;' : '';
        const pkgBadge = item.isPackage
          ? `<span style="display:inline-block;font-size:10px;font-weight:600;color:#92400E;background:#FEF3C7;padding:1px 7px;border-radius:999px;margin-inline-start:6px">מארז</span>`
          : '';
        const noteRow = item.note
          ? `<div style="font-size:11px;color:#8E7D6A;margin-top:3px">${escapeHtml(item.note)}</div>`
          : '';
        const pfRow = item.isPackage && item.petitFours.length > 0
          ? `<div style="margin-top:6px;font-size:11px;color:#5C4A38;line-height:1.65">
               <span style="color:#8E7D6A">פטיפורים:</span>
               ${item.petitFours.map(s => `<span style="display:inline-block;background:#EFE4D3;color:#4A2F1B;padding:1px 8px;border-radius:999px;margin:2px 2px 0 0;white-space:nowrap">${escapeHtml(s)}</span>`).join('')}
             </div>`
          : '';
        return `
        <tr>
          <td style="${sep}padding:11px 0;font-size:14px;color:#2A1C12;text-align:right;vertical-align:top">
            <div style="font-weight:600">${escapeHtml(item.name)}${pkgBadge}</div>
            ${noteRow}
            ${pfRow}
          </td>
          <td style="${sep}padding:11px 0;font-size:13px;color:#5C4A38;text-align:center;direction:ltr;white-space:nowrap;vertical-align:top">${item.quantity}</td>
          <td style="${sep}padding:11px 0;font-size:13px;color:#5C4A38;text-align:left;direction:ltr;white-space:nowrap;padding-right:8px;vertical-align:top">${fmt(item.unitPrice)}</td>
          <td style="${sep}padding:11px 0;font-size:13px;color:#2A1C12;font-weight:600;text-align:left;direction:ltr;white-space:nowrap;padding-right:12px;vertical-align:top">${fmt(item.lineTotal)}</td>
        </tr>`;
      }).join('');

  // ── Optional blocks ────────────────────────────────────────────────────────

  // WC source banner — only when the order arrived via the WooCommerce
  // webhook. Cream/gold treatment so it reads as a context badge, not an
  // alert. Includes the WC order # so the operator can cross-reference.
  const sourceBanner = a.source === 'WooCommerce'
    ? `<div style="background:#FAF3E5;border:1px solid #E5DACA;border-radius:10px;padding:12px 16px;margin-bottom:16px;text-align:right">
         <div style="font-weight:700;color:#7A4A27;font-size:14px">נכנסה הזמנה חדשה מהאתר</div>
         <div style="font-size:12px;color:#85705C;margin-top:3px">
           מקור: WooCommerce${a.sourceOrderNumber ? ` · מספר הזמנה באתר: #${escapeHtml(String(a.sourceOrderNumber))}` : ''}
         </div>
       </div>`
    : '';

  // Auto-created products callout. Single product → singular wording;
  // multiple → labelled list. Hidden when nothing was created so we don't
  // tell the operator "0 new products" on every email.
  const newProductsBlock = (a.newProducts && a.newProducts.length > 0)
    ? a.newProducts.length === 1
      ? `<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:12px 16px;margin-bottom:18px;text-align:right">
           <div style="font-weight:700;color:#92400E;font-size:13px">שימו לב — נוסף מוצר חדש למוצרים למכירה:</div>
           <div style="font-size:13px;color:#78350F;margin-top:4px;font-weight:600">• ${escapeHtml(a.newProducts[0].name)}</div>
         </div>`
      : `<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:12px 16px;margin-bottom:18px;text-align:right">
           <div style="font-weight:700;color:#92400E;font-size:13px">שימו לב — נוספו ${a.newProducts.length} מוצרים חדשים למוצרים למכירה:</div>
           <ul style="margin:6px 0 0 0;padding-inline-start:16px;font-size:13px;color:#78350F;line-height:1.7">
             ${a.newProducts.map(p => `<li style="font-weight:600">${escapeHtml(p.name)}</li>`).join('')}
           </ul>
         </div>`
    : '';

  const urgentRow = a.isUrgent
    ? `<div style="background:#FEE2E2;border:1px solid #FECACA;border-radius:8px;padding:10px 14px;margin-bottom:18px;text-align:right">
         <span style="display:inline-block;font-weight:700;color:#991B1B;font-size:13px">⚡ הזמנה דחופה</span>
       </div>`
    : '';

  const deliveryBlock = a.deliveryType === 'משלוח' && (a.recipientAddress || a.recipientCity || a.recipientName)
    ? `<div style="font-size:11px;font-weight:700;color:#8E7D6A;letter-spacing:0.08em;text-align:right;margin:24px 0 6px">פרטי משלוח</div>
       <div style="border-top:2px solid #C6A77D;margin-bottom:8px"></div>
       <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF7F2;border-radius:10px;border:1px solid #EDE5D6;overflow:hidden;font-size:13px">
         ${a.recipientName ? `<tr><td style="padding:9px 14px;color:#8E7D6A;text-align:right;width:40%">מקבל</td><td style="padding:9px 14px;color:#2A1C12;font-weight:600;text-align:right">${escapeHtml(a.recipientName)}</td></tr>` : ''}
         ${a.recipientPhone ? `<tr><td style="padding:9px 14px;color:#8E7D6A;text-align:right;border-top:1px solid #F0EAE0">טלפון מקבל</td><td style="padding:9px 14px;color:#5C4A38;text-align:right;border-top:1px solid #F0EAE0;direction:ltr">${escapeHtml(a.recipientPhone)}</td></tr>` : ''}
         ${a.recipientAddress ? `<tr><td style="padding:9px 14px;color:#8E7D6A;text-align:right;border-top:1px solid #F0EAE0">כתובת</td><td style="padding:9px 14px;color:#5C4A38;text-align:right;border-top:1px solid #F0EAE0">${escapeHtml(a.recipientAddress)}${a.recipientCity ? `, ${escapeHtml(a.recipientCity)}` : ''}</td></tr>` : ''}
         ${!a.recipientAddress && a.recipientCity ? `<tr><td style="padding:9px 14px;color:#8E7D6A;text-align:right;border-top:1px solid #F0EAE0">עיר</td><td style="padding:9px 14px;color:#5C4A38;text-align:right;border-top:1px solid #F0EAE0">${escapeHtml(a.recipientCity)}</td></tr>` : ''}
         ${a.deliveryInstructions ? `<tr><td style="padding:9px 14px;color:#8E7D6A;text-align:right;border-top:1px solid #F0EAE0">הוראות</td><td style="padding:9px 14px;color:#5C4A38;text-align:right;border-top:1px solid #F0EAE0">${escapeHtml(a.deliveryInstructions)}</td></tr>` : ''}
       </table>`
    : '';

  const notesBlock = a.notes
    ? `<div style="font-size:11px;font-weight:700;color:#8E7D6A;letter-spacing:0.08em;text-align:right;margin:24px 0 6px">הערות להזמנה</div>
       <div style="border-top:2px solid #C6A77D;margin-bottom:8px"></div>
       <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:14px 16px;font-size:13px;color:#5C4A38;text-align:right;line-height:1.65">${escapeHtml(a.notes)}</div>`
    : '';

  const paymentStatusBadge = (() => {
    const map: Record<string, { bg: string; fg: string }> = {
      'שולם':  { bg: '#DCFCE7', fg: '#166534' },
      'ממתין': { bg: '#FEF3C7', fg: '#92400E' },
      'חלקי':  { bg: '#FFEDD5', fg: '#9A3412' },
      'בוטל':  { bg: '#FEE2E2', fg: '#991B1B' },
      'בארטר': { bg: '#E0E7FF', fg: '#3730A3' },
    };
    const c = map[a.paymentStatus] || { bg: '#F3F4F6', fg: '#374151' };
    return `<span style="display:inline-block;font-size:11px;font-weight:600;color:${c.fg};background:${c.bg};padding:2px 10px;border-radius:999px">${escapeHtml(a.paymentStatus || '—')}</span>`;
  })();

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>הזמנה חדשה ${escapeHtml(a.orderNumber)}</title>
</head>
<body style="margin:0;padding:0;background:#F7F3EC;font-family:Arial,Helvetica,sans-serif;direction:rtl">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F3EC;padding:40px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:16px;border:1px solid #E8DED2;overflow:hidden;margin:0 auto;box-shadow:0 4px 20px rgba(58,42,26,0.07)">

        <!-- Header -->
        <tr>
          <td style="padding:28px 40px 18px;text-align:center;border-bottom:1px solid #F0EAE0;background:linear-gradient(180deg,#FFFDF8 0%,#FBF5EA 100%)">
            <div style="font-size:15px;font-weight:700;color:#2A1C12;letter-spacing:0.01em">${BUSINESS}</div>
            <div style="font-size:10px;color:#B0A090;letter-spacing:0.12em;margin-top:3px;text-transform:uppercase">התראה פנימית · INTERNAL ALERT</div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px 40px 36px">

            <h1 style="margin:0 0 6px;font-size:21px;font-weight:700;color:#2A1C12;line-height:1.35;text-align:right">
              ${a.source === 'WooCommerce' ? 'הזמנה חדשה מהאתר' : 'התקבלה הזמנה חדשה במערכת'}
            </h1>
            <p style="margin:0 0 22px;font-size:13px;color:#8A7664;text-align:right">
              ${a.source === 'WooCommerce'
                ? 'הזמנה חדשה התקבלה דרך WooCommerce.'
                : 'הזמנה חדשה נכנסה זה עתה.'}
            </p>

            ${sourceBanner}
            ${newProductsBlock}
            ${urgentRow}

            <!-- Order summary box -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:26px;background:#FAF7F2;border-radius:10px;border:1px solid #EDE5D6;overflow:hidden;font-size:13px">
              <tr>
                <td style="padding:11px 16px;color:#8E7D6A;text-align:right;width:38%">מספר הזמנה</td>
                <td style="padding:11px 16px;font-weight:700;color:#2A1C12;text-align:right;direction:ltr">${escapeHtml(a.orderNumber)}</td>
              </tr>
              <tr>
                <td style="padding:11px 16px;color:#8E7D6A;text-align:right;border-top:1px solid #F0EAE0">לקוח</td>
                <td style="padding:11px 16px;color:#2A1C12;font-weight:600;text-align:right;border-top:1px solid #F0EAE0">${escapeHtml(a.customerName || '—')}</td>
              </tr>
              ${a.customerPhone ? `<tr>
                <td style="padding:11px 16px;color:#8E7D6A;text-align:right;border-top:1px solid #F0EAE0">טלפון</td>
                <td style="padding:11px 16px;color:#5C4A38;text-align:right;border-top:1px solid #F0EAE0;direction:ltr">${escapeHtml(a.customerPhone)}</td>
              </tr>` : ''}
              ${a.deliveryDate ? `<tr>
                <td style="padding:11px 16px;color:#8E7D6A;text-align:right;border-top:1px solid #F0EAE0">תאריך אספקה</td>
                <td style="padding:11px 16px;color:#2D6648;font-weight:600;text-align:right;border-top:1px solid #F0EAE0">${escapeHtml(a.deliveryDate)}${a.deliveryTime ? ` · ${escapeHtml(a.deliveryTime)}` : ''}</td>
              </tr>` : ''}
              ${a.deliveryType ? `<tr>
                <td style="padding:11px 16px;color:#8E7D6A;text-align:right;border-top:1px solid #F0EAE0">סוג אספקה</td>
                <td style="padding:11px 16px;color:#5C4A38;text-align:right;border-top:1px solid #F0EAE0">${escapeHtml(a.deliveryType)}</td>
              </tr>` : ''}
              <tr>
                <td style="padding:11px 16px;color:#8E7D6A;text-align:right;border-top:1px solid #F0EAE0">סטטוס תשלום</td>
                <td style="padding:11px 16px;text-align:right;border-top:1px solid #F0EAE0">${paymentStatusBadge}${a.paymentMethod ? `<span style="margin-inline-start:8px;color:#8E7D6A;font-size:11px">· ${escapeHtml(a.paymentMethod)}</span>` : ''}</td>
              </tr>
            </table>

            <!-- Items -->
            <div style="font-size:11px;font-weight:700;color:#8E7D6A;letter-spacing:0.08em;text-align:right;margin-bottom:6px">פירוט מוצרים</div>
            <div style="border-top:2px solid #C6A77D;margin-bottom:2px"></div>

            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:18px">
              <thead>
                <tr style="border-bottom:1px solid #EDE5D6">
                  <th style="padding:8px 0;font-size:10px;font-weight:700;color:#8E7D6A;text-align:right;text-transform:uppercase;letter-spacing:0.06em">מוצר</th>
                  <th style="padding:8px 0;font-size:10px;font-weight:700;color:#8E7D6A;text-align:center;text-transform:uppercase;letter-spacing:0.06em">כמות</th>
                  <th style="padding:8px 0;font-size:10px;font-weight:700;color:#8E7D6A;text-align:left;text-transform:uppercase;letter-spacing:0.06em;padding-right:8px">מחיר</th>
                  <th style="padding:8px 0;font-size:10px;font-weight:700;color:#8E7D6A;text-align:left;text-transform:uppercase;letter-spacing:0.06em;padding-right:12px">סה&quot;כ</th>
                </tr>
              </thead>
              <tbody>
                ${itemRows}
              </tbody>
            </table>

            <!-- Total -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #E8DED2;padding-top:4px;margin-bottom:8px">
              <tr>
                <td style="padding:14px 0 4px;font-size:16px;font-weight:700;color:#2A1C12;text-align:right">סה&quot;כ</td>
                <td style="padding:14px 0 4px;font-size:19px;font-weight:700;color:#8B5E34;text-align:left;direction:ltr">${fmt(a.total)}</td>
              </tr>
            </table>

            ${deliveryBlock}
            ${notesBlock}

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#FDFAF5;padding:16px 40px;border-top:1px solid #F0EAE0;text-align:center">
            <div style="font-size:11px;color:#B0A090;letter-spacing:0.05em">התראה אוטומטית מהמערכת</div>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildText(args: {
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  deliveryDate: string;
  deliveryTime: string;
  deliveryType: string;
  paymentStatus: string;
  total: number;
  items: AlertItem[];
  source?: string | null;
  sourceOrderNumber?: string | null;
  newProducts?: { id: string; name: string }[];
}): string {
  const line = '-'.repeat(40);
  const itemLines = args.items.length === 0
    ? '(אין פריטים)'
    : args.items.map(i => {
        const head = `${i.name} | כמות: ${i.quantity} | ${fmt(i.unitPrice)} | סה"כ: ${fmt(i.lineTotal)}`;
        const pf = i.isPackage && i.petitFours.length > 0 ? `\n  פטיפורים: ${i.petitFours.join(', ')}` : '';
        const note = i.note ? `\n  הערה: ${i.note}` : '';
        return head + pf + note;
      }).join('\n');

  const newProductsLines = (args.newProducts && args.newProducts.length > 0)
    ? [
        line,
        args.newProducts.length === 1
          ? `שימו לב — נוסף מוצר חדש למוצרים למכירה:`
          : `שימו לב — נוספו ${args.newProducts.length} מוצרים חדשים למוצרים למכירה:`,
        ...args.newProducts.map(p => `  • ${p.name}`),
      ]
    : [];

  return [
    args.source === 'WooCommerce' ? `נכנסה הזמנה חדשה מהאתר` : `התקבלה הזמנה חדשה במערכת`,
    args.source === 'WooCommerce' && args.sourceOrderNumber ? `מספר הזמנה באתר: #${args.sourceOrderNumber}` : '',
    line,
    `מספר הזמנה: ${args.orderNumber}`,
    `לקוח: ${args.customerName}${args.customerPhone ? ` | ${args.customerPhone}` : ''}`,
    args.deliveryDate ? `אספקה: ${args.deliveryDate}${args.deliveryTime ? ' ' + args.deliveryTime : ''}${args.deliveryType ? ' | ' + args.deliveryType : ''}` : '',
    `סטטוס תשלום: ${args.paymentStatus || '—'}`,
    line,
    'פירוט מוצרים:',
    itemLines,
    ...newProductsLines,
    line,
    `סה"כ: ${fmt(args.total)}`,
  ].filter(Boolean).join('\n');
}

// Optional context for callers that have provenance / new-product info to
// surface in the email body. The WC webhook passes both. Internal create-
// full callers omit options and get the unchanged email.
export interface AdminAlertOptions {
  source?: 'WooCommerce' | string | null;
  sourceOrderNumber?: string | number | null;
  newProducts?: { id: string; name: string }[];
}

// Public entry point — fetches everything and sends. Idempotent at the
// caller's discretion (we don't dedupe — caller decides when to invoke).
export async function sendAdminNewOrderAlert(orderId: string, options: AdminAlertOptions = {}): Promise<void> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.FROM_EMAIL;
  if (!apiKey || !from) {
    console.warn('[admin-alert] SENDGRID_API_KEY or FROM_EMAIL missing — skipping');
    return;
  }

  const supabase = createAdminClient();

  const { data: order, error: orderErr } = await supabase
    .from('הזמנות')
    .select(`
      מספר_הזמנה, סך_הכל_לתשלום, תאריך_אספקה, שעת_אספקה, סוג_אספקה,
      סטטוס_תשלום, אופן_תשלום, שם_מקבל, טלפון_מקבל, כתובת_מקבל_ההזמנה,
      עיר, הוראות_משלוח, הערות_להזמנה, הזמנה_דחופה,
      לקוחות (שם_פרטי, שם_משפחה, טלפון)
    `)
    .eq('id', orderId)
    .single();

  if (orderErr || !order) {
    console.error('[admin-alert] order fetch failed:', orderErr?.message);
    return;
  }

  const { data: items } = await supabase
    .from('מוצרים_בהזמנה')
    .select(`
      סוג_שורה, גודל_מארז, כמות, מחיר_ליחידה, סהכ, הערות_לשורה,
      מוצרים_למכירה (שם_מוצר),
      בחירת_פטיפורים_בהזמנה (כמות, סוגי_פטיפורים (שם_פטיפור))
    `)
    .eq('הזמנה_id', orderId);

  type CustomerRow = { שם_פרטי: string; שם_משפחה: string; טלפון: string | null };
  const customer = (order as Record<string, unknown>).לקוחות as CustomerRow | null;
  const customerName = customer ? `${customer.שם_פרטי} ${customer.שם_משפחה}`.trim() : '—';

  type RawItem = {
    סוג_שורה: string;
    גודל_מארז: number | null;
    כמות: number;
    מחיר_ליחידה: number;
    סהכ: number;
    הערות_לשורה: string | null;
    מוצרים_למכירה: { שם_מוצר: string } | null;
    בחירת_פטיפורים_בהזמנה: Array<{ כמות: number; סוגי_פטיפורים: { שם_פטיפור: string } | null }> | null;
  };

  const alertItems: AlertItem[] = (items as RawItem[] | null ?? []).map(it => {
    const isPackage = it.סוג_שורה === 'מארז';
    const name = isPackage
      ? `מארז פטיפורים${it.גודל_מארז ? ` · ${it.גודל_מארז} יח׳` : ''}`
      : (it.מוצרים_למכירה?.שם_מוצר ?? 'פריט');
    const petitFours = isPackage
      ? (it.בחירת_פטיפורים_בהזמנה ?? [])
          .map(s => s.סוגי_פטיפורים?.שם_פטיפור ? `${s.סוגי_פטיפורים.שם_פטיפור} ×${s.כמות}` : '')
          .filter(Boolean)
      : [];
    return {
      name,
      quantity: it.כמות,
      unitPrice: it.מחיר_ליחידה,
      lineTotal: it.סהכ,
      isPackage,
      petitFours,
      note: it.הערות_לשורה || null,
    };
  });

  const args = {
    orderNumber: (order as Record<string, unknown>).מספר_הזמנה as string ?? '',
    customerName,
    customerPhone: customer?.טלפון ?? '',
    deliveryDate: (order as Record<string, unknown>).תאריך_אספקה as string ?? '',
    deliveryTime: (order as Record<string, unknown>).שעת_אספקה as string ?? '',
    deliveryType: (order as Record<string, unknown>).סוג_אספקה as string ?? '',
    paymentStatus: (order as Record<string, unknown>).סטטוס_תשלום as string ?? '',
    paymentMethod: (order as Record<string, unknown>).אופן_תשלום as string ?? '',
    recipientName: (order as Record<string, unknown>).שם_מקבל as string ?? '',
    recipientPhone: (order as Record<string, unknown>).טלפון_מקבל as string ?? '',
    recipientAddress: (order as Record<string, unknown>).כתובת_מקבל_ההזמנה as string ?? '',
    recipientCity: (order as Record<string, unknown>).עיר as string ?? '',
    deliveryInstructions: (order as Record<string, unknown>).הוראות_משלוח as string ?? '',
    notes: (order as Record<string, unknown>).הערות_להזמנה as string ?? '',
    items: alertItems,
    total: Number((order as Record<string, unknown>).סך_הכל_לתשלום ?? 0),
    isUrgent: !!(order as Record<string, unknown>).הזמנה_דחופה,
    source: options.source ?? null,
    sourceOrderNumber: options.sourceOrderNumber != null ? String(options.sourceOrderNumber) : null,
    newProducts: options.newProducts ?? [],
  };

  // Subject changes for WC orders so the operator can see at-a-glance from
  // the inbox that this came from the website.
  const subject = options.source === 'WooCommerce'
    ? `הזמנה חדשה מהאתר ${args.orderNumber} — ${customerName}`
    : `הזמנה חדשה ${args.orderNumber} — ${customerName}`;

  sgMail.setApiKey(apiKey);
  try {
    await sgMail.send({
      to: ADMIN_TO,
      from,
      subject,
      text: buildText(args),
      html: buildHtml(args),
    });
    console.log('[admin-alert] sent for', args.orderNumber, '| source:', options.source ?? 'manual', '| newProducts:', args.newProducts.length);
  } catch (err) {
    console.error('[admin-alert] failed (non-blocking):', err instanceof Error ? err.message : err);
  }
}
