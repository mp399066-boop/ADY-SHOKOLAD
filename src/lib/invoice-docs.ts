// Shared rules for an order's issued Morning documents: their Hebrew labels,
// which one to use when an order has several, and the displayed number.
// Used by the PDF download, the "send invoice" email and the WhatsApp link so
// all three always pick the same document.

export const INVOICE_DOC_LABELS: Record<string, string> = {
  invoice_receipt:  'חשבונית מס קבלה',
  'חשבונית_מס_קבלה': 'חשבונית מס קבלה',
  tax_invoice:      'חשבונית מס',
  receipt:          'קבלה',
};

// A real invoice document beats a plain receipt.
export function invoicePriority(t?: string | null): number {
  if (t === 'invoice_receipt' || t === 'חשבונית_מס_קבלה') return 3;
  if (t === 'tax_invoice') return 2;
  if (t === 'receipt') return 1;
  return 0;
}

interface RankableInvoice {
  סוג_מסמך?: string | null;
  תאריך_יצירה?: string | null;
}

/** Best first: by document type, then newest. Does not change the input. */
export function rankInvoices<T extends RankableInvoice>(invoices: T[]): T[] {
  return invoices.slice().sort((a, b) =>
    invoicePriority(b.סוג_מסמך) - invoicePriority(a.סוג_מסמך)
    || String(b.תאריך_יצירה || '').localeCompare(String(a.תאריך_יצירה || '')));
}

/** The document number without the internal `manual:` marker, or null. */
export function prettyDocNumber(raw?: string | null): string | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  return t.startsWith('manual:') ? t.slice('manual:'.length).trim() : t;
}
