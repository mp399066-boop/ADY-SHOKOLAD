'use client';

import { useMemo, useRef } from 'react';
import { Card } from '@/components/ui/Card';
import {
  buildPnl, round2, VAT_RATE,
  type FinanceOrder, type Expense, type DateBasis,
} from '@/lib/finance';
import { downloadExcel, downloadElementPng, type Cell } from '@/lib/finance-export';
import { C, money, StatCard, ExportButtons, Th, Td, EmptyNote } from './shared';

export default function ProfitLossTab({ orders, expenses, year, basis, expensesReady }: {
  orders: FinanceOrder[];
  expenses: Expense[];
  year: number;
  basis: DateBasis;
  expensesReady: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pnl = useMemo(() => buildPnl(orders, expenses, year, basis), [orders, expenses, year, basis]);
  const rows = pnl.months;
  const active = rows.filter(r => r.hasData);
  const totals = pnl.totals;
  const result = totals.result;
  const { avgExpenses, avgIncome, average, avg } = pnl;
  const signed = (n: number) => `${n < 0 ? '−' : ''}${money(Math.abs(n))}`;
  const monthlyGap = round2(avgExpenses - avgIncome);
  // Customers pay VAT on top of the net income — show the matching gross too.
  const withVat = (n: number) => round2(n * (1 + VAT_RATE));

  async function exportExcel() {
    const sheet: Cell[][] = [
      ['חודש', 'הכנסות לפני מע״מ', 'הכנסות כולל מע״מ', 'הוצאות לפני מע״מ', 'הוצאות כולל מע״מ', 'רווח / הפסד (לפני מע״מ)', 'מצטבר מתחילת השנה', 'טרם נגבה (לפני מע״מ)'],
      ...rows.map(r => [r.month, r.income, r.incomeGross, r.expenses, r.expensesGross, r.result, r.cumulative ?? '', r.open] as Cell[]),
      ['סה״כ שנתי', totals.income, totals.incomeGross, totals.expenses, totals.expensesGross, result, result, totals.open],
      ...(average.months ? [[`ממוצע חודשי (${average.label})`, avg.income, avg.incomeGross, avg.expenses, avg.expensesGross, avg.result, '', avg.open] as Cell[]] : []),
      [],
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

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard label="הכנסות — לפני מע״מ" value={money(totals.income)} tone="green" />
        <StatCard label="הכנסות — כולל מע״מ" value={money(totals.incomeGross)} />
        <StatCard label="הוצאות — לפני מע״מ" value={money(totals.expenses)} tone="red" />
        <StatCard label="הוצאות — כולל מע״מ (שולם בפועל)" value={money(totals.expensesGross)} />
        <StatCard label={result >= 0 ? 'רווח — לפני מע״מ' : 'הפסד — לפני מע״מ'} value={money(Math.abs(result))} tone={result >= 0 ? 'green' : 'red'} sub={`${active.length} חודשים עם פעילות`} />
        <StatCard label="טרם נגבה מלקוחות — לפני מע״מ" value={money(totals.open)} tone={totals.open ? 'amber' : undefined} sub="כלול בהכנסות" />
      </div>

      {(avgExpenses > 0 || result < 0) && (
        <Card>
          <h3 className="text-sm font-semibold mb-3" style={{ color: C.text }}>כמה צריך להכניס?</h3>
          <ul className="space-y-2 text-sm" style={{ color: C.text }}>
            {avgExpenses > 0 && (
              <li>
                ההוצאה החודשית הממוצעת ({average.label}) היא <b>{money(avgExpenses)}</b> לפני מע״מ. כדי לא להפסיד צריך להכניס לפחות{' '}
                <b style={{ color: C.brand }}>{money(avgExpenses)}</b> בחודש לפני מע״מ
                <span style={{ color: C.sub }}> (כ-{money(withVat(avgExpenses))} כולל מע״מ)</span>.
              </li>
            )}
            {avgIncome > 0 && avgExpenses > 0 && (
              <li>
                ההכנסה החודשית הממוצעת ({average.label}) היא <b>{money(avgIncome)}</b> לפני מע״מ —{' '}
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
              <tr>
                <Th>חודש</Th><Th>הכנסות לפני מע״מ</Th><Th>הכנסות כולל מע״מ</Th><Th>הוצאות לפני מע״מ</Th><Th>הוצאות כולל מע״מ</Th>
                <Th>רווח / הפסד</Th><Th>מצטבר</Th><Th>טרם נגבה</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const future = r.cumulative === null;
                return (
                  <tr key={r.key} style={{ borderTop: `1px solid ${C.border}`, opacity: future ? 0.45 : 1 }}>
                    <Td className="font-medium">{r.month}</Td>
                    <Td className="tabular-nums" style={{ color: r.income ? C.green : C.faint }}>{money(r.income)}</Td>
                    <Td className="tabular-nums" style={{ color: r.incomeGross ? C.text : C.faint }}>{money(r.incomeGross)}</Td>
                    <Td className="tabular-nums" style={{ color: r.expenses ? C.red : C.faint }}>{money(r.expenses)}</Td>
                    <Td className="tabular-nums" style={{ color: r.expensesGross ? C.text : C.faint }}>{money(r.expensesGross)}</Td>
                    <Td className="font-semibold tabular-nums" style={{ color: r.result > 0 ? C.green : r.result < 0 ? C.red : C.faint }}>
                      {r.result < 0 ? '−' : ''}{money(Math.abs(r.result))}
                    </Td>
                    <Td className="tabular-nums" style={{ color: future ? C.faint : (r.cumulative ?? 0) >= 0 ? C.green : C.red }}>
                      {future ? '' : `${(r.cumulative ?? 0) < 0 ? '−' : ''}${money(Math.abs(r.cumulative ?? 0))}`}
                    </Td>
                    <Td className="tabular-nums" style={{ color: r.open ? C.amber : C.faint }}>{money(r.open)}</Td>
                  </tr>
                );
              })}
              <tr style={{ borderTop: `2px solid ${C.gold}`, backgroundColor: C.soft }}>
                <Td className="font-bold">סה״כ שנתי</Td>
                <Td className="font-bold tabular-nums" style={{ color: C.green }}>{money(totals.income)}</Td>
                <Td className="font-bold tabular-nums">{money(totals.incomeGross)}</Td>
                <Td className="font-bold tabular-nums" style={{ color: C.red }}>{money(totals.expenses)}</Td>
                <Td className="font-bold tabular-nums">{money(totals.expensesGross)}</Td>
                <Td className="font-bold tabular-nums" style={{ color: result >= 0 ? C.green : C.red }}>{result < 0 ? '−' : ''}{money(Math.abs(result))}</Td>
                <Td className="font-bold tabular-nums" style={{ color: result >= 0 ? C.green : C.red }}>{result < 0 ? '−' : ''}{money(Math.abs(result))}</Td>
                <Td className="font-bold tabular-nums" style={{ color: C.amber }}>{money(totals.open)}</Td>
              </tr>
              {average.months > 0 && (
                <tr style={{ borderTop: `1px solid ${C.border}`, backgroundColor: '#FBF6EE' }}>
                  <Td className="font-semibold">
                    ממוצע חודשי
                    <div className="text-xs font-normal" style={{ color: C.sub }}>{average.label}</div>
                  </Td>
                  <Td className="font-semibold tabular-nums" style={{ color: C.green }}>{money(avg.income)}</Td>
                  <Td className="font-semibold tabular-nums">{money(avg.incomeGross)}</Td>
                  <Td className="font-semibold tabular-nums" style={{ color: C.red }}>{money(avg.expenses)}</Td>
                  <Td className="font-semibold tabular-nums">{money(avg.expensesGross)}</Td>
                  <Td className="font-semibold tabular-nums" style={{ color: avg.result >= 0 ? C.green : C.red }}>{signed(avg.result)}</Td>
                  <Td />
                  <Td className="font-semibold tabular-nums" style={{ color: C.amber }}>{money(avg.open)}</Td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 text-xs" style={{ color: C.sub, borderTop: `1px solid ${C.border}` }}>
          רווח / הפסד מחושב לפני מע״מ — המע״מ שהלקוחות משלמים שייך למדינה, והמע״מ על ההוצאות מקוזז, ולכן זה הרווח האמיתי. עמודות &quot;כולל מע״מ&quot; מראות את הסכומים כפי שחויבו / שולמו בפועל.
          ההכנסות {basis === 'order' ? 'לפי תאריך ההזמנה' : 'לפי תאריך האספקה'} (כולל הזמנות שטרם שולמו, ללא בארטר ובוטלו).
        </div>
      </Card>
    </div>
  );
}
