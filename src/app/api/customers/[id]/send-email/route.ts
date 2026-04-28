export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import sgMail from '@sendgrid/mail';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createAdminClient();
  const body = await req.json();
  const { subject, content, to } = body as { subject?: string; content: string; to: string };

  if (!content?.trim()) return NextResponse.json({ error: 'תוכן חובה' }, { status: 400 });
  if (!to?.trim()) return NextResponse.json({ error: 'כתובת נמען חובה' }, { status: 400 });

  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.FROM_EMAIL;

  let status = 'נשלח';
  let errorMsg: string | undefined;
  let messageId: string | undefined;

  if (apiKey && from) {
    try {
      sgMail.setApiKey(apiKey);
      const [response] = await sgMail.send({
        to,
        from,
        subject: subject || 'הודעה מעדי שוקולד',
        html: `<html dir="rtl"><body style="font-family:Arial,Helvetica,sans-serif;direction:rtl;text-align:right;padding:24px;color:#2B1A10">${content.replace(/\n/g, '<br>')}<br><br><p style="color:#9B7A5A;font-size:12px;border-top:1px solid #eee;padding-top:12px">עדי שוקולד | adi548419927@gmail.com</p></body></html>`,
        text: `${content}\n\nעדי שוקולד | adi548419927@gmail.com`,
      });
      messageId = response?.headers?.['x-message-id'] as string | undefined;
    } catch (err) {
      status = 'נכשל';
      errorMsg = err instanceof Error ? err.message : String(err);
    }
  }

  const { data: logEntry, error: logError } = await supabase
    .from('תיעוד_תקשורת')
    .insert({
      לקוח_id: params.id,
      סוג: 'מייל',
      כיוון: 'יוצא',
      נושא: subject || null,
      תוכן: content.slice(0, 500),
      אל: to,
      מ: from || null,
      סטטוס: status,
      מזהה_הודעה: messageId || null,
      הודעת_שגיאה: errorMsg || null,
      תאריך: new Date().toISOString(),
    })
    .select()
    .single();

  if (logError) return NextResponse.json({ error: logError.message }, { status: 500 });

  if (status === 'נכשל') {
    return NextResponse.json({ error: errorMsg, data: logEntry }, { status: 500 });
  }

  return NextResponse.json({ data: logEntry }, { status: 201 });
}
