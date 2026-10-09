'use client';

import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useOptionList } from '@/hooks/useOptionList';
import { NO_VAT_CATEGORIES } from '@/lib/finance';
import {
  detectHeaderRow, guessMapping, parseRows, FIELD_LABELS,
  type FieldKey, type RawCell,
} from '@/lib/finance-import-parse';
import { fmtDate } from '@/lib/finance-export';
import { C, money, Th, Td, THEAD_STYLE } from './shared';

const selectCls = 'w-full px-2 py-1.5 text-sm rounded-lg border border-[#E8DED2] bg-white focus:outline-none focus:border-[#C9A46A]';
const FIELDS: FieldKey[] = ['date', 'amount', 'payee', 'category', 'description', 'vat', 'net', 'docNumber'];

/** Reads xlsx/xls/csv into a grid of raw cells (first sheet). */
async function readGrid(file: File): Promise<RawCell[][]> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  let wb;
  if (/\.csv$/i.test(file.name) || file.type === 'text/csv') {
    // Israeli bookkeeping exports are often windows-1255, not UTF-8.
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch {
      text = new TextDecoder('windows-1255').decode(buf);
    }
    // raw: keep dates as text so 01/02/2026 isn't read month-first.
    wb = XLSX.read(text.replace(/^﻿/, ''), { type: 'string', raw: true });
  } else {
    wb = XLSX.read(buf, { type: 'array' });
  }
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<RawCell[]>(ws, { header: 1, raw: true, defval: null, blankrows: false });
}

