'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import toast from 'react-hot-toast';

type Range = 'today' | 'tomorrow' | 'week' | 'custom';

const RANGE_OPTIONS: { value: Range; label: string; sub: string }[] = [
  { value: 'today',    label: 'היום',     sub: 'הזמנות לאספקה היום' },
  { value: 'tomorrow', label: 'מחר',      sub: 'הזמנות לאספקה מחר'  },
  { value: 'week',     label: 'השבוע',    sub: '7 ימים קדימה'        },
  { value: 'custom',   label: 'תאריך',    sub: 'בחירה ידנית'         },
];

const FILTER_OPTIONS: { key: 'urgentOnly' | 'unpaidOnly' | 'deliveryOnly' | 'pickupOnly'; label: string }[] = [
  { key: 'urgentOnly',   label: 'דחופות בלבד'        },
  { key: 'unpaidOnly',   label: 'לא שולמו בלבד'     },
  { key: 'deliveryOnly', label: 'משלוחים בלבד'      },
  { key: 'pickupOnly',   label: 'איסוף עצמי בלבד'   },
];

function todayISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

// Preview payload returned by /api/reports/orders/preview. The `html` field
// is the actual report body the email/download will use — we iframe it in
// the modal so preview and the sent report cannot drift apart.
interface PreviewData {
  summary: {
    total: number;
    urgent: number;
    delivery: number;
    pickup: number;
    unpaid: number;
    rangeLabel: string;
    startDate: string;
    endDate: string;
    totalAmount: number;
  };
  html: string;
}

