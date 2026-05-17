'use client';

// Settings → תיקון הורדות מלאי חסרות
//
// Admin-only UI for /api/admin/inventory/backfill-deductions. The page:
//   1. On mount, runs a DETAILED dry-run and shows each paid order that's
//      missing a תנועות_מלאי 'יציאה' row, with its customer + items +
//      quantities — so the operator sees exactly what will be deducted.
//   2. Lets the operator either run the backfill for ALL missing orders
//      or pick a subset via checkboxes.
//   3. On confirm, calls the live backfill and renders the per-order
//      result + counters (succeeded / already / errored).
//   4. A small "verification" panel polls /api/inventory for "עוגת שמנת"
//      so the operator can see the stock number before and after.
//
// Admin-only: redirects + a Forbidden card if the current user isn't
// admin (mirrors the gate the server-side route enforces).

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
  name: string;
  quantity: number;
  kind: 'product' | 'package';
  petit_fours?: Array<{ name: string; quantity: number }>;
}
interface PreviewRow {
  order_id: string;
  order_number: string | null;
  customer_name: string | null;
  payment_status: string | null;
  items: PreviewItem[];
}
interface DryRunResponse {
  ok: boolean;
  dry_run: true;
  total: number;
  missing_ledger: number;
  already_deducted: number;
  preview: PreviewRow[];
}

interface RunResultRow {
  order_id: string;
  order_number: string | null;
  payment_status: string | null;
  result: 'deducted' | 'already_deducted' | 'no_items' | 'fetch_failed' | 'flag_off' | 'error';
  product_count?: number;
  petit_four_types?: number;
  error?: string;
}
interface RunResponse {
  ok: boolean;
  dry_run: false;
  total: number;
  missing_ledger: number;
  already_deducted: number;
  succeeded: number;
  errored: number;
  results: RunResultRow[];
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function InventoryBackfillPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [preview, setPreview] = useState<DryRunResponse | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResponse | null>(null);

