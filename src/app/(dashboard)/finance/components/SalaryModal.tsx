'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { HEBREW_MONTHS, round2, todayJerusalem, type Expense } from '@/lib/finance';
import { C, money, Th, Td, THEAD_STYLE, TOTAL_ROW_STYLE } from './shared';

export interface EmployeeOption { id: string; שם_עובד: string; פעיל: boolean; תפקיד?: string | null }

const inputCls = 'w-36 px-3 py-1.5 text-sm rounded-lg border border-[#E8DED2] bg-white focus:outline-none focus:border-[#C9A46A] tabular-nums';

/** Previous calendar month — payslips arrive after the month ends. */
function defaultMonth(year: number): string {
  const today = todayJerusalem();
  const [y, m] = today.split('-').map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  return prev.startsWith(String(year)) ? prev : `${year}-12`;
}

/**
 * Enter one month of payslips: the gross (ברוטו) salary of every employee.
 * Saved as expenses (category "משכורות ועובדים", no VAT) via PUT /api/finance/salaries.
 */
export default function SalaryModal({ open, onClose, onSaved, year, employees, expenses }: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  year: number;
  employees: EmployeeOption[];
  /** This year's expenses — payslips already saved prefill the form. */
  expenses: Expense[];
}) {
  const [month, setMonth] = useState(() => defaultMonth(year));
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setMonth(defaultMonth(year)); }, [open, year]);

  // Payslips already saved for the chosen month, by employee.
  const savedByEmp = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) if (e.עובד_id && e.חודש_שכר === month) map.set(e.עובד_id, Number(e.סכום) || 0);
    return map;
  }, [expenses, month]);

  // Active employees, plus anyone who already has a payslip this month.
  const rows = useMemo(
    () => employees.filter(e => e.פעיל || savedByEmp.has(e.id)).sort((a, b) => a.שם_עובד.localeCompare(b.שם_עובד, 'he')),
    [employees, savedByEmp],
  );

  useEffect(() => {
    if (!open) return;
    const next: Record<string, string> = {};
    for (const e of rows) next[e.id] = savedByEmp.has(e.id) ? String(savedByEmp.get(e.id)) : '';
    setValues(next);
  }, [open, rows, savedByEmp]);

  const total = round2(rows.reduce((t, e) => t + (Number(values[e.id]) || 0), 0));

  async function save() {
    const bad = rows.find(e => values[e.id] && !(Number(values[e.id]) >= 0));
    if (bad) return toast.error(`סכום לא תקין עבור ${bad.שם_עובד}`);
    setSaving(true);
    try {
      const res = await fetch('/api/finance/salaries', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, items: rows.map(e => ({ employeeId: e.id, gross: values[e.id] ? Number(values[e.id]) : 0 })) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'השמירה נכשלה');
      toast.success(`נשמרו ${json.saved} תלושים${json.removed ? ` · ${json.removed} הוסרו` : ''}`);
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'השמירה נכשלה');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="תלושי משכורת — ברוטו לעובד" size="lg">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span style={{ color: C.sub }}>חודש השכר:</span>
          <select className="px-3 py-1.5 text-sm rounded-lg border border-[#E8DED2] bg-white" value={month} onChange={e => setMonth(e.target.value)}>
            {HEBREW_MONTHS.map((m, i) => {
              const k = `${year}-${String(i + 1).padStart(2, '0')}`;
              return <option key={k} value={k}>{m} {year}</option>;
            })}
          </select>
        </div>
        <p className="text-xs" style={{ color: C.sub }}>
          מזינים את השכר <b>ברוטו</b> מהתלוש של כל עובד. נרשם כהוצאה בקטגוריה &quot;משכורות ועובדים&quot;, ללא מע״מ, בחודש השכר.
          השארת שדה ריק (או 0) מוחקת את התלוש של אותו עובד לחודש הזה. שמירה חוזרת של אותו חודש מעדכנת — לא מכפילה.
        </p>

        {rows.length === 0 ? (
          <p className="text-sm" style={{ color: C.amber }}>אין עובדים פעילים. מוסיפים עובדים בעמוד &quot;עובדים / משימות&quot;.</p>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
            <table className="w-full">
              <thead style={THEAD_STYLE}>
                <tr><Th>עובד</Th><Th>תפקיד</Th><Th>ברוטו (₪)</Th></tr>
              </thead>
              <tbody>
                {rows.map(e => (
                  <tr key={e.id} style={{ borderTop: `1px solid ${C.border}` }}>
                    <Td className="font-medium">
                      {e.שם_עובד}
                      {!e.פעיל && <span className="text-xs mr-1" style={{ color: C.faint }}>(לא פעיל)</span>}
                    </Td>
                    <Td style={{ color: C.sub }}>{e.תפקיד ?? ''}</Td>
                    <Td>
                      <input className={inputCls} type="number" inputMode="decimal" min="0" step="0.01" placeholder="0"
                        value={values[e.id] ?? ''} onChange={ev => setValues(v => ({ ...v, [e.id]: ev.target.value }))} />
                    </Td>
                  </tr>
                ))}
                <tr style={TOTAL_ROW_STYLE}>
                  <Td className="font-bold">סה״כ ברוטו</Td><Td />
                  <Td className="font-bold tabular-nums">{money(total)}</Td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={save} loading={saving} disabled={!rows.length}>שמירת תלושים</Button>
        </div>
      </div>
    </Modal>
  );
}