export default function OrdersReportPage() {
  const [range, setRange] = useState<Range>('today');
  const [date, setDate] = useState<string>(todayISO());
  const [recipientEmail, setRecipientEmail] = useState<string>('');
  const [filters, setFilters] = useState<{ urgentOnly: boolean; unpaidOnly: boolean; deliveryOnly: boolean; pickupOnly: boolean }>({
    urgentOnly: false, unpaidOnly: false, deliveryOnly: false, pickupOnly: false,
  });
  // Preview modal state.
  const [previewing, setPreviewing] = useState(false);   // currently fetching the preview
  const [preview, setPreview]       = useState<PreviewData | null>(null);
  const [acting, setActing]         = useState(false);   // download/send in flight from inside the modal

  const toggleFilter = (k: keyof typeof filters) => {
    setFilters(prev => {
      const next = { ...prev, [k]: !prev[k] };
      if (k === 'deliveryOnly' && next.deliveryOnly) next.pickupOnly = false;
      if (k === 'pickupOnly' && next.pickupOnly) next.deliveryOnly = false;
      return next;
    });
  };

  const validateRange = (): boolean => {
    if (range === 'custom' && !date) {
      toast.error('יש לבחור תאריך');
      return false;
    }
    return true;
  };

  const buildBody = (extra?: Record<string, unknown>) => ({
    range,
    date: range === 'custom' ? date : undefined,
    filters,
    ...extra,
  });

  // Open the preview modal — fetches a summary + first 5 orders so the user
  // can see what they're about to download/send before committing. Uses
  // /api/reports/orders/preview which shares fetchOrdersForReport with the
  // real download/send endpoints (no logic duplication).
  const openPreview = async () => {
    if (!validateRange()) return;
    setPreviewing(true);
    setPreview(null);
    try {
      const res = await fetch('/api/reports/orders/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody()),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'שגיאה בתצוגה מוקדמת');
      setPreview({ summary: json.summary, html: json.html });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setPreviewing(false);
    }
  };

  // Confirmed download — fires only from inside the preview modal after the
  // user has seen the numbers.
  const confirmDownload = async () => {
    setActing(true);
    try {
      const res = await fetch('/api/reports/orders/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody()),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'שגיאה ביצירת דוח');
      }
      const filename = res.headers.get('X-Report-Filename') || `orders-report-${todayISO()}.html`;
      const total = res.headers.get('X-Report-Total') || '?';
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`הדוח הורד (${total} הזמנות) — פתחי את הקובץ ולחצי "הדפס" לשמירה כ-PDF`);
      setPreview(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setActing(false);
    }
  };

  // Confirmed send — same gate.
  const confirmSend = async () => {
    if (!recipientEmail.trim()) {
      toast.error('יש להזין כתובת מייל לנמען');
      return;
    }
    setActing(true);
    try {
      const res = await fetch('/api/reports/orders/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody({ recipientEmail: recipientEmail.trim() })),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'שגיאה בשליחה');
      toast.success(`נשלח! ${json.summary?.total ?? 0} הזמנות בדוח`);
      setPreview(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold" style={{ color: '#3A2A1A' }}>שליחת דוח הזמנות</h1>
        <p className="text-sm mt-1" style={{ color: '#8A7664' }}>
          שליחת דוח מעוצב של הזמנות לפי טווח תאריכי אספקה. הדוח קריא בלבד — אין שינוי במערכת.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>טווח הדוח</CardTitle></CardHeader>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {RANGE_OPTIONS.map(opt => {
            const active = range === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setRange(opt.value)}
                className="text-right p-3 rounded-lg transition-all border"
                style={active
                  ? { borderColor: '#C9A46A', backgroundColor: '#FBF3E8', boxShadow: '0 0 0 1px #C9A46A inset' }
                  : { borderColor: '#E8DED2', backgroundColor: '#FFFFFF' }}
              >
                <div className="text-sm font-bold" style={{ color: active ? '#5C3410' : '#3A2A1A' }}>{opt.label}</div>
                <div className="text-xs mt-0.5" style={{ color: '#8A7664' }}>{opt.sub}</div>
              </button>
            );
          })}
        </div>
        {range === 'custom' && (
          <div className="mt-4 max-w-xs">
            <Input
              label="תאריך אספקה"
              type="date"
              value={date}
              min={todayISO()}
              onChange={e => setDate(e.target.value)}
            />
          </div>
        )}
      </Card>

      <Card>
        <CardHeader><CardTitle>נמען</CardTitle></CardHeader>
        <Input
          label="כתובת מייל"
          type="email"
          placeholder="example@adi-shokolad.co.il"
          value={recipientEmail}
          onChange={e => setRecipientEmail(e.target.value)}
          required
        />
      </Card>

      <Card>
        <CardHeader><CardTitle>פילטרים (אופציונלי)</CardTitle></CardHeader>
        <div className="grid grid-cols-2 gap-2.5">
          {FILTER_OPTIONS.map(opt => {
            const active = filters[opt.key];
            return (
              <label
                key={opt.key}
                className="flex items-center gap-2.5 p-3 rounded-lg cursor-pointer transition-all border"
                style={active
                  ? { borderColor: '#C9A46A', backgroundColor: '#FBF3E8' }
                  : { borderColor: '#E8DED2', backgroundColor: '#FFFFFF' }}
              >
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggleFilter(opt.key)}
                  className="w-4 h-4 cursor-pointer"
                  style={{ accentColor: '#8B5E34' }}
                />
                <span className="text-sm" style={{ color: active ? '#5C3410' : '#3A2A1A', fontWeight: active ? 600 : 400 }}>
                  {opt.label}
                </span>
              </label>
            );
          })}
        </div>
        <p className="text-xs mt-3" style={{ color: '#B0A090' }}>
          ניתן לסנן רק לפי משלוחים <em>או</em> רק לפי איסוף — לא שניהם יחד.
        </p>
      </Card>

      <div className="flex justify-end gap-3 pt-2 flex-wrap">
        <Button onClick={openPreview} loading={previewing} size="lg">
          👁 תצוגה מוקדמת
        </Button>
      </div>

      {/* Preview-then-confirm modal. The download/send buttons inside it
          are the ONLY way to actually run the report from this screen — the
          page-level buttons only open the modal. */}
      <Modal open={!!preview} onClose={() => setPreview(null)} title="תצוגה מוקדמת — דוח הזמנות" size="lg">
        {preview && (
          <div dir="rtl" className="space-y-4">
            <div className="text-sm" style={{ color: '#5C4A38' }}>
              {preview.summary.rangeLabel}
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <PreviewStat label="סה״כ הזמנות" value={String(preview.summary.total)} />
              <PreviewStat label="סכום כולל" value={`₪${preview.summary.totalAmount.toFixed(2)}`} />
              {preview.summary.urgent > 0 && <PreviewStat label="דחופות" value={String(preview.summary.urgent)} tone="warn" />}
              {preview.summary.unpaid > 0 && <PreviewStat label="לא שולמו" value={String(preview.summary.unpaid)} tone="warn" />}
              {preview.summary.delivery > 0 && <PreviewStat label="משלוחים" value={String(preview.summary.delivery)} />}
              {preview.summary.pickup > 0 && <PreviewStat label="איסוף עצמי" value={String(preview.summary.pickup)} />}
            </div>

            {/* Live HTML preview — iframes the same body the email/download
                will render, so what the user sees here is exactly what goes
                out. Sandbox locks the iframe down (no scripts, no top nav). */}
            {preview.summary.total === 0 ? (
              <div className="rounded-lg p-6 text-center text-sm" style={{ backgroundColor: '#FAF7F0', color: '#9B7A5A' }}>
                אין הזמנות בטווח שנבחר.<br/>
                ניתן עדיין להוריד או לשלוח דוח ריק לתיעוד.
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[11px] uppercase tracking-wider" style={{ color: '#9B7A5A' }}>
                    תצוגת הדוח המלא ({preview.summary.total} הזמנות)
                  </div>
                  <div className="text-[11px]" style={{ color: '#B0A090' }}>
                    זה בדיוק מה שהלקוחה תראה במייל
                  </div>
                </div>
                <div className="rounded-lg overflow-hidden border" style={{ borderColor: '#EDE0CE' }}>
                  <iframe
                    srcDoc={preview.html}
                    title="תצוגה מקדימה — דוח הזמנות"
                    sandbox=""
                    className="w-full block"
                    style={{ height: '60vh', backgroundColor: '#F5F1EB', border: 'none' }}
                  />
                </div>
              </div>
            )}

            {/* Send-recipient hint when an email was typed on the page */}
            {recipientEmail.trim() && (
              <div className="text-xs" style={{ color: '#6B4A2D' }}>
                שליחה תלך לכתובת: <span dir="ltr" className="font-semibold" style={{ color: '#8B5E34' }}>{recipientEmail.trim()}</span>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex justify-end gap-2 flex-wrap pt-2 border-t" style={{ borderColor: '#EDE0CE' }}>
              <Button onClick={() => setPreview(null)} variant="outline" disabled={acting}>
                ביטול
              </Button>
              <Button onClick={confirmDownload} variant="outline" loading={acting}>
                ⬇ הורידי דוח
              </Button>
              <Button onClick={confirmSend} loading={acting} disabled={!recipientEmail.trim()}>
                ✉ שלחי במייל
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function PreviewStat({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <div className="rounded-lg p-3" style={{ backgroundColor: tone === 'warn' ? '#FFF8E1' : '#FAF7F0' }}>
      <div className="text-[10px] uppercase tracking-wider" style={{ color: '#9B7A5A' }}>{label}</div>
      <div className="text-lg font-bold tabular-nums" style={{ color: tone === 'warn' ? '#92400E' : '#2B1A10' }}>{value}</div>
    </div>
  );
}
