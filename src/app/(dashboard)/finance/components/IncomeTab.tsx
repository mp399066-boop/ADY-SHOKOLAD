'use client';

import { useMemo, useRef, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import {
  summarize, summarizeByCustomer, summarizeByPaymentMethod, paymentMethodLabel, orderBasisDate,
  monthKey, monthLabel, HEBREW_MONTHS,
  type FinanceOrder, type DateBasis, type MoneySummary,
} from '@/lib/finance';
import { downloadExcel, downloadElementPng, fmtDate, type Cell } from '@/lib/finance-export';
import { C, money, StatCard, ExportButtons, Th, Td, EmptyNote } from './shared';

// Amounts are BEFORE VAT for every customer (the money that is really the
// business's), with a "כולל מע״מ" column beside each total showing what the
// customer was charged. Every table ends with a total row for every column.

const BASIS_LABEL: Record<DateBasis, string> = { order: 'לפי תאריך הזמנה', delivery: 'לפי תאריך אספקה' };
const VAT_NOTE = '"לפני מע״מ" = הכסף שנכנס אלייך בפועל, לכל הלקוחות (המע״מ שייך למדינה). "כולל מע״מ" = מה שהלקוחות חויבו.';

function ordersExcelRows(orders: FinanceOrder[], basis: DateBasis): Cell[][] {
  const header: Cell[] = [
    basis === 'order' ? 'תאריך הזמנה' : 'תאריך אספקה', 'מס׳ הזמנה', 'לקוח',
    'ללא משלוח (לפני מע״מ)', 'דמי משלוח (לפני מע״מ)', 'סה״כ לפני מע״מ', 'סה״כ כולל מע״מ',
    'אמצעי תשלום', 'סטטוס תשלום',
  ];
  const rows = orders.map(o => [
    fmtDate(orderBasisDate(o, basis)), o.orderNumber, o.customerName,
    ...(o.barter ? [null, null, null, null] : [o.netNoShipping, o.netShipping, o.netTotal, o.grossTotal]),
    paymentMethodLabel(o.paymentMethod), o.barter ? 'בארטר (לא נספר)' : o.paymentStatus,
  ] as Cell[]);
  const s = summarize(orders);
  return [header, ...rows, ['סה״כ', '', `${s.count} הזמנות`, s.noShipping, s.shipping, s.total, s.grossTotal, '', '']];
}

function customersExcelRows(orders: FinanceOrder[]): Cell[][] {
  const s = summarize(orders);
  return [
    ['לקוח', 'מס׳ הזמנות', 'ללא משלוח (לפני מע״מ)', 'דמי משלוח (לפני מע״מ)', 'סה״כ לפני מע״מ', 'סה״כ כולל מע״מ', 'טרם שולם (לפני מע״מ)'],
    ...summarizeByCustomer(orders).map(c => [c.customerName, c.count, c.noShipping, c.shipping, c.total, c.grossTotal, c.openTotal] as Cell[]),
    ['סה״כ', s.count, s.noShipping, s.shipping, s.total, s.grossTotal, s.openTotal],
  ];
}

function methodsExcelRows(orders: FinanceOrder[]): Cell[][] {
  const s = summarize(orders);
  return [
    ['אמצעי תשלום', 'מס׳ הזמנות', 'סה״כ לפני מע״מ', 'סה״כ כולל מע״מ', 'טרם שולם (לפני מע״מ)'],
    ...summarizeByPaymentMethod(orders).map(m => [m.method, m.count, m.total, m.grossTotal, m.openTotal] as Cell[]),
    ['סה״כ', s.count, s.total, s.grossTotal, s.openTotal],
  ];
}

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
  const yearSummary = useMemo(() => summarize(orders), [orders]);

  async function exportYearExcel() {
    const monthly: Cell[][] = [
      ['חודש', 'מס׳ הזמנות', 'ללא משלוח (לפני מע״מ)', 'דמי משלוח (לפני מע״מ)', 'סה״כ לפני מע״מ', 'סה״כ כולל מע״מ', 'שולם (לפני מע״מ)', 'טרם שולם (לפני מע״מ)'],
      ...monthRows.map(m => [monthLabel(m.key), m.s.count, m.s.noShipping, m.s.shipping, m.s.total, m.s.grossTotal, m.s.paidTotal, m.s.openTotal] as Cell[]),
      ['סה״כ שנתי', yearSummary.count, yearSummary.noShipping, yearSummary.shipping, yearSummary.total, yearSummary.grossTotal, yearSummary.paidTotal, yearSummary.openTotal],
      [],
      [`${VAT_NOTE} ${BASIS_LABEL[basis]}. הזמנות שבוטלו, טיוטות והזמנות בארטר אינן נספרות.`],
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label={`נכנס אלייך ב-${year} (לפני מע״מ)`} value={money(yearSummary.total)} sub={`${yearSummary.count} הזמנות`} tone="green" />
          <StatCard label="מתוכו ללא משלוחים" value={money(yearSummary.noShipping)} tone="brand" />
          <StatCard label="סה״כ כולל מע״מ" value={money(yearSummary.grossTotal)} sub={`מתוכו דמי משלוח (לפני מע״מ): ${money(yearSummary.shipping)}`} />
          <StatCard label="מתוכו טרם שולם" value={money(yearSummary.openTotal)} sub={`${yearSummary.openCount} הזמנות`} tone={yearSummary.openTotal > 0 ? 'amber' : undefined} />
        </div>

        <Card className="!p-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3" style={{ borderBottom: `1px solid ${C.border}` }}>
            <div>
              <h2 className="text-sm font-semibold" style={{ color: C.text }}>הכנסות לפי חודש — {year}</h2>
              <p className="text-xs mt-0.5" style={{ color: C.sub }}>
                {BASIS_LABEL[basis]} · ללא משלוח, דמי משלוח, שולם וטרם שולם — לפני מע״מ · לחיצה על חודש פותחת פירוט מלא של כל ההזמנות
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
                <tr>
                  <Th>חודש</Th><Th>הזמנות</Th><Th>ללא משלוח</Th><Th>דמי משלוח</Th><Th>סה״כ לפני מע״מ</Th><Th>סה״כ כולל מע״מ</Th><Th>שולם</Th><Th>טרם שולם</Th><Th />
                </tr>
              </thead>
              <tbody>
                {monthRows.map(({ key, s }) => {
                  const has = s.count + s.barterCount > 0;
                  const dim = (v: number, color: string = C.text) => (v ? color : C.faint);
                  return (
                    <tr key={key}
                      onClick={() => has && setOpenMonth(key)}
                      className={has ? 'cursor-pointer hover:bg-[#FBF6EE]' : ''}
                      style={{ borderTop: `1px solid ${C.border}` }}>
                      <Td className="font-medium">{HEBREW_MONTHS[Number(key.slice(5)) - 1]}</Td>
                      <Td style={{ color: dim(s.count) }}>{s.count}</Td>
                      <Td className="tabular-nums" style={{ color: dim(s.noShipping, C.brand) }}>{money(s.noShipping)}</Td>
                      <Td className="tabular-nums" style={{ color: dim(s.shipping) }}>{money(s.shipping)}</Td>
                      <Td className="font-semibold tabular-nums" style={{ color: dim(s.total, C.green) }}>{money(s.total)}</Td>
                      <Td className="tabular-nums" style={{ color: dim(s.grossTotal) }}>{money(s.grossTotal)}</Td>
                      <Td className="tabular-nums" style={{ color: dim(s.paidTotal) }}>{money(s.paidTotal)}</Td>
                      <Td className="tabular-nums" style={{ color: dim(s.openTotal, C.amber) }}>{money(s.openTotal)}</Td>
                      <Td className="text-xs" style={{ color: C.gold }}>
                        <span data-export-hide>{has ? 'לפירוט ‹' : ''}</span>
                      </Td>
                    </tr>
                  );
                })}
                <tr style={{ borderTop: `2px solid ${C.gold}`, backgroundColor: C.soft }}>
                  <Td className="font-bold">סה״כ נכנס אלייך</Td>
                  <Td className="font-bold">{yearSummary.count}</Td>
                  <Td className="font-bold tabular-nums" style={{ color: C.brand }}>{money(yearSummary.noShipping)}</Td>
                  <Td className="font-bold tabular-nums">{money(yearSummary.shipping)}</Td>
                  <Td className="font-bold tabular-nums" style={{ color: C.green }}>{money(yearSummary.total)}</Td>
                  <Td className="font-bold tabular-nums">{money(yearSummary.grossTotal)}</Td>
                  <Td className="font-bold tabular-nums">{money(yearSummary.paidTotal)}</Td>
                  <Td className="font-bold tabular-nums" style={{ color: C.amber }}>{money(yearSummary.openTotal)}</Td>
                  <Td />
                </tr>
              </tbody>
            </table>
          </div>
          <Footnote summary={yearSummary} undatedCount={undatedCount} />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="!p-0 overflow-hidden lg:col-span-2">
          <div className="px-5 py-3" style={{ borderBottom: `1px solid ${C.border}` }}>
            <h2 className="text-sm font-semibold" style={{ color: C.text }}>לקוחות — סיכום {year}</h2>
            <p className="text-xs mt-0.5" style={{ color: C.sub }}>כמה נכנס מכל לקוח במהלך השנה, לפני מע״מ (מהגבוה לנמוך)</p>
          </div>
          {orders.length === 0 ? (
            <div className="p-5"><EmptyNote>אין הזמנות בשנה זו</EmptyNote></div>
          ) : (
            <div className="overflow-auto" style={{ maxHeight: 480 }}>
              <CustomersTable orders={orders} />
            </div>
          )}
        </Card>
        <Card className="!p-0 overflow-hidden">
          <div className="px-5 py-3" style={{ borderBottom: `1px solid ${C.border}` }}>
            <h2 className="text-sm font-semibold" style={{ color: C.text }}>לפי אמצעי תשלום — {year}</h2>
            <p className="text-xs mt-0.5" style={{ color: C.sub }}>לפני מע״מ</p>
          </div>
          <MethodsTable orders={orders} />
        </Card>
      </div>

      <MonthDetailModal monthKeyStr={openMonth} orders={openList} basis={basis} onClose={() => setOpenMonth(null)} />
    </div>
  );
}

function Footnote({ summary, undatedCount }: { summary: MoneySummary; undatedCount: number }) {
  return (
    <div className="px-5 py-3 text-xs space-y-0.5" style={{ color: C.sub, borderTop: `1px solid ${C.border}` }}>
      <div>{VAT_NOTE} כולל הזמנות שטרם שולמו (מופיעות בטור &quot;טרם שולם&quot;). הזמנות שבוטלו וטיוטות לא נספרות.</div>
      {summary.barterCount > 0 && (
        <div>{summary.barterCount} הזמנות בארטר (שווי {money(summary.barterTotal)} לפני מע״מ) לא נכללו — לא נכנס עליהן כסף.</div>
      )}
      {undatedCount > 0 && (
        <div style={{ color: C.amber }}>{undatedCount} הזמנות ללא תאריך אספקה אינן מופיעות בתצוגה לפי תאריך אספקה.</div>
      )}
    </div>
  );
}

function CustomersTable({ orders }: { orders: FinanceOrder[] }) {
  const list = useMemo(() => summarizeByCustomer(orders), [orders]);
  const s = useMemo(() => summarize(orders), [orders]);
  return (
    <table className="w-full">
      <thead className="sticky top-0" style={{ backgroundColor: C.soft }}>
        <tr><Th>לקוח</Th><Th>הזמנות</Th><Th>ללא משלוח</Th><Th>דמי משלוח</Th><Th>סה״כ לפני מע״מ</Th><Th>סה״כ כולל מע״מ</Th><Th>טרם שולם</Th></tr>
      </thead>
      <tbody>
        {list.map(c => (
          <tr key={c.customerId} style={{ borderTop: `1px solid ${C.border}` }}>
            <Td className="font-medium">{c.customerName}</Td>
            <Td>{c.count}</Td>
            <Td className="tabular-nums" style={{ color: C.brand }}>{money(c.noShipping)}</Td>
            <Td className="tabular-nums">{money(c.shipping)}</Td>
            <Td className="font-semibold tabular-nums" style={{ color: C.green }}>{money(c.total)}</Td>
            <Td className="tabular-nums">{money(c.grossTotal)}</Td>
            <Td className="tabular-nums" style={{ color: c.openTotal ? C.amber : C.faint }}>{money(c.openTotal)}</Td>
          </tr>
        ))}
        <tr style={{ borderTop: `2px solid ${C.gold}`, backgroundColor: C.soft }}>
          <Td className="font-bold">סה״כ</Td>
          <Td className="font-bold">{s.count}</Td>
          <Td className="font-bold tabular-nums" style={{ color: C.brand }}>{money(s.noShipping)}</Td>
          <Td className="font-bold tabular-nums">{money(s.shipping)}</Td>
          <Td className="font-bold tabular-nums" style={{ color: C.green }}>{money(s.total)}</Td>
          <Td className="font-bold tabular-nums">{money(s.grossTotal)}</Td>
          <Td className="font-bold tabular-nums" style={{ color: C.amber }}>{money(s.openTotal)}</Td>
        </tr>
      </tbody>
    </table>
  );
}

function MethodsTable({ orders }: { orders: FinanceOrder[] }) {
  const list = useMemo(() => summarizeByPaymentMethod(orders), [orders]);
  const s = useMemo(() => summarize(orders), [orders]);
  if (!list.length) return <div className="p-5"><EmptyNote>אין הזמנות</EmptyNote></div>;
  return (
    <table className="w-full">
      <thead style={{ backgroundColor: C.soft }}>
        <tr><Th>אמצעי תשלום</Th><Th>הזמנות</Th><Th>לפני מע״מ</Th><Th>כולל מע״מ</Th><Th>טרם שולם</Th></tr>
      </thead>
      <tbody>
        {list.map(m => (
          <tr key={m.method} style={{ borderTop: `1px solid ${C.border}` }}>
            <Td className="font-medium">{m.method}</Td>
            <Td>{m.count}</Td>
            <Td className="font-semibold tabular-nums" style={{ color: C.green }}>{money(m.total)}</Td>
            <Td className="tabular-nums">{money(m.grossTotal)}</Td>
            <Td className="tabular-nums" style={{ color: m.openTotal ? C.amber : C.faint }}>{money(m.openTotal)}</Td>
          </tr>
        ))}
        <tr style={{ borderTop: `2px solid ${C.gold}`, backgroundColor: C.soft }}>
          <Td className="font-bold">סה״כ</Td>
          <Td className="font-bold">{s.count}</Td>
          <Td className="font-bold tabular-nums" style={{ color: C.green }}>{money(s.total)}</Td>
          <Td className="font-bold tabular-nums">{money(s.grossTotal)}</Td>
          <Td className="font-bold tabular-nums" style={{ color: C.amber }}>{money(s.openTotal)}</Td>
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
      ['ללא משלוח (לפני מע״מ)', s.noShipping],
      ['דמי משלוח (לפני מע״מ)', s.shipping],
      ['סה״כ נכנס (לפני מע״מ)', s.total],
      ['שולם', s.paidTotal],
      ['טרם שולם', s.openTotal],
      ['סה״כ שהלקוחות חויבו (כולל מע״מ)', s.grossTotal],
      ...(s.barterCount ? [[`בארטר (לא נספר): ${s.barterCount} הזמנות`, s.barterTotal] as Cell[]] : []),
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
          <StatCard label="נכנס אלייך (לפני מע״מ)" value={money(s.total)} sub={`${s.count} הזמנות`} tone="green" />
          <StatCard label="ללא משלוח" value={money(s.noShipping)} tone="brand" />
          <StatCard label="סה״כ כולל מע״מ" value={money(s.grossTotal)} sub={`דמי משלוח (לפני מע״מ): ${money(s.shipping)}`} />
          <StatCard label="טרם שולם" value={money(s.openTotal)} sub={s.openCount ? `${s.openCount} הזמנות` : undefined} tone={s.openTotal ? 'amber' : undefined} />
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
          {view === 'customers' ? <CustomersTable orders={sorted} />
            : view === 'methods' ? <MethodsTable orders={sorted} />
            : (
              <table className="w-full">
                <thead className="sticky top-0" style={{ backgroundColor: C.soft }}>
                  <tr>
                    <Th>תאריך</Th><Th>מס׳ הזמנה</Th><Th>לקוח</Th><Th>ללא משלוח</Th><Th>דמי משלוח</Th><Th>סה״כ לפני מע״מ</Th>
                    <Th>סה״כ כולל מע״מ</Th><Th>אמצעי תשלום</Th><Th>סטטוס</Th>
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
                      <Td className="tabular-nums" style={{ color: C.brand }}>{o.barter ? '—' : money(o.netNoShipping)}</Td>
                      <Td className="tabular-nums">{o.barter ? '—' : money(o.netShipping)}</Td>
                      <Td className="font-semibold tabular-nums" style={{ color: C.green }}>{o.barter ? '—' : money(o.netTotal)}</Td>
                      <Td className="tabular-nums">{o.barter ? '—' : money(o.grossTotal)}</Td>
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
                    <Td className="font-bold tabular-nums" style={{ color: C.brand }}>{money(s.noShipping)}</Td>
                    <Td className="font-bold tabular-nums">{money(s.shipping)}</Td>
                    <Td className="font-bold tabular-nums" style={{ color: C.green }}>{money(s.total)}</Td>
                    <Td className="font-bold tabular-nums">{money(s.grossTotal)}</Td>
                    <Td /><Td />
                  </tr>
                </tbody>
              </table>
            )}
        </div>
        <p className="text-xs" style={{ color: C.faint }}>{VAT_NOTE}</p>
      </div>
    </Modal>
  );
}
