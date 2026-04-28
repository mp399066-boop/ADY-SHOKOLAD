'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge, UrgentBadge } from '@/components/ui/StatusBadge';
import { PageLoading } from '@/components/ui/LoadingSpinner';
import { formatDate, formatCurrency } from '@/lib/utils';
import toast from 'react-hot-toast';
import type { Order, OrderItem, Customer } from '@/types/database';

type FullOrder = Order & {
  לקוחות: Customer;
  מוצרים_בהזמנה: OrderItem[];
  משלוח: { סטטוס_משלוח: string; שם_שליח: string; עיר: string } | null;
  תשלומים: { id: string; סכום: number; אמצעי_תשלום: string; תאריך_תשלום: string }[];
  חשבוניות: { id: string; מספר_חשבונית: string; סכום: number; סטטוס: string }[];
};

const ORDER_STATUSES = ['חדשה', 'בהכנה', 'מוכנה למשלוח', 'נשלחה', 'הושלמה בהצלחה', 'בוטלה'];

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<FullOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    fetch(`/api/orders/${id}`)
      .then(r => r.json())
      .then(({ data }) => setOrder(data))
      .finally(() => setLoading(false));
  }, [id]);

  const updateStatus = async (status: string) => {
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ סטטוס_הזמנה: status }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setOrder(prev => prev ? { ...prev, סטטוס_הזמנה: json.data.סטטוס_הזמנה } : prev);
      toast.success('סטטוס עודכן');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'שגיאה בעדכון');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const updatePaymentStatus = async (status: string) => {
    const res = await fetch(`/api/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ סטטוס_תשלום: status }),
    });
    if (res.ok) {
      setOrder(prev => prev ? { ...prev, סטטוס_תשלום: status as Order['סטטוס_תשלום'] } : prev);
      toast.success('סטטוס תשלום עודכן');
    }
  };

  if (loading) return <PageLoading />;
  if (!order) return <div className="text-center py-16" style={{ color: '#6B4A2D' }}>הזמנה לא נמצאה</div>;

  const customer = order.לקוחות;

  return (
    <div className="grid grid-cols-3 gap-5 max-w-6xl">
      {/* Main content - 2/3 */}
      <div className="col-span-2 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} className="text-sm hover:underline" style={{ color: '#8B5E34' }}>← חזרה</button>
            <h2 className="text-lg font-bold" style={{ color: '#2B1A10' }}>{order.מספר_הזמנה}</h2>
            {order.הזמנה_דחופה && <UrgentBadge />}
            <StatusBadge status={order.סטטוס_הזמנה} type="order" />
          </div>
        </div>

        {/* Customer */}
        <Card>
          <CardHeader><CardTitle>פרטי לקוח</CardTitle></CardHeader>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span style={{ color: '#6B4A2D' }}>שם: </span>
              <span className="font-medium" style={{ color: '#2B1A10' }}>{customer?.שם_פרטי} {customer?.שם_משפחה}</span>
            </div>
            <div>
              <span style={{ color: '#6B4A2D' }}>טלפון: </span>
              <span>{customer?.טלפון || '-'}</span>
            </div>
            <div>
              <span style={{ color: '#6B4A2D' }}>אימייל: </span>
              <span>{customer?.אימייל || '-'}</span>
            </div>
            <div>
              <span style={{ color: '#6B4A2D' }}>סוג: </span>
              <StatusBadge status={customer?.סוג_לקוח || '-'} type="customer" />
            </div>
          </div>
        </Card>

        {/* Order details */}
        <Card>
          <CardHeader><CardTitle>פרטי הזמנה</CardTitle></CardHeader>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div><span style={{ color: '#6B4A2D' }}>תאריך הזמנה: </span><span>{formatDate(order.תאריך_הזמנה)}</span></div>
            <div><span style={{ color: '#6B4A2D' }}>תאריך אספקה: </span><span className="font-medium">{formatDate(order.תאריך_אספקה)}</span></div>
            <div><span style={{ color: '#6B4A2D' }}>שעה: </span><span>{order.שעת_אספקה || '-'}</span></div>
            <div><span style={{ color: '#6B4A2D' }}>אספקה: </span><span>{order.סוג_אספקה}</span></div>
            <div><span style={{ color: '#6B4A2D' }}>מקור: </span><span>{order.מקור_ההזמנה || '-'}</span></div>
            {order.שם_מקבל && <div><span style={{ color: '#6B4A2D' }}>מקבל: </span><span>{order.שם_מקבל}</span></div>}
            {order.טלפון_מקבל && <div><span style={{ color: '#6B4A2D' }}>טלפון מקבל: </span><span>{order.טלפון_מקבל}</span></div>}
            {order.כתובת_מקבל_ההזמנה && <div className="col-span-2"><span style={{ color: '#6B4A2D' }}>כתובת: </span><span>{order.כתובת_מקבל_ההזמנה}, {order.עיר}</span></div>}
            {order.הוראות_משלוח && <div className="col-span-3"><span style={{ color: '#6B4A2D' }}>הוראות: </span><span>{order.הוראות_משלוח}</span></div>}
          </div>
        </Card>

        {/* Greeting */}
        {order.ברכה_טקסט && (
          <Card>
            <CardHeader><CardTitle>ברכה</CardTitle></CardHeader>
            <p className="text-sm p-3 rounded-lg italic" style={{ backgroundColor: '#FAF7F0', color: '#2B1A10' }}>
              {order.ברכה_טקסט}
            </p>
          </Card>
        )}

        {/* Notes */}
        {order.הערות_להזמנה && (
          <Card>
            <CardHeader><CardTitle>הערות</CardTitle></CardHeader>
            <p className="text-sm" style={{ color: '#2B1A10' }}>{order.הערות_להזמנה}</p>
          </Card>
        )}

        {/* Order items */}
        <Card>
          <CardHeader><CardTitle>פריטי הזמנה</CardTitle></CardHeader>
          {(!order.מוצרים_בהזמנה || order.מוצרים_בהזמנה.length === 0) ? (
            <p className="text-sm" style={{ color: '#6B4A2D' }}>אין פריטים</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #E7D2A6' }}>
                  {['מוצר', 'סוג', 'כמות', 'מחיר', 'סה״כ', 'הערות'].map(h => (
                    <th key={h} className="py-2 px-2 text-right text-xs font-semibold" style={{ color: '#6B4A2D' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {order.מוצרים_בהזמנה.map((item) => (
                  <>
                    <tr key={item.id} className="border-b" style={{ borderColor: '#F5ECD8' }}>
                      <td className="py-2 px-2 font-medium">{(item as OrderItem & { מוצרים_למכירה?: { שם_מוצר: string } }).מוצרים_למכירה?.שם_מוצר || '-'}</td>
                      <td className="py-2 px-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${item.סוג_שורה === 'מארז' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                          {item.סוג_שורה}
                        </span>
                      </td>
                      <td className="py-2 px-2">{item.כמות}</td>
                      <td className="py-2 px-2">{formatCurrency(item.מחיר_ליחידה)}</td>
                      <td className="py-2 px-2 font-semibold">{formatCurrency(item.סהכ)}</td>
                      <td className="py-2 px-2 text-xs" style={{ color: '#6B4A2D' }}>{item.הערות_לשורה || '-'}</td>
                    </tr>
                    {item.סוג_שורה === 'מארז' && item.בחירת_פטיפורים_בהזמנה && item.בחירת_פטיפורים_בהזמנה.length > 0 && (
                      <tr key={`${item.id}-pf`} style={{ backgroundColor: '#FAF7F0' }}>
                        <td colSpan={6} className="py-2 px-4">
                          <div className="flex flex-wrap gap-2">
                            <span className="text-xs font-medium" style={{ color: '#6B4A2D' }}>פטיפורים: </span>
                            {item.בחירת_פטיפורים_בהזמנה.map(sel => (
                              <span key={sel.id} className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: '#E7D2A6', color: '#4A2F1B' }}>
                                {sel.סוגי_פטיפורים?.שם_פטיפור} ×{sel.כמות}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {/* Sidebar - 1/3 */}
      <div className="space-y-5">
        {/* Status update */}
        <Card>
          <CardHeader><CardTitle>עדכון סטטוס</CardTitle></CardHeader>
          <div className="space-y-2">
            {ORDER_STATUSES.map(status => (
              <button
                key={status}
                onClick={() => updateStatus(status)}
                disabled={updatingStatus || order.סטטוס_הזמנה === status}
                className="w-full text-right px-3 py-2 rounded-lg text-sm transition-all border"
                style={
                  order.סטטוס_הזמנה === status
                    ? { backgroundColor: '#8B5E34', color: '#FFFFFF', borderColor: '#8B5E34' }
                    : { backgroundColor: '#FFFFFF', color: '#6B4A2D', borderColor: '#E7D2A6' }
                }
              >
                {status}
              </button>
            ))}
          </div>
        </Card>

        {/* Payment status */}
        <Card>
          <CardHeader><CardTitle>סטטוס תשלום</CardTitle></CardHeader>
          <div className="mb-3"><StatusBadge status={order.סטטוס_תשלום} type="payment" /></div>
          <div className="space-y-2">
            {(['ממתין', 'שולם', 'חלקי', 'בוטל'] as const).map(s => (
              <button
                key={s}
                onClick={() => updatePaymentStatus(s)}
                disabled={order.סטטוס_תשלום === s}
                className="w-full text-right px-3 py-1.5 rounded-lg text-xs transition-all border"
                style={
                  order.סטטוס_תשלום === s
                    ? { backgroundColor: '#C7A46B', color: '#FFFFFF', borderColor: '#C7A46B' }
                    : { backgroundColor: '#FFFFFF', color: '#6B4A2D', borderColor: '#E7D2A6' }
                }
              >
                {s}
              </button>
            ))}
          </div>
        </Card>

        {/* Financial summary */}
        <Card>
          <CardHeader><CardTitle>סיכום כספי</CardTitle></CardHeader>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span style={{ color: '#6B4A2D' }}>לפני הנחה</span>
              <span>{formatCurrency(order.סכום_לפני_הנחה)}</span>
            </div>
            {(order.סכום_הנחה || 0) > 0 && (
              <div className="flex justify-between text-red-600">
                <span>הנחה</span>
                <span>-{formatCurrency(order.סכום_הנחה)}</span>
              </div>
            )}
            {(order.דמי_משלוח || 0) > 0 && (
              <div className="flex justify-between">
                <span style={{ color: '#6B4A2D' }}>דמי משלוח</span>
                <span>{formatCurrency(order.דמי_משלוח)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold pt-2 border-t" style={{ borderColor: '#E7D2A6' }}>
              <span style={{ color: '#2B1A10' }}>סך הכל</span>
              <span style={{ color: '#8B5E34' }}>{formatCurrency(order.סך_הכל_לתשלום)}</span>
            </div>
            <div className="pt-1 text-xs" style={{ color: '#6B4A2D' }}>
              אמצעי תשלום: {order.אופן_תשלום || '-'}
            </div>
          </div>
        </Card>

        {/* Payments list */}
        {order.תשלומים && order.תשלומים.length > 0 && (
          <Card>
            <CardHeader><CardTitle>תשלומים</CardTitle></CardHeader>
            <div className="space-y-2">
              {order.תשלומים.map(p => (
                <div key={p.id} className="flex justify-between text-sm p-2 rounded" style={{ backgroundColor: '#FAF7F0' }}>
                  <span style={{ color: '#6B4A2D' }}>{p.אמצעי_תשלום} · {formatDate(p.תאריך_תשלום)}</span>
                  <span className="font-medium">{formatCurrency(p.סכום)}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Invoices */}
        {order.חשבוניות && order.חשבוניות.length > 0 && (
          <Card>
            <CardHeader><CardTitle>חשבוניות</CardTitle></CardHeader>
            <div className="space-y-2">
              {order.חשבוניות.map(inv => (
                <div key={inv.id} className="flex justify-between text-sm p-2 rounded" style={{ backgroundColor: '#FAF7F0' }}>
                  <span style={{ color: '#6B4A2D' }}>#{inv.מספר_חשבונית}</span>
                  <span className="font-medium">{formatCurrency(inv.סכום)}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
