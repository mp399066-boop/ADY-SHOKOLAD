import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoiceShareUrl, verifyInvoiceToken } from '../invoice-share-link';
import { invoiceWhatsappLink } from '../whatsapp';

const ID = '3f2a9c1e-1b2c-4d5e-8f90-123456789abc';
const tokenOf = (url: string) => url.split('/api/public/invoice/')[1];

describe('invoice share link', () => {
  beforeEach(() => {
    vi.stubEnv('REPORT_ACTION_SECRET', 'test-secret-0123456789');
    vi.stubEnv('APP_URL', 'https://crm.example');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('round-trips a signed link', () => {
    const url = invoiceShareUrl(ID);
    expect(url.startsWith('https://crm.example/api/public/invoice/')).toBe(true);
    expect(url.endsWith('.pdf')).toBe(true);
    expect(verifyInvoiceToken(tokenOf(url))).toBe(ID);
  });

  it('rejects tampered or foreign tokens', () => {
    const token = tokenOf(invoiceShareUrl(ID));
    const otherId = ID.replace('3f2a', '4f2a');
    expect(verifyInvoiceToken(token.replace(ID, otherId))).toBeNull();
    expect(verifyInvoiceToken(token.replace(/.\.pdf$/, c => (c[0] === '0' ? '1' : '0') + '.pdf'))).toBeNull();
    expect(verifyInvoiceToken('garbage')).toBeNull();
    vi.stubEnv('REPORT_ACTION_SECRET', 'another-secret-0123456789');
    expect(verifyInvoiceToken(token)).toBeNull();
  });

  it('puts the share link in the WhatsApp message instead of the Morning viewer', () => {
    const inv = { id: ID, מספר_חשבונית: '20', קישור_חשבונית: 'https://app.greeninvoice.co.il/ext/d/x', סוג_מסמך: 'invoice_receipt' };
    const r = invoiceWhatsappLink([inv], '0501234567', 'דנה', '1234', i => invoiceShareUrl(i.id as string));
    const text = decodeURIComponent((r as { url: string }).url.split('text=')[1]);
    expect(text).toContain(invoiceShareUrl(ID));
    expect(text).not.toContain('greeninvoice');
  });
});
