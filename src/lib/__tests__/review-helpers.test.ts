import { describe, it, expect } from 'vitest';
import { orFilterTerm } from '@/lib/utils';
import { rankInvoices, prettyDocNumber } from '@/lib/invoice-docs';
import { invoiceWhatsappLink } from '@/lib/whatsapp';

describe('orFilterTerm', () => {
  it('drops characters that would add or close a PostgREST condition', () => {
    expect(orFilterTerm('כהן,id.eq.1)')).toBe('כהן id.eq.1');
    expect(orFilterTerm('a"b\\c(d')).toBe('a b c d');
  });
  it('escapes LIKE wildcards and trims/limits length', () => {
    expect(orFilterTerm(' 50%_ ')).toBe('50\\%\\_');
    expect(orFilterTerm('x'.repeat(200)).length).toBe(80);
  });
  it('keeps phone numbers and emails intact', () => {
    expect(orFilterTerm('050-1234567')).toBe('050-1234567');
    expect(orFilterTerm('a@b.co.il')).toBe('a@b.co.il');
  });
});

describe('rankInvoices', () => {
  it('prefers invoice-receipt > tax invoice > receipt, then newest', () => {
    const docs = [
      { id: 'r',  סוג_מסמך: 'receipt',         תאריך_יצירה: '2026-11-03' },
      { id: 't1', סוג_מסמך: 'tax_invoice',     תאריך_יצירה: '2026-11-01' },
      { id: 't2', סוג_מסמך: 'tax_invoice',     תאריך_יצירה: '2026-11-02' },
      { id: 'ir', סוג_מסמך: 'חשבונית_מס_קבלה', תאריך_יצירה: '2026-10-01' },
    ];
    expect(rankInvoices(docs).map(d => d.id)).toEqual(['ir', 't2', 't1', 'r']);
    expect(docs[0].id).toBe('r'); // input untouched
  });
  it('prettyDocNumber strips the manual marker', () => {
    expect(prettyDocNumber('manual: 1234')).toBe('1234');
    expect(prettyDocNumber('  ')).toBeNull();
    expect(prettyDocNumber('5001')).toBe('5001');
  });
});

describe('invoiceWhatsappLink (shared ranking)', () => {
  it('sends the best document with a valid link', () => {
    const res = invoiceWhatsappLink(
      [
        { id: 'a', מספר_חשבונית: '1', קישור_חשבונית: 'https://app.greeninvoice.co.il/ext/d/a', סוג_מסמך: 'receipt', תאריך_יצירה: '2026-11-05' },
        { id: 'b', מספר_חשבונית: 'manual:2', קישור_חשבונית: 'https://app.greeninvoice.co.il/ext/d/b', סוג_מסמך: 'tax_invoice', תאריך_יצירה: '2026-11-01' },
        { id: 'c', מספר_חשבונית: '3', קישור_חשבונית: 'not a url', סוג_מסמך: 'invoice_receipt', תאריך_יצירה: '2026-11-06' },
      ],
      '050-1234567', 'דנה', 'ORD-1',
    );
    expect('url' in res).toBe(true);
    const text = decodeURIComponent((res as { url: string }).url);
    expect(text).toContain("חשבונית מס מס' 2");
    expect(text).toContain('/ext/d/b');
  });
});
