'use client';

import { useMemo, useRef, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import {
  summarize, summarizeByCustomer, orderBasisDate, monthKey, monthLabel, HEBREW_MONTHS,
  type FinanceOrder, type DateBasis, type MoneySummary,
} from '@/lib/finance';
import { downloadExcel, downloadElementPng, fmtDate, type Cell } from '@/lib/finance-export';
import { C, money, StatCard, ExportButtons, Th, Td, EmptyNote } from './shared';

const BASIS_LABEL: Record<DateBasis, string> = { order: 'לפי תאריך הזמנה', delivery: 'לפי תאריך אספקה' };

function ordersExcelRows(orders: FinanceOrder[], basis: DateBasis): Cell[][] {
  const header: Cell[] = [
    basis === 'order' ? 'תאריך הזמנה' : 'תאריך אספקה', 'מס׳ הזמנה', 'לקוח', 'סוג לקוח',
    'סכום ללא משלוח', 'משלוח', 'סה״כ כולל משלוח', 'לפני מע״מ', 'סטטוס תשלום', 'אמצעי תשלום',
  ];
  const rows = orders.map(o => [
    fmtDate(orderBasisDate(o, basis)), o.orderNumber, o.customerName, o.customerType || '',
    o.grossNoShipping, o.grossShipping, o.grossTotal, o.netTotal,
    o.barter ? 'בארטר (לא נספר)' : o.paymentStatus, o.paymentMethod ?? '',
  ] as Cell[]);
  return [header, ...rows];
}

function customersExcelRows(orders: FinanceOrder[]): Cell[][] {
  const list = summarizeByCustomer(orders);
  const s = summarize(orders);
  return [
    ['לקוח', 'מס׳ הזמנות', 'סכום ללא משלוח', 'משלוח', 'סה״כ כולל משלוח', 'מתוכם טרם שולם'],
    ...list.map(c => [c.customerName, c.count, c.noShipping, c.shipping, c.total, c.openTotal] as Cell[]),
    ['סה״כ', s.count, s.noShipping, s.shipping, s.total, s.openTotal],
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
      const d = orderBasisDate(o, basis);
      const k = d?.slice(0, 7);
      if (k && map.has(k)) map.get(k)!.push(o);
    }
    return map;
  }, [orders, year, basis]);

  const monthRows = useMemo(
    () => Array.from(byMonth.entries()).map(([key, list]) => ({ key, list, s: summarize(list) })),
    [byMonth],
  );
  const yearSummary = useMemo(() => summarize(orders), [orders]);
  const yearCustomers = useMemo(() => summarizeByCustomer(orders), [orders]);

  async function exportYearExcel() {
    const monthly: Cell[][] = [
      ['חודש', 'מס׳ הזמנות', 'סכום ללא משלוח', 'משלוח', 'סה״כ כולל משלוח', 'שולם', 'טרם שולם', 'לפני מע״מ'],
      ...monthRows.map(m => [monthLabel(m.key), m.s.count, m.s.noShipping, m.s.shipping, m.s.total, m.s.paidTotal, m.s.openTotal, m.s.netTotal] as Cell[]),
      ['סה״כ שנתי', yearSummary.count, yearSummary.noShipping, yearSummary.shipping, yearSummary.total, yearSummary.paidTotal, yearSummary.openTotal, yearSummary.netTotal],
      [],
      [`הסכומים הם מה שהלקוח משלם בפועל (ללקוח עסקי — כולל מע״מ). ${BASIS_LABEL[basis]}. הזמנות שבוטלו, טיוטות והזמנות בארטר אינן נספרות.`],
    ];
    await downloadExcel(`הכנסות_${year}`, [
      { name: 'סיכום חודשי', rows: monthly },
      { name: 'לפי לקוח', rows: customersExcelRows(orders) },
      { name: 'כל ההזמנות', rows: ordersExcelRows(orders, basis) },
    ]);
  }

  const openList = openMonth ? byMonth.get(openMonth) ?? [] : [];

  return (
    <div className="space-y-5">
      <div ref={yearRef} className="space-y-5 bg-white sm:bg-transparent">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label={`הכנסות ${year} ללא משלוחים`} value={money(yearSummary.noShipping)} sub={`${yearSummary.count} הזמנות`} tone="brand" />
          <StatCard label="משלוחים" value={money(yearSummary.shipping)} />
          <StatCard label="סה״כ כולל משלוחים" value={money(yearSummary.total)} />
          <StatCard label="טרם שולם" value={money(yearSummary.openTotal)} sub={`${yearSummary.openCount} הזמנות`} tone={yearSummary.openTotal > 0 ? 'amber' : undefined} />
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
                <tr>
                  <Th>חודש</Th><Th>הזמנות</Th><Th>ללא משלוח</Th><Th>משלוח</Th><Th>כולל משלוח</Th><Th>שולם</Th><Th>טרם שולם</Th><Th />
                </tr>
              </thead>
              <tbody>
                {monthRows.map(({ key, s }) => (
                  <tr key={key}
                    onClick={() => s.count + s.barterCount > 0 && setOpenMonth(key)}
                    className={s.count + s.barterCount > 0 ? 'cursor-pointer hover:bg-[#FBF6EE]' : ''}
                    style={{ borderTop: `1px solid ${C.border}` }}>
                    <Td className="font-medium">{HEBREW_MONTHS[Number(key.slice(5)) - 1]}</Td>
                    <Td style={{ color: s.count ? C.text : C.faint }}>{s.count}</Td>
                    <Td className="font-semibold tabular-nums" style={{ color: s.count ? C.brand : C.faint }}>{money(s.noShipping)}</Td>
                    <Td className="tabular-nums" style={{ color: s.count ? C.text : C.faint }}>{money(s.shipping)}</Td>
                    <Td className="tabular-nums" style={{ color: s.count ? C.text : C.faint }}>{money(s.total)}</Td>
                    <Td className="tabular-nums" style={{ color: s.paidTotal ? C.green : C.faint }}>{money(s.paidTotal)}</Td>
                    <Td className="tabular-nums" style={{ color: s.openTotal ? C.amber : C.faint }}>{money(s.openTotal)}</Td>
                    <Td className="text-xs" style={{ color: C.gold }}>
                      <span data-export-hide>{s.count + s.barterCount > 0 ? 'לפירוט ‹' : ''}</span>
                    </Td>
                  </tr>
                ))}
                <tr style={{ borderTop: `2px solid ${C.gold}`, backgroundColor: C.soft }}>
                  <Td className="font-bold">סה״כ שנתי</Td>
                  <Td className="font-bold">{yearSummary.count}</Td>
                  <Td className="font-bold tabular-nums" style={{ color: C.brand }}>{money(yearSummary.noShipping)}</Td>
                  <Td className="font-bold tabular-nums">{money(yearSummary.shipping)}</Td>
                  <Td className="font-bold tabular-nums">{money(yearSummary.total)}</Td>
                  <Td className="font-bold tabular-nums" style={{ color: C.green }}>{money(yearSummary.paidTotal)}</Td>
                  <Td className="font-bold tabular-nums" style={{ color: C.amber }}>{money(yearSummary.openTotal)}</Td>
                  <Td />
                </tr>
              </tbody>
            </table>
          </div>
          <Footnote summary={yearSummary} undatedCount={undatedCount} />
        </Card>
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="px-5 py-3" style={{ borderBottom: `1px solid ${C.border}` }}>
          <h2 className="text-sm font-semibold" style={{ color: C.text }}>לקוחות — סיכום {year}</h2>
          <p className="text-xs mt-0.5" style={{ color: C.sub }}>כמה נכנס מכל לקוח במהלך השנה (ממוין מהגבוה לנמוך)</p>
        </div>
        {yearCustomers.length === 0 ? (
          <div className="p-5"><EmptyNote>אין הזמנות בשנה זו</EmptyNote></div>
        ) : (
          <div className="overflow-auto" style={{ maxHeight: 480 }}>
            <CustomersTable orders={orders} />
          </div>
        )}
      </Card>

      <MonthDetailModal
        monthKeyStr={openMonth}
        orders={openList}
        basis={basis}
        onClose={() => setOpenMonth(null)}
      />
    </div>
  );
}

