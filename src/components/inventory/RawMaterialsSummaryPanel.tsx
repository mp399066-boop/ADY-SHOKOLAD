'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { C } from '@/app/(dashboard)/dashboard/components/theme';

// ── Types ──────────────────────────────────────────────────────────────────

interface SourceRef { name: string; type: string; required_qty: number; }

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

interface NoRecipeItem { type: string; name: string; qty: number; }

interface SummaryData {
  orders_count:        number;
  raw_materials:       RawMaterialReq[];
  unit_mismatch_items: RawMaterialReq[];
  no_recipe_items:     NoRecipeItem[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtQty(n: number, unit: string) {
  const d = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
  return unit ? `${d} ${unit}` : d;
}

// ── Panel ──────────────────────────────────────────────────────────────────

export function RawMaterialsSummaryPanel({
  mode = 'full',
}: {
  /**
   * kitchen — kitchen view: actionable card rows with severity badge +
   *           affected products, max 5 rows, no stat chips.
   * compact — legacy: table format, top-5 missing, no drill-down.
   * full    — inventory page: all rows, drill-down, all warning sections.
   */
  mode?: 'compact' | 'full' | 'kitchen';
}) {
  const [data,    setData]    = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const e = new Date(t); e.setDate(e.getDate() + 6);
    const qs = `date_from=${t.toISOString().slice(0, 10)}&date_to=${e.toISOString().slice(0, 10)}`;
    fetch(`/api/raw-materials-summary?${qs}`)
      .then(r => r.json())
      .then(json => { if (!json.error) setData(json); })
      .finally(() => setLoading(false));
  }, []);

  function toggle(id: string) {
    setExpanded(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex justify-center py-5">
        <div className="w-5 h-5 rounded-full border-2 animate-spin"
          style={{ borderColor: '#F0E5D8', borderTopColor: '#8B5E34' }} />
      </div>
    );
  }

  if (!data) return null;

  const missing  = data.raw_materials.filter(r => r.missing > 0);
  const ok       = data.raw_materials.filter(r => r.missing === 0);
  const noRecipe = data.no_recipe_items;
  const mismatch = data.unit_mismatch_items;

  const COMPACT_LIMIT = 5;
  const visibleMissing = mode === 'compact' ? missing.slice(0, COMPACT_LIMIT) : missing;
  const extraCount     = missing.length - COMPACT_LIMIT;

