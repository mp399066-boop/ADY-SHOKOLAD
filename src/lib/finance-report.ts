// Full finance report (דוח פיננסי מלא) — pure data, no DOM.
// One definition of the report feeds both the Excel and the PDF export, so
// the two files always contain the same numbers as the /finance screens.

import {
  summarize, summarizeByCustomer, summarizeByPaymentMethod, paymentMethodLabel, buildPnl, orderBasisDate, expenseNet, expenseSupplierName,
  monthKey, monthLabel, round2, HEBREW_MONTHS, todayJerusalem,
  type FinanceOrder, type Expense, type DateBasis,
} from '@/lib/finance';
import type { Cell } from '@/lib/finance-export';

export interface ReportTable {
  headers: string[];
  rows: Cell[][];
  total?: Cell[];
  /** Column indexes holding shekel amounts (formatted as ₪ in the PDF). */
  moneyCols: number[];
}

export interface ReportSection {
  /** Excel sheet name (≤31 chars). */
  sheet: string;
  title: string;
  kpis?: { label: string; value: number; money?: boolean; tone?: 'green' | 'red' | 'amber' }[];
  table?: ReportTable;
  notes?: string[];
}

export interface FinanceReport {
  title: string;
  periodLabel: string;
  generatedAt: string;
  fileBase: string;
  sections: ReportSection[];
}

