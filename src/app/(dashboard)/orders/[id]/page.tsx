'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge, UrgentBadge } from '@/components/ui/StatusBadge';
import { PageLoading } from '@/components/ui/LoadingSpinner';
import { formatDate, formatCurrency } from '@/lib/utils';
import toast from 'react-hot-toast';
import type { Order, OrderItem, Customer, Product, Package, PetitFourType } from '@/types/database';

// ─── Interfaces ────────────────────────────────────────────────────────────────

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
  סוג_הנחה: 'ללא' | 'אחוז' | 'סכום';
  ערך_הנחה: string;
}

interface EditOrderItem {
  מוצר_id: string;
  שם_מוצר: string;
  כמות: number;
  מחיר_ליחידה: number;
  סהכ: number;
  הערות_לשורה: string;
}

interface EditPackageItem {
  _packageId: string;
  שם_מארז: string;
  גודל_מארז: number;
  כמות: number;
  מחיר_ליחידה: number;
  סהכ: number;
  הערות_לשורה: string;
  פטיפורים: { פטיפור_id: string; שם: string; כמות: number }[];
}

type FullOrder = Order & {
  לקוחות: Customer;
  מוצרים_בהזמנה: (OrderItem & { מוצרים_למכירה?: Product })[];
  משלוח: { סטטוס_משלוח: string; שם_שליח: string; עיר: string } | null;
  תשלומים: { id: string; סכום: number; אמצעי_תשלום: string; תאריך_תשלום: string }[];
  חשבוניות: { id: string; מספר_חשבונית: string; סכום: number; סטטוס: string; קישור_חשבונית?: string | null }[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

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

// ─── Small field helpers ───────────────────────────────────────────────────────

function FieldInput({ label, value, onChange, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: '#6B4A2D' }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
        style={{ borderColor: '#E7D2A6', color: '#2B1A10' }}
      />
    </div>
  );
}

function FieldSelect({ label, value, onChange, children }: {
  label: string; value: string; onChange: (v: string) => void; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: '#6B4A2D' }}>{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
        style={{ borderColor: '#E7D2A6', color: '#2B1A10' }}
      >
        {children}
      </select>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<FullOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showEditItems, setShowEditItems] = useState(false);

  // Catalogue data for dropdowns in the edit modal
  const [products, setProducts] = useState<Product[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [petitFourTypes, setPetitFourTypes] = useState<PetitFourType[]>([]);

  // Edit form state — order header fields
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
    סוג_הנחה: 'ללא',
    ערך_הנחה: '0',
  });

  // Edit state — order items
  const [editItems, setEditItems] = useState<EditOrderItem[]>([]);
  const [editPackages, setEditPackages] = useState<EditPackageItem[]>([]);
  // Recipient type state for edit modal (UI-only until migration 015 is applied)
  const [editRecipientType, setEditRecipientType] = useState<'customer' | 'other'>('customer');

  // ── Load order ──────────────────────────────────────────────────────────────

  const loadOrder = () => {
    setLoading(true);
    fetch(`/api/orders/${id}`)
      .then(r => r.json())
      .then(({ data }) => setOrder(data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadOrder(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load catalogue (once) ───────────────────────────────────────────────────

  useEffect(() => {
    Promise.all([
      fetch('/api/products?active=true').then(r => r.json()),
      fetch('/api/packages').then(r => r.json()),
      fetch('/api/petit-four-types').then(r => r.json()),
    ]).then(([p, pkg, pf]) => {
      const allProducts: Product[] = p.data || [];
      console.log('[order-edit] products loaded:', allProducts.length,
        '| business-only count:', allProducts.filter((x: Product) => x.לקוחות_עסקיים_בלבד).length);
      setProducts(allProducts);
      setPackages(pkg.data || []);
      setPetitFourTypes(pf.data || []);
    });
  }, []);

  // ── Status updates ──────────────────────────────────────────────────────────

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

  // ── Open edit modal ──────────────────────────────────────────────────────────

  const openEdit = () => {
    if (!order) return;

    // Derive recipient type heuristically from stored fields vs customer data
    const custFullName = `${order.לקוחות?.שם_פרטי || ''} ${order.לקוחות?.שם_משפחה || ''}`.trim();
    const nameMatches = order.שם_מקבל === custFullName;
    const phoneMatches = !order.טלפון_מקבל || order.טלפון_מקבל === order.לקוחות?.טלפון;
    setEditRecipientType(nameMatches && phoneMatches ? 'customer' : 'other');

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
      סוג_הנחה: (order.סוג_הנחה as 'ללא' | 'אחוז' | 'סכום') ?? 'ללא',
      ערך_הנחה: order.ערך_הנחה != null ? String(order.ערך_הנחה) : '0',
    });

    setShowEdit(true);
  };

  // ── Open items-edit modal ────────────────────────────────────────────────────

  const openEditItems = () => {
    if (!order) return;

    const productRows = (order.מוצרים_בהזמנה || [])
      .filter(item => item.סוג_שורה === 'מוצר')
      .map(item => ({
        מוצר_id: item.מוצר_id || '',
        שם_מוצר: item.מוצרים_למכירה?.שם_מוצר || '',
        כמות: item.כמות,
        מחיר_ליחידה: item.מחיר_ליחידה,
        סהכ: item.סהכ,
        הערות_לשורה: item.הערות_לשורה || '',
      }));
    setEditItems(productRows);

    const packageRows = (order.מוצרים_בהזמנה || [])
      .filter(item => item.סוג_שורה === 'מארז')
      .map(item => {
        const matched = packages.find(
          p => p.גודל_מארז === item.גודל_מארז && p.מחיר_מארז === item.מחיר_ליחידה,
        );
        return {
          _packageId: matched?.id || '',
          שם_מארז: matched?.שם_מארז || `מארז ${item.גודל_מארז || ''} יח׳`,
          גודל_מארז: item.גודל_מארז || 0,
          כמות: item.כמות,
          מחיר_ליחידה: item.מחיר_ליחידה,
          סהכ: item.סהכ,
          הערות_לשורה: item.הערות_לשורה || '',
          פטיפורים: (item.בחירת_פטיפורים_בהזמנה || []).map(sel => ({
            פטיפור_id: sel.פטיפור_id,
            שם: sel.סוגי_פטיפורים?.שם_פטיפור || '',
            כמות: sel.כמות,
          })),
        };
      });
    setEditPackages(packageRows);

    setShowEditItems(true);
  };

  // ── Save edit ────────────────────────────────────────────────────────────────

  const saveEdit = async () => {
    setSaving(true);
    try {
      // 1. Save order header fields
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
        payload.delivery_recipient_type = editRecipientType;
      } else {
        payload.שם_מקבל = null;
        payload.טלפון_מקבל = null;
        payload.כתובת_מקבל_ההזמנה = null;
        payload.עיר = null;
        payload.הוראות_משלוח = null;
        payload.דמי_משלוח = null;
        payload.delivery_recipient_type = null;
      }

      console.log('[saveEdit] PATCH payload:', payload);
      const patchRes = await fetch(`/api/orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const patchJson = await patchRes.json();
      if (!patchRes.ok) throw new Error(patchJson.error || `PATCH failed ${patchRes.status}`);

      setShowEdit(false);
      toast.success('פרטי הזמנה עודכנו בהצלחה');
      loadOrder();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'שגיאה בשמירה';
      console.error('[saveEdit] error:', msg, err);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  // ── Save items only ──────────────────────────────────────────────────────────

  const saveItems = async () => {
    setSaving(true);
    try {
      const itemsPayload = {
        מוצרים: editItems
          .filter(i => i.מוצר_id)
          .map(i => ({
            מוצר_id: i.מוצר_id,
            כמות: i.כמות,
            מחיר_ליחידה: i.מחיר_ליחידה,
            הערות_לשורה: i.הערות_לשורה || null,
          })),
        מארזים: editPackages.map(p => ({
          גודל_מארז: p.גודל_מארז,
          כמות: p.כמות,
          מחיר_ליחידה: p.מחיר_ליחידה,
          הערות_לשורה: p.הערות_לשורה || null,
          פטיפורים: p.פטיפורים.map(pf => ({ פטיפור_id: pf.פטיפור_id, כמות: pf.כמות })),
        })),
        סוג_הנחה: (order?.סוג_הנחה as 'ללא' | 'אחוז' | 'סכום') ?? 'ללא',
        ערך_הנחה: order?.ערך_הנחה ?? 0,
        דמי_משלוח: order?.דמי_משלוח ?? 0,
      };

      console.log('[saveItems] payload:', JSON.stringify(itemsPayload, null, 2));

      const res = await fetch(`/api/orders/${id}/items`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemsPayload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `שגיאה ${res.status}`);

      setShowEditItems(false);
      toast.success('מוצרי ההזמנה עודכנו בהצלחה');
      loadOrder();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'שגיאה בשמירה';
      console.error('[saveItems] error:', msg, err);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  // ── Edit items helpers ───────────────────────────────────────────────────────

  const addProductItem = () => {
    setEditItems(prev => [
      ...prev,
      { מוצר_id: '', שם_מוצר: '', כמות: 1, מחיר_ליחידה: 0, סהכ: 0, הערות_לשורה: '' },
    ]);
  };

  const updateProductItem = (idx: number, field: string, value: string | number) => {
    setEditItems(prev => {
      const items = [...prev];
      const item = { ...items[idx], [field]: value };
      if (field === 'מוצר_id') {
        const prod = products.find(p => p.id === value);
        if (prod) { item.שם_מוצר = prod.שם_מוצר; item.מחיר_ליחידה = prod.מחיר; }
      }
      item.סהכ = item.כמות * item.מחיר_ליחידה;
      items[idx] = item;
      return items;
    });
  };

  const removeProductItem = (idx: number) => setEditItems(prev => prev.filter((_, i) => i !== idx));

  const addPackageItem = () => {
    setEditPackages(prev => [
      ...prev,
      { _packageId: '', שם_מארז: '', גודל_מארז: 0, כמות: 1, מחיר_ליחידה: 0, סהכ: 0, הערות_לשורה: '', פטיפורים: [] },
    ]);
  };

  const updatePackageItem = (idx: number, field: string, value: string | number) => {
    setEditPackages(prev => {
      const items = [...prev];
      let item = { ...items[idx], [field]: value };
      if (field === '_packageId') {
        const pkg = packages.find(p => p.id === value);
        if (pkg) {
          item.שם_מארז = pkg.שם_מארז;
          item.גודל_מארז = pkg.גודל_מארז;
          item.מחיר_ליחידה = pkg.מחיר_מארז;
        }
      }
      item.סהכ = item.כמות * item.מחיר_ליחידה;
      items[idx] = item;
      return items;
    });
  };

  const removePackageItem = (idx: number) => setEditPackages(prev => prev.filter((_, i) => i !== idx));

  const addPetitFour = (pkgIdx: number, pfId: string) => {
    const pf = petitFourTypes.find(p => p.id === pfId);
    if (!pf) return;
    setEditPackages(prev => {
      const items = [...prev];
      const pkg = { ...items[pkgIdx] };
      if (!pkg.פטיפורים.find(p => p.פטיפור_id === pfId)) {
        pkg.פטיפורים = [...pkg.פטיפורים, { פטיפור_id: pfId, שם: pf.שם_פטיפור, כמות: 1 }];
      }
      items[pkgIdx] = pkg;
      return items;
    });
  };

  const updatePetitFourQty = (pkgIdx: number, pfIdx: number, qty: number) => {
    setEditPackages(prev => {
      const items = [...prev];
      const pkg = { ...items[pkgIdx] };
      pkg.פטיפורים = pkg.פטיפורים.map((pf, i) => i === pfIdx ? { ...pf, כמות: qty } : pf);
      items[pkgIdx] = pkg;
      return items;
    });
  };

  const removePetitFour = (pkgIdx: number, pfIdx: number) => {
    setEditPackages(prev => {
      const items = [...prev];
      const pkg = { ...items[pkgIdx] };
      pkg.פטיפורים = pkg.פטיפורים.filter((_, i) => i !== pfIdx);
      items[pkgIdx] = pkg;
      return items;
    });
  };

  // ── Live totals for items-edit modal ────────────────────────────────────────

  const editSubtotal = [...editItems, ...editPackages].reduce((s, i) => s + i.סהכ, 0);
  const orderDiscountType = (order?.סוג_הנחה as 'ללא' | 'אחוז' | 'סכום') ?? 'ללא';
  const orderDiscountVal = order?.ערך_הנחה ?? 0;
  const editDiscount = orderDiscountType === 'אחוז'
    ? +(editSubtotal * orderDiscountVal / 100).toFixed(2)
    : orderDiscountType === 'סכום'
      ? Math.min(editSubtotal, orderDiscountVal)
      : 0;
  const editDelivery = order?.דמי_משלוח ?? 0;
  const editTotal = Math.max(0, editSubtotal - editDiscount + editDelivery);

  // ── Render ───────────────────────────────────────────────────────────────────

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
          <Button variant="secondary" size="sm" onClick={openEdit}>עריכת הזמנה</Button>
        </div>

        {/* Customer */}
        <Card>
          <CardHeader><CardTitle>פרטי לקוח</CardTitle></CardHeader>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span style={{ color: '#6B4A2D' }}>שם: </span>
              {customer?.id ? (
                <Link
                  href={`/customers/${customer.id}`}
                  className="font-semibold hover:underline"
                  style={{ color: '#8B5E34', textUnderlineOffset: '2px' }}
                >
                  {customer.שם_פרטי} {customer.שם_משפחה}
                </Link>
              ) : (
                <span className="font-medium" style={{ color: '#2B1A10' }}>{customer?.שם_פרטי} {customer?.שם_משפחה}</span>
              )}
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
            {order.סוג_אספקה === 'משלוח' && (() => {
              const custFullName = `${customer?.שם_פרטי || ''} ${customer?.שם_משפחה || ''}`.trim();
              const isForCustomer = order.שם_מקבל === custFullName && (!order.טלפון_מקבל || order.טלפון_מקבל === customer?.טלפון);
              return (
                <div>
                  <span style={{ color: '#6B4A2D' }}>משלוח אל: </span>
                  <span className="font-medium text-xs px-2 py-0.5 rounded-full"
                    style={isForCustomer
                      ? { backgroundColor: '#DBEAFE', color: '#1E40AF' }
                      : { backgroundColor: '#FEF3C7', color: '#92400E' }}>
                    {isForCustomer ? 'הלקוח המזמין' : 'מישהו אחר'}
                  </span>
                </div>
              );
            })()}
            {order.שם_מקבל && <div><span style={{ color: '#6B4A2D' }}>מקבל: </span><span>{order.שם_מקבל}</span></div>}
            {order.טלפון_מקבל && <div><span style={{ color: '#6B4A2D' }}>טלפון מקבל: </span><span>{order.טלפון_מקבל}</span></div>}
            {order.כתובת_מקבל_ההזמנה && <div className="col-span-2"><span style={{ color: '#6B4A2D' }}>כתובת: </span><span>{order.כתובת_מקבל_ההזמנה}{order.עיר ? `, ${order.עיר}` : ''}</span></div>}
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
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>פריטי הזמנה</CardTitle>
              <button
                onClick={openEditItems}
                title="עריכת מוצרים"
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium hover:bg-stone-50 transition-colors"
                style={{ borderColor: '#8B5E34', color: '#8B5E34' }}
              >
                ✏️ עריכת מוצרים
              </button>
            </div>
          </CardHeader>
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
                      <td className="py-2 px-2 font-medium">
                        {item.סוג_שורה === 'מארז'
                          ? (packages.find(p => p.גודל_מארז === item.גודל_מארז)?.שם_מארז || `מארז ${item.גודל_מארז ?? '?'} יח׳`)
                          : ((item as OrderItem & { מוצרים_למכירה?: { שם_מוצר: string } }).מוצרים_למכירה?.שם_מוצר || '-')}
                      </td>
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
                <span>
                  הנחה{order.סוג_הנחה === 'אחוז' ? ` (${order.ערך_הנחה}%)` : ''}
                </span>
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
                  {inv.קישור_חשבונית ? (
                    <a href={inv.קישור_חשבונית} target="_blank" rel="noopener noreferrer" style={{ color: '#8B5E34', textDecoration: 'underline', textUnderlineOffset: '2px' }}>#{inv.מספר_חשבונית}</a>
                  ) : (
                    <span style={{ color: '#6B4A2D' }}>#{inv.מספר_חשבונית}</span>
                  )}
                  <span className="font-medium">{formatCurrency(inv.סכום)}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          Edit Modal
          ══════════════════════════════════════════════════════════════════════ */}
      {showEdit && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-6 px-4"
          onClick={() => setShowEdit(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-4xl space-y-5 p-6 mb-6"
            style={{ direction: 'rtl' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold" style={{ color: '#2B1A10' }}>עריכת הזמנה — {order.מספר_הזמנה}</h3>

            {/* ── פרטי הזמנה ── */}
            <section className="rounded-xl border p-4 space-y-4" style={{ borderColor: '#E7D2A6', backgroundColor: '#FDFAF5' }}>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#8B5E34' }}>פרטי הזמנה</p>

              <div className="grid grid-cols-2 gap-4">
                <FieldSelect
                  label="סוג אספקה"
                  value={editForm.סוג_אספקה}
                  onChange={v => setEditForm(f => ({ ...f, סוג_אספקה: v as EditForm['סוג_אספקה'] }))}
                >
                  <option value="איסוף עצמי">איסוף עצמי</option>
                  <option value="משלוח">משלוח</option>
                </FieldSelect>
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

              <div className="grid grid-cols-2 gap-4">
                <FieldInput label="תאריך אספקה" type="date" value={editForm.תאריך_אספקה} onChange={v => setEditForm(f => ({ ...f, תאריך_אספקה: v }))} />
                <FieldInput label="שעת אספקה" type="time" value={editForm.שעת_אספקה} onChange={v => setEditForm(f => ({ ...f, שעת_אספקה: v }))} />
              </div>

              {editForm.סוג_אספקה === 'משלוח' && (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    {([
                      { key: 'customer', label: 'שליחה ללקוח המזמין' },
                      { key: 'other',    label: 'שליחה למישהו אחר'   },
                    ] as const).map(opt => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => {
                          setEditRecipientType(opt.key);
                          if (opt.key === 'customer' && order.לקוחות) {
                            setEditForm(f => ({
                              ...f,
                              שם_מקבל: `${order.לקוחות!.שם_פרטי} ${order.לקוחות!.שם_משפחה}`.trim(),
                              טלפון_מקבל: order.לקוחות!.טלפון || '',
                              כתובת_מקבל_ההזמנה: '',
                              עיר: '',
                            }));
                          } else if (opt.key === 'other') {
                            setEditForm(f => ({
                              ...f,
                              שם_מקבל: '',
                              טלפון_מקבל: '',
                              כתובת_מקבל_ההזמנה: '',
                              עיר: '',
                            }));
                          }
                        }}
                        className="px-3 py-1.5 text-xs font-medium rounded-full border transition-colors"
                        style={editRecipientType === opt.key
                          ? { backgroundColor: '#8B5E34', color: '#fff', borderColor: '#8B5E34' }
                          : { backgroundColor: '#fff', color: '#6B4A2D', borderColor: '#DDD0BC' }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3 p-3 rounded-lg" style={{ backgroundColor: '#FAF7F0' }}>
                  <FieldInput label="שם מקבל" value={editForm.שם_מקבל} onChange={v => setEditForm(f => ({ ...f, שם_מקבל: v }))} />
                  <FieldInput label="טלפון מקבל" type="tel" value={editForm.טלפון_מקבל} onChange={v => setEditForm(f => ({ ...f, טלפון_מקבל: v }))} />
                  <FieldInput label="כתובת" value={editForm.כתובת_מקבל_ההזמנה} onChange={v => setEditForm(f => ({ ...f, כתובת_מקבל_ההזמנה: v }))} />
                  <FieldInput label="עיר" value={editForm.עיר} onChange={v => setEditForm(f => ({ ...f, עיר: v }))} />
                  <FieldInput label="הוראות משלוח" value={editForm.הוראות_משלוח} onChange={v => setEditForm(f => ({ ...f, הוראות_משלוח: v }))} />
                  <FieldInput label="דמי משלוח (₪)" type="number" value={editForm.דמי_משלוח} onChange={v => setEditForm(f => ({ ...f, דמי_משלוח: v }))} />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#6B4A2D' }}>מקור הזמנה</label>
                <select
                  value={editForm.מקור_ההזמנה}
                  onChange={e => setEditForm(f => ({ ...f, מקור_ההזמנה: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{ borderColor: '#E7D2A6', color: '#2B1A10' }}
                >
                  <option value="">—</option>
                  {['טלפון', 'WhatsApp', 'אינסטגרם', 'פייסבוק', 'אתר', 'הפניה', 'אחר'].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#6B4A2D' }}>ברכה</label>
                <textarea rows={2} value={editForm.ברכה_טקסט}
                  onChange={e => setEditForm(f => ({ ...f, ברכה_טקסט: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
                  style={{ borderColor: '#E7D2A6', color: '#2B1A10' }} />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#6B4A2D' }}>הערות להזמנה</label>
                <textarea rows={2} value={editForm.הערות_להזמנה}
                  onChange={e => setEditForm(f => ({ ...f, הערות_להזמנה: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
                  style={{ borderColor: '#E7D2A6', color: '#2B1A10' }} />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#6B4A2D' }}>אמצעי תשלום</label>
                  <select
                    value={editForm.אופן_תשלום}
                    onChange={e => setEditForm(f => ({ ...f, אופן_תשלום: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"
                    style={{ borderColor: '#E7D2A6', color: '#2B1A10' }}
                  >
                    <option value="">—</option>
                    {['מזומן', 'כרטיס אשראי', 'העברה בנקאית', 'bit', 'PayBox', 'PayPal', 'אחר'].map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <FieldSelect label="סטטוס תשלום" value={editForm.סטטוס_תשלום}
                  onChange={v => setEditForm(f => ({ ...f, סטטוס_תשלום: v as EditForm['סטטוס_תשלום'] }))}>
                  {(['ממתין', 'שולם', 'חלקי', 'בוטל'] as const).map(s => <option key={s} value={s}>{s}</option>)}
                </FieldSelect>
                <FieldSelect label="סטטוס הזמנה" value={editForm.סטטוס_הזמנה}
                  onChange={v => setEditForm(f => ({ ...f, סטטוס_הזמנה: v as EditForm['סטטוס_הזמנה'] }))}>
                  {ORDER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </FieldSelect>
              </div>
            </section>

            {/* ── Actions ── */}
            <div className="flex gap-3 justify-end pt-2 border-t" style={{ borderColor: '#E7D2A6' }}>
              <button
                onClick={() => setShowEdit(false)}
                className="px-4 py-2 text-sm rounded-lg border hover:bg-stone-50 transition-colors"
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

      {/* ══════════════════════════════════════════════════════════════════════
          Items Edit Modal
          ══════════════════════════════════════════════════════════════════════ */}
      {showEditItems && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-6 px-4"
          onClick={() => setShowEditItems(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-3xl space-y-5 p-6 mb-6"
            style={{ direction: 'rtl' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold" style={{ color: '#2B1A10' }}>עריכת מוצרים — {order.מספר_הזמנה}</h3>

            {/* ── מוצרים ── */}
            <section className="rounded-xl border p-4 space-y-3" style={{ borderColor: '#E7D2A6', backgroundColor: '#FDFAF5' }}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#8B5E34' }}>מוצרים</p>
                <button
                  type="button"
                  onClick={addProductItem}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border font-medium hover:bg-stone-50 transition-colors"
                  style={{ borderColor: '#8B5E34', color: '#8B5E34' }}
                >
                  ＋ הוסף מוצר
                </button>
              </div>

              {editItems.length === 0 ? (
                <p className="text-xs text-center py-3" style={{ color: '#9B7A5A' }}>
                  אין מוצרים. לחץ &quot;הוסף מוצר&quot; להוספה.
                </p>
              ) : (
                <div className="space-y-2">
                  {editItems.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-end p-3 rounded-xl" style={{ backgroundColor: '#FAF7F0' }}>
                      <div className="col-span-5">
                        <label className="block text-xs mb-1" style={{ color: '#6B4A2D' }}>מוצר</label>
                        <select
                          value={item.מוצר_id}
                          onChange={e => updateProductItem(idx, 'מוצר_id', e.target.value)}
                          className="w-full border rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                          style={{ borderColor: '#E7D2A6', color: '#2B1A10' }}
                        >
                          <option value="">בחר מוצר...</option>
                          {products
                            .filter(p => p.סוג_מוצר === 'מוצר רגיל')
                            .filter(p => !p.לקוחות_עסקיים_בלבד || order.לקוחות?.סוג_לקוח === 'עסקי')
                            .map(p => (
                              <option key={p.id} value={p.id}>{p.שם_מוצר}</option>
                            ))}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs mb-1" style={{ color: '#6B4A2D' }}>כמות</label>
                        <input type="number" min={1} value={item.כמות}
                          onChange={e => updateProductItem(idx, 'כמות', Number(e.target.value))}
                          className="w-full border rounded-lg px-2 py-1.5 text-xs focus:outline-none text-center"
                          style={{ borderColor: '#E7D2A6', color: '#2B1A10' }} />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs mb-1" style={{ color: '#6B4A2D' }}>מחיר ₪</label>
                        <input type="number" min={0} step={0.01} value={item.מחיר_ליחידה}
                          onChange={e => updateProductItem(idx, 'מחיר_ליחידה', Number(e.target.value))}
                          className="w-full border rounded-lg px-2 py-1.5 text-xs focus:outline-none text-center"
                          style={{ borderColor: '#E7D2A6', color: '#2B1A10' }} />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs mb-1" style={{ color: '#6B4A2D' }}>סה״כ</label>
                        <div className="px-2 py-1.5 text-xs rounded-lg text-center font-semibold" style={{ backgroundColor: '#EDE0CE', color: '#4A2F1B' }}>
                          ₪{item.סהכ.toFixed(2)}
                        </div>
                      </div>
                      <div className="col-span-1 flex items-end justify-center pb-0.5">
                        <button
                          type="button"
                          onClick={() => removeProductItem(idx)}
                          title="מחק שורה"
                          className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-red-50 transition-colors text-base"
                          style={{ color: '#dc2626' }}
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ── מארזי פטיפורים ── */}
            <section className="rounded-xl border p-4 space-y-3" style={{ borderColor: '#E7D2A6', backgroundColor: '#FDFAF5' }}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#8B5E34' }}>מארזי פטיפורים</p>
                <button
                  type="button"
                  onClick={addPackageItem}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border font-medium hover:bg-stone-50 transition-colors"
                  style={{ borderColor: '#8B5E34', color: '#8B5E34' }}
                >
                  ＋ הוסף מארז
                </button>
              </div>

              {editPackages.length === 0 ? (
                <p className="text-xs text-center py-3" style={{ color: '#9B7A5A' }}>
                  אין מארזים. לחץ &quot;הוסף מארז&quot; להוספה.
                </p>
              ) : (
                <div className="space-y-4">
                  {editPackages.map((pkg, pkgIdx) => (
                    <div key={pkgIdx} className="p-3 rounded-xl border" style={{ borderColor: '#DDD0BC', backgroundColor: '#FAF7F0' }}>
                      <div className="grid grid-cols-4 gap-3 mb-3">
                        <div className="col-span-2">
                          <label className="block text-xs mb-1" style={{ color: '#6B4A2D' }}>בחר מארז</label>
                          <select
                            value={pkg._packageId}
                            onChange={e => updatePackageItem(pkgIdx, '_packageId', e.target.value)}
                            className="w-full border rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                            style={{ borderColor: '#E7D2A6', color: '#2B1A10' }}
                          >
                            <option value="">
                              {pkg.גודל_מארז ? `מארז ${pkg.גודל_מארז} יח׳ (קיים)` : 'בחר מארז...'}
                            </option>
                            {packages.filter(p => p.פעיל).map(p => (
                              <option key={p.id} value={p.id}>
                                {p.שם_מארז} — {p.גודל_מארז} יח׳ · ₪{p.מחיר_מארז}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs mb-1" style={{ color: '#6B4A2D' }}>כמות</label>
                          <input type="number" min={1} value={pkg.כמות}
                            onChange={e => updatePackageItem(pkgIdx, 'כמות', Number(e.target.value))}
                            className="w-full border rounded-lg px-2 py-1.5 text-xs focus:outline-none text-center"
                            style={{ borderColor: '#E7D2A6', color: '#2B1A10' }} />
                        </div>
                        <div>
                          <label className="block text-xs mb-1" style={{ color: '#6B4A2D' }}>מחיר ₪</label>
                          <input type="number" min={0} step={0.01} value={pkg.מחיר_ליחידה}
                            onChange={e => updatePackageItem(pkgIdx, 'מחיר_ליחידה', Number(e.target.value))}
                            className="w-full border rounded-lg px-2 py-1.5 text-xs focus:outline-none text-center"
                            style={{ borderColor: '#E7D2A6', color: '#2B1A10' }} />
                        </div>
                      </div>

                      {/* Petit-four selector */}
                      <div className="border-t pt-3 space-y-2" style={{ borderColor: '#DDD0BC' }}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium" style={{ color: '#4A2F1B' }}>פטיפורים</span>
                          <select
                            className="text-xs border rounded px-2 py-1 w-44"
                            style={{ borderColor: '#DDD0BC', color: '#2B1A10' }}
                            value=""
                            onChange={e => { if (e.target.value) addPetitFour(pkgIdx, e.target.value); }}
                          >
                            <option value="">＋ הוסף סוג פטיפור</option>
                            {petitFourTypes.filter(pf => pf.פעיל).map(pf => (
                              <option key={pf.id} value={pf.id}>{pf.שם_פטיפור}</option>
                            ))}
                          </select>
                        </div>
                        {pkg.פטיפורים.length > 0 && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {pkg.פטיפורים.map((pf, pfIdx) => (
                              <div key={pfIdx} className="flex items-center gap-2 p-2 bg-white rounded-lg border" style={{ borderColor: '#DDD0BC' }}>
                                <span className="flex-1 text-xs font-medium truncate" style={{ color: '#2B1A10' }}>{pf.שם}</span>
                                <input type="number" min={1} value={pf.כמות}
                                  onChange={e => updatePetitFourQty(pkgIdx, pfIdx, Number(e.target.value))}
                                  className="w-10 px-1 py-1 text-xs border rounded text-center focus:outline-none"
                                  style={{ borderColor: '#DDD0BC', color: '#2B1A10' }} />
                                <button type="button" onClick={() => removePetitFour(pkgIdx, pfIdx)}
                                  className="text-red-400 hover:text-red-600 text-sm leading-none">×</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between mt-3 pt-2 border-t" style={{ borderColor: '#DDD0BC' }}>
                        <span className="text-xs font-semibold" style={{ color: '#2B1A10' }}>
                          סה״כ מארז: ₪{pkg.סהכ.toFixed(2)}
                        </span>
                        <button type="button" onClick={() => removePackageItem(pkgIdx)}
                          className="text-xs text-red-500 hover:underline">הסר מארז</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ── סיכום כספי ── */}
            <section className="rounded-xl border p-4 space-y-2 text-sm" style={{ borderColor: '#E7D2A6', backgroundColor: '#FDFAF5' }}>
              <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: '#8B5E34' }}>סיכום כספי</p>
              <div className="flex justify-between" style={{ color: '#6B4A2D' }}>
                <span>סכום לפני הנחה:</span>
                <span>₪{editSubtotal.toFixed(2)}</span>
              </div>
              {editDiscount > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>
                    הנחה{orderDiscountType === 'אחוז' ? ` (${orderDiscountVal}%)` : ''}:
                  </span>
                  <span>−₪{editDiscount.toFixed(2)}</span>
                </div>
              )}
              {editDelivery > 0 && (
                <div className="flex justify-between" style={{ color: '#6B4A2D' }}>
                  <span>דמי משלוח:</span>
                  <span>₪{editDelivery.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold pt-2 border-t text-base" style={{ borderColor: '#E7D2A6' }}>
                <span style={{ color: '#2B1A10' }}>סה״כ לתשלום:</span>
                <span style={{ color: '#8B5E34' }}>₪{editTotal.toFixed(2)}</span>
              </div>
            </section>

            {/* ── Actions ── */}
            <div className="flex gap-3 justify-end pt-2 border-t" style={{ borderColor: '#E7D2A6' }}>
              <button
                onClick={() => setShowEditItems(false)}
                className="px-4 py-2 text-sm rounded-lg border hover:bg-stone-50 transition-colors"
                style={{ borderColor: '#E7D2A6', color: '#6B4A2D' }}
              >
                ביטול
              </button>
              <Button onClick={saveItems} disabled={saving}>
                {saving ? 'שומר...' : 'שמור מוצרים'}
              </Button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
