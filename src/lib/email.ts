import sgMail from '@sendgrid/mail';
import { createAdminClient } from '@/lib/supabase/server';

export interface OrderEmailItem {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  // Optional structured petit-four breakdown — when present (and non-empty)
  // the email renders these as a clean vertical list under the product name
  // instead of stuffing them into the name string with parentheses.
  petitFours?: { name: string; quantity: number }[];
}

export interface OrderEmailData {
  orderNumber: string;
  orderDate: string;
  deliveryDate?: string | null;
  items: OrderEmailItem[];
  subtotal: number;
  discount: number;
  total: number;
  customerPhone?: string | null;
  // Optional — when set, the email shows VAT rows iff the customer is business
  // and the order isn't satmar. Without these, the email omits VAT lines
  // entirely (safer than the previous behaviour, which always added 18% VAT
  // to the displayed total even for private customers whose prices already
  // included it).
  customerType?: string | null;
  orderType?: string | null;
}

// Mirrors the new-order form rule: business customer + not satmar → prices
// are pre-VAT and we should display an explicit "+ מע״מ → כולל מע״מ" block.
function shouldShowVat(customerType?: string | null, orderType?: string | null): boolean {
  if (orderType === 'סאטמר') return false;
  return (
    customerType === 'עסקי' ||
    customerType === 'עסקי - קבוע' ||
    customerType === 'עסקי - כמות'
  );
}

const EMAIL_ADDR = 'adi548419927@gmail.com';
const BUSINESS = 'עדי תכשיט שוקולד';
const VAT_RATE = 0.18;

function fmt(n: number) {
  return `${n.toFixed(2)} ₪`;
}

function fmtPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.slice(0, 3) + '.' + digits.slice(3);
}

