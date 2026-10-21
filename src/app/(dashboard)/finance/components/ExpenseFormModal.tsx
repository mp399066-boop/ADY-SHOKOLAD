'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useOptionList } from '@/hooks/useOptionList';
import { NO_VAT_CATEGORIES, vatFromGross, round2, todayJerusalem, expenseBox, EXPENSE_BOXES, EXPENSE_BOX_LABEL, type Expense, type ExpenseBox } from '@/lib/finance';
import { C, money } from './shared';

export interface SupplierOption { id: string; שם_ספק: string; פעיל?: boolean }

type VatMode = 'included' | 'none' | 'manual';

const selectCls = 'w-full px-3 py-2 text-sm rounded-lg border border-[#E8DED2] bg-white focus:outline-none focus:border-[#C9A46A]';

export default function ExpenseFormModal({ open, initial, suppliers, longTermReady, boxReady, defaultBox, onClose, onSaved }: {
  open: boolean;
  /** Existing expense to edit (has id) or a template to duplicate (no id). */
  initial: Partial<Expense> | null;
  suppliers: SupplierOption[];
  /** false until migration 062 (long-term flag) has been run. */
  longTermReady: boolean;
  /** false until migration 065 (expense box) has been run. */
  boxReady: boolean;
  /** Box for a new expense (the tab it was opened from). */
  defaultBox: ExpenseBox;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { values: categories } = useOptionList('expense_categories', initial?.קטגוריה ?? null);
  const { values: paymentMethods } = useOptionList('payment_methods', initial?.אמצעי_תשלום ?? null);

  const [date, setDate] = useState('');
  const [category, setCategory] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [payee, setPayee] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [vatMode, setVatMode] = useState<VatMode>('included');
  const [vatManual, setVatManual] = useState('');
  const [docNumber, setDocNumber] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [longTerm, setLongTerm] = useState(false);
  const [box, setBox] = useState<ExpenseBox>(defaultBox);
  const [saving, setSaving] = useState(false);

  const editing = !!initial?.id;

  useEffect(() => {
    if (!open) return;
    const i = initial ?? {};
    setDate(i.תאריך ?? todayJerusalem());
    setCategory(i.קטגוריה ?? '');
    setSupplierId(i.ספק_id ?? '');
    setPayee(i.ספק_id ? '' : i.שם_ספק ?? '');
    setDescription(i.תיאור ?? '');
    setAmount(i.סכום != null ? String(i.סכום) : '');
    const amt = Number(i.סכום) || 0;
    const vat = Number(i.מעמ) || 0;
    if (i.סכום == null) setVatMode('included');
    else if (vat === 0) setVatMode('none');
    else if (Math.abs(vat - vatFromGross(amt)) < 0.02) setVatMode('included');
    else setVatMode('manual');
    setVatManual(vat ? String(vat) : '');
    setDocNumber(i.מספר_מסמך ?? '');
    setPaymentMethod(i.אמצעי_תשלום ?? '');
    setNotes(i.הערות ?? '');
    setLongTerm(i.השקעה_לטווח_ארוך === true);
    setBox(i.קופה ? expenseBox(i) : defaultBox);
  }, [open, initial, defaultBox]);

  const amountNum = Number(amount) || 0;
  const vat = vatMode === 'none' ? 0 : vatMode === 'included' ? vatFromGross(amountNum) : round2(Number(vatManual) || 0);

  function onCategoryChange(v: string) {
    setCategory(v);
    if (!editing && NO_VAT_CATEGORIES.has(v)) setVatMode('none');
  }

  async function save() {
    if (!date) return toast.error('יש לבחור תאריך');
    if (!category) return toast.error('יש לבחור קטגוריה');
    if (!(amountNum > 0)) return toast.error('יש להזין סכום');
    if (vat > amountNum) return toast.error('המע״מ לא יכול להיות גדול מהסכום');
    setSaving(true);
    try {
      const body = {
        תאריך: date,
        ספק_id: supplierId || null,
        שם_ספק: supplierId ? suppliers.find(s => s.id === supplierId)?.שם_ספק ?? null : payee.trim() || null,
        קטגוריה: category,
        תיאור: description,
        סכום: amountNum,
        מעמ: vat,
        מספר_מסמך: docNumber,
        אמצעי_תשלום: paymentMethod,
        הערות: notes,
        ...(longTermReady ? { השקעה_לטווח_ארוך: longTerm } : {}),
        ...(boxReady ? { קופה: box } : {}),
      };
      const res = await fetch(editing ? `/api/finance/expenses/${initial!.id}` : '/api/finance/expenses', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'השמירה נכשלה');
      toast.success(editing ? 'ההוצאה עודכנה' : 'ההוצאה נשמרה');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'השמירה נכשלה');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'עריכת הוצאה' : 'הוצאה חדשה'} size="lg">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="תאריך" type="date" required value={date} onChange={e => setDate(e.target.value)} />
        <div className="space-y-1">
          <label className="block text-xs font-medium" style={{ color: C.sub }}>קטגוריה<span style={{ color: C.red }}>*</span></label>
          <select className={selectCls} value={category} onChange={e => onCategoryChange(e.target.value)}>
            <option value="">בחרי קטגוריה…</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium" style={{ color: C.sub }}>ספק</label>
          <select className={selectCls} value={supplierId} onChange={e => setSupplierId(e.target.value)}>
            <option value="">— לא ספק מהרשימה —</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.שם_ספק}</option>)}
          </select>
        </div>
        {!supplierId ? (
          <Input label="שם המקבל (עובד / חברת חשמל / ספק אחר)" value={payee} onChange={e => setPayee(e.target.value)} placeholder="למשל: חברת החשמל" />
        ) : <div />}
        <div className="sm:col-span-2">
          <Input label="תיאור" value={description} onChange={e => setDescription(e.target.value)} placeholder="למשל: שוקולד בלגי 10 ק״ג / משכורת ספטמבר" />
        </div>
        <Input label="סכום ששולם (₪)" type="number" inputMode="decimal" min="0" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} />
        <div className="space-y-1">
          <label className="block text-xs font-medium" style={{ color: C.sub }}>מע״מ</label>
          <select className={selectCls} value={vatMode} onChange={e => setVatMode(e.target.value as VatMode)}>
            <option value="included">הסכום כולל מע״מ 18%</option>
            <option value="none">ללא מע״מ (משכורות, ביטוח, עוסק פטור…)</option>
            <option value="manual">סכום מע״מ ידני</option>
          </select>
          {vatMode === 'manual' && (
            <input className={selectCls} type="number" min="0" step="0.01" value={vatManual} onChange={e => setVatManual(e.target.value)} placeholder="סכום המע״מ" />
          )}
          <p className="text-xs" style={{ color: C.faint }}>
            מע״מ: {money(vat)} · לפני מע״מ: {money(round2(amountNum - vat))}
          </p>
        </div>
        <Input label="מס׳ חשבונית / אסמכתא" value={docNumber} onChange={e => setDocNumber(e.target.value)} />
        <div className="space-y-1">
          <label className="block text-xs font-medium" style={{ color: C.sub }}>אמצעי תשלום</label>
          <select className={selectCls} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
            <option value="">—</option>
            {paymentMethods.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <Input label="הערות" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <div className="sm:col-span-2 space-y-1">
          <label className="block text-xs font-medium" style={{ color: C.sub }}>קופה</label>
          <select className={selectCls} value={box} disabled={!boxReady} onChange={e => setBox(e.target.value as ExpenseBox)}>
            {EXPENSE_BOXES.map(b => <option key={b} value={b}>{EXPENSE_BOX_LABEL[b]}</option>)}
          </select>
          <p className="text-xs" style={{ color: C.faint }}>
            {!boxReady
              ? 'כדי לבחור קופה — יש להריץ את מיגרציה 065 ב-Supabase SQL Editor.'
              : box === 'קורסים'
                ? 'הוצאה של הקורסים — לא נכנסת להוצאות של העסק ולרווח והפסד, מוצגת בלשונית "קופת קורסים".'
                : box === 'בית'
                  ? 'הוצאה של הבית — לא נכנסת להוצאות של העסק ולרווח והפסד, מוצגת בלשונית "קופת בית". (דורש הרצה של מיגרציה 072 ב-Supabase)'
                  : 'הוצאה רגילה של העסק.'}
          </p>
        </div>
        <div className="sm:col-span-2 rounded-lg px-3 py-2.5" style={{ border: `1px solid ${C.border}`, backgroundColor: longTerm ? '#FBF6EE' : undefined }}>
          <label className="flex items-start gap-2 text-sm" style={{ color: longTermReady ? C.text : C.faint, cursor: longTermReady ? 'pointer' : 'not-allowed' }}>
            <input type="checkbox" className="mt-0.5" checked={longTerm} disabled={!longTermReady} onChange={e => setLongTerm(e.target.checked)} />
            <span>
              <b>השקעה לטווח ארוך</b> — ציוד שלא מתכלה (מקרר, תנור, שולחנות, מכונות…)
              <span className="block text-xs mt-0.5" style={{ color: C.sub }}>
                {longTermReady
                  ? 'לא נכנסת להוצאות החודשיות ולממוצע החודשי — מוצגת בנפרד ברווח והפסד.'
                  : 'כדי לסמן — יש להריץ את מיגרציה 062 ב-Supabase SQL Editor.'}
              </span>
            </span>
          </label>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="outline" onClick={onClose}>ביטול</Button>
        <Button onClick={save} loading={saving}>{editing ? 'שמירת שינויים' : 'הוספת הוצאה'}</Button>
      </div>
    </Modal>
  );
}
