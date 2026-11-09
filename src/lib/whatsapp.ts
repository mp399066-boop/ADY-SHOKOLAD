import { INVOICE_DOC_LABELS, rankInvoices, prettyDocNumber } from '@/lib/invoice-docs';
// wa.me links for Israeli phone numbers ("050-1234567", "+972 50 …", "972501234567").

/** International digits (972…) or null when the number can't be a phone. */
export function waNumber(phone: string | null | undefined): string | null {
  let d = (phone ?? '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('972')) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length < 8 || d.length > 10) return null;
  return `972${d}`;
}

export function waLink(phone: string | null | undefined, text: string): string | null {
  const n = waNumber(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}

/** Fills {שם} (first name) in a message template. */
export function fillTemplate(template: string, firstName: string): string {
  return template.replace(/\{שם\}/g, firstName.trim() || '');
}

type ShareableInvoice = {
  id?: string;
  מספר_חשבונית?: string | null;
  קישור_חשבונית?: string | null;
  סוג_מסמך?: string | null;
  תאריך_יצירה?: string | null;
};


/** The Morning (חשבונית ירוקה) viewer URL from a stored link — legacy rows hold a JSON {he, origin} blob. */
function morningViewUrl(raw: string): string | null {
  let s = raw.trim();
  if (s.startsWith('{')) {
    try {
      const p = JSON.parse(s) as Record<string, string>;
      s = p.he ?? p.origin ?? Object.values(p)[0] ?? '';
    } catch { return null; }
  }
  return /^https:\/\//.test(s) ? s : null;
}

/**
 * wa.me link that sends the customer the order's best issued Morning document link.
 * Returns an error message instead when there's no document link or no valid phone.
 */
export function invoiceWhatsappLink(
  invoices: ShareableInvoice[],
  phone: string | null | undefined,
  firstName: string,
  orderNumber?: string | null,
  /** Link to put in the message instead of Morning's viewer (which asks the customer to log in). */
  shareUrl?: (invoice: ShareableInvoice) => string,
): { url: string } | { error: string } {
  const best = rankInvoices(invoices.filter(i => !!morningViewUrl(i.קישור_חשבונית ?? '')))[0];
  if (!best) return { error: 'לא קיים מסמך עם קישור לשליחה. יש להפיק חשבונית תחילה.' };
  if (!waNumber(phone)) return { error: 'לא קיים מספר טלפון תקין ללקוחה. יש לעדכן טלפון בכרטיס הלקוחה.' };

  const i = best;
  const url = shareUrl ? shareUrl(i) : morningViewUrl(i.קישור_חשבונית ?? '') as string;
  const label = INVOICE_DOC_LABELS[i.סוג_מסמך || ''] || 'חשבונית';
  const num = prettyDocNumber(i.מספר_חשבונית) ?? '';
  const text = [
    `שלום${firstName.trim() ? ` ${firstName.trim()}` : ''},`,
    `מצורפת ${label}${num ? ` מס' ${num}` : ''}${orderNumber ? ` עבור הזמנה ${orderNumber}` : ''}:`,
    url,
    '',
    'תודה, עדי תכשיט שוקולד',
  ].join('\n');
  return { url: waLink(phone, text) as string };
}