  // Stock verification for "עוגת שמנת" — the canonical test case from the
  // operator's bug report. Refetched after a backfill so the operator
  // can see the stock count drop.
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
        body: JSON.stringify({ dry_run: true, detailed: true }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j?.error || `שגיאה (${res.status})`);
        setPreview(null);
        return;
      }
      const data = (await res.json()) as DryRunResponse;
      setPreview(data);
      // Preselect everything by default — operator likely wants to run all.
      setSelected(new Set(data.preview.map(p => p.order_id)));
    } finally {
      setLoadingPreview(false);
    }
  };

  const loadShamenetStock = async () => {
    try {
      const res = await fetch('/api/inventory');
      if (!res.ok) return;
      const { data } = await res.json();
      // /api/inventory returns raw materials; finished-product stock lives
      // on מוצרים_למכירה. We fetch via /api/products to get the right table.
      const prodRes = await fetch('/api/products?active=true');
      if (!prodRes.ok) return;
      const { data: prods } = await prodRes.json();
      const match = (prods ?? []).find((p: { שם_מוצר?: string }) =>
        (p.שם_מוצר || '').includes('עוגת שמנת'),
      );
      if (match) {
        setShamenetStock({
          id: match.id,
          שם_מוצר: match.שם_מוצר,
          כמות_במלאי: Number(match.כמות_במלאי ?? 0),
        });
      } else {
        setShamenetStock(null);
      }
      void data; // /api/inventory unused — kept the call for future raw-mat verification
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

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    if (!preview) return;
    if (selected.size === preview.preview.length) setSelected(new Set());
    else setSelected(new Set(preview.preview.map(p => p.order_id)));
  };

  const runBackfill = async (orderIds: string[]) => {
    if (orderIds.length === 0) {
      toast.error('לא נבחרו הזמנות לתיקון');
      return;
    }
    if (!window.confirm(`לבצע תיקון מלאי עבור ${orderIds.length} הזמנות? פעולה זו לא הפיכה — מומלץ לוודא תחילה בתצוגה המקדימה.`)) {
      return;
    }
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
      toast.success(`בוצע: ${j.succeeded} הצליחו · ${j.errored} שגיאות`);
      // Refresh both the preview list (deducted orders shouldn't appear
      // again) and the verification stock number.
      await Promise.all([loadPreview(), loadShamenetStock()]);
    } finally {
      setRunning(false);
    }
  };

  const allSelected = useMemo(() => preview && selected.size === preview.preview.length && preview.preview.length > 0, [preview, selected]);

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

      {/* Verification panel — quick read of the test-case product stock */}
      {shamenetStock && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>אימות מלאי — &quot;{shamenetStock.שם_מוצר}&quot;</CardTitle>
          </CardHeader>
          <div className="flex items-baseline gap-4">
            <div>
              <div className="text-3xl font-bold tabular-nums" style={{ color: '#5C3410' }}>
                {shamenetStock.כמות_במלאי}
              </div>
              <div className="text-xs" style={{ color: '#9B7A5A' }}>כמות נוכחית במלאי</div>
            </div>
            <div className="text-xs" style={{ color: '#9B7A5A' }}>
              לאחר תיקון של 3 הזמנות עתידיות הצפויות, אמור להראות 11.
            </div>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>תיקון הורדות מלאי חסרות</CardTitle>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={loadPreview} disabled={loadingPreview || running}>
              רענן תצוגה
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => preview && runBackfill(Array.from(selected))}
              disabled={loadingPreview || running || !preview || selected.size === 0}
              loading={running}
            >
              תקן {selected.size} הזמנות
            </Button>
          </div>
        </CardHeader>

        <p className="text-xs mb-4 p-2 rounded" style={{ backgroundColor: '#FAF7F0', color: '#6B4A2D' }}>
          המסך הזה סורק הזמנות בסטטוס תשלום=שולם שאין להן רישום ירידת מלאי
          ב-תנועות_מלאי, ומאפשר להריץ הורדה בטוחה (אידמפוטנטית — לא ייווצרו
          ירידות כפולות גם אם יילחץ פעמיים).
        </p>

        {loadingPreview ? (
          <div className="py-6 text-center text-sm" style={{ color: '#9B7A5A' }}>טוען תצוגה מקדימה…</div>
        ) : !preview ? (
          <div className="py-6 text-center text-sm" style={{ color: '#9B7A5A' }}>שגיאה בטעינה — נסי לרענן.</div>
        ) : preview.preview.length === 0 ? (
          <div className="py-6 text-center text-sm font-semibold rounded" style={{ color: '#15803D', backgroundColor: '#F0FDF4' }}>
            אין הזמנות שדורשות תיקון. {preview.already_deducted > 0 && `(${preview.already_deducted} הזמנות כבר עם רישום ירידת מלאי תקין.)`}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-3 text-xs" style={{ color: '#6B4A2D' }}>
              <span>נמצאו <strong>{preview.missing_ledger}</strong> הזמנות שצריכות תיקון</span>
              <span>·</span>
              <span><strong>{preview.already_deducted}</strong> הזמנות כבר בעלות רישום תקין</span>
              <span className="ms-auto">
                <button type="button" onClick={toggleAll} className="text-xs underline" style={{ color: '#8B5E34' }}>
                  {allSelected ? 'בטלי בחירת הכל' : 'סמני הכל'}
                </button>
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse" dir="rtl">
                <thead>
                  <tr style={{ backgroundColor: '#F5EFE6' }}>
                    <th className="border px-2 py-1 text-right w-8" style={{ borderColor: '#DDD0BE' }}></th>
                    <th className="border px-2 py-1 text-right" style={{ borderColor: '#DDD0BE', color: '#5C3410' }}>הזמנה</th>
                    <th className="border px-2 py-1 text-right" style={{ borderColor: '#DDD0BE', color: '#5C3410' }}>לקוחה</th>
                    <th className="border px-2 py-1 text-right" style={{ borderColor: '#DDD0BE', color: '#5C3410' }}>פריטים</th>
                    <th className="border px-2 py-1 text-right" style={{ borderColor: '#DDD0BE', color: '#5C3410' }}>מה יורד מהמלאי</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.map((row, i) => (
                    <tr key={row.order_id} style={{ backgroundColor: i % 2 === 0 ? '#FFFFFF' : '#FBF7F2' }}>
                      <td className="border px-2 py-1 text-center" style={{ borderColor: '#DDD0BE' }}>
                        <input
                          type="checkbox"
                          checked={selected.has(row.order_id)}
                          onChange={() => toggleOne(row.order_id)}
                          style={{ accentColor: '#8B5E34' }}
                        />
                      </td>
                      <td className="border px-2 py-1" style={{ borderColor: '#DDD0BE', color: '#3D2B1A' }}>
                        <Link href={`/orders/${row.order_id}`} className="hover:underline" style={{ color: '#5C3410' }}>
                          {row.order_number || row.order_id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="border px-2 py-1" style={{ borderColor: '#DDD0BE', color: '#3D2B1A' }}>
                        {row.customer_name || '—'}
                      </td>
                      <td className="border px-2 py-1" style={{ borderColor: '#DDD0BE', color: '#3D2B1A' }}>
                        {row.items.length === 0 ? (
                          <span style={{ color: '#9B7A5A' }}>אין פריטים</span>
                        ) : (
                          <ul className="space-y-0.5">
                            {row.items.map((it, j) => (
                              <li key={j}>
                                <span className="font-semibold">{it.name}</span>
                                <span className="mx-1">×{it.quantity}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="border px-2 py-1" style={{ borderColor: '#DDD0BE', color: '#3D2B1A' }}>
                        <ul className="space-y-0.5">
                          {row.items.map((it, j) => {
                            if (it.kind === 'package') {
                              if (!it.petit_fours || it.petit_fours.length === 0) {
                                return <li key={j} style={{ color: '#9B7A5A' }}>מארז ללא בחירת פטיפורים</li>;
                              }
                              return (
                                <li key={j}>
                                  פטיפורים: {it.petit_fours.map(p => `${p.name}×${p.quantity}`).join(', ')}
                                </li>
                              );
                            }
                            return <li key={j}>{it.name} ×{it.quantity}</li>;
                          })}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {/* Result panel — appears after the operator runs the backfill */}
      {result && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>תוצאות תיקון</CardTitle>
          </CardHeader>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-sm">
            <div className="p-3 rounded-lg text-center" style={{ backgroundColor: '#F0FDF4' }}>
              <div className="text-2xl font-bold" style={{ color: '#166534' }}>{result.succeeded}</div>
              <div className="text-xs" style={{ color: '#166534' }}>הצליחו</div>
            </div>
            <div className="p-3 rounded-lg text-center" style={{ backgroundColor: '#FAF7F0' }}>
              <div className="text-2xl font-bold" style={{ color: '#5C3410' }}>{result.already_deducted}</div>
              <div className="text-xs" style={{ color: '#5C3410' }}>היו כבר עם רישום</div>
            </div>
            <div className="p-3 rounded-lg text-center" style={{ backgroundColor: result.errored > 0 ? '#FEF2F2' : '#F0FDF4' }}>
              <div className="text-2xl font-bold" style={{ color: result.errored > 0 ? '#991B1B' : '#166534' }}>{result.errored}</div>
              <div className="text-xs" style={{ color: result.errored > 0 ? '#991B1B' : '#166534' }}>שגיאות</div>
            </div>
            <div className="p-3 rounded-lg text-center" style={{ backgroundColor: '#FAF7F0' }}>
              <div className="text-2xl font-bold" style={{ color: '#5C3410' }}>{result.missing_ledger}</div>
              <div className="text-xs" style={{ color: '#5C3410' }}>סך הכל נסרקו</div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse" dir="rtl">
              <thead>
                <tr style={{ backgroundColor: '#F5EFE6' }}>
                  <th className="border px-2 py-1 text-right" style={{ borderColor: '#DDD0BE', color: '#5C3410' }}>הזמנה</th>
                  <th className="border px-2 py-1 text-right" style={{ borderColor: '#DDD0BE', color: '#5C3410' }}>תוצאה</th>
                  <th className="border px-2 py-1 text-right" style={{ borderColor: '#DDD0BE', color: '#5C3410' }}>פרטים</th>
                </tr>
              </thead>
              <tbody>
                {result.results.map((r, i) => (
                  <tr key={r.order_id} style={{ backgroundColor: i % 2 === 0 ? '#FFFFFF' : '#FBF7F2' }}>
                    <td className="border px-2 py-1" style={{ borderColor: '#DDD0BE', color: '#3D2B1A' }}>
                      <Link href={`/orders/${r.order_id}`} className="hover:underline" style={{ color: '#5C3410' }}>
                        {r.order_number || r.order_id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="border px-2 py-1" style={{ borderColor: '#DDD0BE' }}>
                      {r.result === 'deducted' && (
                        <span className="px-1.5 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: '#DCFCE7', color: '#166534' }}>
                          ירד מהמלאי
                        </span>
                      )}
                      {r.result === 'already_deducted' && (
                        <span className="px-1.5 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: '#E5E7EB', color: '#374151' }}>
                          כבר היה רשום
                        </span>
                      )}
                      {r.result === 'no_items' && (
                        <span className="px-1.5 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: '#FEF3C7', color: '#92400E' }}>
                          ללא פריטים
                        </span>
                      )}
                      {(r.result === 'error' || r.result === 'fetch_failed') && (
                        <span className="px-1.5 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: '#FEE2E2', color: '#991B1B' }}>
                          שגיאה
                        </span>
                      )}
                      {r.result === 'flag_off' && (
                        <span className="px-1.5 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: '#E5E7EB', color: '#374151' }}>
                          שירות כבוי
                        </span>
                      )}
                    </td>
                    <td className="border px-2 py-1" style={{ borderColor: '#DDD0BE', color: '#3D2B1A' }}>
                      {r.result === 'deducted' && `${r.product_count ?? 0} מוצרים · ${r.petit_four_types ?? 0} סוגי פטיפורים`}
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