export default function ExpenseImportModal({ open, onClose, onImported }: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const { values: categories } = useOptionList('expense_categories');
  const [fileName, setFileName] = useState('');
  const [grid, setGrid] = useState<RawCell[][]>([]);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<Record<FieldKey, number> | null>(null);
  const [defaultCategory, setDefaultCategory] = useState('ספקים וחומרי גלם');
  const [assumeVat, setAssumeVat] = useState(true);
  const [importing, setImporting] = useState(false);

  function reset() {
    setFileName(''); setGrid([]); setHeaderRow(0); setMapping(null);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return toast.error('הקובץ גדול מדי (עד 10MB)');
    try {
      const g = await readGrid(file);
      if (g.length < 2) return toast.error('לא נמצאו שורות בקובץ');
      const h = detectHeaderRow(g);
      setFileName(file.name);
      setGrid(g);
      setHeaderRow(h);
      setMapping(guessMapping(g[h] ?? []));
    } catch (e) {
      console.error('[expense import] read failed', e instanceof Error ? e.message : e);
      toast.error('לא ניתן לקרוא את הקובץ. נסי לשמור אותו כ-Excel (xlsx) או CSV.');
    }
  }

  const headers = grid[headerRow] ?? [];
  const columnCount = Math.max(0, ...grid.slice(headerRow, headerRow + 50).map(r => r.length));

  const parsed = useMemo(() => {
    if (!mapping) return [];
    return parseRows(grid.slice(headerRow + 1), headerRow + 2, {
      mapping, defaultCategory, assumeVatIncluded: assumeVat, noVatCategories: NO_VAT_CATEGORIES,
    });
  }, [grid, headerRow, mapping, defaultCategory, assumeVat]);

  const ok = parsed.filter(r => r.ok);
  const bad = parsed.filter(r => !r.ok);
  const total = ok.reduce((s, r) => s + r.data!.סכום, 0);

  async function doImport() {
    if (!ok.length) return;
    setImporting(true);
    try {
      const res = await fetch('/api/finance/expenses/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: ok.map(r => r.data) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'הייבוא נכשל');
      toast.success(`נקלטו ${json.inserted} הוצאות${json.duplicates ? ` · ${json.duplicates} כבר היו קיימות ודולגו` : ''}`, { duration: 6000 });
      onImported();
      reset();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'הייבוא נכשל');
    } finally {
      setImporting(false);
    }
  }

  const colLabel = (i: number) => {
    const h = String(headers[i] ?? '').trim();
    return h ? `${h}` : `עמודה ${i + 1}`;
  };

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="ייבוא הוצאות מקובץ (הנהלת חשבונות)" size="xl">
      <div className="space-y-4">
        <div className="text-sm space-y-1" style={{ color: C.sub }}>
          <p>מעלים קובץ Excel או CSV שמייצאים מהנהלת החשבונות (כרטסת ספקים / דוח הוצאות). המערכת מזהה את העמודות לבד — אפשר לתקן את ההתאמה למטה לפני הייבוא.</p>
          <p>ייבוא חוזר של אותו קובץ לא יכפיל הוצאות — שורה עם אותו תאריך, סכום, ספק ומס׳ מסמך מדולגת.</p>
        </div>

        <label className="flex items-center justify-center gap-2 rounded-xl px-4 py-5 cursor-pointer text-sm"
          style={{ border: `2px dashed ${C.border}`, backgroundColor: C.soft, color: C.brand }}>
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={e => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
          {fileName ? `📄 ${fileName} — לחצי להחלפה` : '📂 בחירת קובץ Excel / CSV'}
        </label>

        {mapping && (
          <>
            <div className="rounded-xl p-4 space-y-3" style={{ border: `1px solid ${C.border}` }}>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span style={{ color: C.sub }}>שורת הכותרות היא שורה</span>
                <select className={`${selectCls} !w-auto`} value={headerRow}
                  onChange={e => { const h = Number(e.target.value); setHeaderRow(h); setMapping(guessMapping(grid[h] ?? [])); }}>
                  {grid.slice(0, 25).map((_, i) => <option key={i} value={i}>{i + 1}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {FIELDS.map(f => (
                  <div key={f} className="space-y-1">
                    <label className="block text-xs font-medium" style={{ color: C.sub }}>
                      {FIELD_LABELS[f]}{(f === 'date' || f === 'amount') && <span style={{ color: C.red }}>*</span>}
                    </label>
                    <select className={selectCls} value={mapping[f]}
                      onChange={e => setMapping({ ...mapping, [f]: Number(e.target.value) })}>
                      <option value={-1}>— אין —</option>
                      {Array.from({ length: columnCount }, (_, i) => <option key={i} value={i}>{colLabel(i)}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-medium" style={{ color: C.sub }}>קטגוריה לשורות בלי קטגוריה</label>
                  <select className={selectCls} value={defaultCategory} onChange={e => setDefaultCategory(e.target.value)}>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                {mapping.vat < 0 && mapping.net < 0 && (
                  <label className="flex items-center gap-2 text-sm mt-5" style={{ color: C.text }}>
                    <input type="checkbox" checked={assumeVat} onChange={e => setAssumeVat(e.target.checked)} />
                    אין עמודת מע״מ — הסכומים כוללים מע״מ 18% (משכורות/ביטוחים תמיד ללא מע״מ)
                  </label>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-4 text-sm">
              <span style={{ color: C.green }}>✓ {ok.length} שורות תקינות · סה״כ {money(total)}</span>
              {bad.length > 0 && <span style={{ color: C.red }}>✗ {bad.length} שורות ידולגו</span>}
            </div>

            <div className="rounded-xl overflow-auto" style={{ border: `1px solid ${C.border}`, maxHeight: '38vh' }}>
              <table className="w-full">
                <thead className="sticky top-0" style={THEAD_STYLE}>
                  <tr><Th>שורה</Th><Th>תאריך</Th><Th>ספק / שם</Th><Th>קטגוריה</Th><Th>תיאור</Th><Th>סכום</Th><Th>מע״מ</Th><Th>מס׳ מסמך</Th></tr>
                </thead>
                <tbody>
                  {parsed.slice(0, 300).map(r => (
                    <tr key={r.line} style={{ borderTop: `1px solid ${C.border}`, backgroundColor: r.ok ? undefined : C.redBg }}>
                      <Td style={{ color: C.faint }}>{r.line}</Td>
                      {r.ok ? (
                        <>
                          <Td>{fmtDate(r.data!.תאריך)}</Td>
                          <Td>{r.data!.שם_ספק ?? '—'}</Td>
                          <Td>{r.data!.קטגוריה}</Td>
                          <Td className="max-w-[220px] truncate">{r.data!.תיאור ?? ''}</Td>
                          <Td className="tabular-nums">{money(r.data!.סכום)}</Td>
                          <Td className="tabular-nums">{money(r.data!.מעמ)}</Td>
                          <Td>{r.data!.מספר_מסמך ?? ''}</Td>
                        </>
                      ) : (
                        <td colSpan={7} className="px-3 py-2 text-xs" style={{ color: C.red }}>{r.error}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.length > 300 && (
                <p className="text-xs p-2" style={{ color: C.faint }}>מוצגות 300 השורות הראשונות — כל {ok.length} השורות התקינות ייובאו.</p>
              )}
            </div>
          </>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>ביטול</Button>
          <Button onClick={doImport} loading={importing} disabled={!ok.length}>ייבוא {ok.length ? `${ok.length} הוצאות` : ''}</Button>
        </div>
      </div>
    </Modal>
  );
}
