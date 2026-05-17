'use client';

// Settings → תיקון מלאי
//
// Admin-only UI for /api/admin/inventory/backfill-deductions.
//
// Under the new policy (deduct on order creation, restore on cancellation),
// this page surfaces two kinds of drift:
//
//   1. "צריך להוריד" — active orders (חדשה/בהכנה/מוכנה למשלוח/נשלחה) that
//      somehow don't have a יציאה ledger row. These are leftover gaps from
//      the old payment-triggered policy, or any future code path that
//      forgets to call the helper.
//   2. "צריך להחזיר" — cancelled orders (בוטלה) that still have stock
//      taken from inventory (net יציאה > 0). These should have been
//      restored when cancelled but weren't (e.g. cancelled before the
//      restore code shipped, or cancelled via direct DB edit).
//
// Each section has checkboxes + a per-section "תקן" button. Running the
// fix calls the backfill endpoint with the selected order ids; the
// endpoint uses the idempotent helpers so a re-run is a safe no-op.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PageLoading } from '@/components/ui/LoadingSpinner';
import toast from 'react-hot-toast';

const SETTINGS_TABS = [
  { href: '/settings',                     label: 'הגדרות עסק',         adminOnly: false },
  { href: '/settings/users',               label: 'משתמשים והרשאות',    adminOnly: false },
  { href: '/settings/inventory-backfill',  label: 'תיקון מלאי',          adminOnly: true  },
  { href: '/settings/system-control',      label: 'מרכז בקרה',           adminOnly: true  },
];

