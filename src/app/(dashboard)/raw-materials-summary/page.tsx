'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { IconRawMaterials } from '@/components/icons';

// ── Response types ────────────────────────────────────────────────────────

interface OrderRef { מספר_הזמנה: string; id: string; לקוח: string; }

interface SourceRef {
  name: string;
  type: 'מוצר' | 'פטיפור';
  required_qty: number;
}

interface RawMaterialReq {
  חומר_גלם_id: string;
  שם: string;
  required: number;
  in_stock: number;
  missing: number;
  recipe_unit: string;
  stock_unit: string;
  unit_mismatch: boolean;
  sources: SourceRef[];
}

interface NoRecipeItem {
  type: 'מוצר' | 'פטיפור';
  name: string;
  qty: number;
  orders: OrderRef[];
}

interface SummaryData {
  orders_count:        number;
  raw_materials:       RawMaterialReq[];
  unit_mismatch_items: RawMaterialReq[];
  no_recipe_items:     NoRecipeItem[];
}

// ── Date helpers ──────────────────────────────────────────────────────────

function toISO(d: Date) { return d.toISOString().slice(0, 10); }

type Preset = 'today' | 'tomorrow' | 'week' | 'twoweeks';
function getPreset(p: Preset): { from: string; to: string } {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  if (p === 'today')    { const d = toISO(t); return { from: d, to: d }; }
  if (p === 'tomorrow') { const tm = new Date(t); tm.setDate(tm.getDate() + 1); const d = toISO(tm); return { from: d, to: d }; }
  if (p === 'week')     { const e = new Date(t); e.setDate(e.getDate() + 6);  return { from: toISO(t), to: toISO(e) }; }
  const e = new Date(t); e.setDate(e.getDate() + 13); return { from: toISO(t), to: toISO(e) };
}

function fmtDate(iso: string) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function fmtQty(n: number, unit: string) {
  const display = Number.isInteger(n) ? n.toString() : n.toFixed(2).replace(/\.?0+$/, '');
  return unit ? `${display} ${unit}` : display;
}

// ── Constants ─────────────────────────────────────────────────────────────

const ALL_STATUSES = ['חדשה', 'בהכנה', 'מוכנה למשלוח', 'נשלחה', 'הושלמה בהצלחה'];
const DEFAULT_STATUS: string[] = ['חדשה', 'בהכנה', 'מוכנה למשלוח', 'נשלחה'];
const PRESETS: { key: Preset; label: string }[] = [
  { key: 'today',    label: 'היום'      },
  { key: 'tomorrow', label: 'מחר'       },
  { key: 'week',     label: 'השבוע'     },
  { key: 'twoweeks', label: '2 שבועות' },
];

// Brand colors
const B = {
  bg:        '#FFFDF9',
  card:      '#FFFFFF',
  border:    '#EAE0D4',
  borderSoft:'#F4EDE4',
  brand:     '#8B5E34',
  brandSoft: '#F4E8D8',
  espresso:  '#2B1A10',
  textSoft:  '#8A735F',
  textMuted: '#A09080',
  red:       '#991B1B',
  redSoft:   '#FEF2F2',
  redBorder: '#FECACA',
  green:     '#166534',
  greenSoft: '#F0FDF4',
  greenBorder:'#BBF7D0',
  amber:     '#92400E',
  amberSoft: '#FFFBEB',
  amberBorder:'#FDE68A',
  purple:    '#5B21B6',
  purpleSoft:'#EDE9FE',
};

// ── Page ──────────────────────────────────────────────────────────────────

