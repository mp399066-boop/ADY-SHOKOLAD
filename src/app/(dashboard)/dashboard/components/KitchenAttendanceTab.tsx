'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, LogIn, LogOut, Pencil, Plus, RefreshCw, Save, X } from 'lucide-react';
import { C } from './theme';

type Worker = {
  id: string;
  שם_עובדת: string;
  טלפון: string | null;
  תפקיד: string | null;
  פעילה: boolean;
  הערות: string | null;
};

type AttendanceRow = {
  id: string;
  עובדת_id: string;
  תאריך: string;
  שעת_כניסה: string | null;
  שעת_יציאה: string | null;
  סהכ_שעות: number | null;
  סטטוס: 'פתוח' | 'הושלם' | 'חסרה יציאה';
  הערות: string | null;
  עובדות_מטבח?: { שם_עובדת: string } | null;
};

type ApiData = {
  workers: Worker[];
  todayAttendance: AttendanceRow[];
  staleOpenAttendance: AttendanceRow[];
  report: AttendanceRow[];
  today: string;
  isAdmin: boolean;
};

type WorkerDraft = {
  שם_עובדת: string;
  טלפון: string;
  תפקיד: string;
  פעילה: boolean;
  הערות: string;
};

type RowDraft = {
  תאריך: string;
  שעת_כניסה: string;
  שעת_יציאה: string;
  סטטוס: 'פתוח' | 'הושלם' | 'חסרה יציאה';
  הערות: string;
};

const emptyWorker: WorkerDraft = { שם_עובדת: '', טלפון: '', תפקיד: '', פעילה: true, הערות: '' };

function trimTime(value: string | null | undefined): string {
  if (!value) return '';
  return value.slice(0, 5);
}

function hoursLabel(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return `${Number(value).toFixed(2)}`;
}

function statusTone(status: string) {
  if (status === 'בפנים עכשיו' || status === 'פתוח') return { bg: C.greenSoft, color: C.green, border: '#C9D9C7' };
  if (status === 'חסרה יציאה') return { bg: C.redSoft, color: C.red, border: '#E4C2BE' };
  if (status === 'יצאה היום' || status === 'הושלם') return { bg: C.blueSoft, color: C.blue, border: '#C8D8DF' };
  return { bg: C.amberSoft, color: C.amber, border: '#E7CFA9' };
}

