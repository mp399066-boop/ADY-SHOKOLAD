'use client';

// /settings/system-control — admin-only control center for the automations
// in src/lib/system-services.ts.
//
// What lives here:
//   - One card per registered service (toggle on/off, last-run summary)
//   - Recent runs feed (filterable by service + status)
//   - Detail modal for a single run
//
// What does NOT live here:
//   - Service definitions (those are in src/lib/system-services.ts +
//     migration 026's seed). The page only reads what's there.
//   - Direct DB access. Everything goes through /api/system/* — those are
//     the ONLY routes admin-gated, the rest of the app's API is staff-OK.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { PageLoading } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';

// ── Tabs (local copy — settings/page.tsx + settings/users/page.tsx each
//        keep their own; matching that pattern instead of importing).
const SETTINGS_TABS = [
  { href: '/settings',                label: 'הגדרות עסק' },
  { href: '/settings/users',          label: 'משתמשים והרשאות' },
  { href: '/settings/system-control', label: 'מרכז בקרה' },
];

function SettingsTabs({ active }: { active: string }) {
  return (
    <div className="flex gap-1 mb-6 border-b" style={{ borderColor: '#EAE0D4' }}>
      {SETTINGS_TABS.map(tab => {
        const isActive = tab.href === active;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="px-4 py-2.5 text-sm font-medium relative transition-colors"
            style={isActive
              ? { color: '#5C3410', borderBottom: '2.5px solid #C9A46A', marginBottom: '-1px' }
              : { color: '#8A7664' }}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────

interface Service {
  id: string;
  service_key: string;
  display_name: string;
  description: string | null;
  category: string | null;
  is_enabled: boolean;
  last_run_at: string | null;
  last_status: string | null;
  updated_at: string | null;
}

interface ServiceRun {
  id: string;
  service_key: string;
  action: string | null;
  status: 'success' | 'failed' | 'skipped' | 'running' | 'disabled' | string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  related_type: string | null;
  related_id: string | null;
  message: string | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
}

// ── Status visual config ──────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  success:  'הצליח',
  failed:   'נכשל',
  skipped:  'דולג',
  running:  'רץ עכשיו',
  disabled: 'כבוי',
};

const STATUS_TONE: Record<string, { bg: string; fg: string; border: string }> = {
  success:  { bg: '#E8F4EC', fg: '#1F6B3E', border: '#BBE0C8' },
  failed:   { bg: '#FBE9E7', fg: '#A03C2C', border: '#F0C7BF' },
  skipped:  { bg: '#F4ECDF', fg: '#7A5C2C', border: '#DCC9A8' },
  running:  { bg: '#EAF2FB', fg: '#1E4E8C', border: '#C0D6F0' },
  disabled: { bg: '#EFE7DA', fg: '#5C4A38', border: '#D5C9B5' },
};

const CATEGORY_LABEL: Record<string, string> = {
  finance:      'כספים ומסמכים',
  emails:       'מיילים',
  deliveries:   'משלוחים',
  inventory:    'מלאי',
  reports:      'דוחות',
  integrations: 'אינטגרציות',
};

// ── Per-service confirm copy when an admin tries to disable ────────────────

const DISABLE_CONFIRM_COPY: Record<string, string> = {
  morning_documents:      'כיבוי השירות ימנע הפקת קבלות / חשבוניות אוטומטית או ידנית דרך המערכת, עד להפעלה מחדש.',
  customer_order_emails:  'כיבוי השירות ימנע שליחת אישורי הזמנה ללקוחות.',
  admin_alerts:           'כיבוי השירות ימנע שליחת התראות פנימיות אלייך על הזמנות חדשות.',
  delivery_notifications: 'כיבוי השירות ימנע שליחת קישורים לשליחים.',
  daily_orders_report:    'כיבוי השירות יעצור את הדוח היומי האוטומטי שנשלח כל בוקר.',
  woocommerce_orders:     'כיבוי השירות ימנע יצירת הזמנות חדשות מהאתר. ההזמנות הקיימות לא יושפעו.',
  inventory_deduction:    'כיבוי השירות ימנע הורדת מלאי אוטומטית. מומלץ להשתמש בזה רק לבדיקה זמנית.',
  payplus_payments:       'כיבוי השירות ימנע יצירת קישורי תשלום חדשים דרך PayPlus.',
};

const GENERIC_DISABLE_COPY = 'כיבוי השירות יעצור זמנית את הפעולה האוטומטית הזו. ניתן להפעיל מחדש בכל רגע. להמשיך?';

// ── Date formatting (Israel locale, 24h) ──────────────────────────────────

function formatRunTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('he-IL', {
      timeZone: 'Asia/Jerusalem',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function formatDuration(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function SystemControlPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [runs, setRuns] = useState<ServiceRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [confirmToggle, setConfirmToggle] = useState<{ service: Service; nextEnabled: boolean } | null>(null);
  const [filterService, setFilterService] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [detailRun, setDetailRun] = useState<ServiceRun | null>(null);

  const loadServices = async () => {
    const res = await fetch('/api/system/services');
    if (res.status === 401 || res.status === 403) { setForbidden(true); return; }
    const json = await res.json();
    setServices(json.services || []);
  };

  const loadRuns = async () => {
    const params = new URLSearchParams();
    if (filterService) params.set('service_key', filterService);
    if (filterStatus)  params.set('status', filterStatus);
    params.set('limit', '50');
    const res = await fetch(`/api/system/runs?${params}`);
    if (res.status === 401 || res.status === 403) { setForbidden(true); return; }
    const json = await res.json();
    setRuns(json.runs || []);
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadServices(), loadRuns()]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch runs when filters change.
  useEffect(() => {
    if (loading) return;
    loadRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterService, filterStatus]);

  // Group services by category for the cards layout.
  const grouped = useMemo(() => {
    const byCat = new Map<string, Service[]>();
    for (const s of services) {
      const cat = s.category || 'other';
      const list = byCat.get(cat) || [];
      list.push(s);
      byCat.set(cat, list);
    }
    return Array.from(byCat.entries());
  }, [services]);

  const handleToggleClick = (svc: Service) => {
    const nextEnabled = !svc.is_enabled;
    if (!nextEnabled) {
      // Going OFF → confirm with service-specific copy.
      setConfirmToggle({ service: svc, nextEnabled });
    } else {
      // Going ON → no confirm needed (re-enabling is the safe direction).
      void applyToggle(svc.service_key, true);
    }
  };

  const applyToggle = async (key: string, enabled: boolean) => {
    setTogglingKey(key);
    try {
      const res = await fetch(`/api/system/services/${encodeURIComponent(key)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_enabled: enabled }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'שגיאה בעדכון השירות');
        return;
      }
      toast.success(enabled ? 'השירות הופעל' : 'השירות כובה');
      // Optimistic update + re-fetch in the background to pick up updated_at.
      setServices(prev => prev.map(s => s.service_key === key ? { ...s, is_enabled: enabled } : s));
      void loadServices();
    } finally {
      setTogglingKey(null);
      setConfirmToggle(null);
    }
  };

  if (forbidden) {
    return (
      <div className="max-w-3xl">
        <EmptyState
          title="גישה למרכז הבקרה מוגבלת"
          description="המסך זמין למשתמש בעל הרשאת אדמין בלבד. אם זה אמור להיות זמין לך, פני למנהלת המערכת."
        />
      </div>
    );
  }

  if (loading) return <PageLoading />;

  return (
    <div className="max-w-5xl space-y-5" dir="rtl">
      <SettingsTabs active="/settings/system-control" />

      <div>
        <h1 className="text-xl font-bold" style={{ color: '#3A2A1A' }}>מרכז בקרה למערכת</h1>
        <p className="text-sm mt-1" style={{ color: '#8A7664' }}>
          כאן ניתן לראות ולנהל את השירותים האוטומטיים של המערכת. אפשר להפעיל, לכבות ולעקוב אחרי הריצות האחרונות — בלי להיכנס לקוד או ללוגים חיצוניים.
        </p>
      </div>

      {/* ── Service cards, grouped by category ───────────────────────────── */}
      {grouped.map(([cat, items]) => (
        <section key={cat} className="space-y-3">
          <h2 className="text-[12px] font-bold uppercase tracking-wider" style={{ color: '#8A7664', letterSpacing: '0.06em' }}>
            {CATEGORY_LABEL[cat] || cat}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {items.map(svc => (
              <Card key={svc.service_key} className="p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[15px] font-bold leading-tight" style={{ color: '#2B1A10' }}>
                      {svc.display_name}
                    </h3>
                    <p className="text-[11.5px] mt-1 leading-snug" style={{ color: '#8A7664' }}>
                      {svc.description}
                    </p>
                  </div>
                  <ToggleSwitch
                    enabled={svc.is_enabled}
                    busy={togglingKey === svc.service_key}
                    onChange={() => handleToggleClick(svc)}
                  />
                </div>

                {/* Status meta */}
                <div className="mt-3 pt-3 flex items-center justify-between gap-2 flex-wrap" style={{ borderTop: '1px solid #F0E5D8' }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="inline-flex items-center text-[10.5px] font-bold px-2 py-0.5 rounded-full border"
                      style={svc.is_enabled
                        ? { backgroundColor: STATUS_TONE.success.bg, color: STATUS_TONE.success.fg, borderColor: STATUS_TONE.success.border }
                        : { backgroundColor: STATUS_TONE.disabled.bg, color: STATUS_TONE.disabled.fg, borderColor: STATUS_TONE.disabled.border }}
                    >
                      {svc.is_enabled ? 'פעיל' : 'כבוי'}
                    </span>
                    {svc.last_status && (
                      <span
                        className="inline-flex items-center text-[10.5px] font-semibold px-2 py-0.5 rounded-full border"
                        style={{
                          backgroundColor: (STATUS_TONE[svc.last_status] || STATUS_TONE.disabled).bg,
                          color:           (STATUS_TONE[svc.last_status] || STATUS_TONE.disabled).fg,
                          borderColor:     (STATUS_TONE[svc.last_status] || STATUS_TONE.disabled).border,
                        }}
                        title="סטטוס הריצה האחרונה"
                      >
                        אחרון: {STATUS_LABEL[svc.last_status] || svc.last_status}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setFilterService(svc.service_key)}
                    className="text-[11px] font-semibold hover:underline"
                    style={{ color: '#8B5E34' }}
                  >
                    צפה בריצות
                  </button>
                </div>
                <div className="mt-1.5 text-[10.5px]" style={{ color: '#A0907D' }}>
                  ריצה אחרונה: {formatRunTime(svc.last_run_at)}
                </div>
              </Card>
            ))}
          </div>
        </section>
      ))}

      {/* ── Recent runs feed ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <h2 className="text-[15px] font-bold" style={{ color: '#2B1A10' }}>ריצות אחרונות במערכת</h2>
          <div className="flex items-center gap-2 flex-wrap text-[12px]">
            <select
              value={filterService}
              onChange={e => setFilterService(e.target.value)}
              className="px-2 h-8 rounded-lg border bg-white"
              style={{ borderColor: '#E8D8C6', color: '#3A2A1A' }}
            >
              <option value="">כל השירותים</option>
              {services.map(s => (
                <option key={s.service_key} value={s.service_key}>{s.display_name}</option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="px-2 h-8 rounded-lg border bg-white"
              style={{ borderColor: '#E8D8C6', color: '#3A2A1A' }}
            >
              <option value="">כל הסטטוסים</option>
              {(['success', 'failed', 'disabled', 'skipped', 'running'] as const).map(s => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
            {(filterService || filterStatus) && (
              <button
                onClick={() => { setFilterService(''); setFilterStatus(''); }}
                className="text-[11px] font-semibold hover:underline"
                style={{ color: '#8B5E34' }}
              >
                נקי סינון
              </button>
            )}
          </div>
        </div>

        {runs.length === 0 ? (
          <Card className="p-6 text-center text-sm" style={{ color: '#8A7664' }}>
            אין ריצות שתואמות את הסינון הנוכחי.
          </Card>
        ) : (
          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: '#FAF7F0', borderBottom: '1px solid #E7D2A6' }}>
                    {['זמן', 'שירות', 'פעולה', 'סטטוס', 'משך', 'מזהה קשור', 'הודעה', ''].map(h => (
                      <th key={h} className="px-3 py-2 text-right text-[11px] font-semibold" style={{ color: '#6B4A2D' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {runs.map(run => {
                    const tone = STATUS_TONE[run.status] || STATUS_TONE.disabled;
                    const svc = services.find(s => s.service_key === run.service_key);
                    return (
                      <tr key={run.id} className="border-b hover:bg-amber-50" style={{ borderColor: '#F5ECD8' }}>
                        <td className="px-3 py-2 text-[12px]" style={{ color: '#5C4A38' }}>{formatRunTime(run.started_at)}</td>
                        <td className="px-3 py-2 text-[12px]" style={{ color: '#2B1A10' }}>{svc?.display_name || run.service_key}</td>
                        <td className="px-3 py-2 text-[11.5px] font-mono" style={{ color: '#6B4A2D' }}>{run.action || '—'}</td>
                        <td className="px-3 py-2">
                          <span
                            className="inline-flex items-center text-[10.5px] font-bold px-2 py-0.5 rounded-full border"
                            style={{ backgroundColor: tone.bg, color: tone.fg, borderColor: tone.border }}
                          >
                            {STATUS_LABEL[run.status] || run.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[11.5px] tabular-nums" style={{ color: '#5C4A38' }}>{formatDuration(run.duration_ms)}</td>
                        <td className="px-3 py-2 text-[11.5px]" style={{ color: '#6B4A2D' }}>
                          {run.related_id
                            ? <span className="font-mono">{run.related_type ? `${run.related_type}: ` : ''}{run.related_id.slice(0, 8)}…</span>
                            : '—'}
                        </td>
                        <td className="px-3 py-2 text-[11.5px] truncate max-w-[280px]" style={{ color: '#5C4A38' }}>
                          {run.error_message || run.message || '—'}
                        </td>
                        <td className="px-3 py-2 text-left">
                          <button
                            onClick={() => setDetailRun(run)}
                            className="text-[11px] font-semibold hover:underline"
                            style={{ color: '#8B5E34' }}
                          >
                            פרטים
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      {/* ── Disable-confirm modal ────────────────────────────────────────── */}
      <Modal
        open={!!confirmToggle}
        onClose={() => { if (!togglingKey) setConfirmToggle(null); }}
        title="כיבוי שירות"
      >
        {confirmToggle && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: '#1E120A', fontWeight: 600 }}>
              {confirmToggle.service.display_name}
            </p>
            <p className="text-sm" style={{ color: '#6B4A2D' }}>
              {DISABLE_CONFIRM_COPY[confirmToggle.service.service_key] || GENERIC_DISABLE_COPY}
            </p>
            <p className="text-[12px]" style={{ color: '#8A7664' }}>
              ניתן להפעיל את השירות מחדש בכל רגע.
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setConfirmToggle(null)} disabled={!!togglingKey}>
                ביטול
              </Button>
              <button
                onClick={() => applyToggle(confirmToggle.service.service_key, false)}
                disabled={!!togglingKey}
                className="px-4 h-10 text-sm font-semibold rounded-xl text-white transition-colors disabled:opacity-60"
                style={{ backgroundColor: '#9D4B4A' }}
              >
                {togglingKey ? 'מכבה...' : 'כבה שירות'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Run detail modal ─────────────────────────────────────────────── */}
      <Modal open={!!detailRun} onClose={() => setDetailRun(null)} title="פרטי ריצה" size="lg">
        {detailRun && (() => {
          const svc = services.find(s => s.service_key === detailRun.service_key);
          const tone = STATUS_TONE[detailRun.status] || STATUS_TONE.disabled;
          return (
            <div className="space-y-3 text-sm" style={{ color: '#2B1A10' }}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-bold">{svc?.display_name || detailRun.service_key}</h3>
                <span
                  className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full border"
                  style={{ backgroundColor: tone.bg, color: tone.fg, borderColor: tone.border }}
                >
                  {STATUS_LABEL[detailRun.status] || detailRun.status}
                </span>
              </div>
              <DetailRow label="פעולה" value={detailRun.action || '—'} mono />
              <DetailRow label="זמן התחלה" value={formatRunTime(detailRun.started_at)} />
              <DetailRow label="זמן סיום" value={formatRunTime(detailRun.finished_at)} />
              <DetailRow label="משך" value={formatDuration(detailRun.duration_ms)} />
              {detailRun.related_id && (
                <DetailRow
                  label="מזהה קשור"
                  value={`${detailRun.related_type ? detailRun.related_type + ' · ' : ''}${detailRun.related_id}`}
                  mono
                />
              )}
              {detailRun.message && (
                <DetailRow label="הודעת מערכת" value={detailRun.message} />
              )}
              {detailRun.error_message && (
                <div>
                  <div className="text-[11px] font-bold mb-1" style={{ color: '#A03C2C' }}>שגיאה מלאה</div>
                  <pre
                    dir="ltr"
                    className="text-[11.5px] p-3 rounded-lg whitespace-pre-wrap break-words"
                    style={{ backgroundColor: '#FBF1EE', color: '#7A2C1F', border: '1px solid #F0C7BF', fontFamily: 'monospace' }}
                  >
                    {detailRun.error_message}
                  </pre>
                </div>
              )}
              {detailRun.metadata && Object.keys(detailRun.metadata).length > 0 && (
                <div>
                  <div className="text-[11px] font-bold mb-1" style={{ color: '#6B4A2D' }}>נתונים נוספים</div>
                  <ul className="text-[12px] space-y-1 p-3 rounded-lg" style={{ backgroundColor: '#FAF7F0' }}>
                    {Object.entries(detailRun.metadata).map(([k, v]) => (
                      <li key={k}>
                        <span className="font-mono text-[11px]" style={{ color: '#8A7664' }}>{k}:</span>{' '}
                        <span style={{ color: '#2B1A10' }}>{String(v)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex justify-end pt-2">
                <Button variant="outline" onClick={() => setDetailRun(null)}>סגור</Button>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function ToggleSwitch({
  enabled, busy, onChange,
}: {
  enabled: boolean;
  busy: boolean;
  onChange: () => void;
}) {
  return (
    <button
      onClick={onChange}
      disabled={busy}
      role="switch"
      aria-checked={enabled}
      title={enabled ? 'לחצי לכיבוי' : 'לחצי להפעלה'}
      className="relative inline-flex shrink-0 transition-colors disabled:opacity-60"
      style={{
        width: 44,
        height: 24,
        borderRadius: 999,
        backgroundColor: enabled ? '#476D53' : '#C7B7A0',
        border: '1px solid ' + (enabled ? '#3A5A45' : '#A89882'),
      }}
    >
      <span
        className="absolute top-0.5 transition-all"
        style={{
          width: 18,
          height: 18,
          borderRadius: 999,
          backgroundColor: '#FFFFFF',
          left:  enabled ? 22 : 2,
          boxShadow: '0 1px 3px rgba(47,27,20,0.18)',
        }}
      />
    </button>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-[11px] font-bold" style={{ color: '#8A7664', minWidth: 90 }}>{label}</span>
      <span
        className={`text-[12.5px] ${mono ? 'font-mono' : ''}`}
        style={{ color: '#2B1A10', wordBreak: 'break-word' }}
      >
        {value}
      </span>
    </div>
  );
}
