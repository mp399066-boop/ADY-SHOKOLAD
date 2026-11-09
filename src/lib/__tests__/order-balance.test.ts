import { describe, it, expect } from 'vitest';
import { paidTotal, balanceShown, balanceStored, vatAddedOnTop } from '@/lib/order-balance';

describe('order balance', () => {
  it('counts only payments marked שולם', () => {
    expect(paidTotal([
      { סכום: 100, סטטוס_תשלום: 'שולם' },
      { סכום: '50.5', סטטוס_תשלום: 'שולם' },
      { סכום: 400, סטטוס_תשלום: 'ממתין' }, // PayPlus link not paid yet
    ])).toBe(150.5);
    expect(paidTotal(null)).toBe(0);
  });

  it('private customer: balance = total − paid, never negative', () => {
    expect(balanceShown(500, [{ סכום: 200, סטטוס_תשלום: 'שולם' }], false)).toBe(300);
    expect(balanceStored(500, [{ סכום: 600, סטטוס_תשלום: 'שולם' }], false)).toBe(0);
  });

  it('business customer: payment is VAT-inclusive, stored balance stays pre-VAT', () => {
    // total 1000 before VAT → customer sees 1180; paid 590 → 590 shown, 500 stored
    expect(balanceShown(1000, [{ סכום: 590, סטטוס_תשלום: 'שולם' }], true)).toBe(590);
    expect(balanceStored(1000, [{ סכום: 590, סטטוס_תשלום: 'שולם' }], true)).toBe(500);
  });

  it('VAT on top only for business, never for סאטמר', () => {
    expect(vatAddedOnTop('עסקי - קבוע', 'רגיל')).toBe(true);
    expect(vatAddedOnTop('עסקי', 'סאטמר')).toBe(false);
    expect(vatAddedOnTop('פרטי', 'רגיל')).toBe(false);
  });
});
