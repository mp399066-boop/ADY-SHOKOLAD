'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { createClient } from '@/lib/supabase/client';
import { HEBREW_MONTHS, type FinanceOrder, type Expense, type DateBasis } from '@/lib/finance';
import { buildFinanceReport, type FinanceReport } from '@/lib/finance-report';
import { buildReportPdf, downloadPdfBlob, downloadReportExcel } from '@/lib/finance-export';
import { C } from './shared';

const DEFAULT_BUSINESS = 'עדי תכשיט שוקולד';

type Busy = 'view' | 'pdf' | 'excel' | null;

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
  const [busy, setBusy] = useState<Busy>(null);
  const [businessName, setBusinessName] = useState(DEFAULT_BUSINESS);
  // Generated PDF, kept so "download" after "view" doesn't rebuild it.
  const [pdf, setPdf] = useState<{ blob: Blob; url: string; report: FinanceReport; key: string } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const cacheKey = `${year}|${month ?? 'all'}|${basis}|${orders.length}|${expenses.length}`;

  useEffect(() => {
    if (!open) return;
    createClient().from('business_settings').select('business_name').single()
      .then(({ data }: { data: { business_name?: string } | null }) => { if (data?.business_name) setBusinessName(data.business_name); });
  }, [open]);

  // Free the blob URL when it's replaced or the dialog unmounts.
  useEffect(() => () => { if (pdf) URL.revokeObjectURL(pdf.url); }, [pdf]);

  const makeReport = () => buildFinanceReport({ orders, expenses, year, month, basis, expensesReady });

  async function getPdf() {
    if (pdf && pdf.key === cacheKey) return pdf;
    const report = makeReport();
    const blob = await buildReportPdf(report, businessName);
    const next = { blob, url: URL.createObjectURL(blob), report, key: cacheKey };
    setPdf(next);
    return next;
  }

  async function run(kind: Exclude<Busy, null>) {
    setBusy(kind);
    try {
      if (kind === 'excel') {
        await downloadReportExcel(makeReport());
        toast.success('האקסל הורד');
      } else if (kind === 'pdf') {
        const p = await getPdf();
        downloadPdfBlob(p.blob, p.report);
        toast.success('ה-PDF הורד');
      } else {
        await getPdf();
        setPreviewOpen(true);
      }
    } catch (e) {
      console.error('[finance full report]', kind, e instanceof Error ? e.message : e);
      toast.error('הפקת הדוח נכשלה');
    } finally {
      setBusy(null);
    }
  }

  const btn = 'flex-1 flex flex-col items-center gap-1 rounded-xl px-3 py-4 text-sm font-semibold disabled:opacity-50 transition-colors bg-white';
  const periodText = month ? `${HEBREW_MONTHS[month - 1]} ${year}` : `שנת ${year}`;

  return (
    <>
      <Modal open={open && !previewOpen} onClose={onClose} title="דוח פיננסי מלא" size="md">
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
            <div className="font-medium" style={{ color: C.text }}>הדוח כולל (כל הסכומים לפני מע״מ):</div>
            <div>• סיכום: כמה נכנס אלייך, ללא משלוחים, דמי משלוח, טרם שולם{expensesReady ? ', הוצאות ורווח/הפסד' : ''}</div>
            {month === null && <div>• הכנסות לפי חודש{expensesReady ? ' + רווח והפסד לפי חודש' : ''}</div>}
            {expensesReady && <div>• הוצאות לפי קטגוריה, לפי ספק ולפי אמצעי תשלום</div>}
            <div>• הכנסות לפי לקוח ולפי אמצעי תשלום</div>
            <div>• פירוט כל ההזמנות{expensesReady ? ' וכל ההוצאות' : ''}, כולל אמצעי התשלום</div>
            <div className="pt-1">{basis === 'order' ? 'הזמנות לפי תאריך הזמנה' : 'הזמנות לפי תאריך אספקה'} (כפי שנבחר בראש העמוד).</div>
          </div>

          <div className="flex gap-2">
            <button className={btn} disabled={busy !== null} onClick={() => run('view')}
              style={{ border: `1px solid ${C.gold}`, color: C.brand }}>
              <span className="text-2xl">👁️</span>
              {busy === 'view' ? 'מכין…' : 'צפייה ב-PDF'}
            </button>
            <button className={btn} disabled={busy !== null} onClick={() => run('pdf')}
              style={{ border: `1px solid ${C.border}`, color: C.red }}>
              <span className="text-2xl">📄</span>
              {busy === 'pdf' ? 'מכין…' : 'הורדת PDF'}
            </button>
            <button className={btn} disabled={busy !== null} onClick={() => run('excel')}
              style={{ border: `1px solid ${C.border}`, color: '#1D6F42' }}>
              <span className="text-2xl">📊</span>
              {busy === 'excel' ? 'מכין…' : 'הורדת אקסל'}
            </button>
          </div>
        </div>
      </Modal>

      {previewOpen && pdf && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: 'rgba(20,12,4,0.55)' }} dir="rtl">
          <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-white" style={{ borderBottom: `1px solid ${C.border}`, paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}>
            <div className="text-sm font-semibold flex-1" style={{ color: C.text }}>דוח פיננסי — {periodText}</div>
            <a href={pdf.url} target="_blank" rel="noreferrer"
              className="px-3 py-1.5 text-xs font-medium rounded-lg" style={{ border: `1px solid ${C.border}`, color: C.brand }}>
              פתיחה בחלון חדש
            </a>
            <button onClick={() => downloadPdfBlob(pdf.blob, pdf.report)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg text-white" style={{ backgroundColor: C.brand }}>
              הורדה
            </button>
            <button onClick={() => setPreviewOpen(false)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg" style={{ border: `1px solid ${C.border}`, color: C.sub }}>
              סגירה ✕
            </button>
          </div>
          <iframe src={pdf.url} title="דוח פיננסי" className="flex-1 w-full bg-white" />
        </div>
      )}
    </>
  );
}
