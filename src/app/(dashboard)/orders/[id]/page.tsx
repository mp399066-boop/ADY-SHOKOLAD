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

interface EditForm {
  הזמנה_דחופה: boolean;
  סוג_אספקה: 'משלוח' | 'איסוף עצמי';
  תאריך_אספקה: string;
  שעת_אספקה: string;
  מקור_ההזמנה: string;
  שם_מקבל: string;
  טלפון_מקבל: string;
  כתובת_מקבל_ההזמנה: string;
  עיר: string;
  הוראות_משלוח: string;
  דמי_משלוח: string;
  ברכה_טקסט: string;
  הערות_להזמנה: string;
  אופן_תשלום: string;
  סטטוס_תשלום: Order['סטטוס_תשלום'];
  סטטוס_הזמנה: Order['סטטוס_הזמנה'];
}

type FullOrder = Order & {
  לקוחות: Customer;
  מוצרים_בהזמנה: OrderItem[];
  משלוח: { סטטוס_משלוח: string; שם_שליח: string; עיר: string } | null;
  תשלומים: { id: string; סכום: number; אמצעי_תשלום: string; תאריך_תשלום: string }[];
  חשבוניות: { id: string; מספר_חשבונית: string; סכום: number; סטטוס: string }[];
};

const ORDER_STATUSES = ['חדשה', 'בהכנה', 'מוכנה למשלוח', 'נשלחה', 'הושלמה בהצלחה', 'בוטלה'];

const STATUS_PILL: Record<string, string> = {
  'חדשה':             'bg-sky-100 text-sky-800 ring-1 ring-sky-300',
  'בהכנה':            'bg-amber-100 text-amber-800 ring-1 ring-amber-300',
  'מוכנה למשלוח':     'bg-violet-100 text-violet-800 ring-1 ring-violet-300',
  'נשלחה':            'bg-indigo-100 text-indigo-800 ring-1 ring-indigo-300',
  'הושלמה בהצלחה':    'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300',
  'בוטלה':            'bg-rose-100 text-rose-700 ring-1 ring-rose-300',
};

