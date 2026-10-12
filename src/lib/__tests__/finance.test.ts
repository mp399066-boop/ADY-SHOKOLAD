import { describe, expect, it } from 'vitest';
import {
  vatModeFor, toFinanceOrder, isBarterOrder, isCountableOrder, orderIncome, summarize,
  vatFromGross, expenseNet, buildPnl, expenseBox, isCoursesExpense, type FinanceOrderSource, type Expense,
} from '@/lib/finance';

const order = (
  over: Partial<FinanceOrderSource> = {},
  customer: Partial<NonNullable<FinanceOrderSource['לקוחות']>> = {},
): FinanceOrderSource => ({
  id: 'o1', מספר_הזמנה: '100', תאריך_הזמנה: '2026-10-01', תאריך_אספקה: '2026-10-02',
  סטטוס_הזמנה: 'חדשה', סטטוס_תשלום: 'שולם', סוג_הזמנה: 'רגיל', אופן_תשלום: 'אשראי',
  סך_הכל_לתשלום: 118, דמי_משלוח: 0, לקוח_id: 'c1',
  לקוחות: { שם_פרטי: 'דנה', שם_משפחה: 'כהן', סוג_לקוח: 'פרטי', פטור_ממעמ: false, ...customer },
  ...over,
});

describe('vatModeFor', () => {
  it('business customer → amounts are pre-VAT', () => expect(vatModeFor('עסקי', 'רגיל', false)).toBe('business'));
  it('private customer → VAT included', () => expect(vatModeFor('פרטי', 'רגיל', false)).toBe('included'));
  it('Satmar order of a business customer → VAT included', () => expect(vatModeFor('עסקי', 'סאטמר', false)).toBe('included'));
  it('VAT-exempt wins over everything', () => expect(vatModeFor('עסקי', 'רגיל', true)).toBe('exempt'));
});

describe('toFinanceOrder', () => {
  it('private: stored 118 incl. VAT → net 100', () => {
    const o = toFinanceOrder(order());
    expect(o.grossTotal).toBe(118);
    expect(o.netTotal).toBe(100);
  });
  it('business: stored 100 pre-VAT → customer pays 118', () => {
    const o = toFinanceOrder(order({ סך_הכל_לתשלום: 100 }, { סוג_לקוח: 'עסקי' }));
    expect(o.grossTotal).toBe(118);
    expect(o.netTotal).toBe(100);
  });
  it('exempt: stored = paid = net', () => {
    const o = toFinanceOrder(order({ סך_הכל_לתשלום: 100 }, { פטור_ממעמ: true }));
    expect(o.grossTotal).toBe(100);
    expect(o.netTotal).toBe(100);
  });
  it('shipping can never exceed the total', () => {
    const o = toFinanceOrder(order({ סך_הכל_לתשלום: 20, דמי_משלוח: 35 }));
    expect(o.grossShipping).toBe(20);
    expect(o.grossNoShipping).toBe(0);
  });
  it('string amounts from the DB are parsed', () => {
    expect(toFinanceOrder(order({ סך_הכל_לתשלום: '236' })).netTotal).toBe(200);
  });
});

describe('barter & countable', () => {
  it('barter by payment status or method', () => {
    expect(isBarterOrder(order({ סטטוס_תשלום: 'בארטר' }))).toBe(true);
    expect(isBarterOrder(order({ אופן_תשלום: 'בארטר' }))).toBe(true);
  });
  it('barter customer without a money method is barter; with one it is not', () => {
    expect(isBarterOrder(order({ אופן_תשלום: '' }, { סוג_לקוח: 'בארטר' }))).toBe(true);
    expect(isBarterOrder(order({ אופן_תשלום: 'מזומן' }, { סוג_לקוח: 'בארטר' }))).toBe(false);
  });
  it('cancelled and draft orders are not income', () => {
    expect(isCountableOrder({ סטטוס_הזמנה: 'בוטלה', סטטוס_תשלום: 'שולם' })).toBe(false);
    expect(isCountableOrder({ סטטוס_הזמנה: 'טיוטה', סטטוס_תשלום: 'ממתין' })).toBe(false);
    expect(isCountableOrder({ סטטוס_הזמנה: 'חדשה', סטטוס_תשלום: 'בוטל' })).toBe(false);
    expect(isCountableOrder({ סטטוס_הזמנה: 'חדשה', סטטוס_תשלום: 'שולם' })).toBe(true);
  });
});

describe('income', () => {
  it('pocket + shipping before VAT + VAT = what the customer paid', () => {
    const cases: [number, number, string][] = [[236, 35.4, 'פרטי'], [500, 30, 'עסקי'], [99.9, 0, 'פרטי']];
    for (const [total, ship, type] of cases) {
      const m = orderIncome(toFinanceOrder(order({ סך_הכל_לתשלום: total, דמי_משלוח: ship }, { סוג_לקוח: type })));
      expect(Math.abs(m.pocket + m.shippingNet + m.vat - m.grossTotal)).toBeLessThanOrEqual(0.02);
    }
  });
  it('pocket excludes delivery and VAT', () => {
    const m = orderIncome(toFinanceOrder(order({ סך_הכל_לתשלום: 236, דמי_משלוח: 59 })));
    expect(m.pocket).toBe(150);
    expect(m.shippingNet).toBe(50);
  });
  it('unpaid order shows as open', () => {
    expect(orderIncome(toFinanceOrder(order({ סטטוס_תשלום: 'ממתין' }))).openGross).toBe(118);
  });
  it('summarize keeps barter out of the money', () => {
    const s = summarize([toFinanceOrder(order()), toFinanceOrder(order({ id: 'o2', סטטוס_תשלום: 'בארטר' }))]);
    expect(s.count).toBe(1);
    expect(s.barterCount).toBe(1);
    expect(s.grossTotal).toBe(118);
    expect(s.barterTotal).toBe(100);
  });
});

describe('expenses', () => {
  it('VAT inside a gross amount', () => expect(vatFromGross(118)).toBe(18));
  it('expense net = amount − VAT', () => expect(expenseNet({ סכום: 118, מעמ: 18 })).toBe(100));
});

describe('expense boxes (קופת קורסים)', () => {
  const exp = (over: Partial<Expense>): Expense => ({
    id: 'e1', תאריך: '2026-10-05', ספק_id: null, שם_ספק: 'ספק', קטגוריה: 'חומרי גלם', תיאור: null,
    סכום: 118, מעמ: 18, מספר_מסמך: null, אמצעי_תשלום: null, הערות: null, מקור: 'ידני', ...over,
  });

  it('missing / unknown box = the business box', () => {
    expect(expenseBox({})).toBe('עסק');
    expect(expenseBox({ קופה: null })).toBe('עסק');
    expect(expenseBox({ קופה: 'קורסים' })).toBe('קורסים');
    expect(isCoursesExpense({ קופה: 'עסק' })).toBe(false);
  });

  it('courses expenses are not counted in the business profit & loss', () => {
    const pnl = buildPnl([], [exp({ id: 'a' }), exp({ id: 'b', קופה: 'קורסים', סכום: 590, מעמ: 90 })], 2026, 'order', '2026-10-12');
    expect(pnl.totals.expenses).toBe(100);
    expect(pnl.totals.expensesGross).toBe(118);
    expect(pnl.totals.result).toBe(-100);
  });
});
