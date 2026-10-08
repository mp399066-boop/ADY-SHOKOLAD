'use client';

import { useMemo, useRef } from 'react';
import { Card } from '@/components/ui/Card';
import {
  summarize, orderBasisDate, expenseNet, monthKey, round2, HEBREW_MONTHS, todayJerusalem, VAT_RATE,
  type FinanceOrder, type Expense, type DateBasis,
} from '@/lib/finance';
import { downloadExcel, downloadElementPng, type Cell } from '@/lib/finance-export';
import { C, money, StatCard, ExportButtons, Th, Td, EmptyNote } from './shared';

interface MonthRow {
  key: string;
  month: string;
  income: number;       // net of VAT
  incomeGross: number;  // what customers pay
  open: number;         // gross, not yet paid
  expenses: number;     // net of VAT
  expensesGross: number;
  result: number;
  cumulative: number;
  hasData: boolean;
}

export default function ProfitLossTab({ orders, expenses, year, basis, expensesReady }: {
  orders: FinanceOrder[];
  expenses: Expense[];
  year: number;
  basis: DateBasis;
  expensesReady: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const today = todayJerusalem();
  const currentMonthKey = today.slice(0, 7);

  const rows = useMemo<MonthRow[]>(() => {
    let cumulative = 0;
    return Array.from({ length: 12 }, (_, i) => {
      const key = monthKey(year, i);
      const monthOrders = orders.filter(o => orderBasisDate(o, basis)?.slice(0, 7) === key);
      const s = summarize(monthOrders);
      const monthExpenses = expenses.filter(e => e.תאריך.slice(0, 7) === key);
      const exp = round2(monthExpenses.reduce((t, e) => t + expenseNet(e), 0));
      const expGross = round2(monthExpenses.reduce((t, e) => t + Number(e.סכום), 0));
      const result = round2(s.netTotal - exp);
      const hasData = s.count > 0 || monthExpenses.length > 0;
      if (key <= currentMonthKey || hasData) cumulative = round2(cumulative + result);
      return {
        key, month: HEBREW_MONTHS[i], income: s.netTotal, incomeGross: s.total, open: s.openTotal,
        expenses: exp, expensesGross: expGross, result, cumulative, hasData,
      };
    });
  }, [orders, expenses, year, basis, currentMonthKey]);

  const active = rows.filter(r => r.hasData);
  const totals = useMemo(() => ({
    income: round2(rows.reduce((t, r) => t + r.income, 0)),
    incomeGross: round2(rows.reduce((t, r) => t + r.incomeGross, 0)),
    open: round2(rows.reduce((t, r) => t + r.open, 0)),
    expenses: round2(rows.reduce((t, r) => t + r.expenses, 0)),
    expensesGross: round2(rows.reduce((t, r) => t + r.expensesGross, 0)),
  }), [rows]);
  const result = round2(totals.income - totals.expenses);

  // Break-even: average monthly expense over months that have expenses.
  const expenseMonths = rows.filter(r => r.expenses > 0);
  const avgExpenses = expenseMonths.length ? round2(totals.expenses / expenseMonths.length) : 0;
  const incomeMonths = rows.filter(r => r.income > 0);
  const avgIncome = incomeMonths.length ? round2(totals.income / incomeMonths.length) : 0;
  const monthlyGap = round2(avgExpenses - avgIncome);
  // Customers pay VAT on top of the net income — show the matching gross too.
  const withVat = (n: number) => round2(n * (1 + VAT_RATE));

  async function exportExcel() {
    const sheet: Cell[][] = [
      ['חודש', 'הכנסות לפני מע״מ', 'הוצאות לפני מע״מ', 'רווח / הפסד', 'מצטבר מתחילת השנה', 'הכנסות כולל מע״מ', 'הוצאות ששולמו (כולל מע״מ)', 'טרם נגבה מלקוחות'],
      ...rows.map(r => [r.month, r.income, r.expenses, r.result, r.cumulative, r.incomeGross, r.expensesGross, r.open] as Cell[]),
      ['סה״כ שנתי', totals.income, totals.expenses, result, '', totals.incomeGross, totals.expensesGross, totals.open],
      [],
      ['הוצאה חודשית ממוצעת (לפני מע״מ)', avgExpenses],
      ['הכנסה חודשית ממוצעת (לפני מע״מ)', avgIncome],
      ...(result < 0 ? [['הכנסה נוספת שנדרשת כדי לכסות את ההפסד', -result] as Cell[]] : []),
      [],
      ['רווח והפסד מחושב לפני מע״מ: מע״מ שנגבה מלקוחות שייך למדינה, ומע״מ על הוצאות מקוזז.'],
    ];
    await downloadExcel(`רווח_והפסד_${year}`, [{ name: `רווח והפסד ${year}`, rows: sheet }]);
  }

  return (
    <div ref={ref} className="space-y-5 bg-white sm:bg-transparent">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold" style={{ color: C.text }}>רווח והפסד — {year}</h2>
        <ExportButtons onExcel={exportExcel} onImage={() => ref.current ? downloadElementPng(ref.current, `רווח_והפסד_${year}`) : undefined} />
      </div>

      {!expensesReady && (
        <EmptyNote>טבלת ההוצאות עדיין לא הופעלה (מיגרציה 057) — כרגע מוצגות רק ההכנסות.</EmptyNote>
      )}
      {expensesReady && expenses.length === 0 && (
        <EmptyNote>עוד לא הוזנו הוצאות לשנת {year}. הוסיפי אותן בלשונית &quot;הוצאות&quot; כדי לראות רווח והפסד אמיתי.</EmptyNote>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="הכנסות (לפני מע״מ)" value={money(totals.income)} sub={`כולל מע״מ: ${money(totals.incomeGross)}`} tone="green" />
        <StatCard label="הוצאות (לפני מע״מ)" value={money(totals.expenses)} sub={`שולם בפועל: ${money(totals.expensesGross)}`} tone="red" />
        <StatCard label={result >= 0 ? 'רווח' : 'הפסד'} value={money(Math.abs(result))} tone={result >= 0 ? 'green' : 'red'} sub={`${active.length} חודשים עם פעילות`} />
        <StatCard label="טרם נגבה מלקוחות" value={money(totals.open)} tone={totals.open ? 'amber' : undefined} sub="כלול בהכנסות" />
      </div>

      {(avgExpenses > 0 || result < 0) && (
        <Card>
          <h3 className="text-sm font-semibold mb-3" style={{ color: C.text }}>כמה צריך להכניס?</h3>
          <ul className="space-y-2 text-sm" style={{ color: C.text }}>
            {avgExpenses > 0 && (
              <li>
                ההוצאה החודשית הממוצעת היא <b>{money(avgExpenses)}</b> לפני מע״מ. כדי לא להפסיד צריך להכניס לפחות{' '}
                <b style={{ color: C.brand }}>{money(avgExpenses)}</b> בחודש לפני מע״מ
                <span style={{ color: C.sub }}> (כ-{money(withVat(avgExpenses))} כולל מע״מ)</span>.
              </li>
            )}
            {avgIncome > 0 && avgExpenses > 0 && (
              <li>
                ההכנסה החודשית הממוצעת היא <b>{money(avgIncome)}</b> לפני מע״מ —{' '}
                {monthlyGap > 0
                  ? <>חסרים בממוצע <b style={{ color: C.red }}>{money(monthlyGap)}</b> בחודש (כ-{money(withVat(monthlyGap))} כולל מע״מ).</>
                  : <>יותר מההוצאות בממוצע ב-<b style={{ color: C.green }}>{money(-monthlyGap)}</b> בחודש.</>}
              </li>
            )}
            {result < 0 && (
              <li>
                ההפסד המצטבר ב-{year} הוא <b style={{ color: C.red }}>{money(-result)}</b>. כדי לכסות אותו צריך עוד{' '}
                <b>{money(-result)}</b> רווח מעבר להוצאות
                <span style={{ color: C.sub }}> (כ-{money(withVat(-result))} כולל מע״מ)</span>.
                {totals.open > 0 && <span style={{ color: C.sub }}> מתוך ההכנסות שכבר נספרו, {money(totals.open)} עוד לא נגבו מלקוחות.</span>}
              </li>
            )}
          </ul>
        </Card>
      )}

      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto" data-export-expand>
          <table className="w-full">
            <thead style={{ backgroundColor: C.soft }}>
              <tr><Th>חודש</Th><Th>הכנסות</Th><Th>הוצאות</Th><Th>רווח / הפסד</Th><Th>מצטבר</Th><Th>טרם נגבה</Th></tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const future = r.key > currentMonthKey && !r.hasData;
                return (
                  <tr key={r.key} style={{ borderTop: `1px solid ${C.border}`, opacity: future ? 0.45 : 1 }}>
                    <Td className="font-medium">{r.month}</Td>
                    <Td className="tabular-nums" style={{ color: r.income ? C.green : C.faint }}>{money(r.income)}</Td>
                    <Td className="tabular-nums" style={{ color: r.expenses ? C.red : C.faint }}>{money(r.expenses)}</Td>
                    <Td className="font-semibold tabular-nums" style={{ color: r.result > 0 ? C.green : r.result < 0 ? C.red : C.faint }}>
                      {r.result < 0 ? '−' : ''}{money(Math.abs(r.result))}
                    </Td>
                    <Td className="tabular-nums" style={{ color: future ? C.faint : r.cumulative >= 0 ? C.green : C.red }}>
                      {future ? '' : `${r.cumulative < 0 ? '−' : ''}${money(Math.abs(r.cumulative))}`}
                    </Td>
                    <Td className="tabular-nums" style={{ color: r.open ? C.amber : C.faint }}>{money(r.open)}</Td>
                  </tr>
                );
              })}
              <tr style={{ borderTop: `2px solid ${C.gold}`, backgroundColor: C.soft }}>
                <Td className="font-bold">סה״כ שנתי</Td>
                <Td className="font-bold tabular-nums" style={{ color: C.green }}>{money(totals.income)}</Td>
                <Td className="font-bold tabular-nums" style={{ color: C.red }}>{money(totals.expenses)}</Td>
                <Td className="font-bold tabular-nums" style={{ color: result >= 0 ? C.green : C.red }}>{result < 0 ? '−' : ''}{money(Math.abs(result))}</Td>
                <Td />
                <Td className="font-bold tabular-nums" style={{ color: C.amber }}>{money(totals.open)}</Td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 text-xs" style={{ color: C.sub, borderTop: `1px solid ${C.border}` }}>
          כל הסכומים בטבלה לפני מע״מ — המע״מ שהלקוחות משלמים שייך למדינה, והמע״מ על ההוצאות מקוזז, ולכן זה הרווח האמיתי.
          ההכנסות {basis === 'order' ? 'לפי תאריך ההזמנה' : 'לפי תאריך האספקה'} (כולל הזמנות שטרם שולמו, ללא בארטר ובוטלו).
        </div>
      </Card>
    </div>
  );
}
