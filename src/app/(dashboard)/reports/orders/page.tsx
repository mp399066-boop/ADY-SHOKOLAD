'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
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

export default function OrdersReportPage() {
  const [range, setRange] = useState<Range>('today');
  const [date, setDate] = useState<string>(todayISO());
  const [recipientEmail, setRecipientEmail] = useState<string>('');
  const [filters, setFilters] = useState<{ urgentOnly: boolean; unpaidOnly: boolean; deliveryOnly: boolean; pickupOnly: boolean }>({
    urgentOnly: false, unpaidOnly: false, deliveryOnly: false, pickupOnly: false,
  });
  const [sending, setSending] = useState(false);
  const [downloading, setDownloading] = useState(false);

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

  const handleSend = async () => {
    if (!recipientEmail.trim()) {
      toast.error('יש להזין כתובת מייל לנמען');
      return;
    }
    if (!validateRange()) return;
    setSending(true);
    try {
      const res = await fetch('/api/reports/orders/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody({ recipientEmail: recipientEmail.trim() })),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'שגיאה בשליחה');
      toast.success(`נשלח! ${json.summary?.total ?? 0} הזמנות בדוח`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setSending(false);
    }
  };

  const handleDownload = async () => {
    if (!validateRange()) return;
    setDownloading(true);
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
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`הדוח הורד (${total} הזמנות) — פתחי את הקובץ ולחצי "הדפס" לשמירה כ-PDF`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setDownloading(false);
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
        <Button onClick={handleDownload} loading={downloading} size="lg" variant="outline">
          ⬇ הורידי דוח
        </Button>
        <Button onClick={handleSend} loading={sending} size="lg">
          ✉ שלחי במייל
        </Button>
      </div>
    </div>
  );
}
