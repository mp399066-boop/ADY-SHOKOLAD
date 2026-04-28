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

function buildHtml(customerName: string, d: OrderEmailData): string {
  const afterDiscount = d.subtotal - d.discount;
  const vat = afterDiscount * VAT_RATE;

  const itemRows = d.items.map(item => `
      <tr>
        <td style="padding:9px 12px;border-bottom:1px solid #e8e8e8;text-align:right">${item.name}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #e8e8e8;text-align:center">${item.quantity}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #e8e8e8;text-align:left">${fmt(item.unitPrice)}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #e8e8e8;text-align:left">${fmt(item.lineTotal)}</td>
      </tr>`).join('');

  const discountRows = d.discount > 0 ? `
      <tr>
        <td style="padding:6px 0;color:#555;text-align:right">הנחה</td>
        <td style="padding:6px 0;text-align:left;color:#c0392b">-${fmt(d.discount)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#555;text-align:right">סכום אחרי הנחה</td>
        <td style="padding:6px 0;text-align:left">${fmt(afterDiscount)}</td>
      </tr>` : '';

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>סיכום הזמנה ${d.orderNumber}</title>
</head>
<body style="margin:0;padding:0;background:#f6f6f6;font-family:Arial,Helvetica,sans-serif;direction:rtl;text-align:right">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f6;padding:32px 16px">
    <tr>
      <td align="center">

        <!-- Card -->
        <table width="600" cellpadding="0" cellspacing="0"
               style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;margin:0 auto">

          <!-- Header -->
          <tr>
            <td style="background:#3a3a3a;color:#ffffff;padding:24px 32px;text-align:center">
              <div style="font-size:18px;font-weight:bold;margin:0">${BUSINESS}</div>
              <div style="font-size:13px;margin-top:6px;color:#cccccc">סיכום הזמנה מספר ${d.orderNumber}</div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 32px">

              <!-- Greeting -->
              <p style="margin:0 0 8px;font-size:15px;color:#222">שלום ${customerName},</p>
              <p style="margin:0 0 24px;font-size:14px;color:#444;line-height:1.6">
                קיבלנו את הזמנתך. להלן פירוט מלא.
              </p>

              <!-- Order meta -->
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="margin-bottom:24px;font-size:13px;background:#f9f9f9;border-radius:6px;border:1px solid #e8e8e8">
                <tr>
                  <td style="padding:9px 14px;color:#555;width:40%;text-align:right">מספר הזמנה</td>
                  <td style="padding:9px 14px;font-weight:600;text-align:right">${d.orderNumber}</td>
                </tr>
                <tr style="background:#f2f2f2">
                  <td style="padding:9px 14px;color:#555;text-align:right">תאריך הזמנה</td>
                  <td style="padding:9px 14px;text-align:right">${d.orderDate}</td>
                </tr>
                ${d.deliveryDate ? `
                <tr>
                  <td style="padding:9px 14px;color:#555;text-align:right">תאריך אספקה</td>
                  <td style="padding:9px 14px;font-weight:600;text-align:right">${d.deliveryDate}</td>
                </tr>` : ''}
              </table>

              <!-- Items -->
              <div style="font-size:13px;font-weight:600;color:#333;margin-bottom:8px;text-align:right">
                פירוט מוצרים
              </div>
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="font-size:13px;border-collapse:collapse;margin-bottom:24px;border:1px solid #e8e8e8;border-radius:6px">
                <thead>
                  <tr style="background:#f2f2f2">
                    <th style="padding:9px 12px;text-align:right;color:#555;font-weight:600">מוצר</th>
                    <th style="padding:9px 12px;text-align:center;color:#555;font-weight:600">כמות</th>
                    <th style="padding:9px 12px;text-align:left;color:#555;font-weight:600">מחיר ליח׳</th>
                    <th style="padding:9px 12px;text-align:left;color:#555;font-weight:600">סה״כ</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemRows || '<tr><td colspan="4" style="padding:12px;text-align:center;color:#999">אין פריטים</td></tr>'}
                </tbody>
              </table>

              <!-- Financial summary -->
              <table width="280" cellpadding="0" cellspacing="0" align="left"
                     style="font-size:13px;margin-bottom:28px;border-top:1px solid #e8e8e8;padding-top:12px">
                <tr>
                  <td style="padding:6px 0;color:#555;text-align:right">סכום לפני הנחה</td>
                  <td style="padding:6px 0;text-align:left;padding-right:24px">${fmt(d.subtotal)}</td>
                </tr>
                ${discountRows}
                <tr>
                  <td style="padding:6px 0;color:#555;text-align:right">מע"מ (18%)</td>
                  <td style="padding:6px 0;text-align:left;padding-right:24px">${fmt(vat)}</td>
                </tr>
                <tr style="border-top:2px solid #333">
                  <td style="padding:10px 0 6px;font-weight:700;font-size:15px;text-align:right">סה״כ לתשלום</td>
                  <td style="padding:10px 0 6px;font-weight:700;font-size:17px;color:#1a1a1a;text-align:left;padding-right:24px">${fmt(d.total)}</td>
                </tr>
              </table>

              <div style="clear:both"></div>

              <!-- Closing -->
              <p style="font-size:13px;color:#555;line-height:1.7;margin:0 0 4px;border-top:1px solid #e8e8e8;padding-top:20px">
                תודה על ההזמנה. אנו מטפלים בה ונעדכן אותך בהמשך.
              </p>
              <p style="font-size:12px;color:#999;margin:0">
                זהו מייל אוטומטי בעקבות הזמנה שבוצעה. אין להשיב על מייל זה.
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f2f2f2;padding:18px 32px;border-top:1px solid #e8e8e8">
              <table width="100%" cellpadding="0" cellspacing="0" style="font-size:12px;color:#666">
                <tr>
                  <td style="text-align:right">
                    <strong style="color:#333">${BUSINESS}</strong><br>
                    טלפון: ${PHONE}<br>
                    אימייל: ${EMAIL_ADDR}
                  </td>
                </tr>
              </table>
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

  const html = orderData
    ? buildHtml(customerName, orderData)
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