export default function RawMaterialsSummaryPage() {
  const def = getPreset('week');
  const [dateFrom,     setDateFrom]     = useState(def.from);
  const [dateTo,       setDateTo]       = useState(def.to);
  const [statuses,     setStatuses]     = useState<string[]>(DEFAULT_STATUS);
  const [activePreset, setActivePreset] = useState<string>('week');
  const [data,         setData]         = useState<SummaryData | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [expanded,     setExpanded]     = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    if (statuses.length === 0) {
      setData({ orders_count: 0, raw_materials: [], unit_mismatch_items: [], no_recipe_items: [] });
      return;
    }
    setLoading(true); setError(null);
    try {
      const qs = new URLSearchParams({ date_from: dateFrom, date_to: dateTo, status: statuses.join(',') });
      const res = await fetch(`/api/raw-materials-summary?${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'שגיאה בטעינת נתונים');
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, statuses]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function applyPreset(p: Preset) {
    const { from, to } = getPreset(p);
    setDateFrom(from); setDateTo(to); setActivePreset(p);
  }

  function toggleStatus(s: string) {
    setStatuses(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
    setActivePreset('custom');
  }

  function toggleExpand(key: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  const missingCount  = data?.raw_materials.filter(r => r.missing > 0).length ?? 0;
  const okCount       = data?.raw_materials.filter(r => r.missing === 0).length ?? 0;
  const noRecipeCount = data?.no_recipe_items.length ?? 0;
  const mismatchCount = data?.unit_mismatch_items.length ?? 0;

  const hasAnyData = data && (
    data.raw_materials.length > 0 ||
    data.unit_mismatch_items.length > 0 ||
    data.no_recipe_items.length > 0
  );

  return (
    <div dir="rtl" className="max-w-5xl mx-auto space-y-5 pb-12">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 pt-1">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: B.brandSoft, color: B.brand }}>
          <IconRawMaterials className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ color: B.espresso }}>סיכום חומרי גלם</h1>
          <p className="text-xs mt-0.5" style={{ color: B.textSoft }}>
            {loading ? 'טוען...' : data
              ? `${data.orders_count} הזמנות בתקופה ${fmtDate(dateFrom)}–${fmtDate(dateTo)}`
              : ''}
          </p>
        </div>
        <Link href="/production-summary"
          className="mr-auto text-xs font-medium px-3 py-1.5 rounded-xl border transition-colors"
          style={{ color: B.brand, borderColor: B.border, backgroundColor: B.brandSoft }}>
          ← סיכום ייצור
        </Link>
      </div>

      {/* ── Filters ── */}
      <div className="rounded-2xl p-4 space-y-3"
        style={{ background: 'linear-gradient(180deg,#FFFDF8 0%,#FBF5EA 100%)', border: `1px solid ${B.border}` }}>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium shrink-0" style={{ color: B.textSoft }}>תקופה:</span>
          {PRESETS.map(({ key, label }) => (
            <button key={key} onClick={() => applyPreset(key)}
              className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
              style={activePreset === key
                ? { backgroundColor: B.brand, color: '#FFFFFF' }
                : { backgroundColor: '#EAE0D4', color: '#6B4A2D' }}>
              {label}
            </button>
          ))}
          <div className="flex items-center gap-1.5 flex-wrap" style={{ marginInlineStart: 'auto' }}>
            <input type="date" value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setActivePreset('custom'); }}
              className="rounded-lg px-2 py-1 text-xs border"
              style={{ borderColor: B.border, color: B.espresso, backgroundColor: '#FFFFFF' }} />
            <span className="text-xs" style={{ color: B.textSoft }}>—</span>
            <input type="date" value={dateTo}
              onChange={e => { setDateTo(e.target.value); setActivePreset('custom'); }}
              className="rounded-lg px-2 py-1 text-xs border"
              style={{ borderColor: B.border, color: B.espresso, backgroundColor: '#FFFFFF' }} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium shrink-0" style={{ color: B.textSoft }}>סטטוס:</span>
          {ALL_STATUSES.map(s => (
            <button key={s} onClick={() => toggleStatus(s)}
              className="px-2.5 py-1 rounded-full text-xs transition-colors"
              style={statuses.includes(s)
                ? { backgroundColor: B.brand, color: '#FFFFFF', fontWeight: 500 }
                : { backgroundColor: B.brandSoft, color: B.brand }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="p-4 rounded-xl text-sm"
          style={{ backgroundColor: B.redSoft, color: B.red, border: `1px solid ${B.redBorder}` }}>
          {error}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-7 h-7 rounded-full border-2 animate-spin"
            style={{ borderColor: B.border, borderTopColor: B.brand }} />
        </div>
      )}

      {/* ── Summary counts strip ── */}
      {!loading && data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <CountCard label="חסר במלאי" count={missingCount} bg={missingCount > 0 ? B.redSoft : B.card} color={missingCount > 0 ? B.red : B.textMuted} border={missingCount > 0 ? B.redBorder : B.border} />
          <CountCard label="מספיק במלאי" count={okCount} bg={B.greenSoft} color={B.green} border={B.greenBorder} />
          <CountCard label="ללא מתכון" count={noRecipeCount} bg={B.amberSoft} color={B.amber} border={B.amberBorder} />
          <CountCard label="יחידות לא תואמות" count={mismatchCount} bg={B.purpleSoft} color={B.purple} border="#DDD6FE" />
        </div>
      )}

      {/* ── Empty ── */}
      {!loading && data && !hasAnyData && (
        <div className="text-center py-16">
          <p className="text-lg font-medium" style={{ color: B.textSoft }}>אין הזמנות בתקופה זו</p>
          <p className="text-sm mt-1" style={{ color: B.textMuted }}>שנה את הפילטרים כדי לראות נתונים</p>
        </div>
      )}

      {!loading && data && hasAnyData && (
        <>
          {/* ── Section 1: Missing stock ── */}
          {data.raw_materials.some(r => r.missing > 0) && (
            <Section title="חסר במלאי" badge={`${missingCount} חומרים`}
              badgeStyle={{ backgroundColor: B.red, color: '#FFFFFF' }}
              headerStyle={{ backgroundColor: '#FEF2F2' }}>
              <RawMaterialTable
                items={data.raw_materials.filter(r => r.missing > 0)}
                expanded={expanded}
                toggleExpand={toggleExpand}
                rowVariant="missing"
              />
            </Section>
          )}

          {/* ── Section 2: Sufficient stock ── */}
          {data.raw_materials.some(r => r.missing === 0) && (
            <Section title="מספיק במלאי" badge={`${okCount} חומרים`}
              badgeStyle={{ backgroundColor: B.green, color: '#FFFFFF' }}
              headerStyle={{ backgroundColor: '#F0FDF4' }}>
              <RawMaterialTable
                items={data.raw_materials.filter(r => r.missing === 0)}
                expanded={expanded}
                toggleExpand={toggleExpand}
                rowVariant="ok"
              />
            </Section>
          )}

          {/* ── Section 3: No linked recipe ── */}
          {data.no_recipe_items.length > 0 && (
            <Section title="מוצרים ופטיפורים ללא מתכון משויך" badge={`${noRecipeCount} פריטים`}
              badgeStyle={{ backgroundColor: B.amber, color: '#FFFFFF' }}
              headerStyle={{ backgroundColor: B.amberSoft }}>
              <NoRecipeTable items={data.no_recipe_items} expanded={expanded} toggleExpand={toggleExpand} />
            </Section>
          )}

          {/* ── Section 4: Unit mismatches ── */}
          {data.unit_mismatch_items.length > 0 && (
            <Section title="יחידות לא תואמות — לבדיקה" badge={`${mismatchCount} חומרים`}
              badgeStyle={{ backgroundColor: B.purple, color: '#FFFFFF' }}
              headerStyle={{ backgroundColor: B.purpleSoft }}>
              <RawMaterialTable
                items={data.unit_mismatch_items}
                expanded={expanded}
                toggleExpand={toggleExpand}
                rowVariant="mismatch"
              />
            </Section>
          )}
        </>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function CountCard({ label, count, bg, color, border }: {
  label: string; count: number; bg: string; color: string; border: string;
}) {
  return (
    <div className="rounded-xl p-3 text-center"
      style={{ backgroundColor: bg, border: `1px solid ${border}` }}>
      <div className="text-2xl font-bold tabular-nums" style={{ color }}>{count}</div>
      <div className="text-xs mt-0.5" style={{ color }}>{label}</div>
    </div>
  );
}

function Section({ title, badge, badgeStyle, headerStyle, children }: {
  title: string;
  badge: string;
  badgeStyle?: React.CSSProperties;
  headerStyle?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: '#FFFFFF', border: '1px solid #EAE0D4', boxShadow: '0 1px 6px rgba(58,42,26,0.04)' }}>
      <div className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid #EAE0D4', ...headerStyle }}>
        <h2 className="font-semibold text-sm" style={{ color: '#2B1A10' }}>{title}</h2>
        <span className="text-xs font-bold px-2.5 py-1 rounded-full"
          style={badgeStyle}>
          {badge}
        </span>
      </div>
      {children}
    </div>
  );
}

// ── Raw material table (used for missing, ok, mismatch sections) ──────────

function RawMaterialTable({ items, expanded, toggleExpand, rowVariant }: {
  items: RawMaterialReq[];
  expanded: Set<string>;
  toggleExpand: (key: string) => void;
  rowVariant: 'missing' | 'ok' | 'mismatch';
}) {
  function missingBadge(item: RawMaterialReq) {
    if (rowVariant === 'mismatch') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
          style={{ backgroundColor: B.purpleSoft, color: B.purple }}>
          יחידות לא תואמות
        </span>
      );
    }
    if (rowVariant === 'missing') {
      return (
        <span className="inline-flex items-center justify-center min-w-[4rem] h-6 px-2 rounded-lg text-xs font-bold tabular-nums"
          style={{ backgroundColor: B.redSoft, color: B.red, border: `1px solid ${B.redBorder}` }}>
          חסר {fmtQty(item.missing, item.recipe_unit)}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center justify-center min-w-[4rem] h-6 px-2 rounded-lg text-xs font-bold"
        style={{ backgroundColor: B.greenSoft, color: B.green, border: `1px solid ${B.greenBorder}` }}>
        מספיק
      </span>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr style={{ borderBottom: '1px solid #EAE0D4' }}>
          <th className="text-right py-2 px-4 text-xs font-medium" style={{ color: '#8A735F' }}>חומר גלם</th>
          <th className="text-center py-2 px-3 text-xs font-medium w-28" style={{ color: '#8A735F' }}>נדרש</th>
          <th className="text-center py-2 px-3 text-xs font-medium w-28" style={{ color: '#8A735F' }}>קיים במלאי</th>
          <th className="text-center py-2 px-3 text-xs font-medium w-32" style={{ color: '#8A735F' }}>מצב</th>
          <th className="w-8" />
        </tr>
      </thead>
      <tbody>
        {items.map(item => {
          const key = `rm:${item.חומר_גלם_id}`;
          const open = expanded.has(key);
          return (
            <React.Fragment key={key}>
              <tr onClick={() => toggleExpand(key)}
                className="cursor-pointer"
                style={{ borderBottom: '1px solid #F4EEE6' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#FAFAF6')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}>
                <td className="py-2.5 px-4 font-semibold" style={{ color: '#2B1A10' }}>
                  {item.שם}
                </td>
                <td className="py-2.5 px-3 text-center tabular-nums text-sm font-medium" style={{ color: '#2B1A10' }}>
                  {fmtQty(item.required, item.recipe_unit)}
                </td>
                <td className="py-2.5 px-3 text-center tabular-nums text-sm" style={{ color: '#8A735F' }}>
                  {rowVariant === 'mismatch'
                    ? <span className="text-xs" style={{ color: B.purple }}>{item.in_stock} {item.stock_unit}</span>
                    : fmtQty(item.in_stock, item.recipe_unit)
                  }
                </td>
                <td className="py-2.5 px-3 text-center">
                  {missingBadge(item)}
                </td>
                <td className="py-2.5 px-2 text-center text-xs" style={{ color: '#C9A46A' }}>
                  {open ? '▲' : '▼'}
                </td>
              </tr>

              {open && (
                <tr style={{ backgroundColor: '#FDFBF7', borderBottom: '1px solid #F4EEE6' }}>
                  <td colSpan={5} className="px-4 pt-2 pb-3">
                    <p className="text-[11px] font-semibold mb-1.5 uppercase tracking-wide" style={{ color: '#A09080' }}>
                      נדרש בגלל:
                    </p>
                    {rowVariant === 'mismatch' && (
                      <div className="mb-2 text-xs px-3 py-2 rounded-lg"
                        style={{ backgroundColor: B.purpleSoft, color: B.purple }}>
                        יחידת מידה במתכון: <strong>{item.recipe_unit}</strong>
                        {' '}· יחידת מידה במלאי: <strong>{item.stock_unit}</strong>
                        {' '}— יש לוודא שהיחידות תואמות כדי לחשב את החוסר
                      </div>
                    )}
                    <div className="space-y-1">
                      {item.sources.map((src, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium"
                            style={src.type === 'מוצר'
                              ? { backgroundColor: B.brandSoft, color: B.brand }
                              : { backgroundColor: B.purpleSoft, color: B.purple }}>
                            {src.type}
                          </span>
                          <span className="font-medium" style={{ color: '#2B1A10' }}>{src.name}</span>
                          <span style={{ color: '#A09080' }}>→</span>
                          <span className="tabular-nums font-semibold" style={{ color: B.brand }}>
                            {fmtQty(src.required_qty, item.recipe_unit)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

// ── No-recipe items table ─────────────────────────────────────────────────

function NoRecipeTable({ items, expanded, toggleExpand }: {
  items: NoRecipeItem[];
  expanded: Set<string>;
  toggleExpand: (key: string) => void;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr style={{ borderBottom: '1px solid #EAE0D4' }}>
          <th className="text-right py-2 px-4 text-xs font-medium" style={{ color: '#8A735F' }}>פריט</th>
          <th className="text-right py-2 px-4 text-xs font-medium w-24" style={{ color: '#8A735F' }}>סוג</th>
          <th className="text-center py-2 px-4 text-xs font-medium w-24" style={{ color: '#8A735F' }}>כמות</th>
          <th className="w-8" />
        </tr>
      </thead>
      <tbody>
        {items.map((item, idx) => {
          const key = `nr:${idx}:${item.name}`;
          const open = expanded.has(key);
          return (
            <React.Fragment key={key}>
              <tr onClick={() => toggleExpand(key)}
                className="cursor-pointer"
                style={{ borderBottom: '1px solid #F4EEE6' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#FAFAF6')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}>
                <td className="py-2.5 px-4 font-medium" style={{ color: '#2B1A10' }}>{item.name}</td>
                <td className="py-2.5 px-4">
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={item.type === 'פטיפור'
                      ? { backgroundColor: B.purpleSoft, color: B.purple }
                      : { backgroundColor: B.brandSoft, color: B.brand }}>
                    {item.type}
                  </span>
                </td>
                <td className="py-2.5 px-4 text-center">
                  <span className="inline-flex items-center justify-center min-w-[2.5rem] h-7 px-2 rounded-lg text-sm font-bold"
                    style={{ backgroundColor: B.amberSoft, color: B.amber }}>
                    {item.qty}
                  </span>
                </td>
                <td className="py-2.5 px-2 text-center text-xs" style={{ color: '#C9A46A' }}>
                  {open ? '▲' : '▼'}
                </td>
              </tr>
              {open && item.orders.map((o, i) => (
                <tr key={`${key}:o${i}`} style={{ backgroundColor: '#FDFBF7', borderBottom: '1px solid #F4EEE6' }}>
                  <td className="py-1.5 px-4 text-xs" style={{ paddingInlineStart: '2.5rem', color: '#6B4A2D' }} colSpan={3}>
                    <Link href={`/orders/${o.id}`} className="hover:underline font-medium" style={{ color: B.brand }}>
                      הזמנה #{o.מספר_הזמנה}
                    </Link>
                    {o.לקוח && <span style={{ color: '#9B7A5A' }}> — {o.לקוח}</span>}
                  </td>
                  <td />
                </tr>
              ))}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
