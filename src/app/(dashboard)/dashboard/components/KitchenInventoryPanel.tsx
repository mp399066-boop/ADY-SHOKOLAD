'use client';

import { Pencil, Warehouse } from 'lucide-react';
import type { KitchenInventoryItem } from '@/lib/dashboard/kitchen-view';
import { C } from './theme';

function statusLabel(status: string): 'תקין' | 'נמוך' | 'חסר' {
  if (status === 'אזל מהמלאי' || status === 'קריטי') return 'חסר';
  if (status === 'מלאי נמוך') return 'נמוך';
  return 'תקין';
}

function statusColors(label: string) {
  if (label === 'חסר') return { bg: C.redSoft, color: C.red };
  if (label === 'נמוך') return { bg: C.amberSoft, color: C.amber };
  return { bg: C.greenSoft, color: C.green };
}

export function KitchenInventoryPanel({
  items,
  onOpenInventory,
}: {
  items: KitchenInventoryItem[];
  onOpenInventory: () => void;
}) {
  return (
    <section className="rounded-lg border p-3" style={{ backgroundColor: C.card, borderColor: C.border }}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Warehouse size={18} color={C.cocoa} />
          <h2 className="text-base font-bold" style={{ color: C.text }}>חומרי גלם ומלאי</h2>
        </div>
        <button
          type="button"
          onClick={onOpenInventory}
          className="h-9 rounded-lg border px-3 text-xs font-bold"
          style={{ backgroundColor: C.brandSoft, borderColor: C.border, color: C.text }}
        >
          הצג את כל המלאי
        </button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border px-3 py-4 text-sm font-semibold" style={{ borderColor: C.borderSoft, color: C.green, backgroundColor: C.greenSoft }}>
          אין כרגע התראות מלאי חשובות.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
          {items.map(item => {
            const label = statusLabel(item.status);
            const colors = statusColors(label);
            return (
              <div key={`${item.kind}-${item.id}`} className="rounded-lg border p-3" style={{ borderColor: C.borderSoft, backgroundColor: C.cardSoft }}>
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold" style={{ color: C.text }}>{item.שם}</p>
                    <p className="text-xs" style={{ color: C.textSoft }}>נותר: {item.quantity.toLocaleString('he-IL')} {item.unit || ''}</p>
                  </div>
                  <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ backgroundColor: colors.bg, color: colors.color }}>
                    {label}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onOpenInventory}
                  className="h-8 rounded-lg border px-2 text-xs font-bold flex items-center gap-1.5"
                  style={{ borderColor: C.border, color: C.cocoa, backgroundColor: C.brandSoft }}
                >
                  <Pencil size={13} />
                  עדכן כמות
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
