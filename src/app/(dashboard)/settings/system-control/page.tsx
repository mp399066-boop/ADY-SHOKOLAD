'use client';

// /settings/system-control — admin-only "לוגים" feed.
//
// V1: one clean page that reads system_activity_logs through
// GET /api/system/activity. Replaces the previous three-view control center
// (services / runs / activity). Service toggles and gated-run views were
// hidden in V1; their tables and APIs stay intact for a future re-surface.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { PageLoading } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  STATUS_LABEL_HE,
  MODULE_LABEL_HE,
  ACTOR_LABEL_HE,
  type ActivityStatus,
  type ActorType,
  type ActivityModule,
} from '@/lib/activity-log-labels';

// ── Settings tab strip (shared visual; matches the other settings pages) ─────

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

function statusLabel(s: string): string {
  return STATUS_LABEL_HE[s as ActivityStatus] || s;
}
function moduleLabel(m: string): string {
  return MODULE_LABEL_HE[m as ActivityModule] || m;
}
function actorLabel(t: string): string {
  return ACTOR_LABEL_HE[t as ActorType] || t;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function LogsPage() {
  const [items, setItems]         = useState<ActivityLog[]>([]);
  const [total, setTotal]         = useState(0);
  const [hasMore, setHasMore]     = useState(false);
  const [loading, setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [detail, setDetail]       = useState<ActivityLog | null>(null);

  // Filters
  const [q, setQ]                 = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [moduleF, setModuleF]     = useState('');
  const [statusF, setStatusF]     = useState('');
  const [actorF, setActorF]       = useState('');
  const [fromF, setFromF]         = useState('');
  const [toF, setToF]             = useState('');

  // Debounce the free-text input so we don't hammer the API.
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const buildParams = useCallback((offset: number) => {
    const sp = new URLSearchParams();
    sp.set('limit', String(PAGE_SIZE));
    sp.set('offset', String(offset));
    if (qDebounced) sp.set('q', qDebounced);
    if (moduleF)    sp.set('module', moduleF);
    if (statusF)    sp.set('status', statusF);
    if (actorF)     sp.set('actor_type', actorF);
    if (fromF)      sp.set('from', new Date(fromF).toISOString());
    if (toF)        sp.set('to',   new Date(toF + 'T23:59:59').toISOString());
    return sp;
  }, [qDebounced, moduleF, statusF, actorF, fromF, toF]);

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
    () => Boolean(qDebounced || moduleF || statusF || actorF || fromF || toF),
    [qDebounced, moduleF, statusF, actorF, fromF, toF],
  );

  const clearFilters = () => {
    setQ('');
    setQDebounced('');
    setModuleF('');
    setStatusF('');
    setActorF('');
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
    <div className="max-w-5xl space-y-5" dir="rtl">
      <SettingsTabs active="/settings/system-control" />

      <div>
        <h1 className="text-xl font-bold" style={{ color: '#3A2A1A' }}>לוגים</h1>
        <p className="text-sm mt-1" style={{ color: '#8A7664' }}>
          מה קרה במערכת — הזמנות, לקוחות, תשלומים, חשבוניות, WooCommerce, משלוחים ושגיאות חשובות. עדכון אחרון מופיע למעלה.
        </p>
      </div>

      {/* Filter bar */}
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
            value={moduleF}
            onChange={e => setModuleF(e.target.value)}
            className="px-2 h-8 rounded-lg border bg-white"
            style={{ borderColor: '#E8D8C6', color: '#3A2A1A' }}
          >
            <option value="">כל המודולים</option>
            {Object.entries(MODULE_LABEL_HE).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>

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

          <select
            value={actorF}
            onChange={e => setActorF(e.target.value)}
            className="px-2 h-8 rounded-lg border bg-white"
            style={{ borderColor: '#E8D8C6', color: '#3A2A1A' }}
          >
            <option value="">כל הגורמים</option>
            {(['user', 'system', 'webhook', 'cron', 'public_token'] as ActorType[]).map(a => (
              <option key={a} value={a}>{ACTOR_LABEL_HE[a]}</option>
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
            title="אין פעילות מתאימה"
            description={filterActive ? 'לא נמצאו לוגים שתואמים את הסינון. נסי לשנות את התקופה או לנקות סינון.' : 'עדיין אין פעילות מתועדת במערכת.'}
          />
        </Card>
      ) : (
        <>
          <Card className="p-0 overflow-hidden">
            <ul className="divide-y" style={{ borderColor: '#F0E5D8' }}>
              {items.map(row => (
                <LogRow key={row.id} row={row} onOpen={() => setDetail(row)} />
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

// ── Feed row ─────────────────────────────────────────────────────────────────

function LogRow({ row, onOpen }: { row: ActivityLog; onOpen: () => void }) {
  const tone = STATUS_TONE[row.status] || STATUS_TONE.disabled;
  const icon = MODULE_ICON[row.module] || '•';
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
