'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useOptionList } from '@/hooks/useOptionList';
import { todayJerusalem } from '@/lib/finance';
import { fmtDate } from '@/lib/finance-export';
import { C, money, Th, Td, THEAD_STYLE, TOTAL_ROW_STYLE } from './shared';

type RowStatus = 'new' | 'synced' | 'manual-duplicate';
interface PreviewRow {
  תאריך: string;
  שם_ספק: string | null;
  תיאור: string | null;
  סכום: number;
  מעמ: number;
  מספר_מסמך: string | null;
  אמצעי_תשלום: string | null;
  מזהה_חיצוני: string;
  status: RowStatus;
}
interface SyncResult {
  dryRun: boolean;
  counts: { fetched: number; new: number; synced: number; manualDuplicate: number; skipped: number; newTotal: number; inserted?: number };
  preview?: PreviewRow[];
  skipped: { label: string; reason: string }[];
}

const STATUS: Record<RowStatus, { label: string; fg: string; bg: string }> = {
  new: { label: 'חדשה — תיקלט', fg: C.green, bg: C.greenBg },
  synced: { label: 'כבר נקלטה', fg: C.sub, bg: '#F0EAE0' },
  'manual-duplicate': { label: 'כבר הוזנה ידנית — תדלג', fg: C.amber, bg: C.amberBg },
};

const inputCls = 'px-3 py-1.5 text-sm rounded-lg border border-[#E8DED2] bg-white focus:outline-none focus:border-[#C9A46A]';

