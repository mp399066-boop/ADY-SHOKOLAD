import { createHmac, timingSafeEqual } from 'crypto';
import { appBaseUrl } from '@/lib/app-url';

// Server-only: signed public link to one issued invoice's PDF, for sending to
// the customer (WhatsApp). Morning's own viewer link asks the customer to log
// in, so we serve the PDF ourselves. The link is `<invoiceId>.<hmac>.pdf` —
// it opens exactly that one document and can't be guessed for any other.

const TOKEN_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([0-9a-f]{64})\.pdf$/i;

function secret(): string {
  const s = process.env.REPORT_ACTION_SECRET;
  if (!s || s.length < 16) throw new Error('REPORT_ACTION_SECRET חסר או קצר מדי');
  return s;
}

function sign(invoiceId: string): string {
  return createHmac('sha256', secret()).update(`invoice-pdf.${invoiceId}`).digest('hex');
}

export function invoiceShareUrl(invoiceId: string): string {
  return `${appBaseUrl()}/api/public/invoice/${invoiceId}.${sign(invoiceId)}.pdf`;
}

/** The invoice id when the token is valid, otherwise null. */
export function verifyInvoiceToken(token: string): string | null {
  const m = TOKEN_RE.exec(token);
  if (!m) return null;
  try {
    const a = Buffer.from(sign(m[1]), 'hex');
    const b = Buffer.from(m[2], 'hex');
    return a.length === b.length && timingSafeEqual(a, b) ? m[1] : null;
  } catch {
    return null;
  }
}
