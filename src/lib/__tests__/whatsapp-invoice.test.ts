import { describe, it, expect } from 'vitest';
import { invoiceWhatsappLink } from '../whatsapp';

const receipt = { מספר_חשבונית: '10', קישור_חשבונית: 'https://app.greeninvoice.co.il/ext/d/r1', סוג_מסמך: 'receipt' };
const invRec = { מספר_חשבונית: '20', קישור_חשבונית: '{"he":"https://app.greeninvoice.co.il/ext/d/ir1"}', סוג_מסמך: 'invoice_receipt' };

describe('invoiceWhatsappLink', () => {
  it('prefers the invoice-receipt and unwraps legacy JSON links', () => {
    const r = invoiceWhatsappLink([receipt, invRec], '050-1234567', 'דנה', '1234');
    expect('url' in r).toBe(true);
    const url = (r as { url: string }).url;
    expect(url.startsWith('https://wa.me/972501234567?text=')).toBe(true);
    const text = decodeURIComponent(url.split('text=')[1]);
    expect(text).toContain('שלום דנה');
    expect(text).toContain("חשבונית מס קבלה מס' 20 עבור הזמנה 1234");
    expect(text).toContain('https://app.greeninvoice.co.il/ext/d/ir1');
  });

  it('errors without a link or a valid phone', () => {
    expect(invoiceWhatsappLink([{ קישור_חשבונית: null }], '0501234567', '')).toHaveProperty('error');
    expect(invoiceWhatsappLink([receipt], '123', '')).toHaveProperty('error');
  });
});