const fmtD = (iso: string | null | undefined) => {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

/**
 * @param month 1-12 for a single month, or null for the whole year.
 * @param expensesReady false when the expenses table doesn't exist yet.
 */
export function buildFinanceReport(opts: {
  orders: FinanceOrder[];
  expenses: Expense[];
  year: number;
  month: number | null;
  basis: DateBasis;
  expensesReady: boolean;
}): FinanceReport {
  const { year, month, basis, expensesReady } = opts;
  const key = month ? monthKey(year, month - 1) : null;
  const orders = key ? opts.orders.filter(o => orderBasisDate(o, basis)?.slice(0, 7) === key) : opts.orders;
  const expenses = key ? opts.expenses.filter(e => e.תאריך.slice(0, 7) === key) : opts.expenses;
  const periodLabel = key ? monthLabel(key) : `שנת ${year}`;
  const basisLabel = basis === 'order' ? 'הזמנות משויכות לחודש לפי תאריך ההזמנה' : 'הזמנות משויכות לחודש לפי תאריך האספקה';

  const s = summarize(orders);
  const expGross = round2(expenses.reduce((t, e) => t + (Number(e.סכום) || 0), 0));
  const expVat = round2(expenses.reduce((t, e) => t + (Number(e.מעמ) || 0), 0));
  const expNet = round2(expGross - expVat);
  const result = round2(s.total - expNet);

  const sections: ReportSection[] = [];

  // 1. Summary
  sections.push({
    sheet: 'סיכום',
    title: `סיכום — ${periodLabel}`,
    kpis: [
      { label: 'סה״כ נכנס אלייך (לפני מע״מ)', value: s.total, money: true, tone: 'green' },
      { label: 'מתוכו ללא משלוחים', value: s.noShipping, money: true },
      { label: 'מתוכו דמי משלוח', value: s.shipping, money: true },
      { label: 'מתוכו טרם שולם', value: s.openTotal, money: true, tone: s.openTotal ? 'amber' : undefined },
      { label: 'מספר הזמנות', value: s.count },
      { label: 'הלקוחות חויבו (כולל מע״מ)', value: s.grossTotal, money: true },
      ...(expensesReady ? [
        { label: 'הוצאות ששולמו (כולל מע״מ)', value: expGross, money: true },
        { label: 'הוצאות לפני מע״מ', value: expNet, money: true, tone: 'red' as const },
        { label: result >= 0 ? 'רווח (לפני מע״מ)' : 'הפסד (לפני מע״מ)', value: Math.abs(result), money: true, tone: result >= 0 ? 'green' as const : 'red' as const },
      ] : []),
    ],
    notes: [
      basisLabel + '.',
      'כל הסכומים לפני מע״מ, לכל הלקוחות — זה הכסף שנכנס אלייך בפועל (המע״מ שייך למדינה). כולל הזמנות שטרם שולמו; ללא הזמנות שבוטלו, טיוטות ובארטר.',
      ...(s.barterCount ? [`${s.barterCount} הזמנות בארטר (שווי ₪${s.barterTotal.toLocaleString('he-IL')} לפני מע״מ) לא נכללו — לא נכנס עליהן כסף.`] : []),
      'הוצאות: "שולם" = הסכום שיצא בפועל; "לפני מע״מ" = אחרי קיזוז המע״מ. רווח והפסד מחושב לפני מע״מ.',
      ...(!expensesReady ? ['טבלת ההוצאות עדיין לא הופעלה (מיגרציה 057) — הדוח כולל הכנסות בלבד.'] : []),
    ],
  });

  // 2. Monthly income + P&L (whole year only)
  if (!key) {
    const pnl = buildPnl(opts.orders, opts.expenses, year, basis);
    const monthly = Array.from({ length: 12 }, (_, i) => {
      const k = monthKey(year, i);
      return { m: HEBREW_MONTHS[i], s: summarize(orders.filter(o => orderBasisDate(o, basis)?.slice(0, 7) === k)) };
    });
    sections.push({
      sheet: 'הכנסות לפי חודש',
      title: `הכנסות לפי חודש — ${year} (לפני מע״מ)`,
      table: {
        headers: ['חודש', 'הזמנות', 'ללא משלוח', 'דמי משלוח', 'סה״כ נכנס', 'שולם', 'טרם שולם'],
        rows: monthly.map(({ m, s: x }) => [m, x.count, x.noShipping, x.shipping, x.total, x.paidTotal, x.openTotal]),
        total: ['סה״כ נכנס אלייך', s.count, s.noShipping, s.shipping, s.total, s.paidTotal, s.openTotal],
        moneyCols: [2, 3, 4, 5, 6],
      },
    });
    if (expensesReady) {
      const t = pnl.totals;
      sections.push({
        sheet: 'רווח והפסד',
        title: `רווח והפסד לפי חודש — ${year} (לפני מע״מ)`,
        table: {
          headers: ['חודש', 'הכנסות', 'הוצאות', 'רווח / הפסד', 'מצטבר', 'טרם נגבה'],
          rows: pnl.months.map(r => [r.month, r.income, r.expenses, r.result, r.cumulative, r.open]),
          total: ['סה״כ', t.income, t.expenses, t.result, null, t.open],
          moneyCols: [1, 2, 3, 4, 5],
        },
        notes: [
          ...(pnl.avgExpenses > 0 ? [`הוצאה חודשית ממוצעת: ₪${pnl.avgExpenses.toLocaleString('he-IL')} לפני מע״מ — זו ההכנסה המינימלית לחודש כדי לא להפסיד.`] : []),
          ...(pnl.avgIncome > 0 ? [`הכנסה חודשית ממוצעת: ₪${pnl.avgIncome.toLocaleString('he-IL')} לפני מע״מ.`] : []),
          ...(t.result < 0 ? [`כדי לכסות את ההפסד המצטבר צריך עוד ₪${(-t.result).toLocaleString('he-IL')} רווח מעבר להוצאות.`] : []),
        ],
      });
    }
  }

  // 3. Expenses by category / by supplier
  if (expensesReady) {
    const group = (keyOf: (e: Expense) => string) => {
      const map = new Map<string, { n: number; gross: number; vat: number }>();
      for (const e of expenses) {
        const k = keyOf(e);
        const g = map.get(k) ?? { n: 0, gross: 0, vat: 0 };
        g.n++; g.gross = round2(g.gross + Number(e.סכום)); g.vat = round2(g.vat + Number(e.מעמ));
        map.set(k, g);
      }
      return Array.from(map.entries()).sort((a, b) => b[1].gross - a[1].gross)
        .map(([name, g]) => [name, g.n, g.gross, g.vat, round2(g.gross - g.vat)] as Cell[]);
    };
    const total: Cell[] = ['סה״כ', expenses.length, expGross, expVat, expNet];
    sections.push({
      sheet: 'הוצאות לפי קטגוריה',
      title: `הוצאות לפי קטגוריה — ${periodLabel}`,
      table: { headers: ['קטגוריה', 'הוצאות', 'שולם', 'מע״מ', 'לפני מע״מ'], rows: group(e => e.קטגוריה || 'אחר'), total, moneyCols: [2, 3, 4] },
    });
    sections.push({
      sheet: 'הוצאות לפי ספק',
      title: `הוצאות לפי ספק / מקבל — ${periodLabel}`,
      table: { headers: ['ספק / מקבל', 'הוצאות', 'שולם', 'מע״מ', 'לפני מע״מ'], rows: group(expenseSupplierName), total, moneyCols: [2, 3, 4] },
    });
    sections.push({
      sheet: 'הוצאות לפי אמצעי תשלום',
      title: `הוצאות לפי אמצעי תשלום — ${periodLabel}`,
      table: { headers: ['אמצעי תשלום', 'הוצאות', 'שולם', 'מע״מ', 'לפני מע״מ'], rows: group(e => paymentMethodLabel(e.אמצעי_תשלום)), total, moneyCols: [2, 3, 4] },
    });
  }

  // 4. Income by customer
  sections.push({
    sheet: 'הכנסות לפי לקוח',
    title: `הכנסות לפי לקוח — ${periodLabel} (לפני מע״מ)`,
    table: {
      headers: ['לקוח', 'הזמנות', 'ללא משלוח', 'דמי משלוח', 'סה״כ נכנס', 'טרם שולם'],
      rows: summarizeByCustomer(orders).map(c => [c.customerName, c.count, c.noShipping, c.shipping, c.total, c.openTotal]),
      total: ['סה״כ', s.count, s.noShipping, s.shipping, s.total, s.openTotal],
      moneyCols: [2, 3, 4, 5],
    },
  });

  // 4b. Income by payment method
  sections.push({
    sheet: 'הכנסות לפי אמצעי תשלום',
    title: `הכנסות לפי אמצעי תשלום — ${periodLabel} (לפני מע״מ)`,
    table: {
      headers: ['אמצעי תשלום', 'הזמנות', 'סה״כ נכנס', 'טרם שולם'],
      rows: summarizeByPaymentMethod(orders).map(m => [m.method, m.count, m.total, m.openTotal]),
      total: ['סה״כ', s.count, s.total, s.openTotal],
      moneyCols: [2, 3],
    },
  });

  // 5. All orders
  const sortedOrders = [...orders].sort((a, b) =>
    (orderBasisDate(a, basis) ?? '').localeCompare(orderBasisDate(b, basis) ?? '') || a.orderNumber.localeCompare(b.orderNumber));
  sections.push({
    sheet: 'כל ההזמנות',
    title: `כל ההזמנות — ${periodLabel} (לפני מע״מ)`,
    table: {
      headers: [basis === 'order' ? 'תאריך הזמנה' : 'תאריך אספקה', 'מס׳ הזמנה', 'לקוח', 'ללא משלוח', 'דמי משלוח', 'סה״כ נכנס', 'אמצעי תשלום', 'סטטוס'],
      rows: sortedOrders.map(o => [
        fmtD(orderBasisDate(o, basis)), o.orderNumber, o.customerName,
        o.netNoShipping, o.netShipping, o.netTotal,
        paymentMethodLabel(o.paymentMethod), o.barter ? 'בארטר (לא נספר)' : o.paymentStatus,
      ]),
      total: ['סה״כ', '', `${s.count} הזמנות`, s.noShipping, s.shipping, s.total, '', ''],
      moneyCols: [3, 4, 5],
    },
  });

  // 6. All expenses
  if (expensesReady) {
    sections.push({
      sheet: 'כל ההוצאות',
      title: `כל ההוצאות — ${periodLabel}`,
      table: {
        headers: ['תאריך', 'ספק / מקבל', 'קטגוריה', 'תיאור', 'שולם', 'מע״מ', 'לפני מע״מ', 'אמצעי תשלום', 'מס׳ מסמך'],
        rows: [...expenses].sort((a, b) => a.תאריך.localeCompare(b.תאריך)).map(e => [
          fmtD(e.תאריך), expenseSupplierName(e), e.קטגוריה, e.תיאור ?? '',
          Number(e.סכום), Number(e.מעמ), expenseNet(e), paymentMethodLabel(e.אמצעי_תשלום), e.מספר_מסמך ?? '',
        ]),
        total: ['סה״כ', '', '', `${expenses.length} הוצאות`, expGross, expVat, expNet, '', ''],
        moneyCols: [4, 5, 6],
      },
    });
  }

  const today = todayJerusalem();
  return {
    title: 'דוח פיננסי',
    periodLabel,
    generatedAt: fmtD(today),
    fileBase: `דוח_פיננסי_${key ?? year}`,
    sections,
  };
}

/** Excel workbook layout: one sheet per section; summary KPIs as label/value rows. */
export function reportToSheets(r: FinanceReport): { name: string; rows: Cell[][] }[] {
  return r.sections.map(sec => {
    const rows: Cell[][] = [[sec.title]];
    if (sec.kpis) {
      rows.push([]);
      for (const k of sec.kpis) rows.push([k.label, k.value]);
    }
    if (sec.table) {
      rows.push([], sec.table.headers, ...sec.table.rows);
      if (sec.table.total) rows.push(sec.table.total);
    }
    if (sec.notes?.length) {
      rows.push([]);
      for (const n of sec.notes) rows.push([n]);
    }
    if (sec.sheet === 'סיכום') rows.splice(1, 0, [`תקופה: ${r.periodLabel}`], [`הופק: ${r.generatedAt}`]);
    return { name: sec.sheet, rows };
  });
}
