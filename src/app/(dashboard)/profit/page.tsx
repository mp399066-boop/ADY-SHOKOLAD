'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { TrendingUp, Coins, PiggyBank, Percent, AlertTriangle } from 'lucide-react';
import { Tabs } from '@/components/ui/Tabs';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { exportToCsv } from '@/lib/exportCsv';
import { todayJerusalem } from '@/lib/finance';
import type { ProductProfitRow } from '@/lib/order-profit';
import { C, money, StatCard, Th, Td, THEAD_STYLE, ROW_CLS, EmptyNote } from '../finance/components/shared';

interface OrderRow {
  id: string;
  orderNumber: string;
  date: string | null;
  customerName: string;
  barter: boolean;
  revenue: number;
  cost: number;
  profit: number | null;
  partialProfit: number;
  margin: number | null;
  complete: boolean;
  missing: string[];
}

interface ProfitData {
  tableReady: boolean;
  totals: {
    orders: number;
    completeOrders: number;
    revenue: number;
    cost: number;
    coveredRevenue: number;
    profitOnCovered: number;
    margin: number | null;
    coverage: number | null;
    barterOrders: number;
    barterCost: number;
  };
  products: ProductProfitRow[];
  orders: OrderRow[];
  missingItems: { label: string; orders: number }[];
}

type Preset = 'month' | 'lastMonth' | 'quarter' | 'year';
const PRESETS: { key: Preset; label: string }[] = [
  { key: 'month', label: 'החודש' },
  { key: 'lastMonth', label: 'חודש שעבר' },
  { key: 'quarter', label: '3 חודשים' },
  { key: 'year', label: 'השנה' },
];

function presetRange(p: Preset): { from: string; to: string } {
  const today = todayJerusalem();
  const [y, m] = today.split('-').map(Number);
  const iso = (yy: number, mm: number, dd: number) => new Date(Date.UTC(yy, mm - 1, dd)).toISOString().slice(0, 10);
  if (p === 'month') return { from: iso(y, m, 1), to: today };
  if (p === 'lastMonth') return { from: iso(y, m - 1, 1), to: iso(y, m, 0) };
  if (p === 'quarter') return { from: iso(y, m - 2, 1), to: today };
  return { from: `${y}-01-01`, to: today };
}

const fmtDate = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');
const pct = (n: number | null) => (n == null ? '—' : `${n}%`);

type TabKey = 'products' | 'orders' | 'missing';
type SortKey = 'revenue' | 'profit' | 'margin';

