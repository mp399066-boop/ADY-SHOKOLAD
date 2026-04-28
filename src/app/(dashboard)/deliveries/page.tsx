'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PageLoading } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Input';
import type { Delivery } from '@/types/database';
import Link from 'next/link';

function DeliveriesContent() {
  const searchParams = useSearchParams();
  const defaultDate = searchParams.get('date') || new Date().toISOString().split('T')[0];

  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(defaultDate);
  const [status, setStatus] = useState('');

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (status) params.set('status', status);
    fetch(`/api/deliveries?${params}`)
      .then(r => r.json())
      .then(({ data }) => setDeliveries(data || []))
      .finally(() => setLoading(false));
  }, [date, status]);

  const updateDeliveryStatus = async (id: string, newStatus: string) => {
    await fetch(`/api/deliveries/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ סטטוס_משלוח: newStatus }),
    });
    setDeliveries(prev => prev.map(d => d.id === id ? { ...d, סטטוס_משלוח: newStatus as Delivery['סטטוס_משלוח'] } : d));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-44" label="" />
        <Select value={status} onChange={e => setStatus(e.target.value)} className="w-44">
          <option value="">כל הסטטוסים</option>
          {['ממתין', 'מוכן למשלוח', 'יצא למשלוח', 'נמסר'].map(s => <option key={s} value={s}>{s}</option>)}
        </Select>
        <span className="text-sm mr-auto" style={{ color: '#6B4A2D' }}>{deliveries.length} משלוחים</span>
      </div>

      {loading ? <PageLoading /> : deliveries.length === 0 ? (
        <EmptyState title="אין משלוחים" description="לא נמצאו משלוחים לתאריך זה" />
      ) : (
        <div className="space-y-3">
          {deliveries.map(d => {
            const order = (d as Delivery & { הזמנות?: { מספר_הזמנה: string; שם_מקבל: string; טלפון_מקבל: string; לקוחות?: { שם_פרטי: string; שם_משפחה: string } } }).הזמנות;
            return (
              <Card key={d.id}>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs font-semibold" style={{ color: '#8B5E34' }}>
                        {order?.מספר_הזמנה || '-'}
                      </span>
                      <StatusBadge status={d.סטטוס_משלוח} type="delivery" />
                    </div>
                    <div className="text-sm font-medium" style={{ color: '#2B1A10' }}>
                      {order?.לקוחות ? `${order.לקוחות.שם_פרטי} ${order.לקוחות.שם_משפחה}` : order?.שם_מקבל || '-'}
                    </div>
                    <div className="text-xs" style={{ color: '#6B4A2D' }}>
                      {d.כתובת && <span>{d.כתובת}, </span>}
                      {d.עיר && <span>{d.עיר}</span>}
                      {d.שעת_משלוח && <span> · {d.שעת_משלוח}</span>}
                    </div>
                    {d.הוראות_משלוח && (
                      <div className="text-xs p-2 rounded mt-1" style={{ backgroundColor: '#FAF7F0', color: '#6B4A2D' }}>
                        {d.הוראות_משלוח}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 mr-4">
                    {(['ממתין', 'מוכן למשלוח', 'יצא למשלוח', 'נמסר'] as const).map(s => (
                      <button
                        key={s}
                        onClick={() => updateDeliveryStatus(d.id, s)}
                        disabled={d.סטטוס_משלוח === s}
                        className="text-xs px-2 py-1 rounded border transition-all"
                        style={
                          d.סטטוס_משלוח === s
                            ? { backgroundColor: '#8B5E34', color: '#FFFFFF', borderColor: '#8B5E34' }
                            : { backgroundColor: '#FFFFFF', color: '#6B4A2D', borderColor: '#E7D2A6' }
                        }
                      >
                        {s}
                      </button>
                    ))}
                    <Link href={`/orders/${d.הזמנה_id}`} className="text-xs text-center mt-1 hover:underline" style={{ color: '#8B5E34' }}>
                      הזמנה ↗
                    </Link>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function DeliveriesPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <DeliveriesContent />
    </Suspense>
  );
}
