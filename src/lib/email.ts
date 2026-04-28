import sgMail from '@sendgrid/mail';

export async function sendOrderEmail(to: string, customerName: string): Promise<void> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.FROM_EMAIL;
  if (!apiKey || !from) return;

  sgMail.setApiKey(apiKey);

  await sgMail.send({
    to,
    from,
    subject: 'סיכום הזמנה — עדי תכשיט שוקולד',
    html: `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;direction:rtl;color:#2B1A10;background:#F5F1EB;margin:0;padding:20px">
  <div style="max-width:600px;margin:0 auto">
    <div style="background:#7C5230;color:#FAF7F0;padding:28px 32px;border-radius:12px 12px 0 0;text-align:center">
      <h1 style="margin:0;font-size:22px">עדי תכשיט שוקולד</h1>
      <p style="margin:8px 0 0;opacity:0.85;font-size:14px">סיכום הזמנה</p>
    </div>
    <div style="background:#FFFFFF;border:1px solid #EDE0CE;border-top:none;padding:28px 32px;border-radius:0 0 12px 12px">
      <p style="font-size:15px;margin:0 0 16px">שלום ${customerName},</p>
      <p style="font-size:15px;margin:0 0 24px">תודה על הזמנתך! קיבלנו את הזמנתך ונעדכן אותך בקרוב.</p>
      <p style="color:#9B7A5A;font-size:12px;margin:0;border-top:1px solid #EDE0CE;padding-top:16px">
        בברכה,<br>
        <strong style="color:#7C5230">עדי תכשיט שוקולד</strong>
      </p>
    </div>
  </div>
</body>
</html>`,
  });
}
