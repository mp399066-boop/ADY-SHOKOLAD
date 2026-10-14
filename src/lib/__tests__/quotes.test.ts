import { describe, expect, it } from 'vitest';
import { computeQuoteTotals, quoteApprovable, quoteEditable, quoteIsPreVat, quoteInputSchema, PUBLIC_TOKEN_RE } from '@/lib/quotes';
import { waNumber, waLink, fillTemplate } from '@/lib/whatsapp';

const L = (כמות: number, מחיר_ליחידה: number) => ({ כמות, מחיר_ליחידה });

describe('computeQuoteTotals', () => {
  it('sums lines and adds delivery', () => {
    expect(computeQuoteTotals([L(2, 50), L(1, 30.5)], 'ללא', 0, 40)).toEqual({ subtotal: 130.5, discount: 0, total: 170.5 });
  });
  it('applies a percent discount on the subtotal only', () => {
    expect(computeQuoteTotals([L(10, 20)], 'אחוז', 10, 30)).toEqual({ subtotal: 200, discount: 20, total: 210 });
  });
  it('caps a fixed discount at the subtotal', () => {
    expect(computeQuoteTotals([L(1, 50)], 'סכום', 80, 0)).toEqual({ subtotal: 50, discount: 50, total: 0 });
  });
});

describe('quote state rules', () => {
  it('approvable only while sent/draft and not expired', () => {
    expect(quoteApprovable({ סטטוס: 'נשלחה', תוקף_עד: '2026-10-20' }, '2026-10-14')).toBe(true);
    expect(quoteApprovable({ סטטוס: 'נשלחה', תוקף_עד: '2026-10-13' }, '2026-10-14')).toBe(false);
    expect(quoteApprovable({ סטטוס: 'נשלחה', תוקף_עד: null }, '2026-10-14')).toBe(true);
    expect(quoteApprovable({ סטטוס: 'נדחתה', תוקף_עד: null }, '2026-10-14')).toBe(false);
  });
  it('editable until approved or converted', () => {
    expect(quoteEditable('נשלחה')).toBe(true);
    expect(quoteEditable('אושרה')).toBe(false);
    expect(quoteEditable('הומרה להזמנה')).toBe(false);
  });
  it('business customers are quoted before VAT unless exempt', () => {
    expect(quoteIsPreVat('עסקי - קבוע', false)).toBe(true);
    expect(quoteIsPreVat('עסקי', true)).toBe(false);
    expect(quoteIsPreVat('פרטי', false)).toBe(false);
  });
});

describe('quoteInputSchema', () => {
  const base = { לקוח_id: '11111111-1111-4111-8111-111111111111', פריטים: [{ סוג: 'ידני', שם: 'מגש', כמות: 1, מחיר_ליחידה: 100 }] };
  it('accepts a valid quote', () => {
    expect(quoteInputSchema.safeParse(base).success).toBe(true);
  });
  it('rejects negative prices, zero quantities and >100% discounts', () => {
    expect(quoteInputSchema.safeParse({ ...base, פריטים: [{ סוג: 'ידני', שם: 'x', כמות: 1, מחיר_ליחידה: -5 }] }).success).toBe(false);
    expect(quoteInputSchema.safeParse({ ...base, פריטים: [{ סוג: 'ידני', שם: 'x', כמות: 0, מחיר_ליחידה: 5 }] }).success).toBe(false);
    expect(quoteInputSchema.safeParse({ ...base, סוג_הנחה: 'אחוז', ערך_הנחה: 120 }).success).toBe(false);
  });
  it('requires a product id on a product line', () => {
    expect(quoteInputSchema.safeParse({ ...base, פריטים: [{ סוג: 'מוצר', כמות: 1, מחיר_ליחידה: 5 }] }).success).toBe(false);
  });
});

describe('public token format', () => {
  it('accepts base64url tokens and rejects junk', () => {
    expect(PUBLIC_TOKEN_RE.test('AbCdEfGhIjKlMnOpQrStUvWxYz012345')).toBe(true);
    expect(PUBLIC_TOKEN_RE.test('short')).toBe(false);
    expect(PUBLIC_TOKEN_RE.test("abc'; drop table--abcdefghijklmn")).toBe(false);
  });
});

describe('whatsapp', () => {
  it('normalizes Israeli numbers', () => {
    expect(waNumber('050-1234567')).toBe('972501234567');
    expect(waNumber('+972 50 123 4567')).toBe('972501234567');
    expect(waNumber('00972501234567')).toBe('972501234567');
    expect(waNumber('123')).toBeNull();
  });
  it('builds a link with encoded text and fills the name', () => {
    expect(waLink('0501234567', 'שלום')).toBe('https://wa.me/972501234567?text=%D7%A9%D7%9C%D7%95%D7%9D');
    expect(fillTemplate('היי {שם}!', 'דנה')).toBe('היי דנה!');
  });
});
