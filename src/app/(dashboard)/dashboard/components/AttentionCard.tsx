'use client';

// Single small card in the right intelligence rail. Clean header (label +
// big number) + optional row list + optional CTA at the bottom.
//
// When a CTA href is provided, the entire card becomes a Link — clicking
// anywhere on the card navigates. The bottom "label →" is then redundant
// but kept for visual affordance. When the card is inert (no CTA), it
// renders as a plain div.

import Link from 'next/link';
import { C } from './theme';

interface Props {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
  rows?: { id: string; primary: string; secondary?: string }[];
  cta?: { label: string; href: string };
}

export function AttentionCard({ label, value, sub, accent, rows, cta }: Props) {
  const inner = (
    <>
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

      {cta && (
        <span className="text-[11px] font-medium mt-2 inline-block group-hover:underline" style={{ color: C.brand }}>
          {cta.label} →
        </span>
      )}
    </>
  );

  const baseClasses = 'block rounded-xl px-4 py-3.5 transition-shadow';
  const baseStyle = {
    backgroundColor: C.card,
    border: `1px solid ${C.border}`,
    boxShadow: '0 1px 2px rgba(58,42,26,0.04)',
  } as const;

  if (cta) {
    return (
      <Link
        href={cta.href}
        className={`${baseClasses} group hover:shadow-[0_2px_8px_rgba(58,42,26,0.08)]`}
        style={baseStyle}
      >
        {inner}
      </Link>
    );
  }
  return (
    <div className={baseClasses} style={baseStyle}>
      {inner}
    </div>
  );
}
