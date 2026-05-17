'use client';

// /settings/system-control — admin-only control center.
//
// Three sub-views:
//   1. שירותים ואוטומציות     — service cards with toggles
//   2. ריצות שירותים            — system_service_runs feed (gated-call audit)
//   3. יומן פעילות מערכת        — system_activity_logs feed (broader audit)
//
// All three share the SettingsTabs at the top and the page-level data
// (services / runs / detail modal). The activity feed has its own state
// because its filter shape differs.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { PageLoading } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';

// ── SettingsTabs (local — same pattern as other settings pages) ──────────
const SETTINGS_TABS = [
  { href: '/settings',                    label: 'הגדרות עסק'      },
  { href: '/settings/users',              label: 'משתמשים והרשאות' },
  { href: '/settings/inventory-backfill', label: 'תיקון מלאי'      },
  { href: '/settings/system-control',     label: 'מרכז בקרה'        },
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

interface ActivityLog {
  id: string;
  created_at: string;
  actor_type: 'user' | 'system' | 'webhook' | 'cron' | 'public_token' | string;
  actor_user_id: string | null;
  actor_email: string | null;
  actor_name: string | null;
  module: string;
  action: string;
  status: 'success' | 'failed' | 'skipped' | 'warning' | 'disabled' | string;
  entity_type: string | null;
  entity_id: string | null;
  entity_label: string | null;
  title: string;
  description: string | null;
  old_value: unknown;
  new_value: unknown;
  metadata: Record<string, unknown> | null;
  error_message: string | null;
  ip_address: string | null;
  user_agent: string | null;
  service_key: string | null;
  related_run_id: string | null;
}

// ── Visual config ─────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  success:  'הצליח',
  failed:   'נכשל',
  skipped:  'דולג',
  running:  'רץ עכשיו',
  disabled: 'כבוי',
  warning:  'אזהרה',
};

const STATUS_TONE: Record<string, { bg: string; fg: string; border: string }> = {
  success:  { bg: '#E8F4EC', fg: '#1F6B3E', border: '#BBE0C8' },
  failed:   { bg: '#FBE9E7', fg: '#A03C2C', border: '#F0C7BF' },
  skipped:  { bg: '#F4ECDF', fg: '#7A5C2C', border: '#DCC9A8' },
  running:  { bg: '#EAF2FB', fg: '#1E4E8C', border: '#C0D6F0' },
  disabled: { bg: '#EFE7DA', fg: '#5C4A38', border: '#D5C9B5' },
  warning:  { bg: '#FFF4E0', fg: '#8A5A18', border: '#EDCF98' },
};

const CATEGORY_LABEL: Record<string, string> = {
  finance:      'כספים ומסמכים',
  emails:       'מיילים',
  deliveries:   'משלוחים',
  inventory:    'מלאי',
  reports:      'דוחות',
  integrations: 'אינטגרציות',
};

const MODULE_LABEL: Record<string, string> = {
  orders:       'הזמנות',
  customers:    'לקוחות',
  deliveries:   'משלוחים',
  inventory:    'מלאי',
  products:     'מוצרים',
  finance:      'פיננסים',
  reports:      'דוחות',
  settings:     'הגדרות',
  auth:         'משתמשים והרשאות',
  integrations: 'אינטגרציות',
  assistant:    'עוזרת חכמה',
};

const ACTOR_LABEL: Record<string, string> = {
  user:         'משתמש',
  system:       'המערכת',
  webhook:      'אינטגרציה',
  cron:         'פעולה מתוזמנת',
  public_token: 'קישור ציבורי',
};

const MODULE_ICON: Record<string, string> = {
  orders:       '🧾',
  customers:    '👤',
  deliveries:   '🚚',
  inventory:    '📦',
  products:     '🍫',
  finance:      '💳',
  reports:      '📊',
  settings:     '⚙️',
  auth:         '🔐',
  integrations: '🔗',
  assistant:    '✨',
};

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

// ── Date / duration formatters ────────────────────────────────────────────

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

type View = 'services' | 'runs' | 'activity';

