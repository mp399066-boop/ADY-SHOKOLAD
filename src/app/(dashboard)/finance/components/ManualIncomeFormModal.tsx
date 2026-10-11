'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useOptionList } from '@/hooks/useOptionList';
import { vatFromGross, round2, todayJerusalem } from '@/lib/finance';
import type { ManualIncome } from '@/lib/finance-manual-income';
import { C, money } from './shared';

type VatMode = 'included' | 'none' | 'manual';

const selectCls = 'w-full px-3 py-2 text-sm rounded-lg border border-[#E8DED2] bg-white focus:outline-none focus:border-[#C9A46A]';

export default function ManualIncomeFormModal({ open, initial, onClose, onSaved }: {
  open: boolean;
  /** Existing income to edit (has id) or a template to duplicate (no id). */
  initial: Partial<ManualIncome> | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { values: categories } = useOptionList('income_categories', initial?.קטגוריה ?? null);
  const { values: paymentMethods } = useOptionList('payment_methods', initial?.אמצעי_תשלום ?? null);

  const [date, setDate] = useState('');
  const [category, setCategory] = useState('');
  const [payer, setPayer] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [vatMode, setVatMode] = useState<VatMode>('included');
  const [vatManual, setVatManual] = useState('');
  const [docNumber, setDocNumber] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paid, setPaid] = useState(true);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const editing = !!initial?.id;

  useEffect(() => {
    if (!open) return;
    const i = initial ?? {};
    setDate(i.תאריך ?? todayJerusalem());
    setCategory(i.קטגוריה ?? '');
    setPayer(i.שם_לקוח ?? '');
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
    setPaid(i.שולם !== false);
    setNotes(i.הערות ?? '');
  }, [open, initial]);

  const amountNum = Number(amount) || 0;
  const vat = vatMode === 'none' ? 0 : vatMode === 'included' ? vatFromGross(amountNum) : round2(Number(vatManual) || 0);

  async function save() {
    if (!date) return toast.error('יש לבחור תאריך');
    if (!category) return toast.error('יש לבחור קטגוריה');
    if (!(amountNum > 0)) return toast.error('יש להזין סכום');
    if (vat > amountNum) return toast.error('המע״מ לא יכול להיות גדול מהסכום');
    setSaving(true);
    try {
      const body = {
        תאריך: date,
        שם_לקוח: payer,
        קטגוריה: category,
        תיאור: description,
        סכום: amountNum,
        מעמ: vat,
        מספר_מסמך: docNumber,
        אמצעי_תשלום: paymentMethod,
        שולם: paid,
        הערות: notes,
      };
      const res = await fetch(editing ? `/api/finance/manual-income/${initial!.id}` : '/api/finance/manual-income', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'השמירה נכשלה');
      toast.success(editing ? 'ההכנסה עודכנה' : 'ההכנסה נשמרה');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'השמירה נכשלה');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'עריכת הכנסה' : 'הכנסה חדשה'} size="lg">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="תאריך" type="date" required value={date} onChange={e => setDate(e.target.value)} />
        <div className="space-y-1">
          <label className="block text-xs font-medium" style={{ color: C.sub }}>קטגוריה<span style={{ color: C.red }}>*</span></label>
          <select className={selectCls} value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">בחרי קטגוריה…</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <Input label="ממי / מקור ההכנסה" value={payer} onChange={e => setPayer(e.target.value)} placeholder="למשל: שם הלקוח / סדנת חנוכה" />
        <Input label="תיאור" value={description} onChange={e => setDescription(e.target.value)} placeholder="למשל: סדנת שוקולד ל-12 משתתפים" />
        <Input label="סכום שהתקבל (₪)" type="number" inputMode="decimal" min="0" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} />
        <div className="space-y-1">
          <label className="block text-xs font-medium" style={{ color: C.sub }}>מע״מ</label>
          <select className={selectCls} value={vatMode} onChange={e => setVatMode(e.target.value as VatMode)}>
            <option value="included">הסכום כולל מע״מ 18%</option>
            <option value="none">ללא מע״מ</option>
            <option value="manual">סכום מע״מ ידני</option>
          </select>
          {vatMode === 'manual' && (
            <input className={selectCls} type="number" min="0" step="0.01" value={vatManual} onChange={e => setVatManual(e.target.value)} placeholder="סכום המע״מ" />
          )}
          <p className="text-xs" style={{ color: C.faint }}>
            מע״מ: {money(vat)} · נכנס לכיס (לפני מע״מ): {money(round2(amountNum - vat))}
          </p>
        </div>
        <Input label="מס׳ חשבונית / קבלה" value={docNumber} onChange={e => setDocNumber(e.target.value)} />
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
        <div className="sm:col-span-2 rounded-lg px-3 py-2.5" style={{ border: `1px solid ${C.border}`, backgroundColor: paid ? undefined : C.amberBg }}>
          <label className="flex items-start gap-2 text-sm cursor-pointer" style={{ color: C.text }}>
            <input type="checkbox" className="mt-0.5" checked={paid} onChange={e => setPaid(e.target.checked)} />
            <span>
              <b>הכסף כבר התקבל</b>
              <span className="block text-xs mt-0.5" style={{ color: C.sub }}>
                בלי סימון — ההכנסה נספרת וגם מופיעה בעמודות &quot;טרם שולם&quot;, כמו הזמנה שלא שולמה.
              </span>
            </span>
          </label>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="outline" onClick={onClose}>ביטול</Button>
        <Button onClick={save} loading={saving}>{editing ? 'שמירת שינויים' : 'הוספת הכנסה'}</Button>
      </div>
    </Modal>
  );
}