function buildHtml(customerName: string, d: OrderEmailData, logoUrl?: string): string {
  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="${BUSINESS}" width="36" height="36" style="width:36px;height:36px;object-fit:contain;border-radius:8px;display:block;margin:0 auto 12px" onerror="this.style.display='none'">`
    : '';

  // Items — one row per product: name + (when applicable) a vertical sub-list
  // of selected petit-fours under it. Sub-list is wrapped in a second <tr> so
  // the product row keeps its qty × price column aligned cleanly to the left.
  const itemRows = d.items.map((item, i) => {
    const isLast = i === d.items.length - 1;
    const hasPf = !!item.petitFours && item.petitFours.length > 0;
    // Border-bottom only on the LAST visible row of this product block —
    // either the petit-four sub-row (if present) or the product row itself.
    const productSep = !hasPf && !isLast ? 'border-bottom:1px solid #F0EAE0;' : '';
    const subSep     = hasPf && !isLast  ? 'border-bottom:1px solid #F0EAE0;' : '';

    const productRow = `
    <tr>
      <td style="${productSep}padding:${hasPf ? '11px 0 4px' : '11px 0'};font-size:14px;font-weight:600;color:#2A1C12;text-align:right;vertical-align:top">${item.name}</td>
      <td style="${productSep}padding:${hasPf ? '11px 0 4px' : '11px 0'};font-size:13px;color:#5C4A38;text-align:left;direction:ltr;white-space:nowrap;padding-right:8px;vertical-align:top">${item.quantity} &times; ${fmt(item.unitPrice)}</td>
    </tr>`;

    if (!hasPf) return productRow;

    // Petit-four sub-list — vertical, one type per line, gold accent label
    // above. The whole block lives in a single <td colspan="2"> so it can
    // breathe across the full row width without fighting the qty column.
    const pfLines = item.petitFours!.map(pf => `
        <div style="display:flex;justify-content:space-between;font-size:13px;color:#5C4A38;padding:2px 0">
          <span>${pf.name}</span>
          <span style="direction:ltr;color:#8A735F">&times; ${pf.quantity}</span>
        </div>`).join('');
    const subRow = `
    <tr>
      <td colspan="2" style="${subSep}padding:0 0 12px">
        <div style="font-size:11px;font-weight:700;color:#B89870;letter-spacing:0.04em;margin:0 0 4px">בחירת פטיפורים</div>
        <div style="border-inline-start:2px solid #F4E8D8;padding-inline-start:10px">
          ${pfLines}
        </div>
      </td>
    </tr>`;

    return productRow + subRow;
  }).join('');

  const deliveryRow = d.deliveryDate ? `
    <tr>
      <td style="padding:9px 16px;color:#8E7D6A;text-align:right;border-top:1px solid #F0EAE0">תאריך אספקה</td>
      <td style="padding:9px 16px;font-weight:600;color:#2D6648;text-align:right;border-top:1px solid #F0EAE0">${d.deliveryDate}</td>
    </tr>` : '';

  // Summary rows — only show subtotal+discount if there's a discount
  const summaryPreDiscount = d.discount > 0 ? `
    <tr>
      <td style="padding:7px 0;font-size:13px;color:#8E7D6A;text-align:right">סכום לפני הנחה</td>
      <td style="padding:7px 0;font-size:13px;color:#5C4A38;text-align:left;direction:ltr">${fmt(d.subtotal)}</td>
    </tr>
    <tr>
      <td style="padding:7px 0;font-size:13px;color:#8E7D6A;text-align:right">הנחה</td>
      <td style="padding:7px 0;font-size:13px;color:#8A3228;text-align:left;direction:ltr">-${fmt(d.discount)}</td>
    </tr>` : '';

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>אישור הזמנה ${d.orderNumber}</title>
</head>
<body style="margin:0;padding:0;background:#F7F3EC;font-family:Arial,Helvetica,sans-serif;direction:rtl">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F3EC;padding:40px 16px">
    <tr><td align="center">

      <!-- Card -->
      <table width="600" cellpadding="0" cellspacing="0"
             style="max-width:600px;width:100%;background:#FFFFFF;border-radius:16px;border:1px solid #E8DED2;overflow:hidden;margin:0 auto;box-shadow:0 4px 20px rgba(58,42,26,0.07)">

        <!-- Header -->
        <tr>
          <td style="padding:30px 40px 22px;text-align:center;border-bottom:1px solid #F0EAE0">
            ${logoHtml}
            <div style="font-size:15px;font-weight:700;color:#2A1C12;letter-spacing:0.01em">${BUSINESS}</div>
            <div style="font-size:11px;color:#B0A090;letter-spacing:0.07em;margin-top:3px">ADI CHOCOLATE BOUTIQUE</div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px">

            <!-- Greeting + heading -->
            <p style="margin:0 0 6px;font-size:13px;color:#8E7D6A;text-align:right">שלום ${customerName},</p>
            <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#2A1C12;line-height:1.35;text-align:right">
              הזמנתך התקבלה בהצלחה
            </h1>
            <p style="margin:0 0 20px;font-size:14px;color:#8A7664;line-height:1.65;text-align:right">
              קיבלנו את ההזמנה ואנו מטפלים בה כעת.
            </p>

            <!-- Order details box -->
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="margin-bottom:32px;background:#FAF7F2;border-radius:10px;border:1px solid #EDE5D6;overflow:hidden;font-size:13px">
              <tr>
                <td style="padding:10px 16px;color:#8E7D6A;text-align:right;width:50%">מספר הזמנה</td>
                <td style="padding:10px 16px;font-weight:700;color:#2A1C12;text-align:right">${d.orderNumber}</td>
              </tr>
              <tr>
                <td style="padding:10px 16px;color:#8E7D6A;text-align:right;border-top:1px solid #F0EAE0">תאריך הזמנה</td>
                <td style="padding:10px 16px;color:#5C4A38;text-align:right;border-top:1px solid #F0EAE0">${d.orderDate}</td>
              </tr>
              ${deliveryRow}
            </table>

            <!-- Items label -->
            <div style="font-size:11px;font-weight:700;color:#8E7D6A;letter-spacing:0.08em;text-align:right;margin-bottom:6px">פירוט מוצרים</div>
            <div style="border-top:2px solid #C6A77D;margin-bottom:2px"></div>

            <!-- Items rows -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px">
              ${itemRows || `<tr><td style="padding:14px 0;text-align:center;color:#B0A090;font-size:13px">אין פריטים</td></tr>`}
            </table>

            <!-- Summary — VAT lines only for business + non-satmar.
                 d.total comes from the DB pre-VAT for business; we add 18%
                 here for display so the total matches what Morning will
                 actually charge in the receipt. Private customers see prices
                 inclusive of VAT throughout, so no extra line is needed. -->
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="border-top:1px solid #E8DED2;padding-top:4px;margin-bottom:28px">
              ${summaryPreDiscount}
              ${(() => {
                const showVat = shouldShowVat(d.customerType, d.orderType);
                const vat = showVat ? +(d.total * VAT_RATE).toFixed(2) : 0;
                const finalTotal = showVat ? +(d.total + vat).toFixed(2) : d.total;
                const vatRows = showVat ? `
              <tr>
                <td style="padding:6px 0;font-size:13px;color:#8E7D6A;text-align:right;border-top:1px dashed #EDE0CE">סה&quot;כ לפני מע&quot;מ</td>
                <td style="padding:6px 0;font-size:13px;color:#5C4A38;text-align:left;direction:ltr;border-top:1px dashed #EDE0CE">${fmt(d.total)}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;font-size:13px;color:#8E7D6A;text-align:right">מע&quot;מ 18%</td>
                <td style="padding:4px 0;font-size:13px;color:#5C4A38;text-align:left;direction:ltr">${fmt(vat)}</td>
              </tr>` : '';
                const totalLabel = showVat ? 'סה&quot;כ כולל מע&quot;מ' : 'סה&quot;כ לתשלום';
                return `${vatRows}
              <tr>
                <td style="padding:14px 0 4px;font-size:16px;font-weight:700;color:#2A1C12;text-align:right;border-top:1px solid #E8DED2">
                  ${totalLabel}
                </td>
                <td style="padding:14px 0 4px;font-size:19px;font-weight:700;color:#8B5E34;text-align:left;direction:ltr;border-top:1px solid #E8DED2">
                  ${fmt(finalTotal)}
                </td>
              </tr>`;
              })()}
            </table>

            <!-- Closing -->
            <p style="margin:0;font-size:12px;color:#B0A090;line-height:1.7;text-align:right;border-top:1px solid #F0EAE0;padding-top:20px">
              זהו מייל אוטומטי. אין להשיב על מייל זה.
            </p>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#FDFAF5;padding:18px 40px;border-top:1px solid #F0EAE0;text-align:center">
            <div style="font-size:13px;font-weight:700;color:#3A2A1A">${BUSINESS}</div>
            <div style="font-size:11px;color:#B0A090;letter-spacing:0.05em;margin-top:2px">Adi Chocolate Boutique</div>
            <div style="font-size:12px;color:#8A7664;margin-top:8px;line-height:1.9">
              ${d.customerPhone ? `טלפון: ${fmtPhone(d.customerPhone)} &nbsp;|&nbsp; ` : ''}${EMAIL_ADDR}
            </div>
          </td>
        </tr>

      </table>

    </td></tr>
  </table>

</body>
</html>`;
}

