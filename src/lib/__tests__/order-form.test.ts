import { describe, expect, it } from 'vitest';
import { orderFormSchema, splitFullName } from '@/lib/order-form';

const valid = {
  שם_מלא: 'דנה כהן',
  טלפון: '050-1234567',
  אימייל: '',
  פריטים: [{ סוג: 'מארז', id: '11111111-1111-4111-8111-111111111111', כמות: 2 }],
  סוג_אספקה: 'איסוף עצמי',
  תאריך_אספקה: '2026-11-01',
};

describe('orderFormSchema', () => {
  it('accepts a minimal pickup request', () => {
    expect(orderFormSchema.safeParse(valid).success).toBe(true);
  });
  it('requires an address and city for delivery', () => {
    const r = orderFormSchema.safeParse({ ...valid, סוג_אספקה: 'משלוח' });
    expect(r.success).toBe(false);
    expect(orderFormSchema.safeParse({ ...valid, סוג_אספקה: 'משלוח', כתובת: 'הרצל 1', עיר: 'ירושלים' }).success).toBe(true);
  });
  it('rejects a bad phone, no items, zero / huge quantities', () => {
    expect(orderFormSchema.safeParse({ ...valid, טלפון: '12' }).success).toBe(false);
    expect(orderFormSchema.safeParse({ ...valid, פריטים: [] }).success).toBe(false);
    expect(orderFormSchema.safeParse({ ...valid, פריטים: [{ ...valid.פריטים[0], כמות: 0 }] }).success).toBe(false);
    expect(orderFormSchema.safeParse({ ...valid, פריטים: [{ ...valid.פריטים[0], כמות: 501 }] }).success).toBe(false);
  });
  it('ignores client prices — only ids and quantities are accepted', () => {
    const r = orderFormSchema.safeParse({ ...valid, פריטים: [{ ...valid.פריטים[0], מחיר: 1 }] });
    expect(r.success && 'מחיר' in r.data.פריטים[0]).toBe(false);
  });
  it('rejects a non-uuid item id', () => {
    expect(orderFormSchema.safeParse({ ...valid, פריטים: [{ סוג: 'מוצר', id: "1' or 1=1", כמות: 1 }] }).success).toBe(false);
  });
});

describe('splitFullName', () => {
  it('splits first and last name', () => {
    expect(splitFullName('  דנה  בן דוד ')).toEqual({ first: 'דנה', last: 'בן דוד' });
    expect(splitFullName('דנה')).toEqual({ first: 'דנה', last: '' });
  });
});
