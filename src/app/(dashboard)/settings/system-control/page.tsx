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
  { href: '/settings/lists',          label: 'רשימות ניהול'    },
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

interface SummaryCounts {
  failed:  number;
  warning: number;
  success: number;
  total:   number;
}

interface ActivitySummary {
  window_days: number;
  since:       string;
  by_service:  Record<string, SummaryCounts>;
  by_module:   Record<string, SummaryCounts>;
  totals:      SummaryCounts;
}

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
  const [summary, setSummary]     = useState<ActivitySummary | null>(null);

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

  // Cross-category failure summary for the sidebar badges + hero banner.
  // Re-fetched on every loadFirstPage so the badges stay roughly in sync
  // when the user filters / refreshes.
  const loadSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/system/activity/summary?days=7');
      if (!res.ok) return;
      const json = (await res.json()) as ActivitySummary;
      setSummary(json);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void loadSummary(); }, [loadSummary]);

  // Quick lookup: how many failures (last 7d) per tab?
  const failuresByTab = useMemo<Record<TabId, number>>(() => {
    const out: Record<TabId, number> = {
      orders: 0, morning_documents: 0, customer_order_emails: 0, admin_alerts: 0,
      delivery_notifications: 0, daily_orders_report: 0, woocommerce_orders: 0,
      inventory_deduction: 0, payplus_payments: 0,
    };
    if (!summary) return out;
    for (const tab of TABS) {
      const f = tab.filter;
      const c = 'module' in f
        ? summary.by_module[f.module]
        : summary.by_service[f.serviceKey];
      out[tab.id] = c?.failed ?? 0;
    }
    return out;
  }, [summary]);

  const totalFailures7d = summary?.totals.failed ?? 0;

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
    <div className="max-w-7xl space-y-5" dir="rtl">
      <SettingsTabs active="/settings/system-control" />

      <div>
        <h1 className="text-xl font-bold" style={{ color: '#3A2A1A' }}>לוגים</h1>
        <p className="text-sm mt-1" style={{ color: '#8A7664' }}>
          מה קרה במערכת — בחרי קטגוריה מהתפריט מצד ימין כדי לראות רק את האירועים של אותה קטגוריה.
        </p>
      </div>

      {/* Hero failure banner — only shown when there are failures in the
          last 7 days. Clicking the action jumps to the category with the
          most failures and applies a status=failed filter so the operator
          lands directly on the broken items. */}
      {totalFailures7d > 0 && (
        <FailureBanner
          totalFailures={totalFailures7d}
          failuresByTab={failuresByTab}
          windowDays={summary?.window_days ?? 7}
          onJump={(tabId) => {
            clearFilters();
            setStatusF('failed');
            setActiveTab(tabId);
          }}
        />
      )}

      {/* Manual trigger for the monthly backup export — calls the existing
          /api/reports/monthly-backup-export route (the same one Vercel cron
          fires on the 1st of every month). Optional ?to= override in the
          input lets the operator send to any test address; empty input
          defaults to adi548419927@gmail.com (the route's default). */}
      <MonthlyBackupCard />

      {/* Two-column layout: sidebar (categories) on the right, feed on the
          left. On narrow widths the sidebar collapses to a horizontal pill
          row that scrolls. */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Sidebar / horizontal scroller */}
        <aside className="lg:w-64 lg:flex-shrink-0">
          <CategorySidebar
            active={activeTab}
            failuresByTab={failuresByTab}
            windowDays={summary?.window_days ?? 7}
            onChange={(id) => { clearFilters(); setActiveTab(id); }}
          />
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 space-y-4">
          {/* In-tab filter bar */}
          <Card className="p-3">
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="חיפוש חופשי (כותרת / תיאור / לקוח / משתמש)"
                className="px-2 h-8 rounded-lg border bg-white min-w-[200px] flex-1"
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

          {/* Active category header — gives the feed a clear "you are here" anchor */}
          <div className="flex items-center gap-2">
            <span aria-hidden className="text-[20px] leading-none">{activeDef.icon}</span>
            <h2 className="text-[16px] font-bold" style={{ color: '#3A2A1A' }}>{activeDef.label}</h2>
          </div>

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
              <StatusSummary items={items} total={total} />

              <div className="space-y-3">
                {items.map(row => (
                  <LogCard key={row.id} row={row} icon={activeDef.icon} onOpen={() => setDetail(row)} />
                ))}
              </div>

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
        </main>
      </div>

      {/* Detail modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="פרטי לוג" size="lg">
        {detail && <LogDetail row={detail} onClose={() => setDetail(null)} />}
      </Modal>
    </div>
  );
}

// ── Category sidebar (right rail in RTL) ─────────────────────────────────────
// Vertical list of categories. On narrow widths (<lg) the same list renders
// as a horizontally-scrollable pill row above the feed so nothing gets cut
// off on mobile.

function CategorySidebar({
  active, failuresByTab, windowDays, onChange,
}: {
  active: TabId;
  failuresByTab: Record<TabId, number>;
  windowDays: number;
  onChange: (id: TabId) => void;
}) {
  return (
    <>
      {/* Desktop / tablet — vertical list */}
      <nav className="hidden lg:block">
        <Card className="p-2">
          <div className="px-2 pt-1 pb-2 text-[10.5px] font-bold uppercase tracking-wider" style={{ color: '#A0907D', letterSpacing: '0.06em' }}>
            קטגוריות
          </div>
          <ul className="space-y-1">
            {TABS.map(tab => {
              const isActive = active === tab.id;
              const failures = failuresByTab[tab.id] || 0;
              return (
                <li key={tab.id}>
                  <button
                    onClick={() => onChange(tab.id)}
                    className="w-full text-right px-3 py-2 rounded-lg inline-flex items-center gap-2.5 transition-colors"
                    style={isActive
                      ? { backgroundColor: '#FAF5EC', color: '#5C3410', borderRight: '3px solid #C9A46A', paddingRight: 9 }
                      : { color: '#5C4A38' }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = '#FAF7F0'; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = ''; }}
                  >
                    <span aria-hidden className="text-[16px] leading-none w-5 text-center">{tab.icon}</span>
                    <span className="text-[12.5px] font-semibold leading-tight flex-1">{tab.label}</span>
                    {failures > 0 && (
                      <span
                        title={`${failures} שגיאות ב-${windowDays} ימים האחרונים`}
                        className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full text-[11px] font-bold tabular-nums"
                        style={{ backgroundColor: '#A03C2C', color: '#FFFFFF', boxShadow: '0 0 0 2px #FFFFFF' }}
                      >
                        {failures}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      </nav>

      {/* Mobile — horizontal scroll of pill buttons */}
      <div className="lg:hidden -mx-1 px-1 overflow-x-auto">
        <div className="flex gap-2 pb-1" style={{ minWidth: 'max-content' }}>
          {TABS.map(tab => {
            const isActive = active === tab.id;
            const failures = failuresByTab[tab.id] || 0;
            return (
              <button
                key={tab.id}
                onClick={() => onChange(tab.id)}
                className="inline-flex items-center gap-1.5 px-3 h-9 rounded-full border whitespace-nowrap text-[12.5px] font-semibold transition-colors"
                style={isActive
                  ? { backgroundColor: '#5C3410', color: '#FFFFFF', borderColor: '#5C3410' }
                  : { backgroundColor: '#FFFFFF', color: '#5C4A38', borderColor: '#EAE0D4' }}
              >
                <span aria-hidden>{tab.icon}</span>
                <span>{tab.label}</span>
                {failures > 0 && (
                  <span
                    className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10.5px] font-bold tabular-nums mr-0.5"
                    style={isActive
                      ? { backgroundColor: '#FFFFFF', color: '#A03C2C' }
                      : { backgroundColor: '#A03C2C', color: '#FFFFFF' }}
                  >
                    {failures}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ── Failure hero banner ──────────────────────────────────────────────────────
// Shown at the top of the page whenever there were any failures in the last
// N days. The "highest-failures" button jumps the operator straight to that
// category with status=failed pre-applied so the broken items are first
// thing they see.

function FailureBanner({
  totalFailures, failuresByTab, windowDays, onJump,
}: {
  totalFailures: number;
  failuresByTab: Record<TabId, number>;
  windowDays: number;
  onJump: (id: TabId) => void;
}) {
  // Top 3 categories with failures (descending count).
  const top = useMemo(() => {
    return TABS
      .map(t => ({ tab: t, count: failuresByTab[t.id] || 0 }))
      .filter(x => x.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
  }, [failuresByTab]);

  if (top.length === 0) return null;
  const worst = top[0];

  return (
    <div
      className="rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3"
      style={{
        background: 'linear-gradient(135deg, #FBE9E7 0%, #FBF1EE 100%)',
        border: '1.5px solid #F0C7BF',
        boxShadow: '0 2px 8px rgba(160,60,44,0.10)',
      }}
    >
      <div
        aria-hidden
        className="flex items-center justify-center rounded-full flex-shrink-0"
        style={{
          width: 40, height: 40,
          backgroundColor: '#A03C2C',
          color: '#FFFFFF',
          fontSize: 20, fontWeight: 700, lineHeight: 1,
        }}
      >
        ✗
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-bold" style={{ color: '#7A2C1F' }}>
          {totalFailures} {totalFailures === 1 ? 'שגיאה' : 'שגיאות'} ב-{windowDays} הימים האחרונים
        </div>
        <div className="text-[12px] mt-0.5 flex flex-wrap items-center gap-1" style={{ color: '#7A2C1F' }}>
          <span>הכי הרבה ב:</span>
          {top.map((x, i) => (
            <button
              key={x.tab.id}
              onClick={() => onJump(x.tab.id)}
              className="inline-flex items-center gap-1 px-2 h-6 rounded-md text-[11.5px] font-semibold hover:underline"
              style={{ backgroundColor: '#FFFFFF', color: '#A03C2C', border: '1px solid #F0C7BF' }}
            >
              <span aria-hidden>{x.tab.icon}</span>
              <span>{x.tab.label}</span>
              <span className="font-bold">({x.count})</span>
              {i < top.length - 1 && <span aria-hidden style={{ color: '#D5A99E' }}>·</span>}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={() => onJump(worst.tab.id)}
        className="inline-flex items-center justify-center px-4 h-9 rounded-lg text-[12.5px] font-bold text-white whitespace-nowrap transition-colors"
        style={{ backgroundColor: '#A03C2C', boxShadow: '0 1px 3px rgba(160,60,44,0.30)' }}
        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#892F22'; }}
        onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#A03C2C'; }}
      >
        בדקי את השגיאות ←
      </button>
    </div>
  );
}

// ── Status summary (Make-style chips on top of the feed) ─────────────────────

function StatusSummary({ items, total }: { items: ActivityLog[]; total: number }) {
  const counts = useMemo(() => {
    const c = { success: 0, failed: 0, warning: 0, skipped: 0, disabled: 0 } as Record<string, number>;
    for (const it of items) {
      if (c[it.status] != null) c[it.status]++;
    }
    return c;
  }, [items]);

  const Chip = ({ icon, label, count, bg, fg, border }: {
    icon: string; label: string; count: number; bg: string; fg: string; border: string;
  }) => (
    <div
      className="inline-flex items-center gap-2 px-3 h-9 rounded-xl border"
      style={{ backgroundColor: bg, color: fg, borderColor: border }}
    >
      <span aria-hidden className="text-[14px] font-bold leading-none">{icon}</span>
      <span className="text-[12px] font-semibold">{label}</span>
      <span className="text-[13px] font-bold tabular-nums">{count}</span>
    </div>
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        className="inline-flex items-center gap-2 px-3 h-9 rounded-xl border"
        style={{ backgroundColor: '#FAF5EC', color: '#5C3410', borderColor: '#EAE0D4' }}
      >
        <span className="text-[12px] font-semibold">סך הכל</span>
        <span className="text-[13px] font-bold tabular-nums">{total}</span>
      </div>
      <Chip icon="✓" label="הצליחו" count={counts.success} bg={STATUS_TONE.success.bg} fg={STATUS_TONE.success.fg} border={STATUS_TONE.success.border} />
      <Chip icon="✗" label="נכשלו"  count={counts.failed}  bg={STATUS_TONE.failed.bg}  fg={STATUS_TONE.failed.fg}  border={STATUS_TONE.failed.border}  />
      <Chip icon="⚠" label="אזהרות" count={counts.warning} bg={STATUS_TONE.warning.bg} fg={STATUS_TONE.warning.fg} border={STATUS_TONE.warning.border} />
      {(counts.skipped > 0 || counts.disabled > 0) && (
        <Chip icon="⏸" label="דולגו / כבויים" count={counts.skipped + counts.disabled} bg={STATUS_TONE.skipped.bg} fg={STATUS_TONE.skipped.fg} border={STATUS_TONE.skipped.border} />
      )}
    </div>
  );
}

// ── Make-style log card ──────────────────────────────────────────────────────
// One card per event. Big status strip on the right (RTL — visual "leading"
// edge), status icon + label up top, bold scenario title, prominent entity
// chip, and — when failed — the error reason rendered inline in a red box so
// the operator never has to open the modal to know "what broke".

const STATUS_ICON: Record<string, string> = {
  success:  '✓',
  failed:   '✗',
  warning:  '⚠',
  skipped:  '⏸',
  disabled: '⏻',
};

const STATUS_VERB: Record<string, string> = {
  success:  'הצליח',
  failed:   'נכשל',
  warning:  'הסתיים עם אזהרה',
  skipped:  'דולג',
  disabled: 'השירות היה כבוי',
};

function LogCard({ row, icon, onOpen }: { row: ActivityLog; icon: string; onOpen: () => void }) {
  const tone = STATUS_TONE[row.status] || STATUS_TONE.disabled;
  const actorText = row.actor_email || row.actor_name || actorLabel(row.actor_type);
  const statusIcon = STATUS_ICON[row.status] || '•';
  const statusVerb = STATUS_VERB[row.status] || statusLabel(row.status);
  const isError = row.status === 'failed';
  const isWarn  = row.status === 'warning';

  return (
    <button
      onClick={onOpen}
      className="w-full text-right rounded-xl transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2"
      style={{
        backgroundColor: isError ? '#FFFAF9' : '#FFFFFF',
        border: isError
          ? `2px solid ${tone.fg}`
          : isWarn
            ? `1.5px solid ${tone.border}`
            : '1px solid #EAE0D4',
        boxShadow: isError
          ? '0 2px 10px rgba(160,60,44,0.18)'
          : '0 1px 6px rgba(58,42,26,0.05)',
        overflow: 'hidden',
      }}
    >
      <div className="flex">
        {/* Status strip on the leading edge (right in RTL) — large color bar
            so the eye picks up success/failure from across the screen.
            Failed events get a thicker bar to draw attention immediately. */}
        <div
          aria-hidden
          style={{
            width: isError ? 10 : 6,
            backgroundColor: tone.fg,
            flex: `0 0 ${isError ? 10 : 6}px`,
          }}
        />

        <div className="flex-1 p-4">
          {/* Top row: big status pill on the right, time on the left */}
          <div className="flex items-center justify-between gap-3 mb-2">
            <div
              className="inline-flex items-center gap-2 px-3 h-8 rounded-full border"
              style={{ backgroundColor: tone.bg, color: tone.fg, borderColor: tone.border }}
            >
              <span aria-hidden className="text-[15px] font-bold leading-none">{statusIcon}</span>
              <span className="text-[13px] font-bold">{statusVerb}</span>
            </div>
            <div className="text-[11.5px]" style={{ color: '#A0907D' }} title={formatTime(row.created_at)}>
              {formatRelative(row.created_at)} <span style={{ color: '#C9B89E' }}>·</span> {formatTime(row.created_at)}
            </div>
          </div>

          {/* Title — the "scenario" line. Big and bold so it dominates. */}
          <div className="flex items-start gap-2">
            <span aria-hidden className="text-[18px] leading-none mt-0.5 select-none">{icon}</span>
            <h3 className="text-[15.5px] font-bold leading-snug flex-1" style={{ color: '#2B1A10' }}>
              {row.title}
            </h3>
          </div>

          {/* Entity chip + meta */}
          <div className="mt-2 flex items-center gap-2 flex-wrap text-[12px]" style={{ color: '#6B4A2D' }}>
            {row.entity_label && (
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-md text-[11.5px] font-semibold"
                style={{ backgroundColor: '#FAF5EC', color: '#5C3410', border: '1px solid #E7D2A6' }}
              >
                {row.entity_label}
              </span>
            )}
            <span style={{ color: '#8A7664' }}>{moduleLabel(row.module)}</span>
            <span style={{ color: '#C9B89E' }}>·</span>
            <span style={{ color: '#8A7664' }}>בוצע על ידי: <span style={{ color: '#5C4A38', fontWeight: 600 }}>{actorText}</span></span>
          </div>

          {/* Description — short context line */}
          {row.description && (
            <div className="mt-2 text-[13px] leading-relaxed" style={{ color: '#3A2A1A' }}>
              {row.description}
            </div>
          )}

          {/* Inline error / warning panel — visible without opening the modal */}
          {(isError || isWarn) && row.error_message && (
            <div
              className="mt-3 p-3 rounded-lg text-[12.5px] leading-relaxed flex items-start gap-2"
              style={{
                backgroundColor: isError ? '#FBF1EE' : '#FFF7E6',
                color:           isError ? '#7A2C1F' : '#7A5618',
                border: `1px solid ${isError ? '#F0C7BF' : '#EDCF98'}`,
              }}
            >
              <span aria-hidden className="text-[14px] font-bold leading-none mt-0.5">
                {isError ? '✗' : '⚠'}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-bold mb-0.5">
                  {isError ? 'מה השתבש:' : 'אזהרה:'}
                </div>
                <div dir="ltr" style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {row.error_message}
                </div>
              </div>
            </div>
          )}

          {/* Footer — open-details affordance */}
          <div className="mt-3 flex items-center justify-between text-[11px]" style={{ color: '#A0907D' }}>
            <span dir="ltr" style={{ fontFamily: 'monospace' }}>{row.action}</span>
            <span className="font-semibold" style={{ color: '#8B5E34' }}>פרטים מלאים ←</span>
          </div>
        </div>
      </div>
    </button>
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
// month (matches the route's own default behavior); empty email field sends
// to the route's default recipient (adi548419927@gmail.com).
const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
] as const;

function MonthlyBackupCard() {
  // Default to previous calendar month — same logic the backend uses when
  // no ?month/?year are provided. Computed once on mount via useState init.
  const [defaultMonth, defaultYear] = (() => {
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return [prev.getMonth() + 1, prev.getFullYear()] as const;
  })();
  const [month, setMonth]         = useState<number>(defaultMonth);
  const [year, setYear]           = useState<number>(defaultYear);
  const [testEmail, setTestEmail] = useState<string>('');
  const [sending,   setSending]   = useState<boolean>(false);

  // Year options — current year ± 3 either side. Plenty of range for testing
  // historical or near-future months without growing a giant dropdown.
  const currentYear = new Date().getFullYear();
  const yearOptions: number[] = [];
  for (let y = currentYear + 1; y >= currentYear - 3; y--) yearOptions.push(y);

  const send = async () => {
    setSending(true);
    try {
      const params = new URLSearchParams();
      params.set('month', String(month));
      params.set('year',  String(year));
      const trimmed = testEmail.trim();
      if (trimmed && trimmed.includes('@')) params.set('to', trimmed);
      const res  = await fetch(`/api/reports/monthly-backup-export?${params.toString()}`, { method: 'GET' });
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
        <span className="text-[11px]" style={{ color: '#8A7664' }}>נשלח אוטומטית ב-1 בחודש · ברירת מחדל: adi548419927@gmail.com</span>
      </div>
      <p className="text-[12px] mb-3" style={{ color: '#8A7664' }}>
        ברירת המחדל היא החודש הקודם. לבדיקה אפשר לבחור חודש אחר.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium" style={{ color: '#6B4A2D' }}>חודש לגיבוי</label>
          <select
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            disabled={sending}
            className="px-2 h-9 rounded-lg border bg-white text-[13px]"
            style={{ borderColor: '#E8D8C6', color: '#3A2A1A', minWidth: '8.5rem' }}
          >
            {HEBREW_MONTHS.map((name, i) => (
              <option key={i + 1} value={i + 1}>{name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium" style={{ color: '#6B4A2D' }}>שנה</label>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            disabled={sending}
            className="px-2 h-9 rounded-lg border bg-white text-[13px]"
            style={{ borderColor: '#E8D8C6', color: '#3A2A1A', minWidth: '5.5rem' }}
          >
            {yearOptions.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[16rem]">
          <label className="text-[11px] font-medium" style={{ color: '#6B4A2D' }}>מייל לבדיקה (אופציונלי)</label>
          <input
            type="email"
            value={testEmail}
            onChange={e => setTestEmail(e.target.value)}
            placeholder="ריק = ברירת מחדל"
            disabled={sending}
            className="px-3 h-9 rounded-lg border bg-white text-[13px]"
            style={{ borderColor: '#E8D8C6', color: '#3A2A1A' }}
          />
        </div>
        <Button onClick={send} loading={sending} disabled={sending}>
          שלחי גיבוי חודשי לבדיקה
        </Button>
      </div>
    </Card>
  );
}
