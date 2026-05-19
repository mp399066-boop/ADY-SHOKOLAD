'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { C } from './theme';

interface TaskRow {
  עובד_id: string | null;
  עדיפות: string;
  עובדים: { id: string; שם_עובד: string; תפקיד: string } | null;
}

interface EmployeeSummary {
  id: string;
  name: string;
  open: number;
  urgent: number;
}

export function DashboardEmployeeTasks() {
  const [summaries, setSummaries] = useState<EmployeeSummary[]>([]);
  const [unassigned, setUnassigned] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/tasks?status=ממתין')
      .then(r => r.json())
      .then(json => {
        const tasks: TaskRow[] = json.data || [];
        const byEmp = new Map<string, EmployeeSummary>();
        let noEmp = 0;
        for (const t of tasks) {
          if (!t.עובד_id || !t.עובדים) { noEmp++; continue; }
          const id = t.עובד_id;
          if (!byEmp.has(id)) {
            byEmp.set(id, { id, name: t.עובדים.שם_עובד, open: 0, urgent: 0 });
          }
          const e = byEmp.get(id)!;
          e.open++;
          if (t.עדיפות === 'דחוף') e.urgent++;
        }
        setSummaries(
          Array.from(byEmp.values()).sort(
            (a, b) => b.urgent - a.urgent || b.open - a.open,
          ),
        );
        setUnassigned(noEmp);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const total = summaries.reduce((s, e) => s + e.open, 0) + unassigned;

  if (!loading && total === 0) return null;

  return (
    <section
      className="rounded-xl p-3"
      style={{ backgroundColor: '#FFFFFF', border: `1px solid ${C.border}`, boxShadow: '0 4px 14px rgba(47,27,20,0.04)' }}
    >
      <div className="flex items-center justify-between mb-2.5">
        <h2 className="text-[12.5px] font-bold" style={{ color: C.textSoft }}>משימות עובדים</h2>
        {!loading && (
          <span
            className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] font-bold"
            style={{ backgroundColor: C.brandSoft, color: C.brand }}
          >
            {total}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <div
            className="w-4 h-4 rounded-full border-2 animate-spin"
            style={{ borderColor: C.borderSoft, borderTopColor: C.brand }}
          />
        </div>
      ) : (
        <div className="space-y-1.5">
          {summaries.slice(0, 4).map(emp => (
            <div
              key={emp.id}
              className="flex items-center gap-2 py-1.5 px-2 rounded-lg"
              style={{ backgroundColor: C.card, border: `1px solid ${C.borderSoft}` }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold truncate" style={{ color: C.text }}>
                  {emp.name}
                </p>
              </div>
              <span
                className="text-[11px] font-bold px-1.5 py-0.5 rounded-md"
                style={{ backgroundColor: C.brandSoft, color: C.brand }}
              >
                {emp.open}
              </span>
              {emp.urgent > 0 && (
                <span
                  className="text-[11px] font-bold px-1.5 py-0.5 rounded-md"
                  style={{ backgroundColor: C.redSoft, color: C.red }}
                >
                  {emp.urgent} דח׳
                </span>
              )}
            </div>
          ))}
          {unassigned > 0 && (
            <div
              className="flex items-center gap-2 py-1.5 px-2 rounded-lg"
              style={{ backgroundColor: C.card, border: `1px solid ${C.borderSoft}` }}
            >
              <span className="flex-1 text-[12px]" style={{ color: C.textMuted }}>ללא שיוך</span>
              <span
                className="text-[11px] font-bold px-1.5 py-0.5 rounded-md"
                style={{ backgroundColor: C.goldSoft, color: C.gold }}
              >
                {unassigned}
              </span>
            </div>
          )}
        </div>
      )}

      <Link
        href="/employees"
        className="mt-2.5 flex items-center justify-center gap-1 pt-2 text-[11.5px] font-semibold transition-opacity hover:opacity-70"
        style={{ color: C.brand, borderTop: `1px solid ${C.borderSoft}` }}
      >
        לוח עובדים ←
      </Link>
    </section>
  );
}
