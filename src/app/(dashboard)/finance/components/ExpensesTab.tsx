'use client';

import { useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import {
  expenseNet, expenseSupplierName, paymentMethodLabel, round2, HEBREW_MONTHS, todayJerusalem, type Expense,
} from '@/lib/finance';
import { downloadExcel, downloadElementPng, fmtDate, type Cell } from '@/lib/finance-export';
import { C, money, StatCard, ExportButtons, Th, Td, EmptyNote, THEAD_STYLE, TOTAL_ROW_STYLE } from './shared';
import { TrendingDown, Percent, CreditCard, Users } from 'lucide-react';
import ExpenseFormModal, { type SupplierOption } from './ExpenseFormModal';
import ExpenseImportModal from './ExpenseImportModal';
import SalaryModal, { type EmployeeOption } from './SalaryModal';

interface Group { name: string; count: number; gross: number; vat: number; net: number }

function groupBy(list: Expense[], keyOf: (e: Expense) => string): Group[] {
  const map = new Map<string, Group>();
  for (const e of list) {
    const k = keyOf(e);
    const g = map.get(k) ?? { name: k, count: 0, gross: 0, vat: 0, net: 0 };
    g.count++;
    g.gross = round2(g.gross + Number(e.סכום));
    g.vat = round2(g.vat + Number(e.מעמ));
    g.net = round2(g.net + expenseNet(e));
    map.set(k, g);
  }
  return Array.from(map.values()).sort((a, b) => b.gross - a.gross);
}

const selectCls = 'px-3 py-1.5 text-sm rounded-lg border border-[#E8DED2] bg-white focus:outline-none focus:border-[#C9A46A]';

export default function ExpensesTab({ expenses, suppliers, employees, salariesReady, year, tableReady, hint, reload }: {
  expenses: Expense[];
  suppliers: SupplierOption[];
  employees: EmployeeOption[];
  /** false until migration 059 (payslip fields) has been run. */
  salariesReady: boolean;
  year: number;
  tableReady: boolean;
  hint: string | null;
  reload: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [month, setMonth] = useState<number | 'all'>('all');
  const [category, setCategory] = useState('');
  const [supplier, setSupplier] = useState('');
  const [method, setMethod] = useState('');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [formInitial, setFormInitial] = useState<Partial<Expense> | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [salaryOpen, setSalaryOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState(false);

  const inMonth = useMemo(
    () => (month === 'all' ? expenses : expenses.filter(e => Number(e.תאריך.slice(5, 7)) === month)),
    [expenses, month],
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inMonth.filter(e =>
      (!category || e.קטגוריה === category) &&
      (!supplier || expenseSupplierName(e) === supplier) &&
      (!method || paymentMethodLabel(e.אמצעי_תשלום) === method) &&
      (!q || [e.שם_ספק, e.תיאור, e.מספר_מסמך, e.הערות, e.קטגוריה, e.אמצעי_תשלום].some(v => (v ?? '').toLowerCase().includes(q))),
    );
  }, [inMonth, category, supplier, method, search]);

  const byCategory = useMemo(() => groupBy(filtered, e => e.קטגוריה || 'אחר'), [filtered]);
  const bySupplier = useMemo(() => groupBy(filtered, expenseSupplierName), [filtered]);
  const byMethod = useMemo(() => groupBy(filtered, e => paymentMethodLabel(e.אמצעי_תשלום)), [filtered]);
  const totals = useMemo(() => ({
    gross: round2(filtered.reduce((s, e) => s + Number(e.סכום), 0)),
    vat: round2(filtered.reduce((s, e) => s + Number(e.מעמ), 0)),
    net: round2(filtered.reduce((s, e) => s + expenseNet(e), 0)),
  }), [filtered]);

  const allCategories = useMemo(() => Array.from(new Set(inMonth.map(e => e.קטגוריה))).sort(), [inMonth]);
  const allSuppliers = useMemo(() => Array.from(new Set(inMonth.map(expenseSupplierName))).sort(), [inMonth]);
  const allMethods = useMemo(() => Array.from(new Set(inMonth.map(e => paymentMethodLabel(e.אמצעי_תשלום)))).sort(), [inMonth]);
  const periodLabel = month === 'all' ? `שנת ${year}` : `${HEBREW_MONTHS[month - 1]} ${year}`;

  function openNew() { setFormInitial(null); setFormOpen(true); }
  function openEdit(e: Expense) { setFormInitial(e); setFormOpen(true); }
  function openDuplicate(e: Expense) {
    const { id: _id, ...rest } = e;
    setFormInitial({ ...rest, תאריך: todayJerusalem(), מספר_מסמך: null });
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/finance/expenses/${toDelete.id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'המחיקה נכשלה');
      toast.success('ההוצאה נמחקה');
      setToDelete(null);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'המחיקה נכשלה');
    } finally {
      setDeleting(false);
    }
  }

  async function exportExcel() {
    const groupRows = (gs: Group[], title: string): Cell[][] => [
      [title, 'מס׳ הוצאות', 'לפני מע״מ', 'מע״מ', 'כולל מע״מ'],
      ...gs.map(g => [g.name, g.count, g.net, g.vat, g.gross] as Cell[]),
      ['סה״כ', filtered.length, totals.net, totals.vat, totals.gross],
    ];
    await downloadExcel(`הוצאות_${month === 'all' ? year : `${year}-${String(month).padStart(2, '0')}`}`, [
      {
        name: 'כל ההוצאות',
        rows: [
          ['תאריך', 'ספק / שם', 'קטגוריה', 'תיאור', 'לפני מע״מ', 'מע״מ', 'כולל מע״מ', 'מס׳ מסמך', 'אמצעי תשלום', 'הערות'],
          ...[...filtered].sort((a, b) => a.תאריך.localeCompare(b.תאריך)).map(e => [
            fmtDate(e.תאריך), expenseSupplierName(e), e.קטגוריה, e.תיאור ?? '', expenseNet(e), Number(e.מעמ), Number(e.סכום),
            e.מספר_מסמך ?? '', paymentMethodLabel(e.אמצעי_תשלום), e.הערות ?? '',
          ] as Cell[]),
          ['סה״כ', '', '', `${filtered.length} הוצאות`, totals.net, totals.vat, totals.gross, '', '', ''],
        ],
      },
      { name: 'לפי קטגוריה', rows: groupRows(byCategory, 'קטגוריה') },
      { name: 'לפי ספק', rows: groupRows(bySupplier, 'ספק / שם') },
      { name: 'לפי אמצעי תשלום', rows: groupRows(byMethod, 'אמצעי תשלום') },
    ]);
  }

  if (!tableReady) {
    return (
      <Card>
        <div className="space-y-2 text-sm" style={{ color: C.text }}>
          <p className="font-semibold">צריך להפעיל את טבלת ההוצאות</p>
          <p style={{ color: C.sub }}>{hint ?? 'יש להריץ את מיגרציה 057 ב-Supabase SQL Editor.'}</p>
          <p style={{ color: C.sub }}>אחרי ההרצה — רענני את הדף ותוכלי להזין ולייבא הוצאות.</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={openNew}>+ הוצאה חדשה</Button>
        <Button variant="outline" onClick={() => setImportOpen(true)}>ייבוא מקובץ הנהלת חשבונות</Button>
        <Button variant="outline" onClick={() => (salariesReady ? setSalaryOpen(true) : toast.error('יש להריץ את מיגרציה 059 ב-Supabase כדי להזין תלושי משכורת'))}>
          תלושי משכורת (ברוטו)
        </Button>
        <div className="flex-1" />
        <select className={selectCls} value={month} onChange={e => setMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
          <option value="all">כל השנה</option>
          {HEBREW_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select className={selectCls} value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">כל הקטגוריות</option>
          {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className={selectCls} value={supplier} onChange={e => setSupplier(e.target.value)}>
          <option value="">כל הספקים</option>
          {allSuppliers.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={selectCls} value={method} onChange={e => setMethod(e.target.value)}>
          <option value="">כל אמצעי התשלום</option>
          {allMethods.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <input className={selectCls} placeholder="חיפוש…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div ref={ref} className="space-y-5 bg-white sm:bg-transparent">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold" style={{ color: C.text }}>הוצאות — {periodLabel}{category ? ` · ${category}` : ''}{supplier ? ` · ${supplier}` : ''}{method ? ` · ${method}` : ''}</h2>
          <ExportButtons onExcel={exportExcel} onImage={() => ref.current ? downloadElementPng(ref.current, `הוצאות_${periodLabel}`) : undefined} />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="הוצאות — לפני מע״מ" value={money(totals.net)} sub={`${filtered.length} הוצאות`} tone="red" icon={TrendingDown} />
          <StatCard label="מע״מ (מוכר)" value={money(totals.vat)} icon={Percent} />
          <StatCard label="הוצאות — כולל מע״מ (שולם בפועל)" value={money(totals.gross)} icon={CreditCard} />
          <StatCard label="ספקים / מקבלים" value={String(bySupplier.length)} icon={Users} />
        </div>

        <SalariesMatrix expenses={expenses} employees={employees} year={year} />

        {expenses.length === 0 ? (
          <EmptyNote>עוד לא הוזנו הוצאות לשנת {year}. אפשר להוסיף ידנית או לייבא קובץ מהנהלת החשבונות.</EmptyNote>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <GroupTable title="לפי קטגוריה" groups={byCategory} total={totals} onPick={setCategory} />
            <GroupTable title="לפי ספק / מקבל — כמה שילמתי לכל אחד" groups={bySupplier} total={totals} onPick={setSupplier} />
            <GroupTable title="לפי אמצעי תשלום" groups={byMethod} total={totals} onPick={setMethod} />
          </div>
        )}

        {filtered.length > 0 && (
          <Card className="!p-0 overflow-hidden">
            <div className="overflow-auto" style={{ maxHeight: 560 }} data-export-expand>
              <table className="w-full">
                <thead className="sticky top-0" style={THEAD_STYLE}>
                  <tr><Th>תאריך</Th><Th>ספק / שם</Th><Th>קטגוריה</Th><Th>תיאור</Th><Th>לפני מע״מ</Th><Th>מע״מ</Th><Th>כולל מע״מ</Th><Th>אמצעי תשלום</Th><Th>מס׳ מסמך</Th><Th /></tr>
                </thead>
                <tbody>
                  {filtered.map(e => (
                    <tr key={e.id} style={{ borderTop: `1px solid ${C.border}` }}>
                      <Td>{fmtDate(e.תאריך)}</Td>
                      <Td className="font-medium">{expenseSupplierName(e)}</Td>
                      <Td>{e.קטגוריה}</Td>
                      <Td className="max-w-[260px] truncate" style={{ color: C.sub }}>{e.תיאור ?? ''}</Td>
                      <Td className="font-semibold tabular-nums">{money(expenseNet(e))}</Td>
                      <Td className="tabular-nums" style={{ color: C.sub }}>{money(Number(e.מעמ))}</Td>
                      <Td className="tabular-nums">{money(Number(e.סכום))}</Td>
                      <Td>{paymentMethodLabel(e.אמצעי_תשלום)}</Td>
                      <Td style={{ color: C.sub }}>{e.מספר_מסמך ?? ''}</Td>
                      <Td>
                        <div className="flex gap-2 text-xs" data-export-hide>
                          <button onClick={() => openEdit(e)} style={{ color: C.brand }}>עריכה</button>
                          <button onClick={() => openDuplicate(e)} style={{ color: C.sub }} title="יצירת הוצאה זהה (למשל הוצאה חודשית קבועה)">שכפול</button>
                          <button onClick={() => setToDelete(e)} style={{ color: C.red }}>מחיקה</button>
                        </div>
                      </Td>
                    </tr>
                  ))}
                  <tr style={TOTAL_ROW_STYLE}>
                    <Td className="font-bold">סה״כ</Td><Td /><Td />
                    <Td className="font-bold">{filtered.length} הוצאות</Td>
                    <Td className="font-bold tabular-nums">{money(totals.net)}</Td>
                    <Td className="font-bold tabular-nums">{money(totals.vat)}</Td>
                    <Td className="font-bold tabular-nums">{money(totals.gross)}</Td>
                    <Td /><Td /><Td />
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      <ExpenseFormModal open={formOpen} initial={formInitial} suppliers={suppliers} onClose={() => setFormOpen(false)} onSaved={reload} />
      <ExpenseImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={reload} />
      <SalaryModal open={salaryOpen} onClose={() => setSalaryOpen(false)} onSaved={reload} year={year} employees={employees} expenses={expenses} />
      <ConfirmModal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title="מחיקת הוצאה"
        description={toDelete ? `למחוק את ההוצאה של ${expenseSupplierName(toDelete)} על סך ${money(Number(toDelete.סכום))} מ-${fmtDate(toDelete.תאריך)}?` : ''}
        confirmLabel="מחיקה"
        loading={deleting}
      />
    </div>
  );
}

function GroupTable({ title, groups, total, onPick }: {
  title: string;
  groups: Group[];
  total: { gross: number; net: number };
  onPick: (name: string) => void;
}) {
  return (
    <Card className="!p-0 overflow-hidden">
      <div className="px-5 py-3 text-sm font-semibold" style={{ color: C.text, borderBottom: `1px solid ${C.border}` }}>{title}</div>
      <div className="overflow-auto" style={{ maxHeight: 380 }} data-export-expand>
        <table className="w-full">
          <thead className="sticky top-0" style={THEAD_STYLE}>
            <tr><Th>שם</Th><Th>הוצאות</Th><Th>לפני מע״מ</Th><Th>כולל מע״מ</Th><Th>%</Th></tr>
          </thead>
          <tbody>
            {groups.map(g => (
              <tr key={g.name} className="cursor-pointer hover:bg-[#FBF6EE]" onClick={() => onPick(g.name)} style={{ borderTop: `1px solid ${C.border}` }}>
                <Td className="font-medium">{g.name}</Td>
                <Td>{g.count}</Td>
                <Td className="font-semibold tabular-nums">{money(g.net)}</Td>
                <Td className="tabular-nums">{money(g.gross)}</Td>
                <Td className="tabular-nums" style={{ color: C.sub }}>{total.gross ? Math.round((g.gross / total.gross) * 100) : 0}%</Td>
              </tr>
            ))}
            <tr style={TOTAL_ROW_STYLE}>
              <Td className="font-bold">סה״כ</Td>
              <Td className="font-bold">{groups.reduce((t, g) => t + g.count, 0)}</Td>
              <Td className="font-bold tabular-nums">{money(total.net)}</Td>
              <Td className="font-bold tabular-nums">{money(total.gross)}</Td>
              <Td className="font-bold">100%</Td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Gross salary per employee per month (payslips), with totals both ways. */
function SalariesMatrix({ expenses, employees, year }: { expenses: Expense[]; employees: EmployeeOption[]; year: number }) {
  const slips = expenses.filter(e => e.עובד_id && e.חודש_שכר?.startsWith(`${year}-`));
  if (!slips.length) return null;
  const months = Array.from(new Set(slips.map(e => e.חודש_שכר!))).sort();
  const nameOf = (id: string) => employees.find(x => x.id === id)?.שם_עובד ?? slips.find(e => e.עובד_id === id)?.שם_ספק ?? '—';
  const empIds = Array.from(new Set(slips.map(e => e.עובד_id!))).sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'he'));
  const cell = (emp: string, m: string) => round2(slips.filter(e => e.עובד_id === emp && e.חודש_שכר === m).reduce((t, e) => t + Number(e.סכום), 0));
  const rowTotal = (emp: string) => round2(months.reduce((t, m) => t + cell(emp, m), 0));
  const colTotal = (m: string) => round2(empIds.reduce((t, emp) => t + cell(emp, m), 0));
  const grand = round2(months.reduce((t, m) => t + colTotal(m), 0));
  return (
    <Card className="!p-0 overflow-hidden">
      <div className="px-5 py-3" style={{ borderBottom: `1px solid ${C.border}` }}>
        <h3 className="text-sm font-semibold" style={{ color: C.text }}>משכורות ברוטו לפי עובד — {year}</h3>
        <p className="text-xs mt-0.5" style={{ color: C.sub }}>מתוך תלושי המשכורת שהוזנו (ללא מע״מ)</p>
      </div>
      <div className="overflow-x-auto" data-export-expand>
        <table className="w-full">
          <thead style={THEAD_STYLE}>
            <tr><Th>עובד</Th>{months.map(m => <Th key={m}>{HEBREW_MONTHS[Number(m.slice(5)) - 1]}</Th>)}<Th>סה״כ</Th></tr>
          </thead>
          <tbody>
            {empIds.map(emp => (
              <tr key={emp} style={{ borderTop: `1px solid ${C.border}` }}>
                <Td className="font-medium">{nameOf(emp)}</Td>
                {months.map(m => <Td key={m} className="tabular-nums" style={{ color: cell(emp, m) ? C.text : C.faint }}>{money(cell(emp, m))}</Td>)}
                <Td className="font-semibold tabular-nums">{money(rowTotal(emp))}</Td>
              </tr>
            ))}
            <tr style={TOTAL_ROW_STYLE}>
              <Td className="font-bold">סה״כ</Td>
              {months.map(m => <Td key={m} className="font-bold tabular-nums">{money(colTotal(m))}</Td>)}
              <Td className="font-bold tabular-nums">{money(grand)}</Td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}