function Footnote({ summary, undatedCount }: { summary: MoneySummary; undatedCount: number }) {
  return (
    <div className="px-5 py-3 text-xs space-y-0.5" style={{ color: C.sub, borderTop: `1px solid ${C.border}` }}>
      <div>הסכומים הם מה שהלקוח משלם בפועל — ללקוח עסקי נוסף מע״מ 18% כפי שמופיע בחשבונית. הזמנות שבוטלו וטיוטות לא נספרות.</div>
      {summary.barterCount > 0 && (
        <div>{summary.barterCount} הזמנות בארטר (שווי {money(summary.barterTotal)}) לא נכללו בסכומים — לא נכנס עליהן כסף.</div>
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
        <tr><Th>לקוח</Th><Th>הזמנות</Th><Th>ללא משלוח</Th><Th>משלוח</Th><Th>כולל משלוח</Th><Th>טרם שולם</Th></tr>
      </thead>
      <tbody>
        {list.map(c => (
          <tr key={c.customerId} style={{ borderTop: `1px solid ${C.border}` }}>
            <Td className="font-medium">{c.customerName}</Td>
            <Td>{c.count}</Td>
            <Td className="font-semibold tabular-nums" style={{ color: C.brand }}>{money(c.noShipping)}</Td>
            <Td className="tabular-nums">{money(c.shipping)}</Td>
            <Td className="tabular-nums">{money(c.total)}</Td>
            <Td className="tabular-nums" style={{ color: c.openTotal ? C.amber : C.faint }}>{money(c.openTotal)}</Td>
          </tr>
        ))}
        <tr style={{ borderTop: `2px solid ${C.gold}`, backgroundColor: C.soft }}>
          <Td className="font-bold">סה״כ</Td>
          <Td className="font-bold">{s.count}</Td>
          <Td className="font-bold tabular-nums" style={{ color: C.brand }}>{money(s.noShipping)}</Td>
          <Td className="font-bold tabular-nums">{money(s.shipping)}</Td>
          <Td className="font-bold tabular-nums">{money(s.total)}</Td>
          <Td className="font-bold tabular-nums" style={{ color: C.amber }}>{money(s.openTotal)}</Td>
        </tr>
      </tbody>
    </table>
  );
}

function MonthDetailModal({ monthKeyStr, orders, basis, onClose }: {
  monthKeyStr: string | null;
  orders: FinanceOrder[];
  basis: DateBasis;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<'orders' | 'customers'>('orders');
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
      ['סכום ללא משלוח', s.noShipping],
      ['משלוח', s.shipping],
      ['סה״כ כולל משלוח', s.total],
      ['שולם', s.paidTotal],
      ['טרם שולם', s.openTotal],
      ['לפני מע״מ (הכנסה נטו)', s.netTotal],
      ...(s.barterCount ? [[`בארטר (לא נספר): ${s.barterCount} הזמנות`, s.barterTotal] as Cell[]] : []),
    ];
    await downloadExcel(`הכנסות_${monthKeyStr}`, [
      { name: 'כל ההזמנות', rows: [...ordersExcelRows(sorted, basis), [], ['סה״כ', '', '', '', s.noShipping, s.shipping, s.total, s.netTotal]] },
      { name: 'לפי לקוח', rows: customersExcelRows(sorted) },
      { name: 'סיכום', rows: summaryRows },
    ]);
  }

  return (
    <Modal open={!!monthKeyStr} onClose={onClose} title={`פירוט הכנסות — ${label}`} size="xl">
      <div ref={ref} className="space-y-4 bg-white">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <StatCard label="ללא משלוח" value={money(s.noShipping)} sub={`${s.count} הזמנות`} tone="brand" />
          <StatCard label="משלוח" value={money(s.shipping)} />
          <StatCard label="כולל משלוח" value={money(s.total)} />
          <StatCard label="טרם שולם" value={money(s.openTotal)} sub={s.openCount ? `${s.openCount} הזמנות` : undefined} tone={s.openTotal ? 'amber' : undefined} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex rounded-lg overflow-hidden text-xs" style={{ border: `1px solid ${C.border}` }} data-export-hide>
            {(['orders', 'customers'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} className="px-3 py-1.5"
                style={view === v ? { backgroundColor: C.brand, color: '#fff' } : { backgroundColor: '#fff', color: C.sub }}>
                {v === 'orders' ? 'כל ההזמנות' : 'לפי לקוח'}
              </button>
            ))}
          </div>
          <ExportButtons onExcel={exportExcel} onImage={() => ref.current ? downloadElementPng(ref.current, `הכנסות_${monthKeyStr}`) : undefined} />
        </div>

        <div className="rounded-xl overflow-auto" style={{ border: `1px solid ${C.border}`, maxHeight: '55vh' }} data-export-expand>
          {view === 'customers' ? <CustomersTable orders={sorted} /> : (
            <table className="w-full">
              <thead className="sticky top-0" style={{ backgroundColor: C.soft }}>
                <tr><Th>תאריך</Th><Th>מס׳ הזמנה</Th><Th>לקוח</Th><Th>ללא משלוח</Th><Th>משלוח</Th><Th>כולל משלוח</Th><Th>תשלום</Th></tr>
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
                    <Td className="font-medium">
                      {o.customerName}
                      {o.vatMode === 'business' && <span className="text-xs mr-1" style={{ color: C.faint }}>(עסקי, כולל מע״מ)</span>}
                    </Td>
                    <Td className="font-semibold tabular-nums" style={{ color: C.brand }}>{money(o.grossNoShipping)}</Td>
                    <Td className="tabular-nums">{money(o.grossShipping)}</Td>
                    <Td className="tabular-nums">{money(o.grossTotal)}</Td>
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
                  <Td className="font-bold tabular-nums">{money(s.total)}</Td>
                  <Td />
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Modal>
  );
}
