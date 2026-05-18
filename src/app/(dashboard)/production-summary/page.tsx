'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { IconProductionSummary } from '@/components/icons';

// ── Response types ────────────────────────────────────────────────────────

interface OrderRef {
  מספר_הזמנה: string;
  id: string;
  לקוח: string;
  כמות: number;
}
interface ProductItem   { מוצר_id: string;  שם_מוצר: string;       כמות_כוללת: number; הזמנות: OrderRef[]; }
interface PackageItem   { גודל_מארז: number; כמות_כוללת: number; פטיפורים_כוללים: number; הזמנות: OrderRef[]; }
interface PetitFourItem { פטיפור_id: string; שם_פטיפור: string;    כמות_כוללת: number; הזמנות: OrderRef[]; }
interface CustomItem    { שם_פריט_מותאם: string; סוג_שורה: string; כמות_כוללת: number; הזמנות: OrderRef[]; }

interface SummaryData {
  orders_count: number;
  products:     ProductItem[];
  packages:     PackageItem[];
  petit_fours:  PetitFourItem[];
  custom_items: CustomItem[];
}

// ── Date helpers ──────────────────────────────────────────────────────────

function toISO(d: Date) { return d.toISOString().slice(0, 10); }

type Preset = 'today' | 'tomorrow' | 'week' | 'twoweeks';
function getPreset(p: Preset): { from: string; to: string } {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  if (p === 'today')     { const d = toISO(t); return { from: d, to: d }; }
  if (p === 'tomorrow')  { const tm = new Date(t); tm.setDate(tm.getDate() + 1); const d = toISO(tm); return { from: d, to: d }; }
  if (p === 'week')      { const e = new Date(t); e.setDate(e.getDate() + 6);  return { from: toISO(t), to: toISO(e) }; }
  /* twoweeks */           const e = new Date(t); e.setDate(e.getDate() + 13); return { from: toISO(t), to: toISO(e) };
}

function fmtDate(iso: string) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// ── Constants ─────────────────────────────────────────────────────────────

const ALL_STATUSES = ['חדשה', 'בהכנה', 'מוכנה למשלוח', 'נשלחה', 'הושלמה בהצלחה'];
const DEFAULT_STATUS: string[] = ['חדשה', 'בהכנה', 'מוכנה למשלוח', 'נשלחה'];
const PRESETS: { key: Preset; label: string }[] = [
  { key: 'today',    label: 'היום'       },
  { key: 'tomorrow', label: 'מחר'        },
  { key: 'week',     label: 'השבוע'      },
  { key: 'twoweeks', label: '2 שבועות'  },
];

// ── Page ──────────────────────────────────────────────────────────────────