export function KitchenAttendanceTab() {
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({ from: '', to: '', workerId: '' });
  const [workerDraft, setWorkerDraft] = useState<WorkerDraft>(emptyWorker);
  const [editingWorkerId, setEditingWorkerId] = useState<string | null>(null);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [rowDraft, setRowDraft] = useState<RowDraft | null>(null);

  const loadData = useCallback(async (nextFilters = filters) => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams();
    if (nextFilters.from) qs.set('from', nextFilters.from);
    if (nextFilters.to) qs.set('to', nextFilters.to);
    if (nextFilters.workerId) qs.set('workerId', nextFilters.workerId);
    try {
      const res = await fetch(`/api/kitchen-attendance?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'שגיאה בטעינת נוכחות');
      setData(json);
      setFilters(curr => ({
        from: curr.from || json.today,
        to: curr.to || json.today,
        workerId: curr.workerId,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת נוכחות');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeWorkers = useMemo(() => (data?.workers || []).filter(w => w.פעילה !== false), [data?.workers]);
  const todayByWorker = useMemo(() => {
    const map = new Map<string, AttendanceRow>();
    for (const row of data?.todayAttendance || []) {
      if (!map.has(row.עובדת_id) || row.סטטוס === 'פתוח') map.set(row.עובדת_id, row);
    }
    return map;
  }, [data?.todayAttendance]);
  const staleByWorker = useMemo(() => {
    const map = new Map<string, AttendanceRow>();
    for (const row of data?.staleOpenAttendance || []) if (!map.has(row.עובדת_id)) map.set(row.עובדת_id, row);
    return map;
  }, [data?.staleOpenAttendance]);

  async function clockIn(workerId: string) {
    setBusyId(workerId);
    setError(null);
    try {
      const res = await fetch('/api/kitchen-attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workerId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'כניסה נכשלה');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'כניסה נכשלה');
    } finally {
      setBusyId(null);
    }
  }

  async function clockOut(rowId: string) {
    setBusyId(rowId);
    setError(null);
    try {
      const res = await fetch(`/api/kitchen-attendance/${rowId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clock_out' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'יציאה נכשלה');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'יציאה נכשלה');
    } finally {
      setBusyId(null);
    }
  }

  async function saveWorker() {
    if (!data?.isAdmin) return;
    setBusyId('worker-save');
    setError(null);
    const path = editingWorkerId ? `/api/kitchen-attendance/workers/${editingWorkerId}` : '/api/kitchen-attendance/workers';
    try {
      const res = await fetch(path, {
        method: editingWorkerId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workerDraft),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'שמירת עובדת נכשלה');
      setWorkerDraft(emptyWorker);
      setEditingWorkerId(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שמירת עובדת נכשלה');
    } finally {
      setBusyId(null);
    }
  }

  async function toggleWorker(worker: Worker) {
    setBusyId(worker.id);
    setError(null);
    try {
      const res = await fetch(`/api/kitchen-attendance/workers/${worker.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ פעילה: !worker.פעילה }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'עדכון עובדת נכשל');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'עדכון עובדת נכשל');
    } finally {
      setBusyId(null);
    }
  }

  async function saveRow(rowId: string) {
    if (!rowDraft) return;
    setBusyId(rowId);
    setError(null);
    try {
      const res = await fetch(`/api/kitchen-attendance/${rowId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rowDraft),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'שמירת נוכחות נכשלה');
      setEditingRowId(null);
      setRowDraft(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שמירת נוכחות נכשלה');
    } finally {
      setBusyId(null);
    }
  }

  function startEditWorker(worker: Worker) {
    setEditingWorkerId(worker.id);
    setWorkerDraft({
      שם_עובדת: worker.שם_עובדת || '',
      טלפון: worker.טלפון || '',
      תפקיד: worker.תפקיד || '',
      פעילה: worker.פעילה !== false,
      הערות: worker.הערות || '',
    });
  }

  function startEditRow(row: AttendanceRow) {
    setEditingRowId(row.id);
    setRowDraft({
      תאריך: row.תאריך,
      שעת_כניסה: trimTime(row.שעת_כניסה),
      שעת_יציאה: trimTime(row.שעת_יציאה),
      סטטוס: row.סטטוס,
      הערות: row.הערות || '',
    });
  }

  if (loading && !data) {
    return (
      <section className="rounded-lg border p-4 text-sm font-semibold" style={{ backgroundColor: C.card, borderColor: C.border, color: C.textSoft }}>
        טוען נוכחות...
      </section>
    );
  }

  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold" style={{ color: C.text }}>נוכחות עובדות</h2>
          <p className="text-[11px]" style={{ color: C.textSoft }}>כניסה ויציאה מהירה לעובדות המטבח.</p>
        </div>
        <button
          type="button"
          onClick={() => loadData()}
          className="flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-bold"
          style={{ backgroundColor: C.card, borderColor: C.border, color: C.textSoft }}
        >
          <RefreshCw size={14} />
          רענון
        </button>
      </div>

      {error && (
        <div className="rounded-md border px-3 py-2 text-sm font-semibold" style={{ backgroundColor: C.redSoft, borderColor: '#E4C2BE', color: C.red }}>
          {error}
        </div>
      )}

      <section className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {activeWorkers.length === 0 ? (
          <div className="rounded-lg border p-4 text-sm font-semibold md:col-span-2 xl:col-span-3" style={{ backgroundColor: C.card, borderColor: C.border, color: C.textSoft }}>
            אין עובדות פעילות להצגה.
          </div>
        ) : activeWorkers.map(worker => {
          const todayRow = todayByWorker.get(worker.id);
          const staleRow = staleByWorker.get(worker.id);
          const openRow = todayRow?.סטטוס === 'פתוח' ? todayRow : null;
          const isStale = !openRow && !!staleRow;
          const status = isStale
            ? 'חסרה יציאה'
            : openRow
              ? 'בפנים עכשיו'
              : todayRow?.סטטוס === 'הושלם'
                ? 'יצאה היום'
                : 'לא נכנסה היום';
          const tone = statusTone(status);
          const buttonLabel = openRow ? 'יציאה' : 'כניסה';
          const disabled = isStale || busyId === worker.id || busyId === openRow?.id;
          return (
            <article key={worker.id} className="rounded-lg border p-3" style={{ backgroundColor: C.card, borderColor: C.border }}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold" style={{ color: C.text }}>{worker.שם_עובדת}</h3>
                  {worker.תפקיד && <p className="text-xs" style={{ color: C.textSoft }}>{worker.תפקיד}</p>}
                </div>
                <span className="rounded-full border px-2 py-1 text-[11px] font-bold" style={{ backgroundColor: tone.bg, borderColor: tone.border, color: tone.color }}>
                  {status}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-1 text-center">
                <Metric label="כניסה" value={trimTime(todayRow?.שעת_כניסה) || '-'} />
                <Metric label="יציאה" value={trimTime(todayRow?.שעת_יציאה) || '-'} />
                <Metric label="שעות" value={hoursLabel(todayRow?.סהכ_שעות)} />
              </div>

              <button
                type="button"
                disabled={disabled}
                onClick={() => openRow ? clockOut(openRow.id) : clockIn(worker.id)}
                className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-md border text-base font-bold disabled:opacity-50"
                style={{
                  backgroundColor: openRow ? C.red : C.espresso,
                  borderColor: openRow ? C.red : C.espresso,
                  color: '#FFFFFF',
                }}
              >
                {openRow ? <LogOut size={18} /> : <LogIn size={18} />}
                {isStale ? 'דורש תיקון' : buttonLabel}
              </button>
              {isStale && (
                <p className="mt-2 text-[11px] font-semibold" style={{ color: C.red }}>
                  קיימת כניסה פתוחה מ-{staleRow?.תאריך}. אדמין יכול לתקן בדוח.
                </p>
              )}
            </article>
          );
        })}
      </section>

      <section className="rounded-lg border p-3" style={{ backgroundColor: C.card, borderColor: C.border }}>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold" style={{ color: C.text }}>דוח נוכחות</h3>
            <p className="text-[11px]" style={{ color: C.textSoft }}>סינון לפי תאריכים ועובדת.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="מ">
              <input type="date" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} className="h-8 rounded-md border px-2 text-xs" style={{ borderColor: C.border }} />
            </Field>
            <Field label="עד">
              <input type="date" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} className="h-8 rounded-md border px-2 text-xs" style={{ borderColor: C.border }} />
            </Field>
            <Field label="עובדת">
              <select value={filters.workerId} onChange={e => setFilters(f => ({ ...f, workerId: e.target.value }))} className="h-8 rounded-md border px-2 text-xs" style={{ borderColor: C.border }}>
                <option value="">כולן</option>
                {(data?.workers || []).map(w => <option key={w.id} value={w.id}>{w.שם_עובדת}</option>)}
              </select>
            </Field>
            <button type="button" onClick={() => loadData(filters)} className="h-8 rounded-md border px-3 text-xs font-bold" style={{ backgroundColor: C.espresso, borderColor: C.espresso, color: '#FFFFFF' }}>
              סנן
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border" style={{ borderColor: C.borderSoft }}>
          <table className="min-w-[760px] w-full text-right text-xs">
            <thead style={{ backgroundColor: C.brandSoft, color: C.text }}>
              <tr>
                <Th>תאריך</Th>
                <Th>עובדת</Th>
                <Th>שעת כניסה</Th>
                <Th>שעת יציאה</Th>
                <Th>סה"כ שעות</Th>
                <Th>סטטוס</Th>
                <Th>הערות</Th>
                {data?.isAdmin && <Th>עריכה</Th>}
              </tr>
            </thead>
            <tbody>
              {(data?.report || []).length === 0 ? (
                <tr><td colSpan={data?.isAdmin ? 8 : 7} className="px-3 py-5 text-center font-semibold" style={{ color: C.textSoft }}>אין רשומות בטווח הזה.</td></tr>
              ) : (data?.report || []).map(row => {
                const editing = editingRowId === row.id && rowDraft;
                return (
                  <tr key={row.id} className="border-t" style={{ borderColor: C.borderSoft }}>
                    <Td>{editing ? <input type="date" value={rowDraft.תאריך} onChange={e => setRowDraft(d => d && { ...d, תאריך: e.target.value })} className="h-8 rounded-md border px-2" style={{ borderColor: C.border }} /> : row.תאריך}</Td>
                    <Td>{row.עובדות_מטבח?.שם_עובדת || '-'}</Td>
                    <Td>{editing ? <input type="time" value={rowDraft.שעת_כניסה} onChange={e => setRowDraft(d => d && { ...d, שעת_כניסה: e.target.value })} className="h-8 rounded-md border px-2" style={{ borderColor: C.border }} /> : trimTime(row.שעת_כניסה) || '-'}</Td>
                    <Td>{editing ? <input type="time" value={rowDraft.שעת_יציאה} onChange={e => setRowDraft(d => d && { ...d, שעת_יציאה: e.target.value })} className="h-8 rounded-md border px-2" style={{ borderColor: C.border }} /> : trimTime(row.שעת_יציאה) || '-'}</Td>
                    <Td>{hoursLabel(row.סהכ_שעות)}</Td>
                    <Td>{editing ? (
                      <select value={rowDraft.סטטוס} onChange={e => setRowDraft(d => d && { ...d, סטטוס: e.target.value as RowDraft['סטטוס'] })} className="h-8 rounded-md border px-2" style={{ borderColor: C.border }}>
                        <option value="פתוח">פתוח</option>
                        <option value="הושלם">הושלם</option>
                        <option value="חסרה יציאה">חסרה יציאה</option>
                      </select>
                    ) : <StatusBadge status={row.סטטוס} />}</Td>
                    <Td>{editing ? <input value={rowDraft.הערות} onChange={e => setRowDraft(d => d && { ...d, הערות: e.target.value })} className="h-8 w-40 rounded-md border px-2" style={{ borderColor: C.border }} /> : row.הערות || '-'}</Td>
                    {data?.isAdmin && (
                      <Td>
                        {editing ? (
                          <div className="flex gap-1">
                            <IconButton title="שמור" onClick={() => saveRow(row.id)}><Save size={14} /></IconButton>
                            <IconButton title="בטל" onClick={() => { setEditingRowId(null); setRowDraft(null); }}><X size={14} /></IconButton>
                          </div>
                        ) : (
                          <IconButton title="ערוך" onClick={() => startEditRow(row)}><Pencil size={14} /></IconButton>
                        )}
                      </Td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Monthly attendance summary — V1 ────────────────────────────────
          Self-contained card with its own month/year/worker selectors. Hits
          the same /api/kitchen-attendance endpoint with from/to set to the
          first/last day of the chosen month. Aggregates per-worker counts
          + total hours + missing-exit count, then renders the daily rows
          below. Excel export via dynamic xlsx import (already installed). */}
      <MonthlySummarySection workers={data?.workers || []} />

      {data?.isAdmin && (
        <section className="rounded-lg border p-3" style={{ backgroundColor: C.card, borderColor: C.border }}>
          <h3 className="mb-3 text-sm font-bold" style={{ color: C.text }}>ניהול עובדות</h3>
          <div className="grid gap-2 md:grid-cols-5">
            <input placeholder="שם עובדת" value={workerDraft.שם_עובדת} onChange={e => setWorkerDraft(d => ({ ...d, שם_עובדת: e.target.value }))} className="h-9 rounded-md border px-2 text-sm" style={{ borderColor: C.border }} />
            <input placeholder="טלפון" value={workerDraft.טלפון} onChange={e => setWorkerDraft(d => ({ ...d, טלפון: e.target.value }))} className="h-9 rounded-md border px-2 text-sm" style={{ borderColor: C.border }} />
            <input placeholder="תפקיד" value={workerDraft.תפקיד} onChange={e => setWorkerDraft(d => ({ ...d, תפקיד: e.target.value }))} className="h-9 rounded-md border px-2 text-sm" style={{ borderColor: C.border }} />
            <input placeholder="הערות" value={workerDraft.הערות} onChange={e => setWorkerDraft(d => ({ ...d, הערות: e.target.value }))} className="h-9 rounded-md border px-2 text-sm" style={{ borderColor: C.border }} />
            <button type="button" onClick={saveWorker} disabled={busyId === 'worker-save'} className="flex h-9 items-center justify-center gap-1 rounded-md border text-sm font-bold" style={{ backgroundColor: C.espresso, borderColor: C.espresso, color: '#FFFFFF' }}>
              {editingWorkerId ? <Save size={15} /> : <Plus size={15} />}
              {editingWorkerId ? 'שמור' : 'הוסף'}
            </button>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {(data.workers || []).map(worker => (
              <div key={worker.id} className="flex items-center justify-between gap-2 rounded-md border p-2" style={{ borderColor: C.borderSoft, backgroundColor: worker.פעילה ? C.cardSoft : '#F7F1EA' }}>
                <div>
                  <div className="text-sm font-bold" style={{ color: C.text }}>{worker.שם_עובדת}</div>
                  <div className="text-[11px]" style={{ color: C.textSoft }}>{worker.תפקיד || 'ללא תפקיד'}{worker.טלפון ? ` · ${worker.טלפון}` : ''}</div>
                </div>
                <div className="flex gap-1">
                  <IconButton title="ערוך" onClick={() => startEditWorker(worker)}><Pencil size={14} /></IconButton>
                  <button type="button" onClick={() => toggleWorker(worker)} className="h-8 rounded-md border px-2 text-[11px] font-bold" style={{ borderColor: C.border, color: worker.פעילה ? C.red : C.green, backgroundColor: C.card }}>
                    {worker.פעילה ? 'השבת' : 'הפעל'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border px-2 py-2" style={{ borderColor: C.borderSoft, backgroundColor: C.cardSoft }}>
      <div className="text-[10px] font-semibold" style={{ color: C.textMuted }}>{label}</div>
      <div className="mt-1 flex items-center justify-center gap-1 text-sm font-bold" style={{ color: C.text }}>
        <Clock size={12} color={C.cocoa} />
        {value}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-bold" style={{ color: C.textSoft }}>
      {label}
      {children}
    </label>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 font-bold">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 align-middle" style={{ color: C.text }}>{children}</td>;
}

function StatusBadge({ status }: { status: string }) {
  const tone = statusTone(status);
  return (
    <span className="inline-flex rounded-full border px-2 py-1 text-[11px] font-bold" style={{ backgroundColor: tone.bg, borderColor: tone.border, color: tone.color }}>
      {status}
    </span>
  );
}

function IconButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-md border"
      style={{ backgroundColor: C.card, borderColor: C.border, color: C.cocoa }}
    >
      {children}
    </button>
  );
}

// ─── MonthlySummarySection ────────────────────────────────────────────────
// V1 monthly summary that lives inside the existing נוכחות עובדות tab.
// Reuses the existing GET /api/kitchen-attendance endpoint with a wider
// from/to range (full month) — no new endpoint, no new table.
const HEBREW_MONTHS_ATT = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
] as const;

type WorkerSummary = {
  workerId: string;
  name: string;
  days: number;
  totalHours: number;
  avgHours: number;
  missingExit: number;
  notes: number;
};

function MonthlySummarySection({ workers }: { workers: Worker[] }) {
  // Defaults: previous calendar month (matches the backup-card default).
  const [defaultMonth, defaultYear] = (() => {
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return [prev.getMonth() + 1, prev.getFullYear()] as const;
  })();
  const [month, setMonth]           = useState<number>(defaultMonth);
  const [year, setYear]             = useState<number>(defaultYear);
  const [workerFilter, setWorkerFilter] = useState<string>('');
  const [rows, setRows]             = useState<AttendanceRow[]>([]);
  const [loading, setLoading]       = useState<boolean>(false);
  const [error, setError]           = useState<string | null>(null);
  const [exporting, setExporting]   = useState<boolean>(false);

  const currentYear = new Date().getFullYear();
  const yearOptions: number[] = [];
  for (let y = currentYear + 1; y >= currentYear - 3; y--) yearOptions.push(y);

  // Resolves the chosen month/year into ISO `from`/`to` date strings the
  // existing endpoint expects (inclusive on both ends — that's how the API
  // already filters).
  const range = useMemo(() => {
    const last = new Date(year, month, 0).getDate(); // last day of selected month
    const mm = String(month).padStart(2, '0');
    return {
      from: `${year}-${mm}-01`,
      to:   `${year}-${mm}-${String(last).padStart(2, '0')}`,
    };
  }, [year, month]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set('from', range.from);
      qs.set('to', range.to);
      if (workerFilter) qs.set('workerId', workerFilter);
      const res = await fetch(`/api/kitchen-attendance?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'שגיאה בטעינת נוכחות חודשית');
      setRows((json.report || []) as AttendanceRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת נוכחות חודשית');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, workerFilter]);

  // Auto-load on mount + whenever selectors change.
  useEffect(() => { void load(); }, [load]);

  // Per-worker aggregation. סהכ_שעות from the row is the existing CRM's own
  // calculation — we just sum what's already there. Rows missing שעת_יציאה
  // have סהכ_שעות=null and are excluded from totals (per the spec: "do not
  // count incomplete rows in total hours unless existing logic already does
  // so" — and the API only fills סהכ_שעות when both times exist).
  const summary: WorkerSummary[] = useMemo(() => {
    const map = new Map<string, WorkerSummary>();
    for (const r of rows) {
      const wId = r.עובדת_id;
      const name = r.עובדות_מטבח?.שם_עובדת || '—';
      const cur = map.get(wId) ?? { workerId: wId, name, days: 0, totalHours: 0, avgHours: 0, missingExit: 0, notes: 0 };
      cur.days += 1;
      if (typeof r.סהכ_שעות === 'number') cur.totalHours += r.סהכ_שעות;
      if (!r.שעת_יציאה) cur.missingExit += 1;
      if (r.הערות && r.הערות.trim()) cur.notes += 1;
      map.set(wId, cur);
    }
    return Array.from(map.values()).map(s => ({
      ...s,
      avgHours: s.days > 0 ? s.totalHours / s.days : 0,
    })).sort((a, b) => a.name.localeCompare(b.name, 'he'));
  }, [rows]);

  const exportExcel = useCallback(async () => {
    setExporting(true);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();

      // Sheet 1 — סיכום לפי עובדת
      const summaryRows = summary.length === 0
        ? [{ הודעה: 'אין נתוני נוכחות לחודש זה' }]
        : summary.map(s => ({
            'שם עובדת':              s.name,
            'מספר ימי נוכחות':       s.days,
            'סך שעות':               Number(s.totalHours.toFixed(2)),
            'ממוצע שעות ליום':       Number(s.avgHours.toFixed(2)),
            'רשומות חסרות שעת יציאה': s.missingExit,
            'הערות':                 s.notes,
          }));
      const ws1 = XLSX.utils.json_to_sheet(summaryRows);
      ws1['!cols'] = [{ wch: 22 }, { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 22 }, { wch: 10 }];
      XLSX.utils.book_append_sheet(wb, ws1, 'סיכום לפי עובדת');

      // Sheet 2 — פירוט יומי
      const detailRows = rows.length === 0
        ? [{ הודעה: 'אין נתוני נוכחות לחודש זה' }]
        : rows.map(r => ({
            'תאריך':         r.תאריך,
            'עובדת':         r.עובדות_מטבח?.שם_עובדת || '—',
            'שעת כניסה':     trimTime(r.שעת_כניסה) || '—',
            'שעת יציאה':     trimTime(r.שעת_יציאה) || '—',
            'סה"כ שעות':     typeof r.סהכ_שעות === 'number' ? Number(r.סהכ_שעות.toFixed(2)) : '—',
            'סטטוס':         r.שעת_יציאה ? r.סטטוס : 'חסר שעת יציאה',
            'הערות':         r.הערות || '',
          }));
      const ws2 = XLSX.utils.json_to_sheet(detailRows);
      ws2['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 11 }, { wch: 16 }, { wch: 30 }];
      XLSX.utils.book_append_sheet(wb, ws2, 'פירוט יומי');

      const fileName = `attendance-${year}-${String(month).padStart(2, '0')}.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בייצוא לאקסל');
    } finally {
      setExporting(false);
    }
  }, [summary, rows, year, month]);

  return (
    <section className="rounded-lg border p-3" style={{ backgroundColor: C.card, borderColor: C.border }}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold" style={{ color: C.text }}>סיכום חודשי</h3>
          <p className="text-[11px]" style={{ color: C.textSoft }}>סיכום נוכחות לפי עובדת לחודש שנבחר. ברירת מחדל: חודש קודם.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="חודש">
            <select
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
              className="h-8 rounded-md border px-2 text-xs"
              style={{ borderColor: C.border }}
            >
              {HEBREW_MONTHS_ATT.map((name, i) => (
                <option key={i + 1} value={i + 1}>{name}</option>
              ))}
            </select>
          </Field>
          <Field label="שנה">
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="h-8 rounded-md border px-2 text-xs"
              style={{ borderColor: C.border }}
            >
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </Field>
          <Field label="עובדת">
            <select
              value={workerFilter}
              onChange={e => setWorkerFilter(e.target.value)}
              className="h-8 rounded-md border px-2 text-xs"
              style={{ borderColor: C.border }}
            >
              <option value="">כל העובדות</option>
              {workers.map(w => <option key={w.id} value={w.id}>{w.שם_עובדת}</option>)}
            </select>
          </Field>
          <button
            type="button"
            onClick={exportExcel}
            disabled={exporting || loading}
            className="h-8 rounded-md border px-3 text-xs font-bold disabled:opacity-50"
            style={{ backgroundColor: C.card, borderColor: C.border, color: C.cocoa }}
          >
            {exporting ? 'מייצא…' : 'ייצוא לאקסל'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-md border px-3 py-2 text-xs font-bold" style={{ backgroundColor: C.redSoft, borderColor: '#E4C2BE', color: C.red }}>
          {error}
        </div>
      )}

      {/* Summary table — per worker */}
      <div className="mb-4 overflow-x-auto rounded-md border" style={{ borderColor: C.borderSoft }}>
        <table className="min-w-[700px] w-full text-right text-xs">
          <thead style={{ backgroundColor: C.brandSoft, color: C.text }}>
            <tr>
              <Th>עובדת</Th>
              <Th>ימי נוכחות</Th>
              <Th>סך שעות</Th>
              <Th>ממוצע שעות / יום</Th>
              <Th>חסרות שעת יציאה</Th>
              <Th>הערות</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-3 py-5 text-center font-semibold" style={{ color: C.textSoft }}>טוען…</td></tr>
            ) : summary.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-5 text-center font-semibold" style={{ color: C.textSoft }}>אין נתוני נוכחות לחודש זה</td></tr>
            ) : summary.map(s => (
              <tr key={s.workerId} className="border-t" style={{ borderColor: C.borderSoft }}>
                <Td>{s.name}</Td>
                <Td>{s.days}</Td>
                <Td>{s.totalHours.toFixed(2)}</Td>
                <Td>{s.avgHours.toFixed(2)}</Td>
                <Td>{s.missingExit}</Td>
                <Td>{s.notes}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Daily details — full row list for the selected month/worker */}
      <div className="overflow-x-auto rounded-md border" style={{ borderColor: C.borderSoft }}>
        <table className="min-w-[760px] w-full text-right text-xs">
          <thead style={{ backgroundColor: C.brandSoft, color: C.text }}>
            <tr>
              <Th>תאריך</Th>
              <Th>עובדת</Th>
              <Th>שעת כניסה</Th>
              <Th>שעת יציאה</Th>
              <Th>סה&quot;כ שעות</Th>
              <Th>סטטוס</Th>
              <Th>הערות</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-3 py-5 text-center font-semibold" style={{ color: C.textSoft }}>טוען…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-5 text-center font-semibold" style={{ color: C.textSoft }}>אין נתוני נוכחות לחודש זה</td></tr>
            ) : rows.map(r => (
              <tr key={r.id} className="border-t" style={{ borderColor: C.borderSoft }}>
                <Td>{r.תאריך}</Td>
                <Td>{r.עובדות_מטבח?.שם_עובדת || '—'}</Td>
                <Td>{trimTime(r.שעת_כניסה) || '—'}</Td>
                <Td>{trimTime(r.שעת_יציאה) || '—'}</Td>
                <Td>{typeof r.סהכ_שעות === 'number' ? r.סהכ_שעות.toFixed(2) : '—'}</Td>
                <Td>{r.שעת_יציאה ? <StatusBadge status={r.סטטוס} /> : <StatusBadge status="חסר שעת יציאה" />}</Td>
                <Td>{r.הערות || '—'}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
