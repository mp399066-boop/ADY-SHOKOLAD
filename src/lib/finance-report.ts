// Full finance report (דוח פיננסי מלא) — pure data, no DOM.
// One definition of the report feeds both the Excel and the PDF export, so
// the two files always contain the same numbers as the /finance screens.

import {
  summarize, summarizeByCustomer, summarizeByPaymentMethod, paymentMethodLabel, buildPnl, averageBasis, averageOf,
  INCOME_COLUMNS, incomeValues, orderIncome, orderBasisDate, expenseNet, expenseSupplierName,
  monthKey, monthLabel, round2, HEBREW_MONTHS, todayJerusalem,
  type FinanceOrder, type Expense, type DateBasis,
} from '@/lib/finance';
import type { Cell } from '@/lib/finance-export';

export interface ReportTable {
  headers: string[];
  rows: Cell[][];
  total?: Cell[];
  /** Optional "ממוצע חודשי" row, printed under the total row. */
  average?: Cell[];
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
  const yearAvg = averageBasis(year, Array.from(new Set(
    orders.map(o => orderBasisDate(o, basis)?.slice(0, 7)).filter((k): k is string => !!k),
  )));
  const expGross = round2(expenses.reduce((t, e) => t + (Number(e.סכום) || 0), 0));
  const expVat = round2(expenses.reduce((t, e) => t + (Number(e.מעמ) || 0), 0));
  const expNet = round2(expGross - expVat);
  const result = round2(s.pocket - expNet);
  // Income money columns, in the shared order (see INCOME_COLUMNS).
  const incomeHeaders = INCOME_COLUMNS.map(c => c.short);
  const orderCols = INCOME_COLUMNS.filter(c => c.key !== 'openNet' && c.key !== 'openGross');
  const moneyRange = (from: number, n: number) => Array.from({ length: n }, (_, i) => from + i);

  const sections: ReportSection[] = [];

  // 1. Summary
  sections.push({
    sheet: 'סיכום',
    title: `סיכום — ${periodLabel}`,
    kpis: [
      { label: `נכנס לכיס — ללא משלוח, לפני מע״מ · ${s.count} הזמנות`, value: s.pocket, money: true, tone: 'green' },
      // Whole year: monthly average (same rule as the screens); single month: order count.
      ...(!key && yearAvg.months
        ? [{ label: `ממוצע חודשי לכיס (${yearAvg.label})`, value: averageOf(s.pocket, yearAvg), money: true }]
        : [{ label: 'מספר הזמנות', value: s.count }]),
      { label: 'ללא משלוח — כולל מע״מ', value: s.pocketGross, money: true },
      { label: 'סה״כ שהלקוחות שילמו — כולל מע״מ', value: s.grossTotal, money: true },
      { label: 'דמי משלוח — לפני מע״מ', value: s.shippingNet, money: true },
      { label: 'דמי משלוח — כולל מע״מ', value: s.shippingGross, money: true },
      { label: 'מע״מ', value: s.vat, money: true },
      { label: 'טרם שולם — לפני מע״מ', value: s.openNet, money: true, tone: s.openNet ? 'amber' : undefined },
      { label: 'טרם שולם — כולל מע״מ', value: s.openGross, money: true, tone: s.openGross ? 'amber' : undefined },
      ...(expensesReady ? [
        { label: 'הוצאות — לפני מע״מ', value: expNet, money: true, tone: 'red' as const },
        { label: 'הוצאות — כולל מע״מ (שולם בפועל)', value: expGross, money: true },
        { label: result >= 0 ? 'רווח — לפני מע״מ' : 'הפסד — לפני מע״מ', value: Math.abs(result), money: true, tone: result >= 0 ? 'green' as const : 'red' as const },
      ] : []),
    ],
    notes: [
      basisLabel + '.',
      '"נכנס לכיס" = סכום ההזמנות ללא דמי משלוח ולפני מע״מ. דמי משלוח ומע״מ אינם הכנסה ומוצגים בנפרד. נכנס לכיס + משלוח לפני מע״מ + מע״מ = מה שהלקוחות שילמו.',
      'כולל הזמנות שטרם שולמו; ללא הזמנות שבוטלו, טיוטות ובארטר.',
      ...(s.barterCount ? [`${s.barterCount} הזמנות בארטר (שווי ₪${s.barterTotal.toLocaleString('he-IL')} ללא משלוח, לפני מע״מ) לא נכללו — לא נכנס עליהן כסף.`] : []),
      'רווח / הפסד = נכנס לכיס פחות ההוצאות, שניהם לפני מע״מ.',
      ...(!expensesReady ? ['טבלת ההוצאות עדיין לא הופעלה (מיגרציה 057) — הדוח כולל הכנסות בלבד.'] : []),
    ],
  });

