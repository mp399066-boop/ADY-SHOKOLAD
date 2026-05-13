'use client';

// Single small card in the right intelligence rail. Clean header (label +
// big number) + optional row list + optional CTA at the bottom.

import Link from 'next/link';
import { C } from './theme';

interface Props {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
  rows?: { id: string; primary: string; secondary?: string }[];
  cta?: { label: string; href?: string; onClick?: () => void };
}

export function AttentionCard({ label, value, sub, accent, rows, cta }: Props) {
  return (
    <div
      className="rounded-xl px-4 py-3.5"
      style={{
        backgroundColor: C.card,
        border: `1px solid ${C.border}`,
        boxShadow: '0 1px 2px rgba(58,42,26,0.04)',
      }}
    >
      {/* Header: label + value */}
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <span className="text-[10px] uppercase font-semibold" style={{ color: C.textSoft, letterSpacing: '0.08em' }}>
          {label}
        </span>
        <span className="text-[18px] font-bold tabular-nums" style={{ color: accent ?? C.text, letterSpacing: '-0.01em' }}>
          {value}
        </span>
      </div>
      {sub && <p className="text-[11px] mb-2" style={{ color: C.textSoft }}>{sub}</p>}

      {rows && rows.length > 0 && (
        <ul className="space-y-1 mt-3 mb-1">
          {rows.map(r => (
            <li key={r.id} className="flex items-center justify-between gap-2 text-[12px]">
              <span className="truncate" style={{ color: C.text }}>{r.primary}</span>
              {r.secondary && (
                <span className="text-[10.5px] tabular-nums whitespace-nowrap" style={{ color: C.textSoft }}>
                  {r.secondary}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {cta && (cta.href ? (
        <Link
          href={cta.href}
          className="text-[11px] font-medium mt-2 inline-block hover:underline"
          style={{ color: C.brand }}
        >
          {cta.label} →
        </Link>
      ) : (
        <button
          onClick={cta.onClick}
          className="text-[11px] font-medium mt-2 hover:underline"
          style={{ color: C.brand }}
        >
          {cta.label} →
        </button>
      ))}
    </div>
  );
}