export default function ProductionSummaryPage() {
  const def = getPreset('week');
  const [dateFrom, setDateFrom]             = useState(def.from);
  const [dateTo,   setDateTo]               = useState(def.to);
  const [statuses, setStatuses]             = useState<string[]>(DEFAULT_STATUS);
  const [activePreset, setActivePreset]     = useState<string>('week');
  const [data,  setData]                    = useState<SummaryData | null>(null);
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState<string | null>(null);
  const [expanded, setExpanded]             = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    if (statuses.length === 0) {
      setData({ orders_count: 0, products: [], packages: [], petit_fours: [], custom_items: [] });
      return;
    }
    setLoading(true); setError(null);
    try {
      const qs = new URLSearchParams({ date_from: dateFrom, date_to: dateTo, status: statuses.join(',') });
      const res = await fetch(`/api/production-summary?${qs}`);
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

  const hasData = data && (
    data.products.length > 0 || data.packages.length > 0 ||
    data.petit_fours.length > 0 || data.custom_items.length > 0
  );

  return (
    <div dir="rtl" className="max-w-5xl mx-auto space-y-5 pb-12">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 pt-1">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: '#F4E8D8', color: '#8B5E34' }}>
          <IconProductionSummary className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#2B1A10' }}>סיכום ייצור</h1>
          <p className="text-xs mt-0.5" style={{ color: '#8A735F' }}>
            {loading ? 'טוען...' : data ? `${data.orders_count} הזמנות בתקופה ${fmtDate(dateFrom)}–${fmtDate(dateTo)}` : ''}
          </p>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="rounded-2xl p-4 space-y-3"
        style={{ background: 'linear-gradient(180deg,#FFFDF8 0%,#FBF5EA 100%)', border: '1px solid #EAE0D4' }}>

        {/* Date presets + custom range */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium shrink-0" style={{ color: '#8A735F' }}>תקופה:</span>
          {PRESETS.map(({ key, label }) => (
            <button key={key} onClick={() => applyPreset(key)}
              className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
              style={activePreset === key
                ? { backgroundColor: '#8B5E34', color: '#FFFFFF' }
                : { backgroundColor: '#EAE0D4', color: '#6B4A2D' }}>
              {label}
            </button>
          ))}
          <div className="flex items-center gap-1.5 flex-wrap" style={{ marginInlineStart: 'auto' }}>
            <input type="date" value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setActivePreset('custom'); }}
              className="rounded-lg px-2 py-1 text-xs border"
              style={{ borderColor: '#EAE0D4', color: '#2B1A10', backgroundColor: '#FFFFFF' }} />
            <span className="text-xs" style={{ color: '#8A735F' }}>—</span>
            <input type="date" value={dateTo}
              onChange={e => { setDateTo(e.target.value); setActivePreset('custom'); }}
              className="rounded-lg px-2 py-1 text-xs border"
              style={{ borderColor: '#EAE0D4', color: '#2B1A10', backgroundColor: '#FFFFFF' }} />
          </div>
        </div>

        {/* Status chips */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium shrink-0" style={{ color: '#8A735F' }}>סטטוס:</span>
          {ALL_STATUSES.map(s => (
            <button key={s} onClick={() => toggleStatus(s)}
              className="px-2.5 py-1 rounded-full text-xs transition-colors"
              style={statuses.includes(s)
                ? { backgroundColor: '#8B5E34', color: '#FFFFFF', fontWeight: 500 }
                : { backgroundColor: '#F4E8D8', color: '#8B5E34' }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="p-4 rounded-xl text-sm"
          style={{ backgroundColor: '#FEF2F2', color: '#991B1B', border: '1px solid #FCA5A5' }}>
          {error}
        </div>
      )}

      {/* ── Loading spinner ── */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-7 h-7 rounded-full border-2 animate-spin"
            style={{ borderColor: '#EAE0D4', borderTopColor: '#8B5E34' }} />
        </div>
      )}

      {/* ── Empty ── */}
      {!loading && data && !hasData && (
        <div className="text-center py-16">
          <p className="text-lg font-medium" style={{ color: '#8A735F' }}>אין הזמנות בתקופה זו</p>
          <p className="text-sm mt-1" style={{ color: '#A09080' }}>שנה את הפילטרים כדי לראות נתונים</p>
        </div>
      )}

      {/* ── Data sections ── */}
      {!loading && data && hasData && (
        <>
          {/* Products */}
          {data.products.length > 0 && (
            <Section title="סיכום מוצרים"
              badge={`${data.products.reduce((s, p) => s + p.כמות_כוללת, 0)} יחידות`}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid #EAE0D4' }}>
                    <th className="text-right py-2 px-4 text-xs font-medium" style={{ color: '#8A735F' }}>מוצר</th>
                    <th className="text-center py-2 px-4 text-xs font-medium w-24" style={{ color: '#8A735F' }}>כמות</th>
                    <th className="text-center py-2 px-4 text-xs font-medium w-20" style={{ color: '#8A735F' }}>הזמנות</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {data.products.map(p => {
                    const key = `prod:${p.מוצר_id}`;
                    const open = expanded.has(key);
                    return (
                      <React.Fragment key={key}>
                        <tr onClick={() => toggleExpand(key)}
                          className="cursor-pointer transition-colors"
                          style={{ borderBottom: '1px solid #F4EEE6' }}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#FAFAF6')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}>
                          <td className="py-2.5 px-4 font-medium" style={{ color: '#2B1A10' }}>{p.שם_מוצר}</td>
                          <td className="py-2.5 px-4 text-center">
                            <span className="inline-flex items-center justify-center min-w-[2.5rem] h-7 px-2 rounded-lg text-sm font-bold"
                              style={{ backgroundColor: '#F4E8D8', color: '#8B5E34' }}>
                              {p.כמות_כוללת}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-center text-sm" style={{ color: '#8A735F' }}>
                            {p.הזמנות.length}
                          </td>
                          <td className="py-2.5 px-2 text-center text-xs" style={{ color: '#C9A46A' }}>
                            {open ? '▲' : '▼'}
                          </td>
                        </tr>
                        {open && p.הזמנות.map((o, i) => (
                          <tr key={`${key}:o${i}`} style={{ backgroundColor: '#FDFBF7', borderBottom: '1px solid #F4EEE6' }}>
                            <td className="py-1.5 px-4 text-xs" style={{ paddingInlineStart: '2.5rem', color: '#6B4A2D' }}>
                              <Link href={`/orders/${o.id}`} className="hover:underline font-medium" style={{ color: '#8B5E34' }}>
                                הזמנה #{o.מספר_הזמנה}
                              </Link>
                              {o.לקוח && <span style={{ color: '#9B7A5A' }}> — {o.לקוח}</span>}
                            </td>
                            <td className="py-1.5 px-4 text-center text-xs font-semibold" style={{ color: '#6B4A2D' }}>{o.כמות}</td>
                            <td colSpan={2} />
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </Section>
          )}

          {/* Packages */}
          {data.packages.length > 0 && (
            <Section title="סיכום מארזים"
              badge={`${data.packages.reduce((s, p) => s + p.כמות_כוללת, 0)} מארזים`}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
                {data.packages.map(pkg => {
                  const key = `pkg:${pkg.גודל_מארז}`;
                  const open = expanded.has(key);
                  return (
                    <div key={key} className="space-y-1">
                      <button onClick={() => toggleExpand(key)}
                        className="w-full text-right rounded-xl p-3.5 transition-opacity hover:opacity-90"
                        style={{ backgroundColor: '#F4E8D8', border: '1px solid #E2CDB0' }}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold" style={{ color: '#6B4A2D' }}>
                            מארז {pkg.גודל_מארז} פטיפורים
                          </span>
                          <span className="text-xs" style={{ color: '#A07850' }}>{open ? '▲' : '▼'}</span>
                        </div>
                        <div className="flex items-end gap-1.5">
                          <span className="text-3xl font-bold leading-none" style={{ color: '#8B5E34' }}>
                            {pkg.כמות_כוללת}
                          </span>
                          <span className="text-xs mb-0.5" style={{ color: '#A07850' }}>יחידות</span>
                        </div>
                        <div className="text-xs mt-1.5 font-medium" style={{ color: '#A07850' }}>
                          {pkg.פטיפורים_כוללים} פטיפורים סה״כ
                        </div>
                      </button>
                      {open && (
                        <div className="rounded-xl p-2 space-y-1"
                          style={{ backgroundColor: '#FDFBF7', border: '1px solid #EAE0D4' }}>
                          {pkg.הזמנות.map((o, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs py-1 px-1">
                              <Link href={`/orders/${o.id}`} className="hover:underline font-medium shrink-0"
                                style={{ color: '#8B5E34' }}>
                                #{o.מספר_הזמנה}
                              </Link>
                              {o.לקוח && <span className="truncate flex-1" style={{ color: '#9B7A5A' }}>{o.לקוח}</span>}
                              <span className="font-semibold shrink-0" style={{ color: '#2B1A10' }}>{o.כמות}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Petit-fours */}
          {data.petit_fours.length > 0 && (
            <Section title="סיכום סוגי פטיפורים"
              badge={`${data.petit_fours.reduce((s, p) => s + p.כמות_כוללת, 0)} פטיפורים`}
              badgeStyle={{ backgroundColor: '#6D28D9', color: '#FFFFFF' }}>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 p-4">
                {data.petit_fours.map(pf => {
                  const key = `pf:${pf.פטיפור_id}`;
                  const open = expanded.has(key);
                  return (
                    <div key={key} className="space-y-1">
                      <button onClick={() => toggleExpand(key)}
                        className="w-full text-right rounded-xl p-3 transition-opacity hover:opacity-90"
                        style={{ backgroundColor: '#EDE9FE', border: '1px solid #DDD6FE' }}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold truncate" style={{ color: '#5B21B6' }}>
                            {pf.שם_פטיפור}
                          </span>
                          <span className="text-xs shrink-0 ml-1" style={{ color: '#7C3AED' }}>{open ? '▲' : '▼'}</span>
                        </div>
                        <span className="text-3xl font-bold leading-none" style={{ color: '#5B21B6' }}>
                          {pf.כמות_כוללת}
                        </span>
                      </button>
                      {open && (
                        <div className="rounded-xl p-2 space-y-1"
                          style={{ backgroundColor: '#FDFBF7', border: '1px solid #EAE0D4' }}>
                          {pf.הזמנות.map((o, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs py-1 px-1">
                              <Link href={`/orders/${o.id}`} className="hover:underline font-medium shrink-0"
                                style={{ color: '#8B5E34' }}>
                                #{o.מספר_הזמנה}
                              </Link>
                              {o.לקוח && <span className="truncate flex-1" style={{ color: '#9B7A5A' }}>{o.לקוח}</span>}
                              <span className="font-semibold shrink-0" style={{ color: '#2B1A10' }}>{o.כמות}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Custom / manual items */}
          {data.custom_items.length > 0 && (
            <Section title="מוצרים ידניים ותוספות"
              badge={`${data.custom_items.reduce((s, p) => s + p.כמות_כוללת, 0)} יחידות`}>
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
                  {data.custom_items.map((item, idx) => {
                    const key = `custom:${idx}`;
                    const open = expanded.has(key);
                    return (
                      <React.Fragment key={key}>
                        <tr onClick={() => toggleExpand(key)}
                          className="cursor-pointer transition-colors"
                          style={{ borderBottom: '1px solid #F4EEE6' }}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#FAFAF6')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}>
                          <td className="py-2.5 px-4 font-medium" style={{ color: '#2B1A10' }}>
                            {item.שם_פריט_מותאם}
                          </td>
                          <td className="py-2.5 px-4">
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                              style={item.סוג_שורה === 'תוספת_תשלום'
                                ? { backgroundColor: '#EDE9FE', color: '#5B21B6' }
                                : { backgroundColor: '#F3F4F6', color: '#374151' }}>
                              {item.סוג_שורה === 'תוספת_תשלום' ? 'תוספת' : 'ידני'}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            <span className="inline-flex items-center justify-center min-w-[2.5rem] h-7 px-2 rounded-lg text-sm font-bold"
                              style={{ backgroundColor: '#F4E8D8', color: '#8B5E34' }}>
                              {item.כמות_כוללת}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 text-center text-xs" style={{ color: '#C9A46A' }}>
                            {open ? '▲' : '▼'}
                          </td>
                        </tr>
                        {open && item.הזמנות.map((o, i) => (
                          <tr key={`${key}:o${i}`}
                            style={{ backgroundColor: '#FDFBF7', borderBottom: '1px solid #F4EEE6' }}>
                            <td className="py-1.5 px-4 text-xs" style={{ paddingInlineStart: '2.5rem', color: '#6B4A2D' }} colSpan={2}>
                              <Link href={`/orders/${o.id}`} className="hover:underline font-medium"
                                style={{ color: '#8B5E34' }}>
                                הזמנה #{o.מספר_הזמנה}
                              </Link>
                              {o.לקוח && <span style={{ color: '#9B7A5A' }}> — {o.לקוח}</span>}
                            </td>
                            <td className="py-1.5 px-4 text-center text-xs font-semibold" style={{ color: '#6B4A2D' }}>
                              {o.כמות}
                            </td>
                            <td />
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </Section>
          )}
        </>
      )}
    </div>
  );
}

// ── Section card wrapper ──────────────────────────────────────────────────

function Section({
  title, badge, badgeStyle, children,
}: {
  title: string;
  badge: string;
  badgeStyle?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: '#FFFFFF', border: '1px solid #EAE0D4', boxShadow: '0 1px 6px rgba(58,42,26,0.04)' }}>
      <div className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid #EAE0D4', backgroundColor: '#FBF5EA' }}>
        <h2 className="font-semibold text-sm" style={{ color: '#2B1A10' }}>{title}</h2>
        <span className="text-xs font-bold px-2.5 py-1 rounded-full"
          style={badgeStyle ?? { backgroundColor: '#8B5E34', color: '#FFFFFF' }}>
          סה״כ: {badge}
        </span>
      </div>
      {children}
    </div>
  );
}
