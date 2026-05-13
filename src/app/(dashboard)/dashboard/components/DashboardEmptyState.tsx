'use client';

// Generic premium empty state. Centered, low-key, with an optional CTA.
// Uses the same card-frame aesthetic as the rest of the dashboard so it
// reads as part of the surface, not a placeholder.

import Link from 'next/link';
import { C } from './theme';

export function DashboardEmptyState({
  title, subtitle, cta,
}: {
  title: string;
  subtitle?: string;
  cta?: { label: string; href: string };
}) {
  return (
    <div className="px-6 py-12 text-center">
      <div
        className="w-10 h-10 mx-auto rounded-full flex items-center justify-center mb-3"
        style={{ backgroundColor: C.greenSoft, color: C.green }}
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 13 4 4 10-10" />
        </svg>
      </div>
      <p className="text-[14px] font-semibold" style={{ color: C.text }}>{title}</p>
      {subtitle && <p className="text-[11.5px] mt-1" style={{ color: C.textSoft }}>{subtitle}</p>}
      {cta && (
        <Link href={cta.href} className="text-[11.5px] font-medium mt-3 inline-block hover:underline" style={{ color: C.brand }}>
          {cta.label} →
        </Link>
      )}
    </div>
  );
}