  // ── Kitchen mode render ──────────────────────────────────────────────────
  if (mode === 'kitchen') {
    if (loading) {
      return (
        <div className="flex justify-center py-4">
          <div className="w-4 h-4 rounded-full border-2 animate-spin"
            style={{ borderColor: C.borderSoft, borderTopColor: C.brand }} />
        </div>
      );
    }
    if (!data || missing.length === 0) {
      return (
        <div className="rounded-lg px-3 py-3 text-center text-[12px] font-semibold"
          style={{ color: C.green, backgroundColor: C.greenSoft, border: `1px solid #BFD4C2` }}>
          {!data || data.orders_count === 0
            ? 'אין הזמנות פעילות השבוע'
            : 'כל חומרי הגלם מספיקים להזמנות הפעילות'}
        </div>
      );
    }

    const visibleK = missing.slice(0, 5);
    const extraK   = missing.length - 5;

    return (
      <div className="space-y-1.5">
        {visibleK.map(item => {
          const severityFrac = item.required > 0 ? item.missing / item.required : 1;
          const isCritical = severityFrac >= 0.5 || item.in_stock === 0;
          const badgeColor = isCritical ? C.red    : C.amber;
          const badgeBg    = isCritical ? C.redSoft : C.amberSoft;
          const topSrc = item.sources.slice(0, 3);
          const moreSrc = item.sources.length - 3;
          return (
            <div key={item.חומר_גלם_id}
              className="flex items-start gap-2.5 rounded-lg px-3 py-2.5"
              style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}
            >
              <span
                className="text-[10px] font-bold px-2 py-1 rounded-md flex-shrink-0 mt-0.5 tabular-nums"
                style={{ backgroundColor: badgeBg, color: badgeColor, minWidth: '4rem', textAlign: 'center' }}
              >
                חסר {fmtQty(item.missing, item.recipe_unit)}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold" style={{ color: C.text }}>{item.שם}</p>
                <p className="text-[10.5px] mt-0.5" style={{ color: C.textSoft }}>
                  נדרש: {fmtQty(item.required, item.recipe_unit)} · קיים: {fmtQty(item.in_stock, item.recipe_unit)}
                </p>
                {topSrc.length > 0 && (
                  <p className="text-[10.5px] mt-0.5 truncate" style={{ color: C.textMuted }}>
                    משפיע: {topSrc.map(s => s.name).join(', ')}{moreSrc > 0 ? ` +${moreSrc}` : ''}
                  </p>
                )}
              </div>
            </div>
          );
        })}
        {extraK > 0 && (
          <Link
            href="/raw-materials-summary"
            className="flex items-center justify-center text-[11px] font-semibold py-1.5 transition-opacity hover:opacity-70"
            style={{ color: C.brand }}
          >
            + {extraK} חומרים נוספים חסרים ←
          </Link>
        )}
        <Link
          href="/raw-materials-summary"
          className="flex items-center justify-center text-[11px] font-medium py-1 transition-opacity hover:opacity-70"
          style={{ color: C.textMuted }}
        >
          סיכום מלא ←
        </Link>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">

      {/* ── Count chips row ── */}
      <div className="flex flex-wrap items-center gap-2">
        <StatChip
          label="חסר במלאי"
          count={missing.length}
          active={missing.length > 0}
          activeColor="#991B1B"  activeBg="#FEF2F2"  activeBorder="#FECACA"
          inactiveColor="#6B5544" inactiveBg="#F8F3EC" inactiveBorder="#EAE0D4"
        />
        <StatChip label="מספיק"     count={ok.length}      color="#166534" bg="#F0FDF4" border="#BBF7D0" />
        <StatChip label="ללא מתכון" count={noRecipe.length} color="#92400E" bg="#FFFBEB" border="#FDE68A" />
        {mismatch.length > 0 && (
          <StatChip label="יחידות?" count={mismatch.length} color="#5B21B6" bg="#EDE9FE" border="#DDD6FE" />
        )}
        <Link href="/raw-materials-summary"
          className="mr-auto text-[11px] font-medium px-2.5 py-1 rounded-lg border transition-colors"
          style={{ color: '#8B5E34', borderColor: '#E8D8C6', backgroundColor: '#F4E8D8' }}>
          סיכום מלא →
        </Link>
      </div>

      {/* ── All-clear message ── */}
      {missing.length === 0 && noRecipe.length === 0 && mismatch.length === 0 && (
        <div className="text-center py-3 text-sm rounded-xl"
          style={{ color: '#166534', backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0' }}>
          {data.orders_count === 0 ? 'אין הזמנות פעילות השבוע' : 'כל חומרי הגלם מספיקים להזמנות הפעילות'}
        </div>
      )}

      {/* ── Missing items table ── */}
      {visibleMissing.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-1.5"
            style={{ color: '#A09080' }}>
            חומרים שחסר להזמנות הפעילות
          </p>
          <div className="rounded-xl border overflow-hidden"
            style={{ borderColor: '#FECACA', backgroundColor: '#FFFFFF' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ backgroundColor: '#FFF5F5', borderBottom: '1px solid #FECACA' }}>
                  <th className="text-right px-3 py-2 font-semibold" style={{ color: '#7F1D1D' }}>חומר גלם</th>
                  <th className="text-center px-3 py-2 font-semibold w-24" style={{ color: '#7F1D1D' }}>נדרש</th>
                  <th className="text-center px-3 py-2 font-semibold w-24" style={{ color: '#6B4A2D' }}>קיים</th>
                  <th className="text-center px-3 py-2 font-semibold w-24" style={{ color: '#7F1D1D' }}>חסר</th>
                  {mode === 'full' && <th className="w-6" />}
                </tr>
              </thead>
              <tbody>
                {visibleMissing.map(item => {
                  const isOpen = expanded.has(item.חומר_גלם_id);
                  return (
                    <React.Fragment key={item.חומר_גלם_id}>
                      <tr
                        onClick={() => mode === 'full' && toggle(item.חומר_גלם_id)}
                        style={{
                          borderBottom: '1px solid #FFF0F0',
                          cursor: mode === 'full' ? 'pointer' : 'default',
                        }}
                        onMouseEnter={mode === 'full' ? e => (e.currentTarget.style.backgroundColor = '#FFFDF9') : undefined}
                        onMouseLeave={mode === 'full' ? e => (e.currentTarget.style.backgroundColor = '') : undefined}
                      >
                        <td className="px-3 py-2 font-semibold" style={{ color: '#2B1A10' }}>{item.שם}</td>
                        <td className="px-3 py-2 text-center tabular-nums" style={{ color: '#4B2E14' }}>
                          {fmtQty(item.required, item.recipe_unit)}
                        </td>
                        <td className="px-3 py-2 text-center tabular-nums" style={{ color: '#8A735F' }}>
                          {fmtQty(item.in_stock, item.recipe_unit)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className="font-bold tabular-nums" style={{ color: '#991B1B' }}>
                            {fmtQty(item.missing, item.recipe_unit)}
                          </span>
                        </td>
                        {mode === 'full' && (
                          <td className="px-2 text-center text-[10px]" style={{ color: '#C9A46A' }}>
                            {isOpen ? '▲' : '▼'}
                          </td>
                        )}
                      </tr>
                      {mode === 'full' && isOpen && (
                        <tr style={{ backgroundColor: '#FDFBF7', borderBottom: '1px solid #FFF0F0' }}>
                          <td colSpan={5} className="px-4 pt-1.5 pb-2.5">
                            <div className="flex flex-wrap gap-1.5">
                              {item.sources.map((src, i) => (
                                <span key={i} className="text-[11px] px-2 py-0.5 rounded-full"
                                  style={{ backgroundColor: '#F4E8D8', color: '#7B4A22', border: '1px solid #E8CFA8' }}>
                                  {src.name}: {fmtQty(src.required_qty, item.recipe_unit)}
                                </span>
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

            {mode === 'compact' && extraCount > 0 && (
              <div className="px-3 py-2 text-center"
                style={{ borderTop: '1px solid #FFF0F0', backgroundColor: '#FFFDF9' }}>
                <Link href="/raw-materials-summary" className="text-[11px] font-medium"
                  style={{ color: '#8B5E34' }}>
                  + {extraCount} חומרים נוספים חסרים — פתח סיכום מלא
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── No-recipe warning — full mode only ── */}
      {mode === 'full' && noRecipe.length > 0 && (
        <div className="rounded-xl border px-4 py-3"
          style={{ borderColor: '#FDE68A', backgroundColor: '#FFFBEB' }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-2"
            style={{ color: '#92400E' }}>
            ללא מתכון משויך — לא ניתן לחשב
          </p>
          <div className="flex flex-wrap gap-1.5">
            {noRecipe.map((item, i) => (
              <span key={i} className="text-xs px-2.5 py-1 rounded-full"
                style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E' }}>
                {item.name} ×{item.qty}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Unit mismatch warning — full mode only ── */}
      {mode === 'full' && mismatch.length > 0 && (
        <div className="rounded-xl border px-4 py-3"
          style={{ borderColor: '#DDD6FE', backgroundColor: '#F5F3FF' }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-2"
            style={{ color: '#5B21B6' }}>
            יחידות לא תואמות — לבדיקה
          </p>
          <div className="flex flex-wrap gap-1.5">
            {mismatch.map(item => (
              <span key={item.חומר_גלם_id} className="text-xs px-2.5 py-1 rounded-full"
                style={{ backgroundColor: '#EDE9FE', border: '1px solid #DDD6FE', color: '#5B21B6' }}>
                {item.שם} ({item.recipe_unit} ≠ {item.stock_unit})
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Stat chip ─────────────────────────────────────────────────────────────

function StatChip({
  label, count,
  color, bg, border,
  active, activeColor, activeBg, activeBorder, inactiveColor, inactiveBg, inactiveBorder,
}: {
  label: string;
  count: number;
  color?: string;
  bg?: string;
  border?: string;
  active?: boolean;
  activeColor?: string;   activeBg?: string;   activeBorder?: string;
  inactiveColor?: string; inactiveBg?: string; inactiveBorder?: string;
}) {
  const c  = active ? activeColor  : (active === false ? inactiveColor  : color);
  const b  = active ? activeBg     : (active === false ? inactiveBg     : bg);
  const bd = active ? activeBorder : (active === false ? inactiveBorder : border);
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px]"
      style={{ backgroundColor: b, border: `1px solid ${bd}`, color: c }}>
      <span className="font-bold tabular-nums">{count}</span>
      <span className="font-medium">{label}</span>
    </div>
  );
}
