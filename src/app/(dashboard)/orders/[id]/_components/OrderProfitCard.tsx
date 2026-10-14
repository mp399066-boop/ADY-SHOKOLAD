'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { formatCurrency } from '@/lib/utils';

interface ProfitResponse {
  tableReady: boolean;
  barter: boolean;
  revenue: number;
  cost: number;
  profit: number | null;
  partialProfit: number;
  margin: number | null;
  complete: boolean;
  missing: string[];
}

/**
 * "רווח בהזמנה" — cost & profit of this order from the /costs sheet.
 * Admin only: the API answers 403 to everyone else and the card stays hidden.
 * `version` changes whenever the order's items or total change, so the card
 * refetches after an edit.
 */
export function OrderProfitCard({ orderId, version }: { orderId: string; version: string }) {
  const [data, setData] = useState<ProfitResponse | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/orders/${orderId}/profit`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (alive) setData(j as ProfitResponse | null); })
      .catch(() => { if (alive) setData(null); });
    return () => { alive = false; };
  }, [orderId, version]);

  if (!data || !data.tableReady) return null;

  const shownProfit = data.profit ?? data.partialProfit;
  const color = shownProfit >= 0 ? '#2D6648' : '#8A3228';

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp size={15} style={{ color: '#8B5E34' }} />
        <p className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: '#8B5E34' }}>רווח בהזמנה</p>
        <span className="text-[10.5px] mr-auto" style={{ color: '#9B7A5A' }}>רק המנהלת רואה</span>
      </div>
      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <dt style={{ color: '#6B4A2D' }}>{data.barter ? 'הכנסה (בארטר)' : 'הכנסה לפני מע״מ, ללא משלוח'}</dt>
          <dd className="tabular-nums" style={{ color: '#2B1A10' }}>{formatCurrency(data.revenue)}</dd>
        </div>
        <div className="flex justify-between">
          <dt style={{ color: '#6B4A2D' }}>עלות סחורה</dt>
          <dd className="tabular-nums" style={{ color: '#2B1A10' }}>−{formatCurrency(data.cost)}</dd>
        </div>
        <div className="flex justify-between pt-2 font-semibold" style={{ borderTop: '1px dashed #E8DED2', color }}>
          <dt>{data.complete ? 'רווח' : 'רווח (חלקי)'}</dt>
          <dd className="tabular-nums">
            {formatCurrency(shownProfit)}
            {data.margin != null && <span className="text-xs font-normal mr-1">({data.margin}%)</span>}
          </dd>
        </div>
      </dl>
      {!data.complete && (
        <p className="text-[11.5px] mt-2 leading-relaxed" style={{ color: '#94650E' }}>
          אין עלות ל: {data.missing.join(', ')}. הרווח מחושב רק על שאר הפריטים.{' '}
          <Link href="/costs" className="underline">השלמת עלויות</Link>
        </p>
      )}
    </Card>
  );
}