/** Pull supplier invoices from Morning's expenses module (preview first, then import). */
export default function MorningSyncModal({ open, onClose, onSynced, year }: {
  open: boolean;
  onClose: () => void;
  onSynced: () => void;
  year: number;
}) {
  const { values: categories } = useOptionList('expense_categories');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [category, setCategory] = useState('ספקים וחומרי גלם');
  const [busy, setBusy] = useState<'check' | 'import' | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const today = todayJerusalem();
    setFromDate(`${year}-01-01`);
    setToDate(today.startsWith(String(year)) ? today : `${year}-12-31`);
    setResult(null);
    setError(null);
  }, [open, year]);

  async function run(dryRun: boolean) {
    setBusy(dryRun ? 'check' : 'import');
    setError(null);
    try {
      const res = await fetch('/api/finance/expenses/sync-morning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromDate, toDate, category, dryRun }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'הסנכרון נכשל');
      if (dryRun) {
        setResult(json as SyncResult);
      } else {
        const c = (json as SyncResult).counts;
        toast.success(`נקלטו ${c.inserted ?? 0} הוצאות ממורנינג`, { duration: 6000 });
        onSynced();
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'הסנכרון נכשל');
    } finally {
      setBusy(null);
    }
  }

  const c = result?.counts;
  const rows = result?.preview ?? [];

  return (
    <Modal open={open} onClose={onClose} title="סנכרון הוצאות ממורנינג (חשבונית ירוקה)" size="xl">
      <div className="space-y-4">
        <p className="text-sm" style={{ color: C.sub }}>
          מושך את חשבוניות הספקים שנמצאות במורנינג תחת &quot;הוצאות&quot; (סרוקות / מועלות שם). קודם בודקים מה ייקלט,
          ואז מאשרים. אפשר לסנכרן שוב בכל פעם — הוצאה שכבר נקלטה לא תיכנס פעמיים, וחשבונית שכבר הוזנה ידנית תדלג.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-xs" style={{ color: C.sub }}>
            <div>מתאריך</div>
            <input type="date" className={inputCls} value={fromDate} onChange={e => { setFromDate(e.target.value); setResult(null); }} />
          </label>
          <label className="space-y-1 text-xs" style={{ color: C.sub }}>
            <div>עד תאריך</div>
            <input type="date" className={inputCls} value={toDate} onChange={e => { setToDate(e.target.value); setResult(null); }} />
          </label>
          <label className="space-y-1 text-xs" style={{ color: C.sub }}>
            <div>קטגוריה להוצאות שייקלטו</div>
            <select className={inputCls} value={category} onChange={e => { setCategory(e.target.value); setResult(null); }}>
              {categories.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
          <Button variant="outline" onClick={() => run(true)} loading={busy === 'check'} disabled={busy !== null || !fromDate || !toDate}>
            בדיקה — מה ייקלט?
          </Button>
        </div>

        {error && <div className="rounded-lg p-3 text-sm" style={{ backgroundColor: C.redBg, color: C.red }}>{error}</div>}

        {c && (
          <>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <span>נמצאו במורנינג: <b>{c.fetched}</b></span>
              <span style={{ color: C.green }}>חדשות שייקלטו: <b>{c.new}</b> ({money(c.newTotal)})</span>
              {c.synced > 0 && <span style={{ color: C.sub }}>כבר נקלטו בעבר: {c.synced}</span>}
              {c.manualDuplicate > 0 && <span style={{ color: C.amber }}>כבר הוזנו ידנית: {c.manualDuplicate}</span>}
              {c.skipped > 0 && <span style={{ color: C.red }}>לא ייקלטו: {c.skipped}</span>}
            </div>

            {rows.length > 0 && (
              <div className="rounded-xl overflow-auto" style={{ border: `1px solid ${C.border}`, maxHeight: '45vh' }}>
                <table className="w-full">
                  <thead className="sticky top-0" style={THEAD_STYLE}>
                    <tr><Th>תאריך</Th><Th>ספק</Th><Th>מס׳ מסמך</Th><Th>תיאור</Th><Th>לפני מע״מ</Th><Th>מע״מ</Th><Th>כולל מע״מ</Th><Th>אמצעי תשלום</Th><Th>מצב</Th></tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.מזהה_חיצוני} style={{ borderTop: `1px solid ${C.border}`, opacity: r.status === 'new' ? 1 : 0.6 }}>
                        <Td>{fmtDate(r.תאריך)}</Td>
                        <Td className="font-medium">{r.שם_ספק ?? '—'}</Td>
                        <Td>{r.מספר_מסמך ?? ''}</Td>
                        <Td className="max-w-[200px] truncate" style={{ color: C.sub }}>{r.תיאור ?? ''}</Td>
                        <Td className="tabular-nums">{money(r.סכום - r.מעמ)}</Td>
                        <Td className="tabular-nums">{money(r.מעמ)}</Td>
                        <Td className="tabular-nums font-semibold">{money(r.סכום)}</Td>
                        <Td>{r.אמצעי_תשלום ?? 'לא צוין'}</Td>
                        <Td>
                          <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: STATUS[r.status].fg, backgroundColor: STATUS[r.status].bg }}>
                            {STATUS[r.status].label}
                          </span>
                        </Td>
                      </tr>
                    ))}
                    <tr style={TOTAL_ROW_STYLE}>
                      <Td className="font-bold">סה״כ חדשות</Td><Td /><Td /><Td className="font-bold">{c.new} הוצאות</Td>
                      <Td className="font-bold tabular-nums">{money(rows.filter(r => r.status === 'new').reduce((t, r) => t + r.סכום - r.מעמ, 0))}</Td>
                      <Td className="font-bold tabular-nums">{money(rows.filter(r => r.status === 'new').reduce((t, r) => t + r.מעמ, 0))}</Td>
                      <Td className="font-bold tabular-nums">{money(c.newTotal)}</Td>
                      <Td /><Td />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {result!.skipped.length > 0 && (
              <div className="text-xs space-y-0.5" style={{ color: C.red }}>
                <div className="font-medium">לא ייקלטו (כדאי להזין ידנית אם צריך):</div>
                {result!.skipped.slice(0, 20).map((s, i) => <div key={i}>• {s.label} — {s.reason}</div>)}
              </div>
            )}
          </>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>סגירה</Button>
          <Button onClick={() => run(false)} loading={busy === 'import'} disabled={busy !== null || !c || c.new === 0}>
            {c ? `קליטת ${c.new} הוצאות` : 'קליטה'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