const PAYMENT_PILL: Record<string, string> = {
  'ממתין': 'bg-amber-100 text-amber-800 ring-1 ring-amber-300',
  'שולם':  'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300',
  'חלקי':  'bg-orange-100 text-orange-800 ring-1 ring-orange-300',
  'בוטל':  'bg-rose-100 text-rose-700 ring-1 ring-rose-300',
};

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<FullOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({
    הזמנה_דחופה: false,
    סוג_אספקה: 'איסוף עצמי',
    תאריך_אספקה: '',
    שעת_אספקה: '',
    מקור_ההזמנה: '',
    שם_מקבל: '',
    טלפון_מקבל: '',
    כתובת_מקבל_ההזמנה: '',
    עיר: '',
    הוראות_משלוח: '',
    דמי_משלוח: '',
    ברכה_טקסט: '',
    הערות_להזמנה: '',
    אופן_תשלום: '',
    סטטוס_תשלום: 'ממתין',
    סטטוס_הזמנה: 'חדשה',
  });

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

  const openEdit = () => {
    if (!order) return;
    setEditForm({
      הזמנה_דחופה: order.הזמנה_דחופה ?? false,
      סוג_אספקה: order.סוג_אספקה ?? 'איסוף עצמי',
      תאריך_אספקה: order.תאריך_אספקה ?? '',
      שעת_אספקה: order.שעת_אספקה ?? '',
      מקור_ההזמנה: order.מקור_ההזמנה ?? '',
      שם_מקבל: order.שם_מקבל ?? '',
      טלפון_מקבל: order.טלפון_מקבל ?? '',
      כתובת_מקבל_ההזמנה: order.כתובת_מקבל_ההזמנה ?? '',
      עיר: order.עיר ?? '',
      הוראות_משלוח: order.הוראות_משלוח ?? '',
      דמי_משלוח: order.דמי_משלוח != null ? String(order.דמי_משלוח) : '',
      ברכה_טקסט: order.ברכה_טקסט ?? '',
      הערות_להזמנה: order.הערות_להזמנה ?? '',
      אופן_תשלום: order.אופן_תשלום ?? '',
      סטטוס_תשלום: order.סטטוס_תשלום,
      סטטוס_הזמנה: order.סטטוס_הזמנה,
    });
    setShowEdit(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        הזמנה_דחופה: editForm.הזמנה_דחופה,
        סוג_אספקה: editForm.סוג_אספקה,
        תאריך_אספקה: editForm.תאריך_אספקה || null,
        שעת_אספקה: editForm.שעת_אספקה || null,
        מקור_ההזמנה: editForm.מקור_ההזמנה || null,
        ברכה_טקסט: editForm.ברכה_טקסט || null,
        הערות_להזמנה: editForm.הערות_להזמנה || null,
        אופן_תשלום: editForm.אופן_תשלום || null,
        סטטוס_תשלום: editForm.סטטוס_תשלום,
        סטטוס_הזמנה: editForm.סטטוס_הזמנה,
      };
      if (editForm.סוג_אספקה === 'משלוח') {
        payload.שם_מקבל = editForm.שם_מקבל || null;
        payload.טלפון_מקבל = editForm.טלפון_מקבל || null;
        payload.כתובת_מקבל_ההזמנה = editForm.כתובת_מקבל_ההזמנה || null;
        payload.עיר = editForm.עיר || null;
        payload.הוראות_משלוח = editForm.הוראות_משלוח || null;
        payload.דמי_משלוח = editForm.דמי_משלוח !== '' ? Number(editForm.דמי_משלוח) : null;
      } else {
        payload.שם_מקבל = null;
        payload.טלפון_מקבל = null;
        payload.כתובת_מקבל_ההזמנה = null;
        payload.עיר = null;
        payload.הוראות_משלוח = null;
        payload.דמי_משלוח = null;
      }

      const res = await fetch(`/api/orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setOrder(prev => prev ? { ...prev, ...json.data } : prev);
      setShowEdit(false);
      toast.success('הזמנה עודכנה בהצלחה');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'שגיאה בשמירה');
    } finally {
      setSaving(false);
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
          <Button variant="secondary" size="sm" onClick={openEdit}>עריכה</Button>
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
            {ORDER_STATUSES.map(status => {
              const isActive = order.סטטוס_הזמנה === status;
              return (
                <button
                  key={status}
                  onClick={() => updateStatus(status)}
                  disabled={updatingStatus || isActive}
                  className={`w-full text-right px-3 py-2 rounded-full text-sm font-medium transition-all ${
                    isActive
                      ? STATUS_PILL[status] || 'bg-stone-200 text-stone-800 ring-1 ring-stone-300'
                      : 'bg-white text-stone-500 ring-1 ring-stone-200 hover:bg-stone-50'
                  }`}
                >
                  {status}
                </button>
              );
            })}
          </div>
        </Card>

        {/* Payment status */}
        <Card>
          <CardHeader><CardTitle>סטטוס תשלום</CardTitle></CardHeader>
          <div className="mb-3"><StatusBadge status={order.סטטוס_תשלום} type="payment" /></div>
          <div className="space-y-2">
            {(['ממתין', 'שולם', 'חלקי', 'בוטל'] as const).map(s => {
              const isActive = order.סטטוס_תשלום === s;
              return (
                <button
                  key={s}
                  onClick={() => updatePaymentStatus(s)}
                  disabled={isActive}
                  className={`w-full text-right px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    isActive
                      ? PAYMENT_PILL[s] || 'bg-stone-200 text-stone-800 ring-1 ring-stone-300'
                      : 'bg-white text-stone-500 ring-1 ring-stone-200 hover:bg-stone-50'
                  }`}
                >
                  {s}
                </button>
              );
            })}
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

      {/* Edit modal */}
      {showEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowEdit(false)}>
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4"
            style={{ direction: 'rtl' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold" style={{ color: '#2B1A10' }}>עריכת הזמנה</h3>

            {/* Supply type + urgent */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#6B4A2D' }}>סוג אספקה</label>
                <select
                  value={editForm.סוג_אספקה}
                  onChange={e => setEditForm(f => ({ ...f, סוג_אספקה: e.target.value as EditForm['סוג_אספקה'] }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={{ borderColor: '#E7D2A6', color: '#2B1A10' }}
                >
                  <option value="איסוף עצמי">איסוף עצמי</option>
                  <option value="משלוח">משלוח</option>
                </select>
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: '#2B1A10' }}>
                  <input
                    type="checkbox"
                    checked={editForm.הזמנה_דחופה}
                    onChange={e => setEditForm(f => ({ ...f, הזמנה_דחופה: e.target.checked }))}
                    className="w-4 h-4"
                  />
                  הזמנה דחופה
                </label>
              </div>
            </div>

            {/* Date + time */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#6B4A2D' }}>תאריך אספקה</label>
                <input
                  type="date"
                  value={editForm.תאריך_אספקה}
                  onChange={e => setEditForm(f => ({ ...f, תאריך_אספקה: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={{ borderColor: '#E7D2A6', color: '#2B1A10' }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#6B4A2D' }}>שעת אספקה</label>
                <input
                  type="time"
                  value={editForm.שעת_אספקה}
                  onChange={e => setEditForm(f => ({ ...f, שעת_אספקה: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={{ borderColor: '#E7D2A6', color: '#2B1A10' }}
                />
              </div>
            </div>

            {/* Delivery fields */}
            {editForm.סוג_אספקה === 'משלוח' && (
              <div className="space-y-3 p-3 rounded-xl" style={{ backgroundColor: '#FAF7F0' }}>
                <p className="text-xs font-semibold" style={{ color: '#6B4A2D' }}>פרטי משלוח</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: '#6B4A2D' }}>שם מקבל</label>
                    <input
                      type="text"
                      value={editForm.שם_מקבל}
                      onChange={e => setEditForm(f => ({ ...f, שם_מקבל: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                      style={{ borderColor: '#E7D2A6', color: '#2B1A10' }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: '#6B4A2D' }}>טלפון מקבל</label>
                    <input
                      type="tel"
                      value={editForm.טלפון_מקבל}
                      onChange={e => setEditForm(f => ({ ...f, טלפון_מקבל: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                      style={{ borderColor: '#E7D2A6', color: '#2B1A10' }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: '#6B4A2D' }}>כתובת</label>
                    <input
                      type="text"
                      value={editForm.כתובת_מקבל_ההזמנה}
                      onChange={e => setEditForm(f => ({ ...f, כתובת_מקבל_ההזמנה: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                      style={{ borderColor: '#E7D2A6', color: '#2B1A10' }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: '#6B4A2D' }}>עיר</label>
                    <input
                      type="text"
                      value={editForm.עיר}
                      onChange={e => setEditForm(f => ({ ...f, עיר: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                      style={{ borderColor: '#E7D2A6', color: '#2B1A10' }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: '#6B4A2D' }}>הוראות משלוח</label>
                    <input
                      type="text"
                      value={editForm.הוראות_משלוח}
                      onChange={e => setEditForm(f => ({ ...f, הוראות_משלוח: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                      style={{ borderColor: '#E7D2A6', color: '#2B1A10' }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: '#6B4A2D' }}>דמי משלוח (₪)</label>
                    <input
                      type="number"
                      min="0"
                      value={editForm.דמי_משלוח}
                      onChange={e => setEditForm(f => ({ ...f, דמי_משלוח: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                      style={{ borderColor: '#E7D2A6', color: '#2B1A10' }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Order source */}
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#6B4A2D' }}>מקור הזמנה</label>
              <input
                type="text"
                value={editForm.מקור_ההזמנה}
                onChange={e => setEditForm(f => ({ ...f, מקור_ההזמנה: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                style={{ borderColor: '#E7D2A6', color: '#2B1A10' }}
              />
            </div>

            {/* Greeting */}
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#6B4A2D' }}>ברכה</label>
              <textarea
                rows={2}
                value={editForm.ברכה_טקסט}
                onChange={e => setEditForm(f => ({ ...f, ברכה_טקסט: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none"
                style={{ borderColor: '#E7D2A6', color: '#2B1A10' }}
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#6B4A2D' }}>הערות להזמנה</label>
              <textarea
                rows={2}
                value={editForm.הערות_להזמנה}
                onChange={e => setEditForm(f => ({ ...f, הערות_להזמנה: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none"
                style={{ borderColor: '#E7D2A6', color: '#2B1A10' }}
              />
            </div>

            {/* Payment method + statuses */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#6B4A2D' }}>אמצעי תשלום</label>
                <input
                  type="text"
                  value={editForm.אופן_תשלום}
                  onChange={e => setEditForm(f => ({ ...f, אופן_תשלום: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={{ borderColor: '#E7D2A6', color: '#2B1A10' }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#6B4A2D' }}>סטטוס תשלום</label>
                <select
                  value={editForm.סטטוס_תשלום}
                  onChange={e => setEditForm(f => ({ ...f, סטטוס_תשלום: e.target.value as EditForm['סטטוס_תשלום'] }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={{ borderColor: '#E7D2A6', color: '#2B1A10' }}
                >
                  {['ממתין', 'שולם', 'חלקי', 'בוטל'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#6B4A2D' }}>סטטוס הזמנה</label>
                <select
                  value={editForm.סטטוס_הזמנה}
                  onChange={e => setEditForm(f => ({ ...f, סטטוס_הזמנה: e.target.value as EditForm['סטטוס_הזמנה'] }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={{ borderColor: '#E7D2A6', color: '#2B1A10' }}
                >
                  {ORDER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end pt-2 border-t" style={{ borderColor: '#E7D2A6' }}>
              <button
                onClick={() => setShowEdit(false)}
                className="px-4 py-2 text-sm rounded-lg border hover:bg-stone-50"
                style={{ borderColor: '#E7D2A6', color: '#6B4A2D' }}
              >
                ביטול
              </button>
              <Button onClick={saveEdit} disabled={saving}>
                {saving ? 'שומר...' : 'שמור שינויים'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