function buildText(customerName: string, d: OrderEmailData): string {
  const afterDiscount = d.subtotal - d.discount;
  const showVat = shouldShowVat(d.customerType, d.orderType);
  const vat = showVat ? +(d.total * VAT_RATE).toFixed(2) : 0;
  const finalTotal = showVat ? +(d.total + vat).toFixed(2) : d.total;
  const line = '-'.repeat(40);

  // Plaintext mirrors the HTML: product line, then (if applicable) an indented
  // vertical petit-four list. Mail clients that fall back to text/plain still
  // get something readable.
  const itemLines = d.items.map(item => {
    const head = `${item.name} | כמות: ${item.quantity} | מחיר ליח': ${fmt(item.unitPrice)} | סה"כ: ${fmt(item.lineTotal)}`;
    if (!item.petitFours || item.petitFours.length === 0) return head;
    const pfBody = item.petitFours.map(pf => `    ${pf.name} × ${pf.quantity}`).join('\n');
    return `${head}\n  בחירת פטיפורים:\n${pfBody}`;
  }).join('\n');

  return [
    `שלום ${customerName},`,
    `קיבלנו את הזמנתך. להלן פירוט מלא.`,
    '',
    line,
    `מספר הזמנה: ${d.orderNumber}`,
    `תאריך הזמנה: ${d.orderDate}`,
    d.deliveryDate ? `תאריך אספקה: ${d.deliveryDate}` : '',
    line,
    '',
    'פירוט מוצרים:',
    itemLines || 'אין פריטים',
    '',
    line,
    `סכום לפני הנחה: ${fmt(d.subtotal)}`,
    d.discount > 0 ? `הנחה: -${fmt(d.discount)}` : '',
    d.discount > 0 ? `סכום אחרי הנחה: ${fmt(afterDiscount)}` : '',
    showVat ? `סה"כ לפני מע"מ: ${fmt(d.total)}` : '',
    showVat ? `מע"מ (18%): ${fmt(vat)}` : '',
    showVat ? `סה"כ כולל מע"מ: ${fmt(finalTotal)}` : `סה"כ לתשלום: ${fmt(d.total)}`,
    line,
    '',
    'תודה על ההזמנה. אנו מטפלים בה ונעדכן אותך בהמשך.',
    'זהו מייל אוטומטי בעקבות הזמנה שבוצעה.',
    '',
    line,
    BUSINESS,
    d.customerPhone ? `טלפון: ${fmtPhone(d.customerPhone)}` : '',
    `אימייל: ${EMAIL_ADDR}`,
  ].filter(l => l !== '').join('\n');
}

