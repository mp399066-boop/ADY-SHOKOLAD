'use client';

import { useCallback, useEffect, useState } from 'react';
import { Tabs } from '@/components/ui/Tabs';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { todayJerusalem, type FinanceOrder, type Expense, type DateBasis } from '@/lib/finance';
import IncomeTab from './components/IncomeTab';
import ExpensesTab from './components/ExpensesTab';
import ProfitLossTab from './components/ProfitLossTab';
import FullReportModal from './components/FullReportModal';
import type { SupplierOption } from './components/ExpenseFormModal';
import type { EmployeeOption } from './components/SalaryModal';
import { C } from './components/shared';

type TabKey = 'income' | 'expenses' | 'pnl';

const selectCls = 'px-3 py-1.5 text-sm rounded-lg border border-[#E8DED2] bg-white focus:outline-none focus:border-[#C9A46A]';

export default function FinancePage() {
  const [role, setRole] = useState<string | null | undefined>(undefined);
  const [tab, setTab] = useState<TabKey>('income');
  const currentYear = Number(todayJerusalem().slice(0, 4));
  const [year, setYear] = useState(currentYear);
  const [years, setYears] = useState<number[]>([currentYear]);
  const [basis, setBasis] = useState<DateBasis>('order');

  const [orders, setOrders] = useState<FinanceOrder[]>([]);
  const [undatedCount, setUndatedCount] = useState(0);
  const [incomeLoading, setIncomeLoading] = useState(true);
  const [incomeError, setIncomeError] = useState<string | null>(null);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expensesReady, setExpensesReady] = useState(true);
  const [salariesReady, setSalariesReady] = useState(true);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [expensesHint, setExpensesHint] = useState<string | null>(null);
  const [expensesLoading, setExpensesLoading] = useState(true);

  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    fetch('/api/me').then(r => (r.ok ? r.json() : null)).then(j => setRole(j?.role ?? null)).catch(() => setRole(null));
  }, []);

  const isAdmin = role === 'admin';

  const loadIncome = useCallback(async () => {
    setIncomeLoading(true);
    setIncomeError(null);
    try {
      const res = await fetch(`/api/finance/income?year=${year}&basis=${basis}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'שגיאה בטעינת ההכנסות');
      setOrders(json.orders ?? []);
      setUndatedCount(json.undatedCount ?? 0);
      if (Array.isArray(json.years) && json.years.length) setYears(json.years);
    } catch (e) {
      setIncomeError(e instanceof Error ? e.message : 'שגיאה בטעינת ההכנסות');
      setOrders([]);
    } finally {
      setIncomeLoading(false);
    }
  }, [year, basis]);

  const loadExpenses = useCallback(async () => {
    setExpensesLoading(true);
    try {
      const res = await fetch(`/api/finance/expenses?year=${year}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'שגיאה בטעינת ההוצאות');
      setExpenses(json.data ?? []);
      setExpensesReady(json.tableReady !== false);
      setExpensesHint(json.hint ?? null);
      setSalariesReady(json.salariesReady !== false);
    } catch {
      setExpenses([]);
    } finally {
      setExpensesLoading(false);
    }
  }, [year]);

  useEffect(() => { if (isAdmin) loadIncome(); }, [isAdmin, loadIncome]);
  useEffect(() => { if (isAdmin) loadExpenses(); }, [isAdmin, loadExpenses]);
  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/suppliers').then(r => (r.ok ? r.json() : null)).then(j => {
      const list = ((j?.data ?? []) as SupplierOption[]).filter(s => s.פעיל !== false);
      setSuppliers(list);
    }).catch(() => {});
    fetch('/api/employees').then(r => (r.ok ? r.json() : null)).then(j => {
      setEmployees((j?.data ?? []) as EmployeeOption[]);
    }).catch(() => {});
  }, [isAdmin]);

  if (role === undefined) {
    return <div className="flex justify-center py-20"><LoadingSpinner /></div>;
  }
  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center text-sm rounded-xl bg-white p-8" style={{ color: C.sub, border: `1px solid ${C.border}` }}>
        עמוד הפיננסים זמין למנהלת המערכת בלבד.
      </div>
    );
  }

  const loading = tab === 'expenses' ? expensesLoading : incomeLoading || (tab === 'pnl' && expensesLoading);

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: C.text }}>פיננסים</h1>
          <p className="text-sm mt-0.5" style={{ color: C.sub }}>כמה נכנס, כמה יצא, ומה נשאר — לפי חודש ולפי שנה</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className={selectCls} value={year} onChange={e => setYear(Number(e.target.value))} aria-label="שנה">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            onClick={() => setReportOpen(true)}
            disabled={incomeLoading || expensesLoading || !!incomeError}
            className="px-3 py-1.5 text-sm font-medium rounded-lg text-white disabled:opacity-50"
            style={{ backgroundColor: C.brand }}>
            ⬇ דוח מלא (PDF / אקסל)
          </button>
          {tab !== 'expenses' && (
            <select className={selectCls} value={basis} onChange={e => setBasis(e.target.value as DateBasis)} aria-label="שיוך הזמנה לחודש">
              <option value="order">הזמנות לפי תאריך הזמנה</option>
              <option value="delivery">הזמנות לפי תאריך אספקה</option>
            </select>
          )}
        </div>
      </div>

      <Tabs
        tabs={[
          { key: 'income', label: 'הכנסות' },
          { key: 'expenses', label: 'הוצאות', count: expensesReady ? expenses.length : undefined },
          { key: 'pnl', label: 'רווח והפסד' },
        ]}
        activeTab={tab}
        onChange={k => setTab(k as TabKey)}
      />

      {incomeError && tab !== 'expenses' ? (
        <div className="rounded-xl p-4 text-sm" style={{ backgroundColor: C.redBg, color: C.red }}>{incomeError}</div>
      ) : loading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : tab === 'income' ? (
        <IncomeTab orders={orders} year={year} basis={basis} undatedCount={undatedCount} />
      ) : tab === 'expenses' ? (
        <ExpensesTab expenses={expenses} suppliers={suppliers} employees={employees} salariesReady={salariesReady} year={year} tableReady={expensesReady} hint={expensesHint} reload={loadExpenses} />
      ) : (
        <ProfitLossTab orders={orders} expenses={expenses} year={year} basis={basis} expensesReady={expensesReady} />
      )}

      <FullReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        orders={orders}
        expenses={expensesReady ? expenses : []}
        year={year}
        basis={basis}
        expensesReady={expensesReady}
      />
    </div>
  );
}
