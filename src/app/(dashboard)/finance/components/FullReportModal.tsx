'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { createClient } from '@/lib/supabase/client';
import { HEBREW_MONTHS, type FinanceOrder, type Expense, type DateBasis } from '@/lib/finance';
import { buildFinanceReport } from '@/lib/finance-report';
import { downloadReportPdf, downloadReportExcel } from '@/lib/finance-export';
import { C } from './shared';

const DEFAULT_BUSINESS = 'עדי תכשיט שוקולד';

export default function FullReportModal({ open, onClose, orders, expenses, year, basis, expensesReady }: {
  open: boolean;
  onClose: () => void;
  orders: FinanceOrder[];
  expenses: Expense[];
  year: number;
  basis: DateBasis;
  expensesReady: boolean;
}) {
  const [month, setMonth] = useState<number | null>(null);
  const [busy, setBusy] = useState<'pdf' | 'excel' | null>(null);
  const [businessName, setBusinessName] = useState(DEFAULT_BUSINESS);

  useEffect(() => {
    if (!open) return;
    createClient().from('business_settings').select('business_name').single()
      .then(({ data }: { data: { business_name?: string } | null }) => { if (data?.business_name) setBusinessName(data.business_name); });
  }, [open]);

  async function run(kind: 'pdf' | 'excel') {
    setBusy(kind);
    try {
      const report = buildFinanceReport({ orders, expenses, year, month, basis, expensesReady });
      if (kind === 'pdf') await downloadReportPdf(report, businessName);
      else await downloadReportExcel(report);
      toast.success('הדוח הורד');
    } catch (e) {
      console.error('[finance full report]', kind, e instanceof Error ? e.message : e);
      toast.error('הפקת הדוח נכשלה');
    } finally {
      setBusy(null);
    }
  }

  const btn = 'flex-1 flex flex-col items-center gap-1 rounded-xl px-4 py-4 text-sm font-semibold disabled:opacity-50 transition-colors';

  return (
    <Modal open={open} onClose={onClose} title="הורדת דוח פיננסי מלא" size="md">
      <div className="space-y-4">
        <div className="space-y-1">
          <label className="block text-xs font-medium" style={{ color: C.sub }}>תקופה</label>
          <select
            className="w-full px-3 py-2 text-sm rounded-lg border border-[#E8DED2] bg-white focus:outline-none focus:border-[#C9A46A]"
            value={month ?? ''} onChange={e => setMonth(e.target.value ? Number(e.target.value) : null)}>
            <option value="">כל שנת {year}</option>
            {HEBREW_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m} {year}</option>)}
          </select>
        </div>

        <div className="text-xs rounded-lg p-3 space-y-0.5" style={{ backgroundColor: C.soft, color: C.sub }}>
          <div className="font-medium" style={{ color: C.text }}>הדוח כולל:</div>
          <div>• סיכום: הכנסות ללא משלוחים, משלוחים, כולל משלוחים, טרם שולם{expensesReady ? ', הוצאות ורווח/הפסד' : ''}</div>
          {month === null && <div>• הכנסות לפי חודש{expensesReady ? ' + רווח והפסד לפי חודש' : ''}</div>}
          {expensesReady && <div>• הוצאות לפי קטגוריה ולפי ספק</div>}
          <div>• הכנסות לפי לקוח</div>
          <div>• פירוט כל ההזמנות{expensesReady ? ' וכל ההוצאות' : ''}</div>
          <div className="pt-1">{basis === 'order' ? 'הזמנות לפי תאריך הזמנה' : 'הזמנות לפי תאריך אספקה'} (כפי שנבחר בראש העמוד).</div>
        </div>

        <div className="flex gap-3">
          <button className={btn} disabled={busy !== null} onClick={() => run('pdf')}
            style={{ border: `1px solid ${C.border}`, color: C.red, backgroundColor: '#fff' }}>
            <span className="text-2xl">📄</span>
            {busy === 'pdf' ? 'מכין PDF…' : 'הורדה כ-PDF'}
          </button>
          <button className={btn} disabled={busy !== null} onClick={() => run('excel')}
            style={{ border: `1px solid ${C.border}`, color: '#1D6F42', backgroundColor: '#fff' }}>
            <span className="text-2xl">📊</span>
            {busy === 'excel' ? 'מכין אקסל…' : 'הורדה כאקסל'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