export function isInternalEmail(email: string): boolean {
  return email.trim().toLowerCase() === EMAIL_ADDR.toLowerCase();
}

export interface EmailContext {
  customerId: string;
  orderId?: string;
}

export async function sendOrderEmail(
  to: string,
  customerName: string,
  orderData?: OrderEmailData,
  context?: EmailContext,
): Promise<void> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.FROM_EMAIL;
  if (!apiKey || !from) return;

  // System-control center kill-switch. The admin can pause customer order
  // confirmations from the UI. Skipped runs are logged so the panel shows
  // exactly what was suppressed and when.
  try {
    const { isServiceEnabled, logServiceRun } = await import('@/lib/system-services');
    const adminClient = createAdminClient();
    if (!(await isServiceEnabled(adminClient, 'customer_order_emails'))) {
      console.log('[email] sendOrderEmail skipped — service "customer_order_emails" is OFF in control center. to:', to, '| order:', context?.orderId || 'none');
      await logServiceRun(adminClient, {
        serviceKey:  'customer_order_emails',
        action:      'send_order_confirmation',
        status:      'disabled',
        relatedType: context?.orderId ? 'order' : 'customer',
        relatedId:   context?.orderId || context?.customerId || null,
        message:     `email NOT sent to ${to}`,
      });
      return;
    }
  } catch { /* gate is observability — never block the email on a gate-check failure */ }

  sgMail.setApiKey(apiKey);

  const subject = orderData
    ? `סיכום הזמנה ${orderData.orderNumber} — ${BUSINESS}`
    : `סיכום הזמנה — ${BUSINESS}`;

  let logoUrl: string | undefined;
  try {
    const supabase = createAdminClient();
    const { data: biz } = await supabase.from('business_settings').select('logo_url').single();
    if (biz?.logo_url) logoUrl = biz.logo_url;
  } catch { /* logo is optional — silently skip */ }

  const html = orderData
    ? buildHtml(customerName, orderData, logoUrl)
    : `<html dir="rtl"><body style="font-family:Arial;direction:rtl;text-align:right"><p>שלום ${customerName}, קיבלנו את הזמנתך.</p></body></html>`;

  const text = orderData
    ? buildText(customerName, orderData)
    : `שלום ${customerName}, קיבלנו את הזמנתך.`;

  let messageId: string | undefined;
  let sendError: string | undefined;

  try {
    const [response] = await sgMail.send({ to, from, subject, html, text });
    messageId = response?.headers?.['x-message-id'] as string | undefined;
  } catch (err) {
    sendError = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    if (context?.customerId) {
      try {
        const supabase = createAdminClient();
        await supabase.from('תיעוד_תקשורת').insert({
          לקוח_id: context.customerId,
          הזמנה_id: context.orderId || null,
          סוג: 'מייל',
          כיוון: 'יוצא',
          נושא: subject,
          תוכן: text.slice(0, 500),
          אל: to,
          מ: from,
          סטטוס: sendError ? 'נכשל' : 'נשלח',
          מזהה_הודעה: messageId || null,
          הודעת_שגיאה: sendError || null,
          תאריך: new Date().toISOString(),
        });
      } catch (logErr) {
        console.error('[email] failed to log communication:', logErr);
      }
    }
  }
}