export default function SystemControlPage() {
  const [services, setServices]   = useState<Service[]>([]);
  const [runs, setRuns]           = useState<ServiceRun[]>([]);
  const [loading, setLoading]     = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [view, setView]           = useState<View>('services');

  // Services view state
  const [togglingKey, setTogglingKey]     = useState<string | null>(null);
  const [confirmToggle, setConfirmToggle] = useState<{ service: Service; nextEnabled: boolean } | null>(null);

  // Runs view state
  const [filterService, setFilterService] = useState<string>('');
  const [filterStatus, setFilterStatus]   = useState<string>('');
  const [detailRun, setDetailRun]         = useState<ServiceRun | null>(null);

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

  useEffect(() => {
    if (loading) return;
    loadRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterService, filterStatus]);

  const grouped = useMemo<[string, Service[]][]>(() => {
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
      setConfirmToggle({ service: svc, nextEnabled });
    } else {
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
        <SettingsTabs active="/settings/system-control" />
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
          כאן ניתן לראות ולנהל את השירותים האוטומטיים של המערכת, לעקוב אחרי הריצות האחרונות ולעיין ביומן הפעילות המלא — בלי להיכנס לקוד או ללוגים חיצוניים.
        </p>
      </div>

      <InnerTabs active={view} onChange={setView} />

      {view === 'services' && (
        <ServicesView
          grouped={grouped}
          togglingKey={togglingKey}
          onToggleClick={handleToggleClick}
          onJumpToRuns={(key) => { setFilterService(key); setView('runs'); }}
        />
      )}

      {view === 'runs' && (
        <RunsView
          services={services}
          runs={runs}
          filterService={filterService}
          filterStatus={filterStatus}
          onFilterService={setFilterService}
          onFilterStatus={setFilterStatus}
          onOpenDetail={setDetailRun}
        />
      )}

      {view === 'activity' && (
        <ActivityFeed services={services} />
      )}

      {/* Disable-confirm modal */}
      <Modal open={!!confirmToggle} onClose={() => { if (!togglingKey) setConfirmToggle(null); }} title="כיבוי שירות">
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
              <Button variant="outline" onClick={() => setConfirmToggle(null)} disabled={!!togglingKey}>ביטול</Button>
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

      {/* Run detail modal */}
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
              <DetailRow label="פעולה"     value={detailRun.action || '—'} mono />
              <DetailRow label="זמן התחלה" value={formatRunTime(detailRun.started_at)} />
              <DetailRow label="זמן סיום"  value={formatRunTime(detailRun.finished_at)} />
              <DetailRow label="משך"       value={formatDuration(detailRun.duration_ms)} />
              {detailRun.related_id && (
                <DetailRow label="מזהה קשור" value={`${detailRun.related_type ? detailRun.related_type + ' · ' : ''}${detailRun.related_id}`} mono />
              )}
              {detailRun.message && <DetailRow label="הודעת מערכת" value={detailRun.message} />}
              {detailRun.error_message && (
                <div>
                  <div className="text-[11px] font-bold mb-1" style={{ color: '#A03C2C' }}>שגיאה מלאה</div>
                  <pre dir="ltr" className="text-[11.5px] p-3 rounded-lg whitespace-pre-wrap break-words"
                       style={{ backgroundColor: '#FBF1EE', color: '#7A2C1F', border: '1px solid #F0C7BF', fontFamily: 'monospace' }}>
                    {detailRun.error_message}
                  </pre>
                </div>
              )}
              {detailRun.metadata && Object.keys(detailRun.metadata).length > 0 && (
                <KeyValueBox metadata={detailRun.metadata} />
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

// ── Inner tabs ────────────────────────────────────────────────────────────

function InnerTabs({ active, onChange }: { active: View; onChange: (v: View) => void }) {
  const tabs: { v: View; label: string }[] = [
    { v: 'services', label: 'שירותים ואוטומציות' },
    { v: 'runs',     label: 'ריצות שירותים' },
    { v: 'activity', label: 'יומן פעילות מערכת' },
  ];
  return (
    <div className="flex flex-wrap gap-1" style={{ borderBottom: '1px solid #EAE0D4' }}>
      {tabs.map(t => {
        const isActive = active === t.v;
        return (
          <button
            key={t.v}
            onClick={() => onChange(t.v)}
            className="px-4 py-2 text-[13px] font-semibold transition-colors"
            style={isActive
              ? { color: '#5C3410', borderBottom: '2.5px solid #C9A46A', marginBottom: '-1px' }
              : { color: '#8A7664' }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Services view ────────────────────────────────────────────────────────

function ServicesView({
  grouped, togglingKey, onToggleClick, onJumpToRuns,
}: {
  grouped: [string, Service[]][];
  togglingKey: string | null;
  onToggleClick: (svc: Service) => void;
  onJumpToRuns: (key: string) => void;
}) {
  return (
    <>
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
                    <h3 className="text-[15px] font-bold leading-tight" style={{ color: '#2B1A10' }}>{svc.display_name}</h3>
                    <p className="text-[11.5px] mt-1 leading-snug" style={{ color: '#8A7664' }}>{svc.description}</p>
                  </div>
                  <ToggleSwitch
                    enabled={svc.is_enabled}
                    busy={togglingKey === svc.service_key}
                    onChange={() => onToggleClick(svc)}
                  />
                </div>
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
                      >
                        אחרון: {STATUS_LABEL[svc.last_status] || svc.last_status}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => onJumpToRuns(svc.service_key)}
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
    </>
  );
}

// ── Runs view ────────────────────────────────────────────────────────────

function RunsView({
  services, runs, filterService, filterStatus, onFilterService, onFilterStatus, onOpenDetail,
}: {
  services: Service[];
  runs: ServiceRun[];
  filterService: string;
  filterStatus: string;
  onFilterService: (v: string) => void;
  onFilterStatus: (v: string) => void;
  onOpenDetail: (run: ServiceRun) => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <h2 className="text-[15px] font-bold" style={{ color: '#2B1A10' }}>ריצות שירותים אחרונות</h2>
        <div className="flex items-center gap-2 flex-wrap text-[12px]">
          <select value={filterService} onChange={e => onFilterService(e.target.value)} className="px-2 h-8 rounded-lg border bg-white" style={{ borderColor: '#E8D8C6', color: '#3A2A1A' }}>
            <option value="">כל השירותים</option>
            {services.map(s => <option key={s.service_key} value={s.service_key}>{s.display_name}</option>)}
          </select>
          <select value={filterStatus} onChange={e => onFilterStatus(e.target.value)} className="px-2 h-8 rounded-lg border bg-white" style={{ borderColor: '#E8D8C6', color: '#3A2A1A' }}>
            <option value="">כל הסטטוסים</option>
            {(['success', 'failed', 'disabled', 'skipped', 'running'] as const).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          {(filterService || filterStatus) && (
            <button onClick={() => { onFilterService(''); onFilterStatus(''); }} className="text-[11px] font-semibold hover:underline" style={{ color: '#8B5E34' }}>נקי סינון</button>
          )}
        </div>
      </div>

      {runs.length === 0 ? (
        <Card className="p-6 text-center text-sm" style={{ color: '#8A7664' }}>אין ריצות שתואמות את הסינון הנוכחי.</Card>
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
                        <span className="inline-flex items-center text-[10.5px] font-bold px-2 py-0.5 rounded-full border" style={{ backgroundColor: tone.bg, color: tone.fg, borderColor: tone.border }}>
                          {STATUS_LABEL[run.status] || run.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[11.5px] tabular-nums" style={{ color: '#5C4A38' }}>{formatDuration(run.duration_ms)}</td>
                      <td className="px-3 py-2 text-[11.5px]" style={{ color: '#6B4A2D' }}>
                        {run.related_id ? <span className="font-mono">{run.related_type ? `${run.related_type}: ` : ''}{run.related_id.slice(0, 8)}…</span> : '—'}
                      </td>
                      <td className="px-3 py-2 text-[11.5px] truncate max-w-[280px]" style={{ color: '#5C4A38' }}>
                        {run.error_message || run.message || '—'}
                      </td>
                      <td className="px-3 py-2 text-left">
                        <button onClick={() => onOpenDetail(run)} className="text-[11px] font-semibold hover:underline" style={{ color: '#8B5E34' }}>פרטים</button>
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
  );
}

// ── Activity feed ────────────────────────────────────────────────────────

const PAGE_SIZE = 50;
const DATE_RANGES: { v: string; label: string }[] = [
  { v: '',         label: 'כל הזמן' },
  { v: 'today',    label: 'היום' },
  { v: 'yesterday',label: 'אתמול' },
  { v: '7d',       label: '7 ימים' },
  { v: '30d',      label: '30 ימים' },
];

function ActivityFeed({ services }: { services: Service[] }) {
  const [items, setItems]   = useState<ActivityLog[]>([]);
  const [total, setTotal]   = useState(0);
  const [hasMore, setMore]  = useState(false);
  const [busy, setBusy]     = useState(false);
  const [detail, setDetail] = useState<ActivityLog | null>(null);

  const [q, setQ]                 = useState('');
  const [module, setModule]       = useState('');
  const [status, setStatus]       = useState('');
  const [actorType, setActorType] = useState('');
  const [range, setRange]         = useState('');

  const computeRangeWindow = (r: string): { from?: string; to?: string } => {
    if (!r) return {};
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString();
    if (r === 'today') return { from: todayStart };
    if (r === 'yesterday') {
      const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
      return { from: y.toISOString(), to: todayStart };
    }
    if (r === '7d')  { const d = new Date(now.getTime() - 7  * 86_400_000); return { from: d.toISOString() }; }
    if (r === '30d') { const d = new Date(now.getTime() - 30 * 86_400_000); return { from: d.toISOString() }; }
    return {};
  };

  const load = async (offset: number) => {
    setBusy(true);
    try {
      const params = new URLSearchParams();
      params.set('limit',  String(PAGE_SIZE));
      params.set('offset', String(offset));
      if (module)    params.set('module',     module);
      if (status)    params.set('status',     status);
      if (actorType) params.set('actor_type', actorType);
      if (q)         params.set('q',          q);
      const win = computeRangeWindow(range);
      if (win.from) params.set('from', win.from);
      if (win.to)   params.set('to',   win.to);

      const res = await fetch(`/api/system/activity?${params}`);
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'שגיאה בטעינת יומן');
        return;
      }
      const incoming = (json.items || []) as ActivityLog[];
      setItems(prev => offset === 0 ? incoming : [...prev, ...incoming]);
      setTotal(json.total ?? 0);
      setMore(!!json.hasMore);
    } finally {
      setBusy(false);
    }
  };

  // Initial + filter-change reload (offset 0).
  useEffect(() => {
    void load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module, status, actorType, range]);

  // Search has its own debounced reload.
  useEffect(() => {
    const t = window.setTimeout(() => { void load(0); }, 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <h2 className="text-[15px] font-bold" style={{ color: '#2B1A10' }}>
          יומן פעילות מערכת
          <span className="text-[11px] font-normal mr-2" style={{ color: '#8A7664' }}>· {items.length} מתוך {total}</span>
        </h2>
      </div>

      {/* Filter bar */}
      <Card className="p-3">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="חיפוש בכותרת, תיאור, ישות, אימייל…"
            className="px-3 h-9 text-[13px] rounded-lg border bg-white"
            style={{ borderColor: '#E8D8C6', color: '#3A2A1A' }}
            dir="rtl"
          />
          <select value={module} onChange={e => setModule(e.target.value)} className="px-2 h-9 rounded-lg border bg-white text-[12px]" style={{ borderColor: '#E8D8C6', color: '#3A2A1A' }}>
            <option value="">כל המודולים</option>
            {Object.entries(MODULE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={status} onChange={e => setStatus(e.target.value)} className="px-2 h-9 rounded-lg border bg-white text-[12px]" style={{ borderColor: '#E8D8C6', color: '#3A2A1A' }}>
            <option value="">כל הסטטוסים</option>
            {(['success', 'failed', 'skipped', 'warning', 'disabled'] as const).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          <select value={actorType} onChange={e => setActorType(e.target.value)} className="px-2 h-9 rounded-lg border bg-white text-[12px]" style={{ borderColor: '#E8D8C6', color: '#3A2A1A' }}>
            <option value="">כל המבצעים</option>
            {Object.entries(ACTOR_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={range} onChange={e => setRange(e.target.value)} className="px-2 h-9 rounded-lg border bg-white text-[12px]" style={{ borderColor: '#E8D8C6', color: '#3A2A1A' }}>
            {DATE_RANGES.map(d => <option key={d.v} value={d.v}>{d.label}</option>)}
          </select>
        </div>
        {(q || module || status || actorType || range) && (
          <div className="mt-2">
            <button onClick={() => { setQ(''); setModule(''); setStatus(''); setActorType(''); setRange(''); }} className="text-[11px] font-semibold hover:underline" style={{ color: '#8B5E34' }}>
              נקי סינון
            </button>
          </div>
        )}
      </Card>

      {/* Items */}
      {items.length === 0 ? (
        <Card className="p-6 text-center text-sm" style={{ color: '#8A7664' }}>{busy ? 'טוען…' : 'אין פעילות שתואמת את הסינון הנוכחי.'}</Card>
      ) : (
        <div className="space-y-2">
          {items.map(item => {
            const tone = STATUS_TONE[item.status] || STATUS_TONE.disabled;
            const icon = MODULE_ICON[item.module] || '•';
            const actor = item.actor_name
              || (item.actor_email && item.actor_email.split('@')[0])
              || ACTOR_LABEL[item.actor_type] || item.actor_type;
            return (
              <Card key={item.id} className="p-3 hover:bg-amber-50 transition-colors">
                <div className="flex items-start gap-3">
                  <span className="text-lg leading-tight" aria-hidden>{icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10.5px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: '#F4E9DC', color: '#7A4A27' }}>
                        {MODULE_LABEL[item.module] || item.module}
                      </span>
                      <span className="inline-flex items-center text-[10.5px] font-bold px-2 py-0.5 rounded-full border" style={{ backgroundColor: tone.bg, color: tone.fg, borderColor: tone.border }}>
                        {STATUS_LABEL[item.status] || item.status}
                      </span>
                      <span className="text-[11px]" style={{ color: '#A0907D' }}>{formatRunTime(item.created_at)}</span>
                    </div>
                    <p className="mt-1 text-[14px] font-bold truncate" style={{ color: '#2B1A10' }}>{item.title}</p>
                    {(item.description || item.entity_label) && (
                      <p className="mt-0.5 text-[12px] truncate" style={{ color: '#6B4A2D' }}>
                        {[item.entity_label, item.description].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    <p className="mt-1 text-[11px]" style={{ color: '#8A7664' }}>
                      בוצע ע״י: {actor} {item.actor_type !== 'user' && `(${ACTOR_LABEL[item.actor_type] || item.actor_type})`}
                    </p>
                  </div>
                  <button onClick={() => setDetail(item)} className="text-[11px] font-semibold hover:underline shrink-0 self-center" style={{ color: '#8B5E34' }}>
                    פרטים
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {hasMore && (
        <div className="text-center">
          <Button variant="outline" onClick={() => load(items.length)} loading={busy}>טען עוד</Button>
        </div>
      )}

      {/* Activity detail modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="פרטי פעולה" size="lg">
        {detail && (() => {
          const tone = STATUS_TONE[detail.status] || STATUS_TONE.disabled;
          return (
            <div className="space-y-3 text-sm" style={{ color: '#2B1A10' }}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-bold">{detail.title}</h3>
                <span className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full border" style={{ backgroundColor: tone.bg, color: tone.fg, borderColor: tone.border }}>
                  {STATUS_LABEL[detail.status] || detail.status}
                </span>
              </div>
              <DetailRow label="זמן"        value={formatRunTime(detail.created_at)} />
              <DetailRow label="מודול"       value={MODULE_LABEL[detail.module] || detail.module} />
              <DetailRow label="פעולה"       value={detail.action} mono />
              <DetailRow
                label="מבצע"
                value={`${detail.actor_name || detail.actor_email || ''}${detail.actor_email && detail.actor_name ? ` (${detail.actor_email})` : ''} · ${ACTOR_LABEL[detail.actor_type] || detail.actor_type}`}
              />
              {detail.entity_id && (
                <DetailRow label="ישות" value={`${detail.entity_type || ''} · ${detail.entity_label || detail.entity_id}`} />
              )}
              {detail.description && <DetailRow label="תיאור" value={detail.description} />}
              {detail.service_key && <DetailRow label="שירות קשור" value={services.find(s => s.service_key === detail.service_key)?.display_name || detail.service_key} />}

              {(detail.old_value != null || detail.new_value != null) && (
                <div>
                  <div className="text-[11px] font-bold mb-1" style={{ color: '#6B4A2D' }}>שינוי</div>
                  <div className="grid grid-cols-2 gap-2 text-[12px]">
                    <div className="p-3 rounded-lg" style={{ backgroundColor: '#FBF1EE' }}>
                      <div className="text-[10px] font-bold mb-1" style={{ color: '#A03C2C' }}>לפני</div>
                      <ChangeBlock value={detail.old_value} />
                    </div>
                    <div className="p-3 rounded-lg" style={{ backgroundColor: '#EAF4EE' }}>
                      <div className="text-[10px] font-bold mb-1" style={{ color: '#1F6B3E' }}>אחרי</div>
                      <ChangeBlock value={detail.new_value} />
                    </div>
                  </div>
                </div>
              )}

              {detail.metadata && Object.keys(detail.metadata).length > 0 && (
                <KeyValueBox metadata={detail.metadata} />
              )}

              {detail.error_message && (
                <div>
                  <div className="text-[11px] font-bold mb-1" style={{ color: '#A03C2C' }}>שגיאה מלאה</div>
                  <pre dir="ltr" className="text-[11.5px] p-3 rounded-lg whitespace-pre-wrap break-words"
                       style={{ backgroundColor: '#FBF1EE', color: '#7A2C1F', border: '1px solid #F0C7BF', fontFamily: 'monospace' }}>
                    {detail.error_message}
                  </pre>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button variant="outline" onClick={() => setDetail(null)}>סגור</Button>
              </div>
            </div>
          );
        })()}
      </Modal>
    </section>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function ToggleSwitch({ enabled, busy, onChange }: { enabled: boolean; busy: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      disabled={busy}
      role="switch"
      aria-checked={enabled}
      title={enabled ? 'לחצי לכיבוי' : 'לחצי להפעלה'}
      className="relative inline-flex shrink-0 transition-colors disabled:opacity-60"
      style={{
        width: 44, height: 24, borderRadius: 999,
        backgroundColor: enabled ? '#476D53' : '#C7B7A0',
        border: '1px solid ' + (enabled ? '#3A5A45' : '#A89882'),
      }}
    >
      <span
        className="absolute top-0.5 transition-all"
        style={{
          width: 18, height: 18, borderRadius: 999,
          backgroundColor: '#FFFFFF',
          left: enabled ? 22 : 2,
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
      <span className={`text-[12.5px] ${mono ? 'font-mono' : ''}`} style={{ color: '#2B1A10', wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}

function KeyValueBox({ metadata }: { metadata: Record<string, unknown> }) {
  return (
    <div>
      <div className="text-[11px] font-bold mb-1" style={{ color: '#6B4A2D' }}>נתונים נוספים</div>
      <ul className="text-[12px] space-y-1 p-3 rounded-lg" style={{ backgroundColor: '#FAF7F0' }}>
        {Object.entries(metadata).map(([k, v]) => (
          <li key={k}>
            <span className="font-mono text-[11px]" style={{ color: '#8A7664' }}>{k}:</span>{' '}
            <span style={{ color: '#2B1A10' }}>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChangeBlock({ value }: { value: unknown }) {
  if (value == null) return <span className="text-[11.5px]" style={{ color: '#8A7664' }}>—</span>;
  if (typeof value === 'object') {
    return (
      <ul className="space-y-0.5">
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <li key={k} className="text-[12px]">
            <span className="font-mono text-[11px]" style={{ color: '#8A7664' }}>{k}:</span>{' '}
            <span style={{ color: '#2B1A10' }}>{String(v ?? '—')}</span>
          </li>
        ))}
      </ul>
    );
  }
  return <span className="text-[12px]" style={{ color: '#2B1A10' }}>{String(value)}</span>;
}
