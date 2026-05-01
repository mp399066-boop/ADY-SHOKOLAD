import sgMail from '@sendgrid/mail';
import { createAdminClient } from '@/lib/supabase/server';

export interface OrderEmailItem {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface OrderEmailData {
  orderNumber: string;
  orderDate: string;
  deliveryDate?: string | null;
  items: OrderEmailItem[];
  subtotal: number;
  discount: number;
  total: number;
}

const PHONE = '05XXXXXXXX';
const EMAIL_ADDR = 'adi548419927@gmail.com';
const BUSINESS = 'עדי שוקולד';
const VAT_RATE = 0.18;

function fmt(n: number) {
  return `${n.toFixed(2)} ₪`;
}

function buildHtml(customerName: string, d: OrderEmailData, logoUrl?: string): string {
  const afterDiscount = d.subtotal - d.discount;
  const vat = afterDiscount * VAT_RATE;

  const itemRows = d.items.map(item => `
      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid #E8DED2;text-align:right;color:#2A1C12">${item.name}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #E8DED2;text-align:center;color:#5C4A38">${item.quantity}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #E8DED2;text-align:left;color:#5C4A38;direction:ltr">${fmt(item.unitPrice)}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #E8DED2;text-align:left;font-weight:600;color:#2A1C12;direction:ltr">${fmt(item.lineTotal)}</td>
      </tr>`).join('');

  const discountRows = d.discount > 0 ? `
      <tr>
        <td style="padding:7px 0;color:#8E7D6A;text-align:right">הנחה</td>
        <td style="padding:7px 0;text-align:left;color:#8A3228;direction:ltr">-${fmt(d.discount)}</td>
      </tr>
      <tr>
        <td style="padding:7px 0;color:#8E7D6A;text-align:right">סכום אחרי הנחה</td>
        <td style="padding:7px 0;text-align:left;color:#2A1C12;direction:ltr">${fmt(afterDiscount)}</td>
      </tr>` : '';

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="${BUSINESS}" width="40" height="40" style="width:40px;height:40px;object-fit:contain;border-radius:8px;display:block;margin:0 auto 10px" onerror="this.style.display='none'">`
    : '';

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>סיכום הזמנה ${d.orderNumber}</title>
</head>
<body style="margin:0;padding:0;background:#F7F3EC;font-family:Arial,Helvetica,sans-serif;direction:rtl;text-align:right">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F3EC;padding:36px 16px">
    <tr>
      <td align="center">

        <!-- Card -->
        <table width="640" cellpadding="0" cellspacing="0"
               style="max-width:640px;width:100%;background:#ffffff;border-radius:16px;border:1px solid #E8DED2;overflow:hidden;margin:0 auto;box-shadow:0 4px 24px rgba(58,42,26,0.08)">

          <!-- Header -->
          <tr>
            <td style="background:#FFFFFF;padding:28px 36px 20px;text-align:center;border-bottom:1px solid #F0EAE0">
              ${logoHtml}
              <div style="font-size:19px;font-weight:700;color:#2A1C12;letter-spacing:-0.01em">${BUSINESS}</div>
              <div style="font-size:11px;color:#8E7D6A;letter-spacing:0.06em;margin-top:3px">Adi Chocolate Boutique</div>
              <div style="font-size:13px;color:#8A7664;margin-top:10px">סיכום הזמנה מספר <strong style="color:#5C4A38">${d.orderNumber}</strong></div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 36px">

              <!-- Greeting -->
              <p style="margin:0 0 6px;font-size:16px;font-weight:600;color:#2A1C12">שלום ${customerName},</p>
              <p style="margin:0 0 26px;font-size:13px;color:#8A7664;line-height:1.7">
                קיבלנו את הזמנתך בהצלחה. להלן פירוט מלא של ההזמנה.
              </p>

              <!-- Order meta -->
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="margin-bottom:24px;font-size:13px;background:#FAF7F2;border-radius:10px;border:1px solid #E8DED2;overflow:hidden">
                <tr>
                  <td style="padding:10px 16px;color:#8E7D6A;width:45%;text-align:right;border-bottom:1px solid #F0EAE0">מספר הזמנה</td>
                  <td style="padding:10px 16px;font-weight:700;color:#2A1C12;text-align:right;border-bottom:1px solid #F0EAE0">${d.orderNumber}</td>
                </tr>
                <tr>
                  <td style="padding:10px 16px;color:#8E7D6A;text-align:right;border-bottom:1px solid #F0EAE0">תאריך הזמנה</td>
                  <td style="padding:10px 16px;color:#5C4A38;text-align:right;border-bottom:1px solid #F0EAE0">${d.orderDate}</td>
                </tr>
                ${d.deliveryDate ? `
                <tr>
                  <td style="padding:10px 16px;color:#8E7D6A;text-align:right">תאריך אספקה</td>
                  <td style="padding:10px 16px;font-weight:600;color:#2D6648;text-align:right">${d.deliveryDate}</td>
                </tr>` : ''}
              </table>

              <!-- Items -->
              <div style="font-size:13px;font-weight:600;color:#3A2A1A;margin-bottom:8px;text-align:right">
                פירוט מוצרים
              </div>
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="font-size:13px;border-collapse:collapse;margin-bottom:24px;border:1px solid #E8DED2;border-radius:10px;overflow:hidden">
                <thead>
                  <tr style="background:#F5EFE7">
                    <th style="padding:10px 14px;text-align:right;color:#8E7D6A;font-weight:600;border-bottom:1px solid #E8DED2">מוצר</th>
                    <th style="padding:10px 14px;text-align:center;color:#8E7D6A;font-weight:600;border-bottom:1px solid #E8DED2">כמות</th>
                    <th style="padding:10px 14px;text-align:left;color:#8E7D6A;font-weight:600;border-bottom:1px solid #E8DED2">מחיר ליח׳</th>
                    <th style="padding:10px 14px;text-align:left;color:#8E7D6A;font-weight:600;border-bottom:1px solid #E8DED2">סה״כ</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemRows || '<tr><td colspan="4" style="padding:14px;text-align:center;color:#B0A090">אין פריטים</td></tr>'}
                </tbody>
              </table>

              <!-- Financial summary -->
              <table width="300" cellpadding="0" cellspacing="0" align="left"
                     style="font-size:13px;margin-bottom:28px;background:#FAF7F2;border:1px solid #E8DED2;border-radius:10px;overflow:hidden">
                <tr>
                  <td style="padding:9px 16px;color:#8E7D6A;text-align:right;border-bottom:1px solid #F0EAE0">סכום לפני הנחה</td>
                  <td style="padding:9px 16px;color:#5C4A38;text-align:left;direction:ltr;border-bottom:1px solid #F0EAE0">${fmt(d.subtotal)}</td>
                </tr>
                ${discountRows}
                <tr>
                  <td style="padding:9px 16px;color:#8E7D6A;text-align:right;border-bottom:1px solid #E8DED2">מע"מ (18%)</td>
                  <td style="padding:9px 16px;color:#5C4A38;text-align:left;direction:ltr;border-bottom:1px solid #E8DED2">${fmt(vat)}</td>
                </tr>
                <tr style="background:#F5EFE7">
                  <td style="padding:12px 16px;font-weight:700;font-size:14px;color:#2A1C12;text-align:right">סה״כ לתשלום</td>
                  <td style="padding:12px 16px;font-weight:700;font-size:18px;color:#8B5E34;text-align:left;direction:ltr">${fmt(d.total)}</td>
                </tr>
              </table>

              <div style="clear:both"></div>

              <!-- Closing -->
              <p style="font-size:13px;color:#8A7664;line-height:1.75;margin:0 0 4px;border-top:1px solid #F0EAE0;padding-top:22px">
                תודה על ההזמנה. אנו מטפלים בה ונעדכן אותך בהמשך.
              </p>
              <p style="font-size:12px;color:#B0A090;margin:0">
                זהו מייל אוטומטי. אין להשיב על מייל זה.
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#FDFAF5;padding:20px 36px;border-top:1px solid #F0EAE0;text-align:center">
              <div style="font-size:13px;font-weight:700;color:#3A2A1A;margin-bottom:2px">${BUSINESS}</div>
              <div style="font-size:11px;color:#8E7D6A;letter-spacing:0.05em;margin-bottom:8px">Adi Chocolate Boutique</div>
              <div style="font-size:12px;color:#8A7664;line-height:1.9">
                טלפון: ${PHONE} &nbsp;|&nbsp; ${EMAIL_ADDR}
              </div>
            </td>
          </tr>

        </table>
        <!-- /Card -->

      </td>
    </tr>
  </table>

</body>
</html>`;
}

function buildText(customerName: string, d: OrderEmailData): string {
  const afterDiscount = d.subtotal - d.discount;
  const vat = afterDiscount * VAT_RATE;
  const line = '-'.repeat(40);

  const itemLines = d.items.map(item =>
    `${item.name} | כמות: ${item.quantity} | מחיר ליח': ${fmt(item.unitPrice)} | סה"כ: ${fmt(item.lineTotal)}`
  ).join('\n');

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
    `מע"מ (18%): ${fmt(vat)}`,
    `סה"כ לתשלום: ${fmt(d.total)}`,
    line,
    '',
    'תודה על ההזמנה. אנו מטפלים בה ונעדכן אותך בהמשך.',
    'זהו מייל אוטומטי בעקבות הזמנה שבוצעה.',
    '',
    line,
    BUSINESS,
    `טלפון: ${PHONE}`,
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
