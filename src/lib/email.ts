import sgMail from '@sendgrid/mail';

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
  return `₪${n.toFixed(2)}`;
}

function buildHtml(customerName: string, d: OrderEmailData): string {
  const afterDiscount = d.subtotal - d.discount;
  const vat = afterDiscount * VAT_RATE;

  const itemRows = d.items.map(item => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #F0E8D8">${item.name}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #F0E8D8;text-align:center">${item.quantity}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #F0E8D8;text-align:left">${fmt(item.unitPrice)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #F0E8D8;text-align:left;font-weight:600">${fmt(item.lineTotal)}</td>
    </tr>`).join('');

  const discountRow = d.discount > 0
    ? `<tr><td style="padding:6px 10px;color:#6B7280">הנחה</td><td style="padding:6px 10px;text-align:left;color:#DC2626">−${fmt(d.discount)}</td></tr>`
    : '';

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#F5F1EB;font-family:Arial,Helvetica,sans-serif;color:#2B1A10">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F1EB;padding:24px 0">
  <tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

    <!-- Header -->
    <tr>
      <td style="background:#7C5230;color:#FAF7F0;padding:28px 32px;border-radius:10px 10px 0 0;text-align:center">
        <div style="font-size:20px;font-weight:bold;margin:0">✉ ${BUSINESS}</div>
        <div style="font-size:13px;margin-top:6px;opacity:0.85">סיכום הזמנה מספר ${d.orderNumber}</div>
      </td>
    </tr>

    <!-- Body -->
    <tr>
      <td style="background:#FFFFFF;border:1px solid #E8DDD0;border-top:none;padding:28px 32px;border-radius:0 0 10px 10px">

        <p style="margin:0 0 20px;font-size:15px;line-height:1.6">שלום ${customerName},<br>
        תודה על הזמנתך. להלן פירוט ההזמנה שהתקבלה.</p>

        <!-- Order meta -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;font-size:13px;background:#FAF7F0;border-radius:6px">
          <tr>
            <td style="padding:10px 14px;color:#6B4A2D;width:40%">מספר הזמנה</td>
            <td style="padding:10px 14px;font-weight:600">${d.orderNumber}</td>
          </tr>
          <tr style="background:#F0E8D8">
            <td style="padding:10px 14px;color:#6B4A2D">תאריך הזמנה</td>
            <td style="padding:10px 14px">${d.orderDate}</td>
          </tr>
          ${d.deliveryDate ? `
          <tr>
            <td style="padding:10px 14px;color:#6B4A2D">תאריך אספקה</td>
            <td style="padding:10px 14px;font-weight:600">${d.deliveryDate}</td>
          </tr>` : ''}
        </table>

        <!-- Items table -->
        <div style="font-size:13px;font-weight:600;color:#7C5230;margin-bottom:8px;border-bottom:2px solid #E8DDD0;padding-bottom:6px">
          פירוט מוצרים
        </div>
        <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;margin-bottom:24px">
          <thead>
            <tr style="background:#FAF7F0">
              <th style="padding:8px 10px;text-align:right;color:#6B4A2D;font-weight:600">מוצר</th>
              <th style="padding:8px 10px;text-align:center;color:#6B4A2D;font-weight:600">כמות</th>
              <th style="padding:8px 10px;text-align:left;color:#6B4A2D;font-weight:600">מחיר ליח׳</th>
              <th style="padding:8px 10px;text-align:left;color:#6B4A2D;font-weight:600">סה״כ</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows || '<tr><td colspan="4" style="padding:12px;text-align:center;color:#9B7A5A">אין פריטים</td></tr>'}
          </tbody>
        </table>

        <!-- Financial summary -->
        <table width="280" cellpadding="0" cellspacing="0" align="left" style="font-size:13px;margin-bottom:24px">
          <tr>
            <td style="padding:6px 10px;color:#6B7280">סכום לפני הנחה</td>
            <td style="padding:6px 10px;text-align:left">${fmt(d.subtotal)}</td>
          </tr>
          ${discountRow}
          ${d.discount > 0 ? `
          <tr>
            <td style="padding:6px 10px;color:#6B7280">סכום אחרי הנחה</td>
            <td style="padding:6px 10px;text-align:left">${fmt(afterDiscount)}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:6px 10px;color:#6B7280">מע"מ (18%)</td>
            <td style="padding:6px 10px;text-align:left">${fmt(vat)}</td>
          </tr>
          <tr style="border-top:2px solid #E8DDD0">
            <td style="padding:10px 10px;font-weight:700;font-size:14px">סה״כ לתשלום</td>
            <td style="padding:10px 10px;font-weight:700;font-size:16px;color:#1A6B35;text-align:left">${fmt(d.total)}</td>
          </tr>
        </table>

        <div style="clear:both"></div>

        <!-- Closing text -->
        <p style="font-size:14px;line-height:1.7;color:#3D2B1A;margin:0 0 24px;border-top:1px solid #E8DDD0;padding-top:20px">
          תודה על ההזמנה. אנו מטפלים בה ונעדכן אותך בהמשך.
        </p>

        <!-- Signature -->
        <table cellpadding="0" cellspacing="0" style="font-size:13px;color:#6B4A2D;border-top:1px solid #E8DDD0;padding-top:16px">
          <tr><td style="padding:2px 0"><strong style="color:#7C5230">${BUSINESS}</strong></td></tr>
          <tr><td style="padding:2px 0">טלפון: ${PHONE}</td></tr>
          <tr><td style="padding:2px 0">אימייל: ${EMAIL_ADDR}</td></tr>
        </table>

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
  const vat = afterDiscount * VAT_RATE;
  const separator = '─'.repeat(40);

  const itemLines = d.items.map(item =>
    `${item.name} | כמות: ${item.quantity} | מחיר ליח׳: ${fmt(item.unitPrice)} | סה"כ: ${fmt(item.lineTotal)}`
  ).join('\n');

  return [
    `שלום ${customerName},`,
    `תודה על הזמנתך. להלן פירוט ההזמנה שהתקבלה.`,
    '',
    separator,
    `מספר הזמנה: ${d.orderNumber}`,
    `תאריך הזמנה: ${d.orderDate}`,
    d.deliveryDate ? `תאריך אספקה: ${d.deliveryDate}` : '',
    separator,
    '',
    'פירוט מוצרים:',
    itemLines || 'אין פריטים',
    '',
    separator,
    `סכום לפני הנחה: ${fmt(d.subtotal)}`,
    d.discount > 0 ? `הנחה: −${fmt(d.discount)}` : '',
    d.discount > 0 ? `סכום אחרי הנחה: ${fmt(afterDiscount)}` : '',
    `מע"מ (18%): ${fmt(vat)}`,
    `סה"כ לתשלום: ${fmt(d.total)}`,
    separator,
    '',
    'תודה על ההזמנה. אנו מטפלים בה ונעדכן אותך בהמשך.',
    '',
    `${BUSINESS}`,
    `טלפון: ${PHONE}`,
    `אימייל: ${EMAIL_ADDR}`,
  ].filter(line => line !== null && line !== undefined).join('\n');
}

export async function sendOrderEmail(
  to: string,
  customerName: string,
  orderData?: OrderEmailData,
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
    : `<html dir="rtl"><body style="font-family:Arial;direction:rtl"><p>שלום ${customerName}, תודה על הזמנתך.</p></body></html>`;

  const text = orderData
    ? buildText(customerName, orderData)
    : `שלום ${customerName}, תודה על הזמנתך.`;

  await sgMail.send({ to, from, subject, html, text });
}
