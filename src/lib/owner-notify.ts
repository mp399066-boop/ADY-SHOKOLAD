// Server-only: a short internal email to the business owner (a quote was
// approved, a request arrived from the order form). Same recipient and the
// same control-center switch ('admin_alerts') as the new-order alert.
// Never throws — a failed notice must not fail the customer's action.
import { sendEmail } from '@/lib/email-transport';
import { createAdminClient } from '@/lib/supabase/server';

const OWNER_TO = process.env.MANAGER_NOTIFICATION_EMAIL || 'adi548419927@gmail.com';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function notifyOwner(args: {
  subject: string;
  title: string;
  rows: [string, string][];
  link: { href: string; label: string };
  kind: string;
}): Promise<void> {
  const from = process.env.FROM_EMAIL;
  if (!process.env.RESEND_API_KEY || !from) {
    console.warn('[owner-notify] email not configured — skipping', { kind: args.kind });
    return;
  }
  try {
    const { isServiceEnabled } = await import('@/lib/system-services');
    if (!(await isServiceEnabled(createAdminClient(), 'admin_alerts'))) return;
  } catch { /* gate failure must not block the notice */ }

  // Every value may come from a customer (public form) — escape it all.
  const rowsHtml = args.rows
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td style="padding:6px 0;color:#7B604D;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:6px 12px 6px 0;color:#2A1C10">${esc(v).replace(/\n/g, '<br>')}</td></tr>`)
    .join('');
  const html = `<!doctype html><html dir="rtl" lang="he"><body style="margin:0;background:#F5F1EB;font-family:Arial,sans-serif">
<div style="max-width:560px;margin:24px auto;background:#FFFDF9;border:1px solid #E8DED2;border-radius:14px;padding:24px">
<h2 style="margin:0 0 14px;color:#4A2F1B;font-size:18px">${esc(args.title)}</h2>
<table style="width:100%;border-collapse:collapse;font-size:14px">${rowsHtml}</table>
<p style="margin:20px 0 0"><a href="${esc(args.link.href)}" style="display:inline-block;background:#8B5E34;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-size:14px">${esc(args.link.label)}</a></p>
</div></body></html>`;

  try {
    await sendEmail({ from, fromName: 'מערכת עדי תכשיט שוקולד', to: OWNER_TO, subject: args.subject, html });
  } catch (err) {
    console.error('[owner-notify] send failed', { kind: args.kind, err: err instanceof Error ? err.message : 'unknown' });
  }
}
