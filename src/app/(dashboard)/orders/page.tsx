'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge, UrgentBadge } from '@/components/ui/StatusBadge';
import { PageLoading } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconSearch } from '@/components/icons';
import { formatDate, formatCurrency } from '@/lib/utils';
import type { Order } from '@/types/database';

const FILTERS = [
  { key: '',            label: 'הכל'           },
  { key: 'today',       label: 'היום'          },
  { key: 'tomorrow',    label: 'מחר'           },
  { key: 'urgent',      label: 'דחופות'        },
  { key: 'unpaid',      label: 'לא שולמו'      },
  { key: 'preparation', label: 'בהכנה'         },
  { key: 'ready',       label: 'מוכנות למשלוח' },
  { key: 'shipped',     label: 'נשלחו'         },
  { key: 'completed',   label: 'הושלמו'        },
];

function OrdersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentFilter = searchParams.get('filter') || '';

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [count, setCount] = useState(0);
  const [search, setSearch] = useState('');

  const fetchOrders = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ filter: currentFilter, limit: '100' });
    if (search) params.set('search', search);
    fetch(`/api/orders?${params}`)
      .then(r => r.json())
      .then(({ data, count }) => { setOrders(data || []); setCount(count || 0); })
      .finally(() => setLoading(false));
  }, [currentFilter, search]);

  useEffect(() => {
    const t = setTimeout(fetchOrders, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [fetchOrders]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <div className="absolute inset-y-0 flex items-center pointer-events-none" style={{ right: '10px' }}>
            <IconSearch className="w-4 h-4 text-[#9B7A5A]" />
          </div>
          <input
            type="text"
            placeholder="חיפוש לפי מספר, לקוח, טלפון..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pr-9 pl-3 py-2 text-sm rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-amber-100 focus:border-amber-400"
            style={{ borderColor: '#DDD0BC', color: '#2B1A10' }}
          />
        </div>

        {/* Filter tabs */}
        <div className="flex flex-wrap gap-1.5 flex-1">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => router.push(f.key ? `/orders?filter=${f.key}` : '/orders')}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all border"
              style={
                currentFilter === f.key
                  ? { backgroundColor: '#8B5E34', color: '#FFFFFF', borderColor: '#8B5E34' }
                  : { backgroundColor: '#FFFFFF', color: '#6B4A2D', borderColor: '#DDD0BC' }
              }
            >
              {f.label}
            </button>
          ))}
        </div>

        <Link href="/orders/new" className="flex-shrink-0">
          <Button size="sm">+ הזמנה חדשה</Button>
        </Link>
      </div>

      {/* Count */}
      <p className="text-xs" style={{ color: '#9B7A5A' }}>
        {count} הזמנות
      </p>

      {loading ? (
        <PageLoading />
      ) : orders.length === 0 ? (
        <EmptyState
          title="אין הזמנות"
          description="לא נמצאו הזמנות התואמות לסינון"
          action={<Link href="/orders/new"><Button>+ הזמנה חדשה</Button></Link>}
        />
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: '#FAF7F0', borderBottom: '1px solid #EDE0CE' }}>
                  {['מספר הזמנה', 'לקוח', 'תאריך אספקה', 'שעה', 'סטטוס', 'תשלום', 'אספקה', 'סכום', ''].map(h => (
                    <th
                      key={h}
                      className="px-4 py-3 text-right text-xs font-semibold"
                      style={{ color: '#6B4A2D' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map(order => {
                  const customer = (order as Order & { לקוחות?: { שם_פרטי: string; שם_משפחה: string } }).לקוחות;
                  return (
                    <tr
                      key={order.id}
                      className="hover:bg-amber-50 transition-colors cursor-pointer border-b"
                      style={{ borderColor: '#F5ECD8' }}
                      onClick={() => router.push(`/orders/${order.id}`)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold" style={{ color: '#8B5E34' }}>
                            {order.מספר_הזמנה}
                          </span>
                          {order.הזמנה_דחופה && <UrgentBadge />}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-xs" style={{ color: '#2B1A10' }}>
                        {customer ? `${customer.שם_פרטי} ${customer.שם_משפחה}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: '#6B4A2D' }}>
                        {formatDate(order.תאריך_אספקה)}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: '#6B4A2D' }}>
                        {order.שעת_אספקה || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={order.סטטוס_הזמנה} type="order" />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={order.סטטוס_תשלום} type="payment" />
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="text-xs px-2 py-0.5 rounded-full border"
                          style={
                            order.סוג_אספקה === 'משלוח'
                              ? { backgroundColor: '#EFF6FF', color: '#1D4ED8', borderColor: '#BFDBFE' }
                              : { backgroundColor: '#F9FAFB', color: '#6B7280', borderColor: '#E5E7EB' }
                          }
                        >
                          {order.סוג_אספקה}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-xs" style={{ color: '#2B1A10' }}>
                        {formatCurrency(order.סך_הכל_לתשלום)}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/orders/${order.id}`}
                          onClick={e => e.stopPropagation()}
                          className="text-xs hover:underline"
                          style={{ color: '#8B5E34' }}
                        >
                          פרטים
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <OrdersContent />
    </Suspense>
  );
}
