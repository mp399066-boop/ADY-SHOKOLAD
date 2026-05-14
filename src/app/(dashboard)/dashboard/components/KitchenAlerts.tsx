'use client';

import { AlertTriangle } from 'lucide-react';
import type { KitchenAlert } from '@/lib/dashboard/kitchen-view';
import { C } from './theme';

export function KitchenAlerts({
  alerts,
  onAction,
}: {
  alerts: KitchenAlert[];
  onAction: (action: KitchenAlert['action']) => void;
}) {
  return (
    <section className="rounded-lg border p-3" style={{ backgroundColor: C.card, borderColor: C.border }}>
      <div className="mb-2 flex items-center gap-2">
        <AlertTriangle size={16} color={C.amber} />
        <h2 className="text-base font-bold" style={{ color: C.text }}>התראות שדורשות טיפול</h2>
      </div>

      {alerts.length === 0 ? (
        <div className="rounded-lg border px-3 py-4 text-sm font-semibold" style={{ borderColor: C.borderSoft, color: C.green, backgroundColor: C.greenSoft }}>
          אין התראות פתוחות כרגע.
        </div>
      ) : (
        <div className="space-y-1.5">
          {alerts.map(alert => (
            <div
              key={alert.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-md border px-2.5 py-1.5"
              style={{ borderColor: C.borderSoft, backgroundColor: C.cardSoft }}
            >
              <div className="min-w-0">
                <p className="text-xs font-bold" style={{ color: C.text }}>{alert.title}</p>
                <p className="text-[11px]" style={{ color: C.textSoft }}>{alert.description}</p>
              </div>
              <button
                type="button"
                onClick={() => onAction(alert.action)}
                className="h-7 rounded-md border px-2.5 text-[11px] font-bold"
                style={{ backgroundColor: C.espresso, borderColor: C.espresso, color: '#FFFFFF' }}
              >
                {alert.actionLabel}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
