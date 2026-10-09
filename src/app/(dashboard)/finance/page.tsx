'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileDown, CalendarDays, ListFilter, ChevronDown } from 'lucide-react';
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

const selectCls = 'h-9 pr-8 pl-8 text-sm font-medium rounded-lg border border-[#E2D6C6] bg-white text-[#2A1C10] shadow-sm appearance-none cursor-pointer hover:border-[#C9A46A] focus:outline-none focus:ring-2 focus:ring-[#C9A46A]/30 focus:border-[#C9A46A]';

function FilterSelect({ icon: Icon, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement> & { icon: typeof CalendarDays }) {
  return (
    <div className="relative">
      <Icon size={15} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: C.sub }} />
      <select className={selectCls} {...rest}>{children}</select>
      <ChevronDown size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: C.sub }} />
    </div>
  );
}

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
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: C.text }}>פיננסים</h1>
          <p className="text-sm mt-1" style={{ color: C.sub }}>כמה נכנס, כמה יצא, ומה נשאר — לפי חודש ולפי שנה</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect icon={CalendarDays} value={year} onChange={e => setYear(Number(e.target.value))} aria-label="שנה">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </FilterSelect>
          <button
            onClick={() => setReportOpen(true)}
            disabled={incomeLoading || expensesLoading || !!incomeError}
            className="inline-flex items-center gap-2 h-9 px-4 text-sm font-semibold rounded-lg text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${C.brand}, ${C.choc})` }}>
            <FileDown size={16} />
            דוח מלא (PDF / אקסל)
          </button>
          {tab !== 'expenses' && (
            <FilterSelect icon={ListFilter} value={basis} onChange={e => setBasis(e.target.value as DateBasis)} aria-label="שיוך הזמנה לחודש">
              <option value="order">הזמנות לפי תאריך הזמנה</option>
              <option value="delivery">הזמנות לפי תאריך אספקה</option>
            </FilterSelect>
          )}
        </div>
      </div>

      <div className="inline-flex gap-1 p-1 rounded-xl" style={{ backgroundColor: '#F1E9DD' }} role="tablist">
        {([
          { key: 'income', label: 'הכנסות' },
          { key: 'expenses', label: 'הוצאות', count: expensesReady ? expenses.length : undefined },
          { key: 'pnl', label: 'רווח והפסד' },
        ] as { key: TabKey; label: string; count?: number }[]).map(t => {
          const active = tab === t.key;
          return (
            <button key={t.key} role="tab" aria-selected={active} onClick={() => setTab(t.key)}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg transition-all"
              style={active
                ? { backgroundColor: '#fff', color: C.text, fontWeight: 600, boxShadow: '0 1px 4px rgba(58,38,24,0.12)' }
                : { color: C.sub, fontWeight: 500 }}>
              {t.label}
              {t.count !== undefined && (
                <span className="px-1.5 rounded-full text-xs tabular-nums"
                  style={{ backgroundColor: active ? '#F5ECDF' : 'rgba(255,255,255,0.6)', color: C.brand }}>
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

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