export default function ProfitPage() {
  const [role, setRole] = useState<string | null | undefined>(undefined);
  const [preset, setPreset] = useState<Preset | 'custom'>('month');
  const [range, setRange] = useState(() => presetRange('month'));
  const [basis, setBasis] = useState<'delivery' | 'order'>('delivery');
  const [tab, setTab] = useState<TabKey>('products');
  const [sort, setSort] = useState<SortKey>('revenue');
  const [data, setData] = useState<ProfitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/me').then(r => (r.ok ? r.json() : null)).then(j => setRole(j?.role ?? null)).catch(() => setRole(null));
  }, []);
  const isAdmin = role === 'admin';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ from: range.from, to: range.to, basis });
      const res = await fetch(`/api/analytics/profit?${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'שגיאה בטעינת הרווחיות');
      setData(json as ProfitData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בטעינת הרווחיות');
    } finally {
      setLoading(false);
    }
  }, [range, basis]);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const products = useMemo(() => {
    const rows = [...(data?.products ?? [])];
    const val = (r: ProductProfitRow) => (sort === 'revenue' ? r.revenue : sort === 'profit' ? r.profit ?? -Infinity : r.margin ?? -Infinity);
    return rows.sort((a, b) => val(b) - val(a));
  }, [data?.products, sort]);

  const exportProducts = () => {
    exportToCsv(`רווחיות-מוצרים-${range.from}-${range.to}`,
      ['מוצר', 'כמות', 'הזמנות', 'הכנסה לפני מע״מ', 'עלות', 'רווח', 'שיעור רווח %', 'יחידות ללא עלות'],
      products.map(r => [r.label, r.qty, r.orders, r.revenue, r.cost, r.profit ?? '', r.margin ?? '', r.uncostedQty]));
  };

  if (role === undefined) return <div className="flex justify-center py-20"><LoadingSpinner /></div>;
  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center text-sm rounded-xl bg-white p-8" style={{ color: C.sub, border: `1px solid ${C.border}` }}>
        עמוד הרווחיות זמין למנהלת המערכת בלבד.
      </div>
    );
  }

  const t = data?.totals;

  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: C.text }}>רווחיות</h1>
        <p className="text-sm mt-0.5" style={{ color: C.sub }}>
          כמה נשאר בכיס מכל מוצר ומכל הזמנה: הכנסה (ללא משלוח, לפני מע״מ) פחות העלות מעמוד{' '}
          <Link href="/costs" className="underline" style={{ color: C.brand }}>עלויות מוצרים</Link>.
        </p>
      </div>

      {/* Filters */}
      <div className="rounded-2xl bg-white p-3 sm:p-4 flex flex-wrap items-center gap-2" style={{ border: `1px solid ${C.border}` }}>
        {PRESETS.map(p => (
          <button key={p.key} onClick={() => { setPreset(p.key); setRange(presetRange(p.key)); }}
            className="h-9 px-3 rounded-full text-xs font-medium transition-colors"
            style={preset === p.key ? { backgroundColor: C.brand, color: '#fff' } : { backgroundColor: C.totalBg, color: C.brand }}>
            {p.label}
          </button>
        ))}
        <div className="flex items-center gap-1.5 flex-wrap">
          <input type="date" value={range.from} aria-label="מתאריך"
            onChange={e => { if (e.target.value) { setPreset('custom'); setRange(r => ({ ...r, from: e.target.value })); } }}
            className="h-9 rounded-lg px-2 text-xs border" style={{ borderColor: C.border, color: C.text }} />
          <span className="text-xs" style={{ color: C.sub }}>—</span>
          <input type="date" value={range.to} aria-label="עד תאריך"
            onChange={e => { if (e.target.value) { setPreset('custom'); setRange(r => ({ ...r, to: e.target.value })); } }}
            className="h-9 rounded-lg px-2 text-xs border" style={{ borderColor: C.border, color: C.text }} />
        </div>
        <select value={basis} onChange={e => setBasis(e.target.value as 'delivery' | 'order')} aria-label="לפי איזה תאריך"
          className="h-9 rounded-lg px-2 text-xs border bg-white sm:mr-auto" style={{ borderColor: C.border, color: C.text }}>
          <option value="delivery">לפי תאריך אספקה</option>
          <option value="order">לפי תאריך הזמנה</option>
        </select>
      </div>

      {error ? (
        <div className="rounded-xl p-4 text-sm" style={{ backgroundColor: C.redBg, color: C.red }}>{error}</div>
      ) : loading || !data || !t ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : (
        <>
          {!data.tableReady && (
            <div className="rounded-xl p-4 text-sm" style={{ backgroundColor: C.amberBg, color: C.amber }}>
              טבלת עלויות המוצרים עדיין לא הופעלה (מיגרציה 058), ולכן אין עלויות לחישוב.
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="הכנסה (לפני מע״מ, ללא משלוח)" value={money(t.revenue)} sub={`${t.orders} הזמנות`} icon={Coins} tone="brand" />
            <StatCard label="עלות סחורה" value={money(t.cost)} sub="של המוצרים שיש להם עלות" icon={PiggyBank} />
            <StatCard label="רווח" value={money(t.profitOnCovered)} sub={t.coverage != null && t.coverage < 100 ? `על ${t.coverage}% מההכנסה שיש לה עלות` : 'על כל ההכנסה'}
              icon={TrendingUp} tone={t.profitOnCovered >= 0 ? 'green' : 'red'} />
            <StatCard label="שיעור רווח" value={pct(t.margin)} sub="רווח ÷ הכנסה" icon={Percent} tone="green" />
          </div>

          {(t.coverage != null && t.coverage < 100) && (
            <div className="rounded-xl px-4 py-3 text-sm flex items-start gap-2" style={{ backgroundColor: C.amberBg, color: C.amber }}>
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>
                ל-{data.missingItems.length} פריטים שנמכרו אין עלות, ולכן הרווח מחושב רק על {t.coverage}% מההכנסה.
                הרשימה בלשונית &quot;חסרות עלויות&quot;. אפשר להשלים אותן ב<Link href="/costs" className="underline font-medium">עלויות מוצרים</Link>.
              </span>
            </div>
          )}
          {t.barterOrders > 0 && (
            <p className="text-xs" style={{ color: C.sub }}>
              {t.barterOrders} הזמנות בארטר (ללא הכנסה) לא נכללו בסיכום. עלות הסחורה בהן: {money(t.barterCost)}.
            </p>
          )}

          <Tabs
            tabs={[
              { key: 'products', label: 'לפי מוצר', count: data.products.length },
              { key: 'orders', label: 'לפי הזמנה', count: data.orders.length },
              { key: 'missing', label: 'חסרות עלויות', count: data.missingItems.length },
            ]}
            activeTab={tab}
            onChange={k => setTab(k as TabKey)}
          />

          {tab === 'products' && (
            data.products.length === 0 ? <EmptyNote>אין מכירות בתקופה הזו.</EmptyNote> : (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs" style={{ color: C.sub }}>מיון:</span>
                  {([['revenue', 'הכנסה'], ['profit', 'רווח'], ['margin', 'שיעור רווח']] as [SortKey, string][]).map(([k, label]) => (
                    <button key={k} onClick={() => setSort(k)} className="h-8 px-3 rounded-full text-xs"
                      style={sort === k ? { backgroundColor: C.brand, color: '#fff' } : { backgroundColor: C.totalBg, color: C.brand }}>
                      {label}
                    </button>
                  ))}
                  <button onClick={exportProducts} className="h-8 px-3 rounded-lg text-xs font-medium bg-white mr-auto" style={{ border: `1px solid ${C.border}`, color: '#2A7A4F' }}>
                    הורדה לאקסל
                  </button>
                </div>
                <div className="rounded-2xl bg-white overflow-x-auto" style={{ border: `1px solid ${C.border}` }}>
                  <table className="w-full">
                    <thead style={THEAD_STYLE}>
                      <tr><Th>מוצר</Th><Th>כמות</Th><Th>הכנסה</Th><Th>עלות</Th><Th>רווח</Th><Th>שיעור רווח</Th></tr>
                    </thead>
                    <tbody>
                      {products.map(r => (
                        <tr key={r.key} className={ROW_CLS}>
                          <Td className="font-medium">
                            {r.label}
                            {r.uncostedQty > 0 && (
                              <span className="block text-[11px] font-normal" style={{ color: C.amber }}>
                                {r.uncostedQty === r.qty ? 'אין עלות' : `${r.uncostedQty} יח׳ ללא עלות`}
                              </span>
                            )}
                          </Td>
                          <Td className="tabular-nums">{r.qty}</Td>
                          <Td className="tabular-nums">{money(r.revenue)}</Td>
                          <Td className="tabular-nums">{r.qty - r.uncostedQty > 0 ? money(r.cost) : '—'}</Td>
                          <Td className="tabular-nums font-semibold" style={{ color: r.profit == null ? C.faint : r.profit >= 0 ? C.green : C.red }}>
                            {r.profit == null ? '—' : money(r.profit)}
                          </Td>
                          <Td className="tabular-nums">
                            <MarginBar value={r.margin} />
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          )}

          {tab === 'orders' && (
            data.orders.length === 0 ? <EmptyNote>אין הזמנות בתקופה הזו.</EmptyNote> : (
              <div className="rounded-2xl bg-white overflow-x-auto" style={{ border: `1px solid ${C.border}` }}>
                <table className="w-full">
                  <thead style={THEAD_STYLE}>
                    <tr><Th>הזמנה</Th><Th>תאריך</Th><Th>לקוח</Th><Th>הכנסה</Th><Th>עלות</Th><Th>רווח</Th><Th>שיעור</Th></tr>
                  </thead>
                  <tbody>
                    {data.orders.map(o => (
                      <tr key={o.id} className={ROW_CLS}>
                        <Td>
                          <Link href={`/orders/${o.id}`} className="underline" style={{ color: C.brand }}>{o.orderNumber}</Link>
                          {o.barter && <span className="mr-1.5 text-[11px]" style={{ color: C.sub }}>בארטר</span>}
                        </Td>
                        <Td className="tabular-nums">{fmtDate(o.date)}</Td>
                        <Td>{o.customerName}</Td>
                        <Td className="tabular-nums">{money(o.revenue)}</Td>
                        <Td className="tabular-nums">{money(o.cost)}</Td>
                        <Td className="tabular-nums font-semibold" style={{ color: (o.profit ?? o.partialProfit) >= 0 ? C.green : C.red }}>
                          {o.profit != null ? money(o.profit) : (
                            <span title={`חסרה עלות: ${o.missing.join(', ')}`}>
                              {money(o.partialProfit)}<span className="text-[11px] font-normal" style={{ color: C.amber }}> (חלקי)</span>
                            </span>
                          )}
                        </Td>
                        <Td className="tabular-nums">{pct(o.margin)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {tab === 'missing' && (
            data.missingItems.length === 0 ? <EmptyNote>לכל מה שנמכר בתקופה יש עלות.</EmptyNote> : (
              <div className="rounded-2xl bg-white p-4 space-y-3" style={{ border: `1px solid ${C.border}` }}>
                <p className="text-sm" style={{ color: C.sub }}>
                  לפריטים האלה אין עלות בעמוד <Link href="/costs" className="underline" style={{ color: C.brand }}>עלויות מוצרים</Link>.
                  מארז מחושב לפי ממוצע העלות של פטיפור × מספר היחידות במארז, אז מארז יופיע כאן רק אם לאף פטיפור אין עלות.
                  פריט ידני (שנכתב בהזמנה ביד) לא מקבל עלות.
                </p>
                <ul className="divide-y" style={{ borderColor: C.border }}>
                  {data.missingItems.map(m => (
                    <li key={m.label} className="py-2 flex items-center justify-between text-sm">
                      <span style={{ color: C.text }}>{m.label}</span>
                      <span className="text-xs tabular-nums" style={{ color: C.sub }}>ב-{m.orders} הזמנות</span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}

function MarginBar({ value }: { value: number | null }) {
  if (value == null) return <span style={{ color: C.faint }}>—</span>;
  const w = Math.max(0, Math.min(100, value));
  const color = value < 0 ? C.red : value < 30 ? C.amber : C.green;
  return (
    <div className="flex items-center gap-2 min-w-[110px]">
      <div className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: C.totalBg }}>
        <div className="h-1.5 rounded-full" style={{ width: `${w}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs tabular-nums w-11 text-left" style={{ color }}>{value}%</span>
    </div>
  );
}
