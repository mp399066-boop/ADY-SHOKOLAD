// Central email transport.
//
// The whole system sends customer/admin email through this one helper so the
// provider lives in a single place. It uses Resend (RESEND_API_KEY) after the
// SendGrid free plan was retired — the previous per-file `sgMail.send(...)`
// calls were replaced with `sendEmail(...)` and kept their exact subject/html/
// text/replyTo/attachment payloads.
//
// Throws on a missing key or a provider send error so existing call sites keep
// their try/catch + communication-logging behaviour unchanged.

import { Resend } from 'resend';

export interface EmailAttachment {
  filename: string;
  /** base64-encoded file content */
  base64: string;
}

export interface SendEmailArgs {
  to: string | string[];
  /** Bare sender address — MUST be on a Resend-verified domain. */
  from: string;
  /** Optional display name rendered before the address. */
  fromName?: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
}

export interface SendEmailResult {
  messageId: string | null;
}

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('שירות המייל אינו מוגדר בשרת (חסר RESEND_API_KEY)');
  }

  const resend = new Resend(apiKey);
  const from = args.fromName ? `${args.fromName} <${args.from}>` : args.from;

  const { data, error } = await resend.emails.send({
    from,
    to: args.to,
    subject: args.subject,
    html: args.html,
    ...(args.text ? { text: args.text } : {}),
    ...(args.replyTo ? { replyTo: args.replyTo } : {}),
    ...(args.attachments && args.attachments.length > 0
      ? {
          attachments: args.attachments.map((a) => ({
            filename: a.filename,
            content: Buffer.from(a.base64, 'base64'),
          })),
        }
      : {}),
  });

  if (error) {
    throw new Error(error.message || 'שליחת המייל נכשלה');
  }
  return { messageId: data?.id ?? null };
}
