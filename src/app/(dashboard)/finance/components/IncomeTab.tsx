'use client';

import { useMemo, useRef, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import {
  summarize, summarizeByCustomer, summarizeByPaymentMethod, paymentMethodLabel, orderBasisDate, orderIncome,
  monthKey, monthLabel, HEBREW_MONTHS, averageBasis, averageOf, round2, INCOME_COLUMNS, incomeValues,
  type FinanceOrder, type DateBasis, type MoneySummary, type IncomeMoney, type IncomeMoneyKey,
} from '@/lib/finance';
import { downloadExcel, downloadElementPng, fmtDate, type Cell } from '@/lib/finance-export';
import { C, money, StatCard, ExportButtons, Th, Td, EmptyNote } from './shared';

// Owner's definition: delivery fees and VAT are NOT income. "נכנס לכיס" is the
// order amount without delivery and before VAT. Delivery (before / with VAT),
// VAT and the open balance (before / with VAT) are shown beside it so she
// knows how much they are. All money columns come from INCOME_COLUMNS, so the
// screen, the Excel and the PDF report always show the same columns.

const BASIS_LABEL: Record<DateBasis, string> = { order: 'לפי תאריך הזמנה', delivery: 'לפי תאריך אספקה' };
const POCKET_NOTE = '"נכנס לכיס" = סכום ההזמנות ללא דמי משלוח ולפני מע״מ — זה מה שנשאר אצלך. "ללא משלוח כולל מע״מ" = אותו סכום כפי שהלקוחות שילמו אותו. דמי משלוח ומע״מ אינם הכנסה ומוצגים בנפרד. נכנס לכיס + משלוח לפני מע״מ + מע״מ = מה שהלקוחות שילמו.';

/** Per-order columns: the open balance is shown by the status column instead. */
const ORDER_COLUMNS = INCOME_COLUMNS.filter(c => c.key !== 'openNet' && c.key !== 'openGross');

const colColor = (key: IncomeMoneyKey, v: number) =>
  !v ? C.faint : key === 'pocket' ? C.green : key === 'openNet' || key === 'openGross' ? C.amber : C.text;

function MoneyCells({ m, cols = INCOME_COLUMNS, bold }: { m: IncomeMoney; cols?: typeof INCOME_COLUMNS; bold?: 'bold' | 'semi' }) {
  const weight = bold === 'bold' ? 'font-bold' : bold === 'semi' ? 'font-semibold' : '';
  return (
    <>
      {cols.map(c => (
        <Td key={c.key} className={`tabular-nums ${weight} ${c.key === 'pocket' && !bold ? 'font-semibold' : ''}`}
          style={{ color: colColor(c.key, m[c.key]) }}>
          {money(m[c.key])}
        </Td>
      ))}
    </>
  );
}

const MoneyHeaders = ({ cols = INCOME_COLUMNS }: { cols?: typeof INCOME_COLUMNS }) =>
  <>{cols.map(c => <Th key={c.key}>{c.short}</Th>)}</>;

const scale = (m: IncomeMoney, f: (n: number) => number): IncomeMoney =>
  Object.fromEntries(INCOME_COLUMNS.map(c => [c.key, f(m[c.key])])) as unknown as IncomeMoney;

// ── Excel builders ──────────────────────────────────────────────────────────

const moneyHeaders = INCOME_COLUMNS.map(c => c.label);

function ordersExcelRows(orders: FinanceOrder[], basis: DateBasis): Cell[][] {
  const s = summarize(orders);
  return [
    [basis === 'order' ? 'תאריך הזמנה' : 'תאריך אספקה', 'מס׳ הזמנה', 'לקוח', ...ORDER_COLUMNS.map(c => c.label), 'אמצעי תשלום', 'סטטוס תשלום'],
    ...orders.map(o => [
      fmtDate(orderBasisDate(o, basis)), o.orderNumber, o.customerName,
      ...ORDER_COLUMNS.map(c => (o.barter ? null : orderIncome(o)[c.key])),
      paymentMethodLabel(o.paymentMethod), o.barter ? 'בארטר (לא נספר)' : o.paymentStatus,
    ] as Cell[]),
    ['סה״כ', '', `${s.count} הזמנות`, ...ORDER_COLUMNS.map(c => s[c.key]), '', ''],
  ];
}

function customersExcelRows(orders: FinanceOrder[]): Cell[][] {
  const s = summarize(orders);
  return [
    ['לקוח', 'מס׳ הזמנות', ...moneyHeaders],
    ...summarizeByCustomer(orders).map(c => [c.customerName, c.count, ...incomeValues(c)] as Cell[]),
    ['סה״כ', s.count, ...incomeValues(s)],
  ];
}

function methodsExcelRows(orders: FinanceOrder[]): Cell[][] {
  const s = summarize(orders);
  return [
    ['אמצעי תשלום', 'מס׳ הזמנות', ...moneyHeaders],
    ...summarizeByPaymentMethod(orders).map(m => [m.method, m.count, ...incomeValues(m)] as Cell[]),
    ['סה״כ', s.count, ...incomeValues(s)],
  ];
}

// ── Tab ─────────────────────────────────────────────────────────────────────

export default function IncomeTab({ orders, year, basis, undatedCount }: {
  orders: FinanceOrder[];
  year: number;
  basis: DateBasis;
  undatedCount: number;
}) {
  const yearRef = useRef<HTMLDivElement>(null);
  const [openMonth, setOpenMonth] = useState<string | null>(null);

  const byMonth = useMemo(() => {
    const map = new Map<string, FinanceOrder[]>();
    for (let i = 0; i < 12; i++) map.set(monthKey(year, i), []);
    for (const o of orders) {
      const k = orderBasisDate(o, basis)?.slice(0, 7);
      if (k && map.has(k)) map.get(k)!.push(o);
    }
    return map;
  }, [orders, year, basis]);

  const monthRows = useMemo(
    () => Array.from(byMonth.entries()).map(([key, list]) => ({ key, list, s: summarize(list) })),
    [byMonth],
  );
  const y = useMemo(() => summarize(orders), [orders]);
  // Monthly average: ÷ 12 for a finished year; for the current year ÷ the
  // months from the first month with orders up to this month.
  const average = useMemo(
    () => averageBasis(year, monthRows.filter(m => m.s.count + m.s.barterCount > 0).map(m => m.key)),
    [year, monthRows],
  );
  const avgMoney = scale(y, n => averageOf(n, average));
  const avgCount = average.months ? round2(y.count / average.months) : 0;

  async function exportYearExcel() {
    const monthly: Cell[][] = [
      ['חודש', 'מס׳ הזמנות', ...moneyHeaders],
      ...monthRows.map(m => [monthLabel(m.key), m.s.count, ...incomeValues(m.s)] as Cell[]),
      ['סה״כ שנתי', y.count, ...incomeValues(y)],
      ...(average.months ? [[`ממוצע חודשי (${average.label})`, avgCount, ...incomeValues(avgMoney)] as Cell[]] : []),
      [],
      [`${POCKET_NOTE} ${BASIS_LABEL[basis]}. הזמנות שבוטלו, טיוטות והזמנות בארטר אינן נספרות.`],
    ];
    await downloadExcel(`הכנסות_${year}`, [
      { name: 'סיכום חודשי', rows: monthly },
      { name: 'לפי לקוח', rows: customersExcelRows(orders) },
      { name: 'לפי אמצעי תשלום', rows: methodsExcelRows(orders) },
      { name: 'כל ההזמנות', rows: ordersExcelRows(orders, basis) },
    ]);
  }

  const openList = openMonth ? byMonth.get(openMonth) ?? [] : [];

  return (
    <div className="space-y-5">
      <div ref={yearRef} className="space-y-5 bg-white sm:bg-transparent">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatCard label={`נכנס לכיס ${year} — ללא משלוח, לפני מע״מ`} value={money(y.pocket)} sub={`${y.count} הזמנות`} tone="green" />
          <StatCard label="ללא משלוח — כולל מע״מ" value={money(y.pocketGross)} />
          <StatCard label="ממוצע חודשי לכיס" value={money(avgMoney.pocket)} sub={average.months ? average.label : undefined} tone="brand" />
          <StatCard label="דמי משלוח — לפני מע״מ" value={money(y.shippingNet)} />
          <StatCard label="דמי משלוח — כולל מע״מ" value={money(y.shippingGross)} />
          <StatCard label="מע״מ" value={money(y.vat)} />
          <StatCard label="סה״כ שהלקוחות שילמו — כולל מע״מ" value={money(y.grossTotal)} />
          <StatCard label="טרם שולם — לפני מע״מ" value={money(y.openNet)} sub={`${y.openCount} הזמנות`} tone={y.openNet > 0 ? 'amber' : undefined} />
          <StatCard label="טרם שולם — כולל מע״מ" value={money(y.openGross)} tone={y.openGross > 0 ? 'amber' : undefined} />
        </div>

        <Card className="!p-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3" style={{ borderBottom: `1px solid ${C.border}` }}>
            <div>
              <h2 className="text-sm font-semibold" style={{ color: C.text }}>הכנסות לפי חודש — {year}</h2>
              <p className="text-xs mt-0.5" style={{ color: C.sub }}>
                {BASIS_LABEL[basis]} · לחיצה על חודש פותחת פירוט מלא של כל ההזמנות
              </p>
            </div>
            <ExportButtons
              onExcel={exportYearExcel}
              onImage={() => yearRef.current ? downloadElementPng(yearRef.current, `הכנסות_${year}`) : undefined}
            />
          </div>
          <div className="overflow-x-auto" data-export-expand>
            <table className="w-full">
              <thead style={{ backgroundColor: C.soft }}>
                <tr><Th>חודש</Th><Th>הזמנות</Th><MoneyHeaders /><Th /></tr>
              </thead>
              <tbody>
                {monthRows.map(({ key, s }) => {
                  const has = s.count + s.barterCount > 0;
                  return (
                    <tr key={key}
                      onClick={() => has && setOpenMonth(key)}
                      className={has ? 'cursor-pointer hover:bg-[#FBF6EE]' : ''}
                      style={{ borderTop: `1px solid ${C.border}` }}>
                      <Td className="font-medium">{HEBREW_MONTHS[Number(key.slice(5)) - 1]}</Td>
                      <Td style={{ color: s.count ? C.text : C.faint }}>{s.count}</Td>
                      <MoneyCells m={s} />
                      <Td className="text-xs" style={{ color: C.gold }}>
                        <span data-export-hide>{has ? 'לפירוט ‹' : ''}</span>
                      </Td>
                    </tr>
                  );
                })}
                <tr style={{ borderTop: `2px solid ${C.gold}`, backgroundColor: C.soft }}>
                  <Td className="font-bold">סה״כ</Td>
                  <Td className="font-bold">{y.count}</Td>
                  <MoneyCells m={y} bold="bold" />
                  <Td />
                </tr>
                {average.months > 0 && (
                  <tr style={{ borderTop: `1px solid ${C.border}`, backgroundColor: '#FBF6EE' }}>
                    <Td className="font-semibold">
                      ממוצע חודשי
                      <div className="text-xs font-normal" style={{ color: C.sub }}>{average.label}</div>
                    </Td>
                    <Td className="font-semibold">{avgCount.toLocaleString('he-IL')}</Td>
                    <MoneyCells m={avgMoney} bold="semi" />
                    <Td />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Footnote summary={y} undatedCount={undatedCount} />
        </Card>
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="px-5 py-3" style={{ borderBottom: `1px solid ${C.border}` }}>
          <h2 className="text-sm font-semibold" style={{ color: C.text }}>לקוחות — סיכום {year}</h2>
          <p className="text-xs mt-0.5" style={{ color: C.sub }}>כמה נכנס לכיס מכל לקוח במהלך השנה (מהגבוה לנמוך)</p>
        </div>
        {orders.length === 0 ? (
          <div className="p-5"><EmptyNote>אין הזמנות בשנה זו</EmptyNote></div>
        ) : (
          <div className="overflow-auto" style={{ maxHeight: 480 }}>
            <GroupTable title="לקוח" rows={summarizeByCustomer(orders).map(c => ({ key: c.customerId, name: c.customerName, count: c.count, m: c }))} total={y} />
          </div>
        )}
      </Card>

      <Card className="!p-0 overflow-hidden">
        <div className="px-5 py-3" style={{ borderBottom: `1px solid ${C.border}` }}>
          <h2 className="text-sm font-semibold" style={{ color: C.text }}>לפי אמצעי תשלום — {year}</h2>
        </div>
        <div className="overflow-x-auto">
          <GroupTable title="אמצעי תשלום" rows={summarizeByPaymentMethod(orders).map(m => ({ key: m.method, name: m.method, count: m.count, m }))} total={y} />
        </div>
      </Card>

      <MonthDetailModal monthKeyStr={openMonth} orders={openList} basis={basis} onClose={() => setOpenMonth(null)} />
    </div>
  );
}

function Footnote({ summary, undatedCount }: { summary: MoneySummary; undatedCount: number }) {
  return (
    <div className="px-5 py-3 text-xs space-y-0.5" style={{ color: C.sub, borderTop: `1px solid ${C.border}` }}>
      <div>{POCKET_NOTE}</div>
      <div>כולל הזמנות שטרם שולמו (מופיעות גם בעמודות &quot;טרם שולם&quot;). הזמנות שבוטלו וטיוטות לא נספרות.</div>
      {summary.barterCount > 0 && (
        <div>{summary.barterCount} הזמנות בארטר (שווי {money(summary.barterTotal)} ללא משלוח, לפני מע״מ) לא נכללו — לא נכנס עליהן כסף.</div>
      )}
      <div>הזמנה נחשבת בארטר כשסטטוס התשלום או אמצעי התשלום הוא &quot;בארטר&quot;, או כשהלקוח מסוג בארטר ולא נרשם אמצעי תשלום של כסף (ריק / אחר).</div>
      {undatedCount > 0 && (
        <div style={{ color: C.amber }}>{undatedCount} הזמנות ללא תאריך אספקה אינן מופיעות בתצוגה לפי תאריך אספקה.</div>
      )}
    </div>
  );
}

/** Customers / payment methods: name, count, every income column, total row. */
function GroupTable({ title, rows, total }: {
  title: string;
  rows: { key: string; name: string; count: number; m: IncomeMoney }[];
  total: MoneySummary;
}) {
  if (!rows.length) return <div className="p-5"><EmptyNote>אין הזמנות</EmptyNote></div>;
  return (
    <table className="w-full">
      <thead className="sticky top-0" style={{ backgroundColor: C.soft }}>
        <tr><Th>{title}</Th><Th>הזמנות</Th><MoneyHeaders /></tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.key} style={{ borderTop: `1px solid ${C.border}` }}>
            <Td className="font-medium">{r.name}</Td>
            <Td>{r.count}</Td>
            <MoneyCells m={r.m} />
          </tr>
        ))}
        <tr style={{ borderTop: `2px solid ${C.gold}`, backgroundColor: C.soft }}>
          <Td className="font-bold">סה״כ</Td>
          <Td className="font-bold">{total.count}</Td>
          <MoneyCells m={total} bold="bold" />
        </tr>
      </tbody>
    </table>
  );
}

