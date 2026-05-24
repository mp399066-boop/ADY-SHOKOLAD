'use client';

// /settings/system-control — admin-only "לוגים" page.
//
// Single page with tabs, one per business category. Each tab is a filtered
// view over system_activity_logs (via GET /api/system/activity). The first
// tab covers all order events (module=orders); the rest are service-specific
// (filtered by service_key).

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { PageLoading } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import toast from 'react-hot-toast';
import {
  STATUS_LABEL_HE,
  MODULE_LABEL_HE,
  ACTOR_LABEL_HE,
  type ActivityStatus,
  type ActorType,
  type ActivityModule,
} from '@/lib/activity-log-labels';

// ── Settings tab strip (top — same visual as the other settings pages) ───────

const SETTINGS_TABS = [
  { href: '/settings',                label: 'הגדרות עסק'      },
  { href: '/settings/users',          label: 'משתמשים והרשאות' },
  { href: '/settings/system-control', label: 'לוגים'            },
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

// ── Category tabs (inside the page) ──────────────────────────────────────────

// Each tab maps to a filter shape consumed by GET /api/system/activity.
// 'orders' is module-based (covers all order events regardless of service);
// the rest are service_key-based and align with the kill-switches in
// system_services.
type TabId =
  | 'orders'
  | 'morning_documents'
  | 'customer_order_emails'
  | 'admin_alerts'
  | 'delivery_notifications'
  | 'daily_orders_report'
  | 'woocommerce_orders'
  | 'inventory_deduction'
  | 'payplus_payments';

interface TabDef {
  id:    TabId;
  label: string;
  icon:  string;
  // Either filter by module (orders tab) or by service_key (everything else).
  // The empty-state copy is tab-specific so the owner immediately knows what
  // they'd expect to see in this tab.
  filter:    { module: ActivityModule } | { serviceKey: string };
  emptyHint: string;
}

const TABS: TabDef[] = [
  {
    id: 'orders', label: 'הזמנות', icon: '🧾',
    filter: { module: 'orders' },
    emptyHint: 'עדיין אין אירועי הזמנות לתקופה שנבחרה.',
  },
  {
    id: 'morning_documents', label: 'הפקת מסמכים פיננסיים', icon: '🧾',
    filter: { serviceKey: 'morning_documents' },
    emptyHint: 'עדיין לא הופקו חשבוניות / קבלות דרך Morning בתקופה שנבחרה.',
  },
  {
    id: 'customer_order_emails', label: 'שליחת אישורי הזמנה ללקוחות', icon: '✉️',
    filter: { serviceKey: 'customer_order_emails' },
    emptyHint: 'עדיין לא נשלחו אישורי הזמנה ללקוחות בתקופה שנבחרה.',
  },
  {
    id: 'admin_alerts', label: 'התראות פנימיות לבעלת העסק', icon: '🔔',
    filter: { serviceKey: 'admin_alerts' },
    emptyHint: 'עדיין לא נשלחו התראות פנימיות בתקופה שנבחרה.',
  },
  {
    id: 'delivery_notifications', label: 'משלוחים — קישורים לשליח', icon: '🚚',
    filter: { serviceKey: 'delivery_notifications' },
    emptyHint: 'עדיין לא נשלחו קישורים לשליחים בתקופה שנבחרה.',
  },
  {
    id: 'daily_orders_report', label: 'דוח יומי אוטומטי', icon: '📊',
    filter: { serviceKey: 'daily_orders_report' },
    emptyHint: 'הדוח היומי טרם רץ בתקופה שנבחרה.',
  },
  {
    id: 'woocommerce_orders', label: 'קבלת הזמנות — WooCommerce', icon: '🛍️',
    filter: { serviceKey: 'woocommerce_orders' },
    emptyHint: 'עדיין לא התקבלו הזמנות מ-WooCommerce בתקופה שנבחרה.',
  },
  {
    id: 'inventory_deduction', label: 'הורדת מלאי אוטומטית', icon: '📦',
    filter: { serviceKey: 'inventory_deduction' },
    emptyHint: 'עדיין לא בוצעה הורדת מלאי אוטומטית בתקופה שנבחרה.',
  },
  {
    id: 'payplus_payments', label: 'PayPlus — קישור תשלום', icon: '💳',
    filter: { serviceKey: 'payplus_payments' },
    emptyHint: 'עדיין לא נוצרו קישורי תשלום ב-PayPlus בתקופה שנבחרה.',
  },
];

// ── Types ────────────────────────────────────────────────────────────────────

interface ActivityLog {
  id: string;
  created_at: string;
  actor_type: ActorType | string;
  actor_user_id: string | null;
  actor_email: string | null;
  actor_name: string | null;
  module: ActivityModule | string;
  action: string;
  status: ActivityStatus | string;
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

// ── Visual config ────────────────────────────────────────────────────────────

const STATUS_TONE: Record<string, { bg: string; fg: string; border: string }> = {
  success:  { bg: '#E8F4EC', fg: '#1F6B3E', border: '#BBE0C8' },
  failed:   { bg: '#FBE9E7', fg: '#A03C2C', border: '#F0C7BF' },
  skipped:  { bg: '#F4ECDF', fg: '#7A5C2C', border: '#DCC9A8' },
  warning:  { bg: '#FFF4E0', fg: '#8A5A18', border: '#EDCF98' },
  disabled: { bg: '#EFE7DA', fg: '#5C4A38', border: '#D5C9B5' },
};

const PAGE_SIZE = 50;

// ── Formatters ───────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('he-IL', {
      timeZone: 'Asia/Jerusalem',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function formatRelative(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const diff = Date.now() - then;
    const min  = Math.floor(diff / 60_000);
    if (min < 1)  return 'הרגע';
    if (min < 60) return `לפני ${min} דק'`;
    const hr = Math.floor(min / 60);
    if (hr < 24)  return `לפני ${hr} שעות`;
    const day = Math.floor(hr / 24);
    if (day < 7)  return `לפני ${day} ימים`;
    return formatTime(iso);
  } catch { return iso; }
}

function statusLabel(s: string): string { return STATUS_LABEL_HE[s as ActivityStatus] || s; }
function moduleLabel(m: string): string { return MODULE_LABEL_HE[m as ActivityModule] || m; }
function actorLabel(t: string): string  { return ACTOR_LABEL_HE[t as ActorType]      || t; }

// ── Page ─────────────────────────────────────────────────────────────────────

export default function LogsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('orders');

  const [items, setItems]         = useState<ActivityLog[]>([]);
  const [total, setTotal]         = useState(0);
  const [hasMore, setHasMore]     = useState(false);
  const [loading, setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [detail, setDetail]       = useState<ActivityLog | null>(null);

  // Filters (apply on top of the tab filter)
  const [q, setQ]                 = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [statusF, setStatusF]     = useState('');
  const [fromF, setFromF]         = useState('');
  const [toF, setToF]             = useState('');

  // Debounce free-text input so we don't hammer the API.
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const activeDef = useMemo(() => TABS.find(t => t.id === activeTab)!, [activeTab]);

  const buildParams = useCallback((offset: number) => {
    const sp = new URLSearchParams();
    sp.set('limit', String(PAGE_SIZE));
    sp.set('offset', String(offset));
    if ('module' in activeDef.filter)    sp.set('module',      activeDef.filter.module);
    if ('serviceKey' in activeDef.filter) sp.set('service_key', activeDef.filter.serviceKey);
    if (qDebounced) sp.set('q', qDebounced);
    if (statusF)    sp.set('status', statusF);
    if (fromF)      sp.set('from', new Date(fromF).toISOString());
    if (toF)        sp.set('to',   new Date(toF + 'T23:59:59').toISOString());
    return sp;
  }, [activeDef, qDebounced, statusF, fromF, toF]);

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/system/activity?${buildParams(0)}`);
      if (res.status === 401 || res.status === 403) { setForbidden(true); return; }
      const json = await res.json();
      setItems(json.items || []);
      setTotal(json.total || 0);
      setHasMore(Boolean(json.hasMore));
    } catch {
      setItems([]);
      setTotal(0);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/system/activity?${buildParams(items.length)}`);
      if (!res.ok) return;
      const json = await res.json();
      setItems(prev => [...prev, ...((json.items as ActivityLog[]) || [])]);
      setTotal(json.total || 0);
      setHasMore(Boolean(json.hasMore));
    } finally {
      setLoadingMore(false);
    }
  }, [buildParams, items.length, hasMore, loadingMore]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  const filterActive = useMemo(
    () => Boolean(qDebounced || statusF || fromF || toF),
    [qDebounced, statusF, fromF, toF],
  );

  const clearFilters = () => {
    setQ('');
    setQDebounced('');
    setStatusF('');
    setFromF('');
    setToF('');
  };

  if (forbidden) {
    return (
      <div className="max-w-3xl" dir="rtl">
        <SettingsTabs active="/settings/system-control" />
        <EmptyState
          title="גישה ללוגים מוגבלת"
          description="המסך זמין למשתמש בעל הרשאת אדמין בלבד. אם זה אמור להיות זמין לך, פני למנהלת המערכת."
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl space-y-5" dir="rtl">
      <SettingsTabs active="/settings/system-control" />

      <div>
        <h1 className="text-xl font-bold" style={{ color: '#3A2A1A' }}>לוגים</h1>
        <p className="text-sm mt-1" style={{ color: '#8A7664' }}>
          מה קרה במערכת — מחולק לפי קטגוריות. בחרי טאב כדי לראות רק את האירועים של אותה קטגוריה.
        </p>
      </div>

      {/* Manual trigger for the monthly backup export — calls the existing
          /api/reports/monthly-backup-export route (the same one Vercel cron
          fires on the 1st of every month). Optional ?to= override in the
          input lets the operator send to any test address; empty input
          defaults to adi548419927@gmail.com (the route's default). */}
      <MonthlyBackupCard />

      {/* Category tabs */}
      <CategoryTabs active={activeTab} onChange={(id) => { clearFilters(); setActiveTab(id); }} />

      {/* In-tab filter bar */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="חיפוש חופשי (כותרת / תיאור / לקוח / משתמש)"
            className="px-2 h-8 rounded-lg border bg-white min-w-[230px] flex-1"
            style={{ borderColor: '#E8D8C6', color: '#3A2A1A' }}
          />

          <select
            value={statusF}
            onChange={e => setStatusF(e.target.value)}
            className="px-2 h-8 rounded-lg border bg-white"
            style={{ borderColor: '#E8D8C6', color: '#3A2A1A' }}
          >
            <option value="">כל הסטטוסים</option>
            {(['success', 'failed', 'warning', 'skipped', 'disabled'] as ActivityStatus[]).map(s => (
              <option key={s} value={s}>{STATUS_LABEL_HE[s]}</option>
            ))}
          </select>

          <span style={{ color: '#8A7664' }}>מ-</span>
          <input
            type="date"
            value={fromF}
            onChange={e => setFromF(e.target.value)}
            className="px-2 h-8 rounded-lg border bg-white"
            style={{ borderColor: '#E8D8C6', color: '#3A2A1A' }}
          />
          <span style={{ color: '#8A7664' }}>עד-</span>
          <input
            type="date"
            value={toF}
            onChange={e => setToF(e.target.value)}
            className="px-2 h-8 rounded-lg border bg-white"
            style={{ borderColor: '#E8D8C6', color: '#3A2A1A' }}
          />

          {filterActive && (
            <button
              onClick={clearFilters}
              className="text-[11px] font-semibold hover:underline"
              style={{ color: '#8B5E34' }}
            >
              נקי סינון
            </button>
          )}

          <button
            onClick={() => void loadFirstPage()}
            className="text-[11px] font-semibold hover:underline mr-auto"
            style={{ color: '#8B5E34' }}
          >
            רענן
          </button>
        </div>
      </Card>

      {/* Feed */}
      {loading ? (
        <PageLoading />
      ) : items.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            title={`אין פעילות בקטגוריה "${activeDef.label}"`}
            description={filterActive ? 'לא נמצאו לוגים שתואמים את הסינון. נסי לשנות את התקופה או לנקות סינון.' : activeDef.emptyHint}
          />
        </Card>
      ) : (
        <>
          <Card className="p-0 overflow-hidden">
            <ul className="divide-y" style={{ borderColor: '#F0E5D8' }}>
              {items.map(row => (
                <LogRow key={row.id} row={row} icon={activeDef.icon} onOpen={() => setDetail(row)} />
              ))}
            </ul>
          </Card>

          <div className="flex items-center justify-between gap-3 text-[12px]" style={{ color: '#8A7664' }}>
            <span>מציג {items.length} מתוך {total}</span>
            {hasMore && (
              <Button variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? 'טוען...' : 'טען עוד'}
              </Button>
            )}
          </div>
        </>
      )}

      {/* Detail modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="פרטי לוג" size="lg">
        {detail && <LogDetail row={detail} onClose={() => setDetail(null)} />}
      </Modal>
    </div>
  );
}

// ── Category tabs ────────────────────────────────────────────────────────────

function CategoryTabs({ active, onChange }: { active: TabId; onChange: (id: TabId) => void }) {
  return (
    <div className="flex flex-wrap gap-1" style={{ borderBottom: '1px solid #EAE0D4' }}>
      {TABS.map(tab => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className="px-3 py-2 text-[12.5px] font-semibold transition-colors inline-flex items-center gap-1.5"
            style={isActive
              ? { color: '#5C3410', borderBottom: '2.5px solid #C9A46A', marginBottom: '-1px' }
              : { color: '#8A7664' }}
          >
            <span aria-hidden>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Feed row ─────────────────────────────────────────────────────────────────

function LogRow({ row, icon, onOpen }: { row: ActivityLog; icon: string; onOpen: () => void }) {
  const tone = STATUS_TONE[row.status] || STATUS_TONE.disabled;
  const actorText = row.actor_email || row.actor_name || actorLabel(row.actor_type);

  return (
    <li>
      <button
        onClick={onOpen}
        className="w-full text-right px-4 py-3 hover:bg-amber-50 transition-colors"
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="text-[16px] leading-none mt-0.5 select-none"
            style={{ width: 20, textAlign: 'center' }}
          >
            {icon}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="inline-flex items-center text-[10.5px] font-bold px-2 py-0.5 rounded-full border"
                style={{ backgroundColor: tone.bg, color: tone.fg, borderColor: tone.border }}
              >
                {statusLabel(row.status)}
              </span>
              <span className="text-[14px] font-semibold leading-tight" style={{ color: '#2B1A10' }}>
                {row.title}
              </span>
            </div>

            <div className="mt-1 text-[11.5px]" style={{ color: '#8A7664' }}>
              {moduleLabel(row.module)}
              <span style={{ color: '#C9B89E' }}> · </span>
              <span dir="ltr" style={{ fontFamily: 'monospace' }}>{row.action}</span>
              <span style={{ color: '#C9B89E' }}> · </span>
              {actorText}
              {row.entity_label && (
                <>
                  <span style={{ color: '#C9B89E' }}> · </span>
                  <span style={{ color: '#5C4A38', fontWeight: 600 }}>{row.entity_label}</span>
                </>
              )}
            </div>

            {row.description && (
              <div className="mt-1 text-[12px] truncate" style={{ color: '#5C4A38' }}>
                {row.description}
              </div>
            )}
          </div>

          <div className="text-[11px] whitespace-nowrap" style={{ color: '#A0907D' }} title={formatTime(row.created_at)}>
            {formatRelative(row.created_at)}
          </div>
        </div>
      </button>
    </li>
  );
}

// ── Detail modal body ────────────────────────────────────────────────────────

function LogDetail({ row, onClose }: { row: ActivityLog; onClose: () => void }) {
  const tone = STATUS_TONE[row.status] || STATUS_TONE.disabled;
  return (
    <div className="space-y-3 text-sm" style={{ color: '#2B1A10' }}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-bold">{row.title}</h3>
        <span
          className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full border"
          style={{ backgroundColor: tone.bg, color: tone.fg, borderColor: tone.border }}
        >
          {statusLabel(row.status)}
        </span>
      </div>

      <DetailRow label="זמן"      value={formatTime(row.created_at)} />
      <DetailRow label="מודול"    value={moduleLabel(row.module)} />
      <DetailRow label="פעולה"    value={row.action} mono />
      <DetailRow label="גורם"     value={`${actorLabel(row.actor_type)}${row.actor_email ? ' · ' + row.actor_email : row.actor_name ? ' · ' + row.actor_name : ''}`} />
      {row.entity_type && (
        <DetailRow
          label="ישות"
          value={`${row.entity_type}${row.entity_label ? ' · ' + row.entity_label : ''}${row.entity_id ? ' · ' + row.entity_id : ''}`}
        />
      )}
      {row.description && <DetailRow label="תיאור" value={row.description} />}

      {row.error_message && (
        <div>
          <div className="text-[11px] font-bold mb-1" style={{ color: '#A03C2C' }}>שגיאה</div>
          <pre dir="ltr" className="text-[11.5px] p-3 rounded-lg whitespace-pre-wrap break-words"
               style={{ backgroundColor: '#FBF1EE', color: '#7A2C1F', border: '1px solid #F0C7BF', fontFamily: 'monospace' }}>
            {row.error_message}
          </pre>
        </div>
      )}

      <JsonBlock label="metadata"  value={row.metadata} />
      <JsonBlock label="old_value" value={row.old_value} />
      <JsonBlock label="new_value" value={row.new_value} />

      {(row.ip_address || row.user_agent) && (
        <div className="pt-1 text-[11px]" style={{ color: '#8A7664' }}>
          {row.ip_address && <span>IP: <span dir="ltr" style={{ fontFamily: 'monospace' }}>{row.ip_address}</span></span>}
          {row.ip_address && row.user_agent && <span> · </span>}
          {row.user_agent && <span dir="ltr" style={{ fontFamily: 'monospace' }}>{row.user_agent}</span>}
        </div>
      )}

      {(row.service_key || row.related_run_id) && (
        <div className="text-[11px]" style={{ color: '#8A7664' }}>
          {row.service_key && <span>שירות: <span dir="ltr" style={{ fontFamily: 'monospace' }}>{row.service_key}</span></span>}
          {row.service_key && row.related_run_id && <span> · </span>}
          {row.related_run_id && <span>ריצה: <span dir="ltr" style={{ fontFamily: 'monospace' }}>{row.related_run_id}</span></span>}
        </div>
      )}

      <div className="flex justify-end pt-2">
        <Button variant="outline" onClick={onClose}>סגור</Button>
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2 text-[12.5px]">
      <div className="font-semibold" style={{ color: '#6B4A2D' }}>{label}</div>
      <div dir={mono ? 'ltr' : undefined} style={{ color: '#2B1A10', fontFamily: mono ? 'monospace' : undefined }}>{value}</div>
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  if (value == null) return null;
  if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length === 0) return null;
  let text: string;
  try {
    text = JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  return (
    <div>
      <div className="text-[11px] font-bold mb-1" style={{ color: '#6B4A2D' }}>{label}</div>
      <pre dir="ltr" className="text-[11.5px] p-3 rounded-lg whitespace-pre-wrap break-words max-h-72 overflow-auto"
           style={{ backgroundColor: '#FAF5EC', color: '#3A2A1A', border: '1px solid #EAE0D4', fontFamily: 'monospace' }}>
        {text}
      </pre>
    </div>
  );
}

// ─── MonthlyBackupCard ──────────────────────────────────────────────────────
// Tiny operator-side trigger for the existing backup route. Pure UI shim —
// no business logic, no new endpoints. Defaults to the previous calendar
// month (route default); empty input field sends to the route's default
// recipient (adi548419927@gmail.com).
function MonthlyBackupCard() {
  const [testEmail, setTestEmail] = useState<string>('');
  const [sending,   setSending]   = useState<boolean>(false);

  const send = async () => {
    setSending(true);
    try {
      const qs = testEmail.trim() && testEmail.includes('@')
        ? `?to=${encodeURIComponent(testEmail.trim())}`
        : '';
      const res  = await fetch(`/api/reports/monthly-backup-export${qs}`, { method: 'GET' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || json?.message || 'שגיאה בשליחת הגיבוי');
      toast.success('הגיבוי נשלח למייל');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'שגיאה בשליחת הגיבוי');
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-[15px] font-bold" style={{ color: '#3A2A1A' }}>גיבוי חודשי</h2>
        <span className="text-[11px]" style={{ color: '#8A7664' }}>ברירת מחדל: חודש קודם · adi548419927@gmail.com</span>
      </div>
      <p className="text-[12px] mb-3" style={{ color: '#8A7664' }}>
        מפעיל את אותו הראוט שרץ אוטומטית ב-1 בחודש. שולח קובץ Excel עם נתוני CRM של החודש הקודם.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="email"
          value={testEmail}
          onChange={e => setTestEmail(e.target.value)}
          placeholder="מייל לבדיקה (אופציונלי) — ריק = ברירת מחדל"
          disabled={sending}
          className="px-3 h-9 rounded-lg border bg-white text-[13px]"
          style={{ borderColor: '#E8D8C6', color: '#3A2A1A', minWidth: '18rem' }}
        />
        <Button onClick={send} loading={sending} disabled={sending}>
          שלחי גיבוי חודשי לבדיקה
        </Button>
      </div>
    </Card>
  );
}
