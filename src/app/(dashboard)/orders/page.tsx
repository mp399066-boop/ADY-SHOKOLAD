'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge, UrgentBadge } from '@/components/ui/StatusBadge';
import { PageLoading } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconSearch, IconExport, IconEye, IconEdit, IconTrash } from '@/components/icons';
import { ActionBtn } from '@/components/ui/RowActions';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { BulkActionBar } from '@/components/ui/BulkActionBar';
import toast from 'react-hot-toast';
import { exportToCsv } from '@/lib/exportCsv';
import { formatDate, formatCurrency } from '@/lib/utils';
import type { Order } from '@/types/database';

const FILTERS = [
  { key: '',            label: 'הכל'             },
  { key: 'today',       label: 'היום'            },
  { key: 'tomorrow',    label: 'מחר'             },
  { key: 'urgent',      label: 'דחופות'          },
  { key: 'unpaid',      label: 'לא שולמו'        },
  { key: 'preparation', label: 'בהכנה'           },
  { key: 'ready',       label: 'מוכנות למשלוח'   },
  { key: 'shipped',     label: 'נשלחו'           },
  { key: 'archive',     label: 'הזמנות בארכיון'  },
];

function OrdersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentFilter = searchParams.get('filter') || '';

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [count, setCount] = useState(0);
  const [search, setSearch] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [bulkStatusValue, setBulkStatusValue] = useState('');
  const [bulkPaymentValue, setBulkPaymentValue] = useState('');
  const [bulkUpdating, setBulkUpdating] = useState(false);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    setSelected(prev => prev.size === orders.length ? new Set() : new Set(orders.map(o => o.id)));
  };
  const clearSelected = () => setSelected(new Set());

  // Clear selection on filter/search change
  useEffect(() => { clearSelected(); }, [currentFilter, search]);

  const handleDelete = async () => {
    if (!confirmId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/orders/${confirmId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error || 'שגיאה במחיקה'); return; }
      setOrders(prev => prev.filter(o => o.id !== confirmId));
      setCount(prev => prev - 1);
      toast.success('הזמנה נמחקה');
      setConfirmId(null);
    } catch { toast.error('שגיאה במחיקה'); }
    finally { setDeleting(false); }
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      const res = await fetch('/api/orders/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', ids: Array.from(selected) }),
      });
      const { succeeded, failed } = await res.json();
      if (succeeded > 0) {
        toast.success(`${succeeded} הזמנות נמחקו`);
        setOrders(prev => prev.filter(o => !selected.has(o.id)));
        setCount(prev => prev - succeeded);
      }
      if (failed > 0) toast.error(`${failed} הזמנות לא נמחקו`);
      clearSelected();
      setShowBulkConfirm(false);
    } catch { toast.error('שגיאה במחיקה'); }
    finally { setBulkDeleting(false); }
  };

  const handleBulkStatus = async () => {
    if (!bulkStatusValue) return;
    setBulkUpdating(true);
    try {
      const res = await fetch('/api/orders/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_status', ids: Array.from(selected), value: bulkStatusValue }),
      });
      const { succeeded, failed } = await res.json();
      if (succeeded > 0) {
        toast.success(`${succeeded} הזמנות עודכנו`);
        setOrders(prev => prev.map(o =>
          selected.has(o.id) ? { ...o, סטטוס_הזמנה: bulkStatusValue as Order['סטטוס_הזמנה'] } : o
        ));
      }
      if (failed > 0) toast.error(`${failed} הזמנות לא עודכנו`);
      clearSelected();
      setShowStatusModal(false);
    } catch { toast.error('שגיאה בעדכון'); }
    finally { setBulkUpdating(false); }
  };

  const handleBulkPayment = async () => {
    if (!bulkPaymentValue) return;
    setBulkUpdating(true);
    try {
      const res = await fetch('/api/orders/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_payment_status', ids: Array.from(selected), value: bulkPaymentValue }),
      });
      const { succeeded, failed } = await res.json();
      if (succeeded > 0) {
        toast.success(`${succeeded} הזמנות עודכנו`);
        setOrders(prev => prev.map(o =>
          selected.has(o.id) ? { ...o, סטטוס_תשלום: bulkPaymentValue as Order['סטטוס_תשלום'] } : o
        ));
      }
      if (failed > 0) toast.error(`${failed} הזמנות לא עודכנו`);
      clearSelected();
      setShowPaymentModal(false);
    } catch { toast.error('שגיאה בעדכון'); }
    finally { setBulkUpdating(false); }
  };

  const handleExport = () => {
    exportToCsv('הזמנות.csv',
      ['מספר הזמנה', 'לקוח', 'תאריך אספקה', 'סטטוס', 'סוג אספקה', 'סכום', 'סטטוס תשלום'],
      orders.map(o => [
        o.מספר_הזמנה,
        o.לקוחות ? `${o.לקוחות.שם_פרטי} ${o.לקוחות.שם_משפחה}` : o.שם_מקבל || '',
        o.תאריך_אספקה || '',
        o.סטטוס_הזמנה,
        o.סוג_אספקה,
        o.סך_הכל_לתשלום ?? '',
        o.סטטוס_תשלום,
      ]),
    );
  };

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

  const allSelected = orders.length > 0 && selected.size === orders.length;
  const someSelected = selected.size > 0 && selected.size < orders.length;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
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

        <div className="flex flex-wrap gap-1.5 flex-1">
          {FILTERS.map(f => {
            const isArchive = f.key === 'archive';
            const isActive  = currentFilter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => router.push(f.key ? `/orders?filter=${f.key}` : '/orders')}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all border"
                style={
                  isActive && isArchive
                    ? { backgroundColor: '#065F46', color: '#fff',     borderColor: '#065F46' }
                    : isArchive
                    ? { backgroundColor: '#F0FDF4', color: '#065F46',  borderColor: '#A7F3D0' }
                    : isActive
                    ? { backgroundColor: '#8B5E34', color: '#FFFFFF',  borderColor: '#8B5E34' }
                    : { backgroundColor: '#FFFFFF',  color: '#6B4A2D', borderColor: '#DDD0BC' }
                }
              >
                {f.label}
              </button>
            );
          })}
        </div>

        <Link href="/orders/new" className="flex-shrink-0">
          <Button size="sm">+ הזמנה חדשה</Button>
        </Link>
        <button
          onClick={handleExport}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border bg-white hover:bg-[#FAF7F2] transition-all duration-200"
          style={{ borderColor: '#D8CCBA', color: '#8B5E34' }}
        >
          <IconExport className="w-3.5 h-3.5" />
          ייצוא לאקסל
        </button>
      </div>

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
                  <th className="px-4 py-3" style={{ width: '40px', minWidth: '40px' }}>
                    <input
                      type="checkbox"
                      className="w-3.5 h-3.5 cursor-pointer"
                      style={{ accentColor: '#8B5E34' }}
                      checked={allSelected}
                      ref={el => { if (el) el.indeterminate = someSelected; }}
                      onChange={toggleSelectAll}
                    />
                  </th>
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
                  const isSelected = selected.has(order.id);
                  const customer = (order as Order & { לקוחות?: { שם_פרטי: string; שם_משפחה: string } }).לקוחות;
                  return (
                    <tr
                      key={order.id}
                      className="hover:bg-amber-50 transition-colors cursor-pointer border-b"
                      style={{
                        borderColor: '#F5ECD8',
                        backgroundColor: isSelected ? '#FEF9EF' : undefined,
                      }}
                      onClick={() => router.push(`/orders/${order.id}`)}
                    >
                      <td className="px-4 py-3" style={{ width: '40px', minWidth: '40px' }} onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="w-3.5 h-3.5 cursor-pointer"
                          style={{ accentColor: '#8B5E34' }}
                          checked={isSelected}
                          onChange={() => toggleSelect(order.id)}
                          onClick={e => e.stopPropagation()}
                        />
                      </td>
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
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-0.5">
                          <ActionBtn title="צפייה" href={`/orders/${order.id}`} icon={<IconEye className="w-4 h-4" />} />
                          <ActionBtn title="עריכה" href={`/orders/${order.id}`} icon={<IconEdit className="w-4 h-4" />} />
                          <ActionBtn title="מחיקה" variant="danger" onClick={() => setConfirmId(order.id)} icon={<IconTrash className="w-4 h-4" />} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Single delete */}
      <ConfirmModal
        open={!!confirmId}
        onClose={() => setConfirmId(null)}
        onConfirm={handleDelete}
        loading={deleting}
      />

      {/* Bulk delete confirm */}
      <ConfirmModal
        open={showBulkConfirm}
        title={`מחיקת ${selected.size} הזמנות`}
        description={`האם למחוק ${selected.size} הזמנות? פעולה זו אינה ניתנת לביטול.`}
        confirmLabel="מחק הכל"
        onClose={() => setShowBulkConfirm(false)}
        onConfirm={handleBulkDelete}
        loading={bulkDeleting}
      />

      {/* Bulk action bar */}
      <BulkActionBar
        count={selected.size}
        onClear={clearSelected}
        actions={[
          {
            label: 'שינוי סטטוס',
            onClick: () => { setBulkStatusValue(''); setShowStatusModal(true); },
          },
          {
            label: 'סטטוס תשלום',
            onClick: () => { setBulkPaymentValue(''); setShowPaymentModal(true); },
          },
          {
            label: 'מחיקה',
            variant: 'danger',
            icon: <IconTrash className="w-3.5 h-3.5" />,
            onClick: () => setShowBulkConfirm(true),
          },
        ]}
      />

      {/* Bulk status modal */}
      {showStatusModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(20,12,4,0.22)', backdropFilter: 'blur(2px)' }}
          onClick={() => setShowStatusModal(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-xs p-6"
            style={{ border: '1px solid #EAE0D4', boxShadow: '0 8px 32px rgba(58,42,26,0.10)' }}
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold mb-4" style={{ color: '#3A2A1A' }}>
              שינוי סטטוס — {selected.size} הזמנות
            </h2>
            <select
              value={bulkStatusValue}
              onChange={e => setBulkStatusValue(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border mb-5 focus:outline-none focus:ring-2 focus:ring-amber-100"
              style={{ borderColor: '#DDD0BC', color: '#2B1A10' }}
            >
              <option value="">בחר סטטוס...</option>
              {['חדשה', 'בהכנה', 'מוכנה לאיסוף', 'נשלחה', 'הושלמה בהצלחה', 'בוטלה'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowStatusModal(false)}
                className="px-4 py-2 text-sm rounded-xl border"
                style={{ borderColor: '#D8CCBA', color: '#6B4A2D' }}
              >
                ביטול
              </button>
              <button
                onClick={handleBulkStatus}
                disabled={!bulkStatusValue || bulkUpdating}
                className="px-4 py-2 text-sm rounded-xl text-white disabled:opacity-40"
                style={{ backgroundColor: '#8B5E34' }}
              >
                {bulkUpdating ? '...' : 'עדכן'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk payment modal */}
      {showPaymentModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(20,12,4,0.22)', backdropFilter: 'blur(2px)' }}
          onClick={() => setShowPaymentModal(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-xs p-6"
            style={{ border: '1px solid #EAE0D4', boxShadow: '0 8px 32px rgba(58,42,26,0.10)' }}
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold mb-4" style={{ color: '#3A2A1A' }}>
              שינוי סטטוס תשלום — {selected.size} הזמנות
            </h2>
            <select
              value={bulkPaymentValue}
              onChange={e => setBulkPaymentValue(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border mb-5 focus:outline-none focus:ring-2 focus:ring-amber-100"
              style={{ borderColor: '#DDD0BC', color: '#2B1A10' }}
            >
              <option value="">בחר סטטוס...</option>
              {['שולם', 'ממתין', 'בוטל'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowPaymentModal(false)}
                className="px-4 py-2 text-sm rounded-xl border"
                style={{ borderColor: '#D8CCBA', color: '#6B4A2D' }}
              >
                ביטול
              </button>
              <button
                onClick={handleBulkPayment}
                disabled={!bulkPaymentValue || bulkUpdating}
                className="px-4 py-2 text-sm rounded-xl text-white disabled:opacity-40"
                style={{ backgroundColor: '#8B5E34' }}
              >
                {bulkUpdating ? '...' : 'עדכן'}
              </button>
            </div>
          </div>
        </div>
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
