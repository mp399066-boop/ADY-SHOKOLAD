'use client';

// "משלוחים" — focused delivery worklist. Shows today's deliveries grouped by
// status (ממתין → נאסף → נמסר). Cards collapse נמסר rows into a small
// "נמסרו היום: N" summary so completed work doesn't dominate the panel.

import Link from 'next/link';
import { formatDate } from '@/lib/utils';
import type { Delivery } from './types';

interface Props {
  deliveries: Delivery[];
  updatingId: string | null;
  onPatchDelivery: (d: Delivery, next: 'נאסף' | 'נמסר') => void;
  onOpenDelivery: (d: Delivery) => void;
}

export function DeliveriesPanel({ deliveries, updatingId, onPatchDelivery, onOpenDelivery }: Props) {
  const pending  = deliveries.filter(d => d.סטטוס_משלוח === 'ממתין');
  const inTransit = deliveries.filter(d => d.סטטוס_משלוח === 'נאסף');
  const delivered = deliveries.filter(d => d.סטטוס_משלוח === 'נמסר');

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[15px] font-bold" style={{ color: '#2B1A10' }}>משלוחים היום</h2>
          <span className="text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md" style={{ backgroundColor: '#F4E8D8', color: '#7A4A27' }}>
            {deliveries.length}
          </span>
        </div>
        <Link href="/deliveries" className="text-[11px] font-medium hover:underline" style={{ color: '#8A735F' }}>ניהול משלוחים מלא →</Link>
      </header>

      <Group title="ממתינים לאיסוף" tone="amber" rows={pending} updatingId={updatingId} onPatchDelivery={onPatchDelivery} onOpenDelivery={onOpenDelivery} primaryLabel="שלח לשליח" primaryStatus="נאסף" />
      <Group title="בדרך — נאספו" tone="blue" rows={inTransit} updatingId={updatingId} onPatchDelivery={onPatchDelivery} onOpenDelivery={onOpenDelivery} />
      {delivered.length > 0 && (
        <div className="rounded-xl px-4 py-2.5 text-center" style={{ backgroundColor: '#F0FAF4', border: '1px solid #C8EAD0', color: '#0F766E', fontSize: 12, fontWeight: 600 }}>
          ✓ {delivered.length} משלוחים נמסרו היום
        </div>
      )}
      {deliveries.length === 0 && (
        <div className="rounded-2xl px-6 py-10 text-center" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8DED2' }}>
          <p className="text-[14px] font-semibold" style={{ color: '#2B1A10' }}>אין משלוחים מתוכננים להיום</p>
          <Link href="/deliveries" className="text-[11px] mt-2 inline-block hover:underline" style={{ color: '#7A4A27' }}>פתח ניהול משלוחים →</Link>
        </div>
      )}
    </div>
  );
}

function Group({
  title, tone, rows, updatingId, onPatchDelivery, onOpenDelivery, primaryLabel, primaryStatus,
}: {
  title: string;
  tone: 'amber' | 'blue';
  rows: Delivery[];
  updatingId: string | null;
  onPatchDelivery: (d: Delivery, next: 'נאסף' | 'נמסר') => void;
  onOpenDelivery: (d: Delivery) => void;
  primaryLabel?: string;
  primaryStatus?: 'נאסף' | 'נמסר';
}) {
  if (rows.length === 0) return null;
  const headerBg = tone === 'amber' ? '#FBF1DC' : '#DBEAFE';
  const headerColor = tone === 'amber' ? '#92602A' : '#1E40AF';
  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8DED2', boxShadow: '0 1px 2px rgba(58,42,26,0.04)' }}>
      <header className="flex items-center justify-between px-4 py-2" style={{ backgroundColor: headerBg, color: headerColor, borderBottom: '1px solid #F0E7D8' }}>
        <span className="text-[12px] font-bold">{title}</span>
        <span className="text-[10.5px] font-semibold tabular-nums">{rows.length}</span>
      </header>
      <ul>
        {rows.map((d, idx) => {
          const o = d.הזמנות;
          const c = o?.לקוחות;
          const recipient = o?.שם_מקבל || (c ? `${c.שם_פרטי} ${c.שם_משפחה}` : 'לקוח');
          const phone = o?.טלפון_מקבל;
          const addr = [d.כתובת, d.עיר].filter(Boolean).join(', ');
          const isLast = idx === rows.length - 1;
          const updating = updatingId === d.id;
          return (
            <li
              key={d.id}
              className="grid items-center gap-3 px-4 py-3 transition-colors hover:bg-amber-50/30"
              style={{ gridTemplateColumns: 'minmax(0,1fr) auto auto', borderBottom: isLast ? 'none' : '1px solid #F0E7D8' }}
            >
              <div className="min-w-0">
                <p className="text-[13px] font-semibold truncate" style={{ color: '#2B1A10' }}>{recipient}</p>
                <p className="text-[11px] mt-0.5 truncate" style={{ color: '#8A735F' }}>
                  {addr || 'אין כתובת'}
                  {phone && (
                    <>
                      <span className="mx-1.5">·</span>
                      <a href={`tel:${phone}`} onClick={e => e.stopPropagation()} className="tabular-nums hover:underline" style={{ color: '#5B8FB8' }}>{phone}</a>
                    </>
                  )}
                </p>
              </div>
              {primaryLabel && primaryStatus ? (
                <button
                  onClick={() => onPatchDelivery(d, primaryStatus)}
                  disabled={updating}
                  className="text-[11px] font-semibold px-3 h-8 rounded-md text-white disabled:opacity-60"
                  style={{ backgroundColor: '#7A4A27' }}
                >
                  {updating ? '...' : primaryLabel}
                </button>
              ) : (
                <span className="text-[11px] font-semibold px-2 py-1 rounded-md" style={{ backgroundColor: headerBg, color: headerColor }}>
                  ממתין לאישור
                </span>
              )}
              <button
                onClick={() => onOpenDelivery(d)}
                className="text-[11px] font-medium hover:underline"
                style={{ color: '#8A735F' }}
              >
                פרטים
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Suppress unused-import warning when nothing in this file uses formatDate yet
// (kept for future "תאריך משלוח" rendering).
void formatDate;