  // 2. Monthly income + P&L (whole year only)
  if (!key) {
    const pnl = buildPnl(opts.orders, opts.expenses, year, basis);
    const monthly = Array.from({ length: 12 }, (_, i) => {
      const k = monthKey(year, i);
      return { k, m: HEBREW_MONTHS[i], s: summarize(orders.filter(o => orderBasisDate(o, basis)?.slice(0, 7) === k)) };
    });
    const incomeAvg = averageBasis(year, monthly.filter(x => x.s.count + x.s.barterCount > 0).map(x => x.k));
    sections.push({
      sheet: 'הכנסות לפי חודש',
      title: `הכנסות לפי חודש — ${year}`,
      table: {
        headers: ['חודש', 'הזמנות', ...incomeHeaders],
        rows: monthly.map(({ m, s: x }) => [m, x.count, ...incomeValues(x)]),
        total: ['סה״כ', s.count, ...incomeValues(s)],
        average: incomeAvg.months
          ? [`ממוצע חודשי (${incomeAvg.label})`, round2(s.count / incomeAvg.months), ...incomeValues(s).map(n => averageOf(n, incomeAvg))]
          : undefined,
        moneyCols: moneyRange(2, INCOME_COLUMNS.length),
      },
    });
    if (expensesReady) {
      const t = pnl.totals;
      sections.push({
        sheet: 'רווח והפסד',
        title: `רווח והפסד לפי חודש — ${year} (רווח / הפסד לפני מע״מ)`,
        table: {
          headers: ['חודש', 'נכנס לכיס לפני מע״מ', 'נכנס לכיס כולל מע״מ', 'הוצאות לפני מע״מ', 'הוצאות כולל מע״מ', 'רווח / הפסד', 'מצטבר', 'טרם נגבה'],
          rows: pnl.months.map(r => [r.month, r.income, r.incomeGross, r.expenses, r.expensesGross, r.result, r.cumulative, r.open]),
          total: ['סה״כ', t.income, t.incomeGross, t.expenses, t.expensesGross, t.result, t.result, t.open],
          average: pnl.average.months
            ? [`ממוצע חודשי (${pnl.average.label})`, pnl.avg.income, pnl.avg.incomeGross, pnl.avg.expenses, pnl.avg.expensesGross, pnl.avg.result, null, pnl.avg.open]
            : undefined,
          moneyCols: [1, 2, 3, 4, 5, 6, 7],
        },
        notes: [
          ...(pnl.avgExpenses > 0 ? [`הוצאה חודשית ממוצעת (${pnl.average.label}): ₪${pnl.avgExpenses.toLocaleString('he-IL')} לפני מע״מ — זו ההכנסה המינימלית לחודש כדי לא להפסיד.`] : []),
          ...(pnl.avgIncome > 0 ? [`ממוצע חודשי לכיס (${pnl.average.label}): ₪${pnl.avgIncome.toLocaleString('he-IL')} ללא משלוח, לפני מע״מ.`] : []),
          'ההכנסות ברווח והפסד = נכנס לכיס (ללא דמי משלוח, לפני מע״מ).',
          'ממוצע חודשי: בשנה שהסתיימה — סה״כ השנה ÷ 12. בשנה הנוכחית — ÷ מספר החודשים מהחודש הראשון עם פעילות ועד החודש הנוכחי (מתעדכן כל חודש).',
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
        .map(([name, g]) => [name, g.n, round2(g.gross - g.vat), g.vat, g.gross] as Cell[]);
    };
    const total: Cell[] = ['סה״כ', expenses.length, expNet, expVat, expGross];
    sections.push({
      sheet: 'הוצאות לפי קטגוריה',
      title: `הוצאות לפי קטגוריה — ${periodLabel}`,
      table: { headers: ['קטגוריה', 'הוצאות', 'לפני מע״מ', 'מע״מ', 'כולל מע״מ'], rows: group(e => e.קטגוריה || 'אחר'), total, moneyCols: [2, 3, 4] },
    });
    sections.push({
      sheet: 'הוצאות לפי ספק',
      title: `הוצאות לפי ספק / מקבל — ${periodLabel}`,
      table: { headers: ['ספק / מקבל', 'הוצאות', 'לפני מע״מ', 'מע״מ', 'כולל מע״מ'], rows: group(expenseSupplierName), total, moneyCols: [2, 3, 4] },
    });
    sections.push({
      sheet: 'הוצאות לפי אמצעי תשלום',
      title: `הוצאות לפי אמצעי תשלום — ${periodLabel}`,
      table: { headers: ['אמצעי תשלום', 'הוצאות', 'לפני מע״מ', 'מע״מ', 'כולל מע״מ'], rows: group(e => paymentMethodLabel(e.אמצעי_תשלום)), total, moneyCols: [2, 3, 4] },
    });
  }

  // 4. Income by customer
  sections.push({
    sheet: 'הכנסות לפי לקוח',
    title: `הכנסות לפי לקוח — ${periodLabel}`,
    table: {
      headers: ['לקוח', 'הזמנות', ...incomeHeaders],
      rows: summarizeByCustomer(orders).map(c => [c.customerName, c.count, ...incomeValues(c)]),
      total: ['סה״כ', s.count, ...incomeValues(s)],
      moneyCols: moneyRange(2, INCOME_COLUMNS.length),
    },
  });

  // 4b. Income by payment method
  sections.push({
    sheet: 'הכנסות לפי אמצעי תשלום',
    title: `הכנסות לפי אמצעי תשלום — ${periodLabel}`,
    table: {
      headers: ['אמצעי תשלום', 'הזמנות', ...incomeHeaders],
      rows: summarizeByPaymentMethod(orders).map(m => [m.method, m.count, ...incomeValues(m)]),
      total: ['סה״כ', s.count, ...incomeValues(s)],
      moneyCols: moneyRange(2, INCOME_COLUMNS.length),
    },
  });

  // 5. All orders
  const sortedOrders = [...orders].sort((a, b) =>
    (orderBasisDate(a, basis) ?? '').localeCompare(orderBasisDate(b, basis) ?? '') || a.orderNumber.localeCompare(b.orderNumber));
  sections.push({
    sheet: 'כל ההזמנות',
    title: `כל ההזמנות — ${periodLabel}`,
    table: {
      headers: [basis === 'order' ? 'תאריך הזמנה' : 'תאריך אספקה', 'מס׳ הזמנה', 'לקוח', ...orderCols.map(c => c.short), 'אמצעי תשלום', 'סטטוס'],
      rows: sortedOrders.map(o => [
        fmtD(orderBasisDate(o, basis)), o.orderNumber, o.customerName,
        ...orderCols.map(c => (o.barter ? null : orderIncome(o)[c.key])),
        paymentMethodLabel(o.paymentMethod), o.barter ? 'בארטר (לא נספר)' : o.paymentStatus,
      ]),
      total: ['סה״כ', '', `${s.count} הזמנות`, ...orderCols.map(c => s[c.key]), '', ''],
      moneyCols: moneyRange(3, orderCols.length),
    },
  });

  // 6. All expenses
  if (expensesReady) {
    sections.push({
      sheet: 'כל ההוצאות',
      title: `כל ההוצאות — ${periodLabel}`,
      table: {
        headers: ['תאריך', 'ספק / מקבל', 'קטגוריה', 'תיאור', 'לפני מע״מ', 'מע״מ', 'כולל מע״מ', 'אמצעי תשלום', 'מס׳ מסמך'],
        rows: [...expenses].sort((a, b) => a.תאריך.localeCompare(b.תאריך)).map(e => [
          fmtD(e.תאריך), expenseSupplierName(e), e.קטגוריה, e.תיאור ?? '',
          expenseNet(e), Number(e.מעמ), Number(e.סכום), paymentMethodLabel(e.אמצעי_תשלום), e.מספר_מסמך ?? '',
        ]),
        total: ['סה״כ', '', '', `${expenses.length} הוצאות`, expNet, expVat, expGross, '', ''],
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
      if (sec.table.average) rows.push(sec.table.average);
    }
    if (sec.notes?.length) {
      rows.push([]);
      for (const n of sec.notes) rows.push([n]);
    }
    if (sec.sheet === 'סיכום') rows.splice(1, 0, [`תקופה: ${r.periodLabel}`], [`הופק: ${r.generatedAt}`]);
    return { name: sec.sheet, rows };
  });
}
