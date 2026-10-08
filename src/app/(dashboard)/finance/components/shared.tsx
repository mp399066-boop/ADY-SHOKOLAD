'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { fmtILS } from '@/lib/finance-export';

export const C = {
  text: '#3A2A1A',
  sub: '#8A7664',
  faint: '#B0A090',
  border: '#EAE0D4',
  brand: '#8B5E34',
  gold: '#C9A46A',
  soft: '#FAF7F0',
  green: '#2F6B3A',
  greenBg: '#EEF6EE',
  red: '#A0362C',
  redBg: '#FBEDEB',
  amber: '#9A6A12',
  amberBg: '#FBF3E2',
};

export function money(n: number) {
  return fmtILS(n);
}

export function StatCard({ label, value, sub, tone }: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'green' | 'red' | 'amber' | 'brand';
}) {
  const color = tone === 'green' ? C.green : tone === 'red' ? C.red : tone === 'amber' ? C.amber : C.text;
  return (
    <div className="rounded-xl bg-white px-4 py-3" style={{ border: `1px solid ${C.border}` }}>
      <div className="text-xs" style={{ color: C.sub }}>{label}</div>
      <div className="text-xl font-semibold mt-1 tabular-nums" style={{ color }}>{value}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: C.faint }}>{sub}</div>}
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
  const btn = 'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white disabled:opacity-50';
  return (
    <div className="flex items-center gap-2" data-export-hide>
      <button className={btn} style={{ border: `1px solid ${C.border}`, color: '#1D6F42' }}
        disabled={busy !== null} onClick={() => run('excel', onExcel)}>
        {busy === 'excel' ? 'מכין…' : '⬇ אקסל'}
      </button>
      {onImage && (
        <button className={btn} style={{ border: `1px solid ${C.border}`, color: C.brand }}
          disabled={busy !== null} onClick={() => run('image', onImage)}>
          {busy === 'image' ? 'מכין…' : '⬇ תמונה'}
        </button>
      )}
    </div>
  );
}

export function Th({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={`px-3 py-2 text-xs font-medium text-right whitespace-nowrap ${className}`} style={{ color: C.sub }}>
      {children}
    </th>
  );
}

export function Td({ children, className = '', style }: { children?: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <td className={`px-3 py-2 text-sm whitespace-nowrap ${className}`} style={{ color: C.text, ...style }}>
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
