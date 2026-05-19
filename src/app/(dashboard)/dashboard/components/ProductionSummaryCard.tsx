'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { C } from './theme';

// ── API response types ────────────────────────────────────────────────────

interface OrderRef {
  id: string;
  מספר_הזמנה: string;
  לקוח: string;
  כמות: number;
  תאריך_אספקה: string | null;
}
interface ProductEntry { שם_מוצר: string;      כמות_כוללת: number; הזמנות: OrderRef[]; }
interface PackageEntry { גודל_מארז: number;    כמות_כוללת: number; פטיפורים_כוללים: number; הזמנות: OrderRef[]; }
interface PfEntry      { פטיפור_id: string;    שם_פטיפור: string;  כמות_כוללת: number; הזמנות: OrderRef[]; }
interface CustomEntry  { שם_פריט_מותאם: string; כמות_כוללת: number; הזמנות: OrderRef[]; }

interface SummaryData {
  orders_count: number;
  products:     ProductEntry[];
  packages:     PackageEntry[];
  petit_fours:  PfEntry[];
  custom_items: CustomEntry[];
}

// ── Helpers ───────────────────────────────────────────────────────────────

function toISO(d: Date) { return d.toISOString().slice(0, 10); }

function nearestDate(orders: OrderRef[]): string | null {
  return orders
    .map(o => o.תאריך_אספקה)
    .filter((d): d is string => !!d)
    .sort()
    .at(0) ?? null;
}

function fmtDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

const SHOW_LIMIT = 5; // items visible before "הצג עוד"

// ── Sub-components ────────────────────────────────────────────────────────

function SectionHeader({ label, total, unit }: { label: string; total: number; unit: string }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.textMuted }}>{label}</h3>
      <span className="text-xs font-bold px-2 py-0.5 rounded-full"
        style={{ backgroundColor: C.brandSoft, color: C.brand }}>
        סה״כ {total} {unit}
      </span>
    </div>
  );
}

function ItemRow({
  name, qty, orderCount, nearest, qtyBgColor, qtyTextColor,
}: {
  name: string;
  qty: number;
  orderCount: number;
  nearest: string | null;
  qtyBgColor?: string;
  qtyTextColor?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 py-1.5" style={{ borderBottom: `1px solid ${C.borderSoft}` }}>
      <span className="flex-1 text-[12px] font-medium truncate" style={{ color: C.text }}>{name}</span>
      <span className="text-[12px] font-bold px-2.5 py-0.5 rounded-lg tabular-nums"
        style={{ backgroundColor: qtyBgColor ?? C.brandSoft, color: qtyTextColor ?? C.brand, minWidth: '2.5rem', textAlign: 'center' }}>
        {qty}
      </span>
      <span className="text-[10.5px] shrink-0" style={{ color: C.textMuted }}>
        {orderCount} הז׳
      </span>
      {nearest && (
        <span className="text-[10.5px] shrink-0" style={{ color: C.textMuted }}>
          | {fmtDate(nearest)}
        </span>
      )}
    </div>
  );
}

function ShowMoreBtn({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="mt-1.5 text-xs font-medium transition-colors"
      style={{ color: C.cocoa }}>
      + הצג {count} נוספים ▼
    </button>
  );
}

// ── Main card ─────────────────────────────────────────────────────────────

