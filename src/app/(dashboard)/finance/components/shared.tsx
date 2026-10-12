'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { FileSpreadsheet, ImageDown, type LucideIcon } from 'lucide-react';
import { fmtILS } from '@/lib/finance-export';

export const C = {
  text: '#2A1C10',
  sub: '#7B604D',
  faint: '#C0B4A8',
  border: '#E8DED2',
  brand: '#7A4820',
  choc: '#3A2A1A',
  gold: '#C9A46A',
  soft: '#FAF7F0',
  totalBg: '#F0EAE0',
  green: '#33623A',
  greenBg: '#EAF0E7',
  red: '#A0362C',
  redBg: '#F0EAE8',
  amber: '#94650E',
  amberBg: '#FBF5E6',
};

/** Dark chocolate table header — pair with <Th>. */
export const THEAD_STYLE: React.CSSProperties = { backgroundColor: C.choc };
/** Highlighted "סה״כ" row. */
export const TOTAL_ROW_STYLE: React.CSSProperties = { borderTop: `2px solid ${C.gold}`, backgroundColor: C.totalBg };
/** Zebra + hover for table body rows. */
export const ROW_CLS = 'even:bg-[#F8F6F2]';

export function money(n: number) {
  return fmtILS(n);
}

const TONE: Record<'green' | 'red' | 'amber' | 'brand' | 'neutral', { fg: string; iconBg: string; iconFg: string }> = {
  green: { fg: C.green, iconBg: C.greenBg, iconFg: C.green },
  red: { fg: C.red, iconBg: C.redBg, iconFg: C.red },
  amber: { fg: C.amber, iconBg: C.amberBg, iconFg: C.amber },
  brand: { fg: C.brand, iconBg: '#FBF0E4', iconFg: C.brand },
  neutral: { fg: C.text, iconBg: '#F0EAE0', iconFg: '#9B7A5A' },
};

export function StatCard({ label, value, sub, tone, icon: Icon }: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'green' | 'red' | 'amber' | 'brand';
  icon?: LucideIcon;
}) {
  const t = TONE[tone ?? 'neutral'];
  return (
    <div className="rounded-2xl bg-white px-4 py-4 flex items-start gap-3 transition-shadow hover:shadow-md"
      style={{ border: `1px solid ${C.border}`, boxShadow: '0 2px 10px rgba(58,38,24,0.06)' }}>
      {Icon && (
        <div className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: t.iconBg }}>
          <Icon size={18} strokeWidth={1.8} style={{ color: t.iconFg }} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-xs leading-snug" style={{ color: C.sub }}>{label}</div>
        <div className="text-2xl font-bold mt-1 tabular-nums tracking-tight" style={{ color: t.fg }}>{value}</div>
        {sub && <div className="text-xs mt-1" style={{ color: C.sub }}>{sub}</div>}
      </div>
    </div>
  );
}

/** "Excel" + "תמונה" download buttons with their own busy state. */
export function ExportButtons({ onExcel, onImage }: {
  onExcel: () => Promise<void> | void;
  onImage?: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState<'excel' | 'image' | null>(null);
  const run = async (kind: 'excel' | 'image', fn: () => Promise<void> | void) => {
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      console.error('[finance export]', kind, e instanceof Error ? e.message : e);
      toast.error(kind === 'excel' ? 'הורדת האקסל נכשלה' : 'הורדת התמונה נכשלה');
    } finally {
      setBusy(null);
    }
  };
  const btn = 'inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg bg-white transition-colors hover:bg-[#FAF7F0] disabled:opacity-50';
  return (
    <div className="flex items-center gap-2" data-export-hide>
      <button className={btn} style={{ border: `1px solid ${C.border}`, color: '#2A7A4F' }}
        disabled={busy !== null} onClick={() => run('excel', onExcel)}>
        <FileSpreadsheet size={14} />
        {busy === 'excel' ? 'מכין…' : 'אקסל'}
      </button>
      {onImage && (
        <button className={btn} style={{ border: `1px solid ${C.border}`, color: C.brand }}
          disabled={busy !== null} onClick={() => run('image', onImage)}>
          <ImageDown size={14} />
          {busy === 'image' ? 'מכין…' : 'תמונה'}
        </button>
      )}
    </div>
  );
}

export function Th({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-3 text-xs font-semibold text-right whitespace-nowrap ${className}`} style={{ color: '#FBF0E4' }}>
      {children}
    </th>
  );
}

export function Td({ children, className = '', style }: { children?: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <td className={`px-4 py-3 text-sm whitespace-nowrap ${className}`} style={{ color: C.text, ...style }}>
      {children}
    </td>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl px-4 py-6 text-center text-sm" style={{ backgroundColor: C.soft, color: C.sub, border: `1px dashed ${C.border}` }}>
      {children}
    </div>
  );
}