function SettingsTabs({ activeHref, isAdmin }: { activeHref: string; isAdmin: boolean }) {
  const tabs = SETTINGS_TABS.filter(t => !t.adminOnly || isAdmin);
  return (
    <div className="flex gap-1 mb-6 border-b" style={{ borderColor: '#EAE0D4' }}>
      {tabs.map(tab => {
        const isActive = tab.href === activeHref;
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

// ── Response shapes ────────────────────────────────────────────────────────
interface PreviewItem {
  name:     string;
  quantity: number;
  kind:     'product' | 'package';
  petit_fours?: Array<{ name: string; quantity: number }>;
}
interface PreviewRow {
  order_id:       string;
  order_number:   string | null;
  customer_name:  string | null;
  payment_status: string | null;
  order_status:   string | null;
  items:          PreviewItem[];
}
interface DryRunResponse {
  ok: boolean;
  dry_run: true;
  mode: 'deduct' | 'restore' | 'both';
  deduct:  { missing_count: number; items: PreviewRow[] };
  restore: { missing_count: number; items: PreviewRow[] };
}

interface RunResultRow {
  order_id:        string;
  order_number:    string | null;
  direction:       'deduct' | 'restore';
  result:          'deducted' | 'restored' | 'already_done' | 'no_items' | 'fetch_failed' | 'flag_off' | 'satmar' | 'error';
  product_count?:  number;
  petit_four_types?: number;
  error?:          string;
}
interface RunResponse {
  ok: boolean;
  dry_run: false;
  deduct:  { processed: number; succeeded: number };
  restore: { processed: number; succeeded: number };
  errored: number;
  results: RunResultRow[];
}

// ── Helper components ──────────────────────────────────────────────────────
function StatusPill({ tone, label }: { tone: 'green' | 'amber' | 'red' | 'gray'; label: string }) {
  const styles = {
    green: { bg: '#DCFCE7', fg: '#166534' },
    amber: { bg: '#FEF3C7', fg: '#92400E' },
    red:   { bg: '#FEE2E2', fg: '#991B1B' },
    gray:  { bg: '#E5E7EB', fg: '#374151' },
  }[tone];
  return (
    <span className="px-1.5 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: styles.bg, color: styles.fg }}>
      {label}
    </span>
  );
}

function PreviewItemsCell({ items }: { items: PreviewItem[] }) {
  if (items.length === 0) return <span style={{ color: '#9B7A5A' }}>אין פריטים</span>;
  return (
    <ul className="space-y-0.5">
      {items.map((it, j) => (
        <li key={j}>
          <span className="font-semibold">{it.name}</span>
          <span className="mx-1">×{it.quantity}</span>
          {it.kind === 'package' && it.petit_fours && it.petit_fours.length > 0 && (
            <div className="text-[11px]" style={{ color: '#9B7A5A' }}>
              ↳ {it.petit_fours.map(p => `${p.name}×${p.quantity}`).join(', ')}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

// ── Reusable per-section table ─────────────────────────────────────────────
function BackfillSection({
  title, helper, rows, selected, onToggleOne, onToggleAll, onRun,
  running, actionLabel, headerTone,
}: {
  title: string;
  helper: string;
  rows: PreviewRow[];
  selected: Set<string>;
  onToggleOne: (id: string) => void;
  onToggleAll: () => void;
  onRun: () => void;
  running: boolean;
  actionLabel: string;
  headerTone: 'red' | 'amber';
}) {
  const allSelected = rows.length > 0 && rows.every(r => selected.has(r.order_id));
  const headerStyle = headerTone === 'red'
    ? { bg: '#FEF2F2', fg: '#991B1B' }
    : { bg: '#FEF9EC', fg: '#92400E' };
  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>
          <span className="me-2 inline-block px-2 py-0.5 rounded text-[11px] font-bold align-middle" style={{ backgroundColor: headerStyle.bg, color: headerStyle.fg }}>
            {rows.length}
          </span>
          {title}
        </CardTitle>
        <Button
          type="button"
          size="sm"
          onClick={onRun}
          disabled={running || selected.size === 0}
          loading={running}
        >
          {actionLabel} ({selected.size})
        </Button>
      </CardHeader>
      <p className="text-xs mb-3" style={{ color: '#6B4A2D' }}>{helper}</p>
      {rows.length === 0 ? (
        <div className="py-4 text-center text-sm font-semibold rounded" style={{ color: '#15803D', backgroundColor: '#F0FDF4' }}>
          הכל תקין — אין הזמנות שדורשות פעולה.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-2 text-xs" style={{ color: '#6B4A2D' }}>
            <span><strong>{rows.length}</strong> הזמנות</span>
            <button type="button" onClick={onToggleAll} className="text-xs underline ms-auto" style={{ color: '#8B5E34' }}>
              {allSelected ? 'בטלי בחירת הכל' : 'סמני הכל'}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse" dir="rtl">
              <thead>
                <tr style={{ backgroundColor: '#F5EFE6' }}>
                  <th className="border px-2 py-1 text-right w-8" style={{ borderColor: '#DDD0BE' }}></th>
                  <th className="border px-2 py-1 text-right" style={{ borderColor: '#DDD0BE', color: '#5C3410' }}>הזמנה</th>
                  <th className="border px-2 py-1 text-right" style={{ borderColor: '#DDD0BE', color: '#5C3410' }}>סטטוס</th>
                  <th className="border px-2 py-1 text-right" style={{ borderColor: '#DDD0BE', color: '#5C3410' }}>לקוחה</th>
                  <th className="border px-2 py-1 text-right" style={{ borderColor: '#DDD0BE', color: '#5C3410' }}>פריטים</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.order_id} style={{ backgroundColor: i % 2 === 0 ? '#FFFFFF' : '#FBF7F2' }}>
                    <td className="border px-2 py-1 text-center" style={{ borderColor: '#DDD0BE' }}>
                      <input
                        type="checkbox"
                        checked={selected.has(row.order_id)}
                        onChange={() => onToggleOne(row.order_id)}
                        style={{ accentColor: '#8B5E34' }}
                      />
                    </td>
                    <td className="border px-2 py-1" style={{ borderColor: '#DDD0BE', color: '#3D2B1A' }}>
                      <Link href={`/orders/${row.order_id}`} className="hover:underline" style={{ color: '#5C3410' }}>
                        {row.order_number || row.order_id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="border px-2 py-1" style={{ borderColor: '#DDD0BE', color: '#3D2B1A' }}>
                      {row.order_status || '—'}
                    </td>
                    <td className="border px-2 py-1" style={{ borderColor: '#DDD0BE', color: '#3D2B1A' }}>
                      {row.customer_name || '—'}
                    </td>
                    <td className="border px-2 py-1" style={{ borderColor: '#DDD0BE', color: '#3D2B1A' }}>
                      <PreviewItemsCell items={row.items} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function InventoryBackfillPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [preview, setPreview] = useState<DryRunResponse | null>(null);
  const [selectedDeduct, setSelectedDeduct]   = useState<Set<string>>(new Set());
  const [selectedRestore, setSelectedRestore] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResponse | null>(null);

  // Stock verification panel — kept as a quick read of the test product.
  const [shamenetStock, setShamenetStock] = useState<{ id: string; שם_מוצר: string; כמות_במלאי: number } | null>(null);

  useEffect(() => {
    fetch('/api/me')
      .then(r => r.json())
      .then(d => setIsAdmin(d?.role === 'admin'))
      .catch(() => setIsAdmin(false));
  }, []);

  const loadPreview = async () => {
    setLoadingPreview(true);
    try {
      const res = await fetch('/api/admin/inventory/backfill-deductions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: true, detailed: true, mode: 'both' }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j?.error || `שגיאה (${res.status})`);
        setPreview(null);
        return;
      }
      const data = (await res.json()) as DryRunResponse;
      setPreview(data);
      // Preselect all in both sections by default.
      setSelectedDeduct(new Set(data.deduct.items.map(p => p.order_id)));
      setSelectedRestore(new Set(data.restore.items.map(p => p.order_id)));
    } finally {
      setLoadingPreview(false);
    }
  };

  const loadShamenetStock = async () => {
    try {
      const prodRes = await fetch('/api/products?active=true');
      if (!prodRes.ok) return;
      const { data: prods } = await prodRes.json();
      const match = (prods ?? []).find((p: { שם_מוצר?: string }) =>
        (p.שם_מוצר || '').includes('עוגת שמנת'),
      );
      setShamenetStock(match
        ? { id: match.id, שם_מוצר: match.שם_מוצר, כמות_במלאי: Number(match.כמות_במלאי ?? 0) }
        : null);
    } catch {
      setShamenetStock(null);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      void loadPreview();
      void loadShamenetStock();
    }
  }, [isAdmin]);

  const toggleOne = (set: Set<string>, setSet: (s: Set<string>) => void) => (id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSet(next);
  };
  const toggleAll = (rows: PreviewRow[], set: Set<string>, setSet: (s: Set<string>) => void) => () => {
    if (set.size === rows.length) setSet(new Set());
    else setSet(new Set(rows.map(r => r.order_id)));
  };

  const runBackfill = async (orderIds: string[], description: string) => {
    if (orderIds.length === 0) {
      toast.error('לא נבחרו הזמנות');
      return;
    }
    if (!window.confirm(`לבצע ${description} עבור ${orderIds.length} הזמנות?`)) return;
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/inventory/backfill-deductions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: false, order_ids: orderIds }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j?.error || `שגיאה (${res.status})`);
        return;
      }
      setResult(j as RunResponse);
      toast.success(`בוצע: ${j.deduct.succeeded + j.restore.succeeded} פעולות הצליחו · ${j.errored} שגיאות`);
      await Promise.all([loadPreview(), loadShamenetStock()]);
    } finally {
      setRunning(false);
    }
  };

  const totalsLine = useMemo(() => {
    if (!preview) return '';
    const d = preview.deduct.missing_count;
    const r = preview.restore.missing_count;
    if (d === 0 && r === 0) return 'הכל מסונכרן — אין הזמנות שדורשות פעולה.';
    const parts: string[] = [];
    if (d > 0) parts.push(`${d} צריכות הורדה`);
    if (r > 0) parts.push(`${r} צריכות החזרה`);
    return `נמצאו ${parts.join(' · ')}.`;
  }, [preview]);

  // ── Gate ──
  if (isAdmin === null) return <PageLoading />;
  if (!isAdmin) {
    return (
      <div className="max-w-4xl">
        <SettingsTabs activeHref="/settings/inventory-backfill" isAdmin={false} />
        <Card>
          <p className="text-sm" style={{ color: '#8A7664' }}>גישה לתיקון מלאי מוגבלת לאדמין בלבד.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl">
      <SettingsTabs activeHref="/settings/inventory-backfill" isAdmin={true} />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>תיקון מלאי</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={loadPreview} disabled={loadingPreview || running}>
            רענן תצוגה
          </Button>
        </CardHeader>
        <p className="text-xs" style={{ color: '#6B4A2D' }}>
          תחת המדיניות החדשה: מלאי יורד עם יצירת/אישור הזמנה, ומוחזר עם ביטול.
          המסך הזה מאתר פערים — הזמנות פעילות שלא הורידו מלאי, או הזמנות מבוטלות
          שעדיין &quot;מחזיקות&quot; מלאי — ומאפשר תיקון אידמפוטנטי.
          {' '}<strong>{totalsLine}</strong>
        </p>
        {shamenetStock && (
          <div className="mt-3 flex items-baseline gap-3 p-2 rounded" style={{ backgroundColor: '#FAF7F0' }}>
            <span className="text-xs" style={{ color: '#9B7A5A' }}>אימות מלאי — &quot;{shamenetStock.שם_מוצר}&quot;:</span>
            <span className="text-xl font-bold tabular-nums" style={{ color: '#5C3410' }}>{shamenetStock.כמות_במלאי}</span>
          </div>
        )}
      </Card>

      {loadingPreview ? (
        <Card>
          <div className="py-6 text-center text-sm" style={{ color: '#9B7A5A' }}>טוען תצוגה מקדימה…</div>
        </Card>
      ) : !preview ? (
        <Card>
          <div className="py-6 text-center text-sm" style={{ color: '#9B7A5A' }}>שגיאה בטעינה — נסי לרענן.</div>
        </Card>
      ) : (
        <>
          <BackfillSection
            title="צריך להוריד מלאי"
            helper="הזמנות פעילות (חדשה / בהכנה / מוכנה למשלוח / נשלחה) שאין להן רישום ירידת מלאי. בעקבות התיקון יווצרו רישומי 'יציאה' מתאימים והמלאי יופחת."
            rows={preview.deduct.items}
            selected={selectedDeduct}
            onToggleOne={toggleOne(selectedDeduct, setSelectedDeduct)}
            onToggleAll={toggleAll(preview.deduct.items, selectedDeduct, setSelectedDeduct)}
            onRun={() => runBackfill(Array.from(selectedDeduct), 'הורדת מלאי')}
            running={running}
            actionLabel="הורד מלאי"
            headerTone="red"
          />
          <BackfillSection
            title="צריך להחזיר מלאי"
            helper="הזמנות מבוטלות שעדיין מחזיקות מלאי (היו ירידות ולא היו החזרות). בעקבות התיקון תיווצר רישום 'כניסה' מתאים והמלאי יתעדכן בחזרה."
            rows={preview.restore.items}
            selected={selectedRestore}
            onToggleOne={toggleOne(selectedRestore, setSelectedRestore)}
            onToggleAll={toggleAll(preview.restore.items, selectedRestore, setSelectedRestore)}
            onRun={() => runBackfill(Array.from(selectedRestore), 'החזרת מלאי')}
            running={running}
            actionLabel="החזר מלאי"
            headerTone="amber"
          />
        </>
      )}

      {result && (
        <Card className="mt-4">
          <CardHeader><CardTitle>תוצאות תיקון</CardTitle></CardHeader>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-sm">
            <div className="p-3 rounded-lg text-center" style={{ backgroundColor: '#F0FDF4' }}>
              <div className="text-2xl font-bold" style={{ color: '#166534' }}>{result.deduct.succeeded}</div>
              <div className="text-xs" style={{ color: '#166534' }}>ירידות שהושלמו</div>
            </div>
            <div className="p-3 rounded-lg text-center" style={{ backgroundColor: '#EFF6FF' }}>
              <div className="text-2xl font-bold" style={{ color: '#1E40AF' }}>{result.restore.succeeded}</div>
              <div className="text-xs" style={{ color: '#1E40AF' }}>החזרות שהושלמו</div>
            </div>
            <div className="p-3 rounded-lg text-center" style={{ backgroundColor: result.errored > 0 ? '#FEF2F2' : '#F0FDF4' }}>
              <div className="text-2xl font-bold" style={{ color: result.errored > 0 ? '#991B1B' : '#166534' }}>{result.errored}</div>
              <div className="text-xs" style={{ color: result.errored > 0 ? '#991B1B' : '#166534' }}>שגיאות</div>
            </div>
            <div className="p-3 rounded-lg text-center" style={{ backgroundColor: '#FAF7F0' }}>
              <div className="text-2xl font-bold" style={{ color: '#5C3410' }}>{result.deduct.processed + result.restore.processed}</div>
              <div className="text-xs" style={{ color: '#5C3410' }}>סך הכל נסרקו</div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse" dir="rtl">
              <thead>
                <tr style={{ backgroundColor: '#F5EFE6' }}>
                  <th className="border px-2 py-1 text-right" style={{ borderColor: '#DDD0BE', color: '#5C3410' }}>הזמנה</th>
                  <th className="border px-2 py-1 text-right" style={{ borderColor: '#DDD0BE', color: '#5C3410' }}>פעולה</th>
                  <th className="border px-2 py-1 text-right" style={{ borderColor: '#DDD0BE', color: '#5C3410' }}>תוצאה</th>
                  <th className="border px-2 py-1 text-right" style={{ borderColor: '#DDD0BE', color: '#5C3410' }}>פרטים</th>
                </tr>
              </thead>
              <tbody>
                {result.results.map((r, i) => (
                  <tr key={`${r.direction}-${r.order_id}`} style={{ backgroundColor: i % 2 === 0 ? '#FFFFFF' : '#FBF7F2' }}>
                    <td className="border px-2 py-1" style={{ borderColor: '#DDD0BE', color: '#3D2B1A' }}>
                      <Link href={`/orders/${r.order_id}`} className="hover:underline" style={{ color: '#5C3410' }}>
                        {r.order_number || r.order_id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="border px-2 py-1" style={{ borderColor: '#DDD0BE', color: '#3D2B1A' }}>
                      {r.direction === 'deduct' ? 'הורדה' : 'החזרה'}
                    </td>
                    <td className="border px-2 py-1" style={{ borderColor: '#DDD0BE' }}>
                      {r.result === 'deducted'     && <StatusPill tone="green" label="ירד מהמלאי" />}
                      {r.result === 'restored'     && <StatusPill tone="green" label="הוחזר למלאי" />}
                      {r.result === 'already_done' && <StatusPill tone="gray"  label="כבר היה רשום" />}
                      {r.result === 'no_items'     && <StatusPill tone="amber" label="ללא פריטים" />}
                      {r.result === 'satmar'       && <StatusPill tone="gray"  label="סאטמר — לא משפיע" />}
                      {(r.result === 'error' || r.result === 'fetch_failed') && <StatusPill tone="red"   label="שגיאה" />}
                      {r.result === 'flag_off'     && <StatusPill tone="gray"  label="שירות כבוי" />}
                    </td>
                    <td className="border px-2 py-1" style={{ borderColor: '#DDD0BE', color: '#3D2B1A' }}>
                      {(r.result === 'deducted' || r.result === 'restored')
                        && `${r.product_count ?? 0} מוצרים · ${r.petit_four_types ?? 0} סוגי פטיפורים`}
                      {r.error && <span style={{ color: '#991B1B' }}>{r.error}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