export function ProductionSummaryCard() {
  const [data,    setData]    = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAllProds, setShowAllProds] = useState(false);
  const [showAllPkgs,  setShowAllPkgs]  = useState(false);
  const [showAllPf,    setShowAllPf]    = useState(false);
  const [showAllCust,  setShowAllCust]  = useState(false);

  useEffect(() => {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const e = new Date(t); e.setDate(e.getDate() + 6);
    const qs = `date_from=${toISO(t)}&date_to=${toISO(e)}`;
    fetch(`/api/production-summary?${qs}`)
      .then(r => r.json())
      .then(json => { if (!json.error) setData(json); })
      .finally(() => setLoading(false));
  }, []);

  const hasAnything = data && (
    data.products.length > 0 || data.packages.length > 0 ||
    data.petit_fours.length > 0 || data.custom_items.length > 0
  );

  // Visible slices
  const visProds = data ? (showAllProds ? data.products     : data.products.slice(0, SHOW_LIMIT))     : [];
  const visPkgs  = data ? (showAllPkgs  ? data.packages     : data.packages.slice(0, SHOW_LIMIT))     : [];
  const visPf    = data ? (showAllPf    ? data.petit_fours  : data.petit_fours.slice(0, SHOW_LIMIT))  : [];
  const visCust  = data ? (showAllCust  ? data.custom_items : data.custom_items.slice(0, SHOW_LIMIT)) : [];

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: C.card, border: `1px solid ${C.border}`, boxShadow: '0 1px 6px rgba(58,42,26,0.05)' }}>

      {/* ── Card header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3 px-3.5 py-3"
        style={{ borderBottom: `1px solid ${C.border}`, backgroundColor: '#FDFAF5' }}>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold" style={{ color: C.espresso }}>סיכום הזמנות לייצור</h2>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: C.goldSoft, color: C.amber }}>השבוע</span>
            {!loading && data && (
              <span className="text-xs" style={{ color: C.textMuted }}>{data.orders_count} הזמנות</span>
            )}
          </div>
          <p className="text-xs mt-0.5" style={{ color: C.textSoft }}>
            מה צריך להכין לפי ההזמנות הפעילות
          </p>
        </div>
        <Link href="/production-summary"
          className="text-xs font-medium px-3 py-1.5 rounded-xl border transition-colors"
          style={{ color: C.brand, borderColor: C.border, backgroundColor: C.brandSoft }}>
          סיכום מלא →
        </Link>
      </div>

      {/* ── Body ── */}
      <div className="px-3.5 py-3">

          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 rounded-full border-2 animate-spin"
                style={{ borderColor: C.borderSoft, borderTopColor: C.brand }} />
            </div>
          )}

          {!loading && !hasAnything && (
            <p className="text-sm text-center py-6" style={{ color: C.textMuted }}>
              אין הזמנות פעילות השבוע
            </p>
          )}

          {!loading && hasAnything && (
            <div className="grid grid-cols-1 gap-4">

              {/* ── Products ── */}
              {data!.products.length > 0 && (
                <div>
                  <SectionHeader
                    label="מוצרים"
                    total={data!.products.reduce((s, p) => s + p.כמות_כוללת, 0)}
                    unit="יחידות"
                  />
                  <div>
                    {visProds.map((p, i) => (
                      <ItemRow key={i}
                        name={p.שם_מוצר}
                        qty={p.כמות_כוללת}
                        orderCount={p.הזמנות.length}
                        nearest={nearestDate(p.הזמנות)}
                      />
                    ))}
                  </div>
                  {!showAllProds && data!.products.length > SHOW_LIMIT && (
                    <ShowMoreBtn count={data!.products.length - SHOW_LIMIT} onClick={() => setShowAllProds(true)} />
                  )}
                </div>
              )}

              {/* ── Packages ── */}
              {data!.packages.length > 0 && (
                <div>
                  <SectionHeader
                    label="מארזים"
                    total={data!.packages.reduce((s, p) => s + p.כמות_כוללת, 0)}
                    unit="מארזים"
                  />
                  <div>
                    {visPkgs.map((pkg, i) => (
                      <div key={i}>
                        <ItemRow
                          name={`מארז ${pkg.גודל_מארז} פטיפורים`}
                          qty={pkg.כמות_כוללת}
                          orderCount={pkg.הזמנות.length}
                          nearest={nearestDate(pkg.הזמנות)}
                        />
                        {pkg.פטיפורים_כוללים > 0 && (
                          <p className="text-xs pb-1" style={{ color: C.textMuted, marginTop: '-4px' }}>
                            {pkg.פטיפורים_כוללים} פטיפורים סה״כ
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                  {!showAllPkgs && data!.packages.length > SHOW_LIMIT && (
                    <ShowMoreBtn count={data!.packages.length - SHOW_LIMIT} onClick={() => setShowAllPkgs(true)} />
                  )}
                </div>
              )}

              {/* ── Petit-fours ── */}
              {data!.petit_fours.length > 0 && (
                <div>
                  <SectionHeader
                    label="סוגי פטיפורים"
                    total={data!.petit_fours.reduce((s, p) => s + p.כמות_כוללת, 0)}
                    unit="יחידות"
                  />
                  <div>
                    {visPf.map(pf => (
                      <ItemRow key={pf.פטיפור_id}
                        name={pf.שם_פטיפור}
                        qty={pf.כמות_כוללת}
                        orderCount={pf.הזמנות.length}
                        nearest={nearestDate(pf.הזמנות)}
                        qtyBgColor="#EDE9FE"
                        qtyTextColor="#5B21B6"
                      />
                    ))}
                  </div>
                  {!showAllPf && data!.petit_fours.length > SHOW_LIMIT && (
                    <ShowMoreBtn count={data!.petit_fours.length - SHOW_LIMIT} onClick={() => setShowAllPf(true)} />
                  )}
                </div>
              )}

              {/* ── Custom / manual items (only if present) ── */}
              {data!.custom_items.length > 0 && (
                <div>
                  <SectionHeader
                    label="ידניים / תוספות"
                    total={data!.custom_items.reduce((s, p) => s + p.כמות_כוללת, 0)}
                    unit="יחידות"
                  />
                  <div>
                    {visCust.map((item, i) => (
                      <ItemRow key={i}
                        name={item.שם_פריט_מותאם}
                        qty={item.כמות_כוללת}
                        orderCount={item.הזמנות.length}
                        nearest={nearestDate(item.הזמנות)}
                        qtyBgColor="#F3F4F6"
                        qtyTextColor="#374151"
                      />
                    ))}
                  </div>
                  {!showAllCust && data!.custom_items.length > SHOW_LIMIT && (
                    <ShowMoreBtn count={data!.custom_items.length - SHOW_LIMIT} onClick={() => setShowAllCust(true)} />
                  )}
                </div>
              )}

            </div>
          )}
        </div>
    </div>
  );
}