type DetailView = 'orders' | 'customers' | 'methods';
const DETAIL_VIEWS: { key: DetailView; label: string }[] = [
  { key: 'orders', label: 'כל ההזמנות' },
  { key: 'customers', label: 'לפי לקוח' },
  { key: 'methods', label: 'לפי אמצעי תשלום' },
];

function MonthDetailModal({ monthKeyStr, orders, basis, onClose }: {
  monthKeyStr: string | null;
  orders: FinanceOrder[];
  basis: DateBasis;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<DetailView>('orders');
  const s = useMemo(() => summarize(orders), [orders]);
  const sorted = useMemo(
    () => [...orders].sort((a, b) => (orderBasisDate(a, basis) ?? '').localeCompare(orderBasisDate(b, basis) ?? '') || a.orderNumber.localeCompare(b.orderNumber)),
    [orders, basis],
  );
  if (!monthKeyStr) return null;
  const label = monthLabel(monthKeyStr);

  async function exportExcel() {
    const summaryRows: Cell[][] = [
      ['חודש', label],
      ['בסיס', BASIS_LABEL[basis]],
      ['מס׳ הזמנות', s.count],
      ...INCOME_COLUMNS.map(c => [c.label, s[c.key]] as Cell[]),
      ...(s.barterCount ? [[`בארטר (לא נספר): ${s.barterCount} הזמנות`, s.barterTotal] as Cell[]] : []),
      [],
      [POCKET_NOTE],
    ];
    await downloadExcel(`הכנסות_${monthKeyStr}`, [
      { name: 'כל ההזמנות', rows: ordersExcelRows(sorted, basis) },
      { name: 'לפי לקוח', rows: customersExcelRows(sorted) },
      { name: 'לפי אמצעי תשלום', rows: methodsExcelRows(sorted) },
      { name: 'סיכום', rows: summaryRows },
    ]);
  }

  return (
    <Modal open={!!monthKeyStr} onClose={onClose} title={`פירוט הכנסות — ${label}`} size="xl">
      <div ref={ref} className="space-y-4 bg-white">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <StatCard label="נכנס לכיס — ללא משלוח, לפני מע״מ" value={money(s.pocket)} sub={`${s.count} הזמנות`} tone="green" />
          <StatCard label="ללא משלוח — כולל מע״מ" value={money(s.pocketGross)} />
          <StatCard label="דמי משלוח — לפני מע״מ" value={money(s.shippingNet)} />
          <StatCard label="דמי משלוח — כולל מע״מ" value={money(s.shippingGross)} />
          <StatCard label="מע״מ" value={money(s.vat)} />
          <StatCard label="סה״כ שהלקוחות שילמו — כולל מע״מ" value={money(s.grossTotal)} />
          <StatCard label="טרם שולם — לפני מע״מ" value={money(s.openNet)} sub={s.openCount ? `${s.openCount} הזמנות` : undefined} tone={s.openNet ? 'amber' : undefined} />
          <StatCard label="טרם שולם — כולל מע״מ" value={money(s.openGross)} tone={s.openGross ? 'amber' : undefined} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex rounded-lg overflow-hidden text-xs" style={{ border: `1px solid ${C.border}` }} data-export-hide>
            {DETAIL_VIEWS.map(v => (
              <button key={v.key} onClick={() => setView(v.key)} className="px-3 py-1.5"
                style={view === v.key ? { backgroundColor: C.brand, color: '#fff' } : { backgroundColor: '#fff', color: C.sub }}>
                {v.label}
              </button>
            ))}
          </div>
          <ExportButtons onExcel={exportExcel} onImage={() => ref.current ? downloadElementPng(ref.current, `הכנסות_${monthKeyStr}`) : undefined} />
        </div>

        <div className="rounded-xl overflow-auto" style={{ border: `1px solid ${C.border}`, maxHeight: '55vh' }} data-export-expand>
          {view === 'customers' ? (
            <GroupTable title="לקוח" rows={summarizeByCustomer(sorted).map(c => ({ key: c.customerId, name: c.customerName, count: c.count, m: c }))} total={s} />
          ) : view === 'methods' ? (
            <GroupTable title="אמצעי תשלום" rows={summarizeByPaymentMethod(sorted).map(m => ({ key: m.method, name: m.method, count: m.count, m }))} total={s} />
          ) : (
            <table className="w-full">
              <thead className="sticky top-0" style={{ backgroundColor: C.soft }}>
                <tr>
                  <Th>תאריך</Th><Th>מס׳ הזמנה</Th><Th>לקוח</Th><MoneyHeaders cols={ORDER_COLUMNS} /><Th>אמצעי תשלום</Th><Th>סטטוס</Th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(o => (
                  <tr key={o.id} style={{ borderTop: `1px solid ${C.border}`, opacity: o.barter ? 0.55 : 1 }}>
                    <Td>{fmtDate(orderBasisDate(o, basis))}</Td>
                    <Td>
                      <a href={`/orders/${o.id}`} target="_blank" rel="noreferrer" className="hover:underline" style={{ color: C.brand }}>
                        {o.orderNumber}
                      </a>
                    </Td>
                    <Td className="font-medium">{o.customerName}</Td>
                    {o.barter
                      ? ORDER_COLUMNS.map(c => <Td key={c.key} style={{ color: C.faint }}>—</Td>)
                      : <MoneyCells m={orderIncome(o)} cols={ORDER_COLUMNS} />}
                    <Td>{paymentMethodLabel(o.paymentMethod)}</Td>
                    <Td>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={
                        o.barter ? { backgroundColor: '#F0EAE2', color: C.sub }
                          : o.paid ? { backgroundColor: C.greenBg, color: C.green }
                          : { backgroundColor: C.amberBg, color: C.amber }}>
                        {o.barter ? 'בארטר — לא נספר' : o.paymentStatus}
                      </span>
                    </Td>
                  </tr>
                ))}
                <tr style={{ borderTop: `2px solid ${C.gold}`, backgroundColor: C.soft }}>
                  <Td className="font-bold">סה״כ</Td><Td /><Td className="font-bold">{s.count} הזמנות</Td>
                  <MoneyCells m={s} cols={ORDER_COLUMNS} bold="bold" />
                  <Td /><Td />
                </tr>
              </tbody>
            </table>
          )}
        </div>
        <p className="text-xs" style={{ color: C.faint }}>{POCKET_NOTE}</p>
      </div>
    </Modal>
  );
}
