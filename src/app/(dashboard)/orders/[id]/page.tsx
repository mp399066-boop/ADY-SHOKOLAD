'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge, UrgentBadge } from '@/components/ui/StatusBadge';
import { PageLoading } from '@/components/ui/LoadingSpinner';
import { Combobox } from '@/components/ui/Combobox';
import { normalizeSearchText } from '@/lib/normalize';
import { sumPetitFours, getCapacityInfo } from '@/lib/packageCapacity';
import { formatDate, formatCurrency } from '@/lib/utils';
import toast from 'react-hot-toast';
import type { Order, OrderItem, Customer, Product, Package, PetitFourType } from '@/types/database';
import { DeliveryTypeCards } from '@/components/orders/DeliveryTypeCards';

// ─── Interfaces ────────────────────────────────────────────────────────────────

interface EditForm {
  הזמנה_דחופה: boolean;
  סוג_אספקה: 'משלוח' | 'איסוף עצמי';
  תאריך_אספקה: string;
  שעת_אספקה: string;
  delivery_time_flexible: boolean;
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
  סוג_הזמנה: 'רגיל' | 'סאטמר';
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
  חשבוניות: { id: string; מספר_חשבונית: string; סכום: number; סטטוס: string; קישור_חשבונית?: string | null; סוג_מסמך?: string | null; תאריך_יצירה?: string | null }[];
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

// ─── Detail-page UI helpers (presentation only — no business logic) ──────────

// Tiny inline icon set — keeps bundle slim and matches the brand stroke weight.
function Icon({ name, className = 'w-4 h-4' }: { name: string; className?: string }) {
  const props = {
    className,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    viewBox: '0 0 24 24',
    'aria-hidden': true,
  };
  switch (name) {
    case 'user':     return <svg {...props}><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>;
    case 'phone':    return <svg {...props}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>;
    case 'mail':     return <svg {...props}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>;
    case 'truck':    return <svg {...props}><path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>;
    case 'pin':      return <svg {...props}><path d="M12 22s7-7.5 7-13a7 7 0 1 0-14 0c0 5.5 7 13 7 13z"/><circle cx="12" cy="9" r="2.5"/></svg>;
    case 'calendar': return <svg {...props}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>;
    case 'clock':    return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
    case 'note':     return <svg {...props}><path d="M5 4h11l4 4v12a1 1 0 0 1-1 1H5z"/><path d="M16 4v4h4M9 12h6M9 16h4"/></svg>;
    case 'gift':     return <svg {...props}><path d="M3 12h18v9H3z"/><path d="M12 7v14M3 7h18v5H3z"/><path d="M12 7c-2 0-4-1-4-3s2-2 3-1 1 4 1 4zM12 7c2 0 4-1 4-3s-2-2-3-1-1 4-1 4z"/></svg>;
    case 'edit':     return <svg {...props}><path d="M4 20h4l11-11-4-4L4 16v4z"/><path d="M14 5l4 4"/></svg>;
    case 'chevron':  return <svg {...props}><path d="m6 9 6 6 6-6"/></svg>;
    case 'check':    return <svg {...props}><path d="m5 13 4 4 10-10"/></svg>;
    case 'plus':     return <svg {...props}><path d="M12 5v14M5 12h14"/></svg>;
    case 'arrow':    return <svg {...props}><path d="m15 6-6 6 6 6"/></svg>;
    default:         return null;
  }
}

// One field of an info card: tiny muted icon, tiny muted label, prominent value.
function InfoField({
  icon, label, children,
}: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 min-w-0">
      <span className="flex-shrink-0 mt-0.5" style={{ color: '#9B7A5A' }}><Icon name={icon} /></span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wider mb-0.5" style={{ color: '#9B7A5A' }}>{label}</p>
        <div className="text-sm leading-snug" style={{ color: '#2B1A10' }}>{children}</div>
      </div>
    </div>
  );
}

// Vertical timeline of order statuses — current step is filled, prior steps are
// muted-filled (done), upcoming are hollow. Click any step to update.
function StatusTimeline({
  statuses, current, disabled, onPick,
}: {
  statuses: string[]; current: string; disabled: boolean; onPick: (s: string) => void;
}) {
  const currentIdx = statuses.indexOf(current);
  return (
    <ol className="relative" dir="rtl">
      {statuses.map((s, i) => {
        const isDone = currentIdx >= 0 && i < currentIdx;
        const isCurrent = i === currentIdx;
        const isLast = i === statuses.length - 1;
        const dotBg = isCurrent ? '#8B5E34' : isDone ? '#C7A46B' : '#FFFFFF';
        const dotBorder = isCurrent ? '#8B5E34' : isDone ? '#C7A46B' : '#DDD0BC';
        const labelColor = isCurrent ? '#2B1A10' : isDone ? '#6B4A2D' : '#9B7A5A';
        const lineColor = isDone ? '#C7A46B' : '#EDE0CE';
        return (
          <li key={s} className="relative flex items-start gap-3 pb-4 last:pb-0">
            {!isLast && (
              <span
                aria-hidden
                className="absolute top-5 right-[9px] w-px"
                style={{ height: 'calc(100% - 12px)', background: lineColor }}
              />
            )}
            <span
              aria-hidden
              className="flex-shrink-0 w-5 h-5 rounded-full mt-0.5 transition-colors flex items-center justify-center"
              style={{ background: dotBg, border: `2px solid ${dotBorder}` }}
            >
              {isDone && <Icon name="check" className="w-3 h-3" />}
            </span>
            <button
              type="button"
              onClick={() => onPick(s)}
              disabled={disabled || isCurrent}
              className="flex-1 text-right text-sm font-medium px-2 py-1 -mx-2 rounded-md transition-colors hover:bg-stone-50 disabled:cursor-default disabled:hover:bg-transparent"
              style={{ color: labelColor, fontWeight: isCurrent ? 700 : 500 }}
            >
              {s}
              {isCurrent && (
                <span
                  className="mr-2 text-[10px] font-semibold px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: '#EFE4D3', color: '#6B4A2D' }}
                >
                  עכשיו
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
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
  // Manual document issuance — three inline buttons in the financial-documents
  // block. tax_invoice fires straight after a confirm; receipt + invoice_receipt
  // open a small payment-method-only modal first (the doc-type picker modal
  // was removed because the document type is now obvious from which button
  // was pressed). When payModalDocType is null the modal stays closed.
  const [payModalDocType, setPayModalDocType] = useState<'receipt' | 'invoice_receipt' | null>(null);
  // Per-doc-type loading: tracks which button shows "מפיק..." and which other
  // buttons are disabled while a request is in flight.
  const [issuingDocType, setIssuingDocType] = useState<'tax_invoice' | 'receipt' | 'invoice_receipt' | null>(null);
  const issuingDoc = issuingDocType !== null;

  // Single source of truth for the manual issuance request. All three buttons
  // (tax_invoice via confirm, receipt + invoice_receipt via the payment-method
  // modal) call this. POSTs to the existing /api/orders/{id}/create-document
  // endpoint — no new API surface.
  const issueDocument = async (
    documentType: 'tax_invoice' | 'receipt' | 'invoice_receipt',
    paymentMethod: string | undefined,
    force: boolean,
  ): Promise<boolean> => {
    if (!order) return false;
    setIssuingDocType(documentType);
    // Hard log so we can prove what the UI sent if a document later
    // appears with the wrong method. This runs in the browser console;
    // pair it with the [PAYMENT API] / [PAYMENT EF] traces server-side.
    console.log('[PAYMENT UI] documentType:', documentType,
      '| selected paymentMethod:', JSON.stringify(paymentMethod ?? null),
      '| source: manual_modal',
      '| order id:', order.id);
    try {
      const res = await fetch(`/api/orders/${order.id}/create-document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // PAYMENT_DOCS (receipt + invoice_receipt) require the explicit
        // `manual_modal` source. tax_invoice doesn't need it but we send
        // it anyway for shape consistency — the API ignores it on that type.
        body: JSON.stringify({ documentType, paymentMethod, paymentMethodSource: 'manual_modal', force }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || 'שגיאה בהפקת המסמך');
        return false;
      }
      if (json.skipped) {
        toast('מסמך מסוג זה כבר קיים — לא נוצר חדש', { icon: 'ℹ️' });
        loadOrder();
        return true;
      }
      toast.success(`מסמך הופק — ${json.invoice_number || 'בהצלחה'}`);
      loadOrder();
      return true;
    } catch (err) {
      toast.error('שגיאה ברשת — לא ניתן להפיק מסמך');
      console.error('[create-document] failed:', err);
      return false;
    } finally {
      setIssuingDocType(null);
    }
  };
  // UI-only: tracks which package rows are expanded to show their petit-fours
  const [expandedPackages, setExpandedPackages] = useState<Set<string>>(new Set());
  const togglePackage = (lineId: string) =>
    setExpandedPackages(prev => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId); else next.add(lineId);
      return next;
    });
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
    delivery_time_flexible: false,
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
    סוג_הזמנה: 'רגיל',
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
      delivery_time_flexible: order.delivery_time_flexible ?? false,
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
      סוג_הזמנה: (order.סוג_הזמנה as 'רגיל' | 'סאטמר') ?? 'רגיל',
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
        סוג_הזמנה: editForm.סוג_הזמנה,
        סוג_אספקה: editForm.סוג_אספקה,
        תאריך_אספקה: editForm.תאריך_אספקה || null,
        שעת_אספקה: editForm.שעת_אספקה || null,
        delivery_time_flexible: editForm.delivery_time_flexible,
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
    // Block when any package's petit-four selection exceeds the package size.
    // Packages with size 0 are skipped — those show only a soft warning.
    for (let i = 0; i < editPackages.length; i++) {
      const pkg = editPackages[i];
      const info = getCapacityInfo(sumPetitFours(pkg.פטיפורים), pkg.גודל_מארז);
      if (info.blocking) {
        toast.error(`מארז ${i + 1} (${pkg.שם_מארז || 'ללא שם'}): ${info.message} — יש להפחית ${info.overage} יחידות`);
        return;
      }
    }
    // Block save when any selected product line has no price. The price field
    // is editable here, so a 0/empty value is almost always an unfilled manual
    // entry — not an intentional zero. Same intent as the new-order guard for
    // products with no price-list entry.
    const noPriceItem = editItems.find(i => i.מוצר_id && (!i.מחיר_ליחידה || i.מחיר_ליחידה <= 0));
    if (noPriceItem) {
      toast.error(`יש להזין מחיר למוצר "${noPriceItem.שם_מוצר || ''}"`);
      return;
    }
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
      const safeQty = Math.max(1, Math.floor(Number(qty) || 1));
      const cap = Number(pkg.גודל_מארז) || 0;
      let nextQty = safeQty;
      if (cap > 0) {
        const others = pkg.פטיפורים.reduce((sum, pf, i) => i === pfIdx ? sum : sum + (Number(pf.כמות) || 0), 0);
        const max = Math.max(1, cap - others);
        if (safeQty > max) nextQty = max;
      }
      pkg.פטיפורים = pkg.פטיפורים.map((pf, i) => i === pfIdx ? { ...pf, כמות: nextQty } : pf);
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
  const custFullName = `${customer?.שם_פרטי || ''} ${customer?.שם_משפחה || ''}`.trim();
  const recipientIsCustomer =
    order.שם_מקבל === custFullName && (!order.טלפון_מקבל || order.טלפון_מקבל === customer?.טלפון);

  // VAT display logic — same rule as the new-order form: business customers
  // get an explicit VAT row + headline-with-VAT, because their סך_הכל_לתשלום
  // is stored pre-VAT (Morning adds 18% in the document). Private customers
  // already see VAT-inclusive prices throughout, so nothing to compute.
  // Satmar orders never show VAT regardless of customer type.
  const isBusinessForVat =
    (order.סוג_הזמנה as string | undefined) !== 'סאטמר' &&
    (customer?.סוג_לקוח === 'עסקי' ||
     customer?.סוג_לקוח === 'עסקי - קבוע' ||
     customer?.סוג_לקוח === 'עסקי - כמות');
  const VAT_RATE = 0.18;
  const baseTotal = order.סך_הכל_לתשלום || 0;
  const vatAmount = isBusinessForVat ? +(baseTotal * VAT_RATE).toFixed(2) : 0;
  const displayedTotal = isBusinessForVat ? +(baseTotal * (1 + VAT_RATE)).toFixed(2) : baseTotal;

  return (
    <div dir="rtl" className="max-w-6xl mx-auto space-y-5">
      {/* ════════ HEADER BAR ════════ */}
      <header
        className="rounded-2xl p-4 sm:p-5 flex flex-wrap items-start justify-between gap-4"
        style={{
          background: 'linear-gradient(180deg,#FFFDF8 0%,#FBF5EA 100%)',
          border: '1px solid #EAE0D4',
          boxShadow: '0 1px 6px rgba(58,42,26,0.05)',
        }}
      >
        {/* Identity cluster */}
        <div className="flex items-start gap-3 min-w-0">
          <button
            onClick={() => router.back()}
            className="flex-shrink-0 mt-1 w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-stone-100"
            style={{ color: '#8B5E34' }}
            aria-label="חזרה"
            title="חזרה"
          >
            <Icon name="arrow" className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: '#9B7A5A' }}>הזמנה</p>
            <h1
              className="text-xl sm:text-2xl font-bold leading-none truncate"
              style={{ color: '#2B1A10', letterSpacing: '0.5px' }}
            >
              {order.מספר_הזמנה}
            </h1>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {order.הזמנה_דחופה && <UrgentBadge />}
              <StatusBadge status={order.סטטוס_הזמנה} type="order" />
              <StatusBadge status={order.סטטוס_תשלום} type="payment" />
              {(order.סוג_הזמנה as string) === 'סאטמר' && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#EDE9FE', color: '#6D28D9' }}>
                  סאטמר
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Total + delivery + actions */}
        <div className="flex items-start gap-4 sm:gap-6 ms-auto">
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: '#9B7A5A' }}>אספקה</p>
            <div className="flex items-center gap-1.5 text-sm font-medium" style={{ color: '#2B1A10' }}>
              <Icon name="calendar" className="w-3.5 h-3.5" />
              <span>{formatDate(order.תאריך_אספקה)}</span>
            </div>
            {order.שעת_אספקה && (
              <div className="flex items-center gap-1.5 text-xs mt-1" style={{ color: '#6B4A2D' }}>
                <Icon name="clock" className="w-3 h-3" />
                <span>{order.שעת_אספקה}</span>
              </div>
            )}
            {order.delivery_time_flexible && (
              <div className="text-xs mt-1 font-medium" style={{ color: '#476D53' }}>גמיש</div>
            )}
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: '#9B7A5A' }}>סכום</p>
            <p className="text-2xl sm:text-3xl font-bold leading-none" style={{ color: '#8B5E34', letterSpacing: '0.3px' }}>
              {formatCurrency(displayedTotal)}
            </p>
            {isBusinessForVat && (
              <p className="text-[10px] mt-1" style={{ color: '#9B7A5A' }}>כולל מע״מ</p>
            )}
          </div>
          <div className="self-center">
            {order.סטטוס_הזמנה === 'טיוטה' ? (
              <Link
                href={`/orders/new?draft=${order.id}`}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-full transition-colors"
                style={{ backgroundColor: '#F5F0FA', color: '#5B21B6', border: '1px solid #DDD6FE' }}
              >
                <Icon name="edit" className="w-3.5 h-3.5" /> ערוך טיוטה
              </Link>
            ) : (
              <button
                type="button"
                onClick={openEdit}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-full transition-colors hover:bg-amber-50"
                style={{ border: '1px solid #C6A77D', color: '#8B5E34' }}
              >
                <Icon name="edit" className="w-3.5 h-3.5" /> עריכת הזמנה
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Draft notice */}
      {order.סטטוס_הזמנה === 'טיוטה' && (
        <div
          className="flex items-start gap-3 px-4 py-3 rounded-xl text-sm"
          style={{ backgroundColor: '#F5F0FA', border: '1px solid #DDD6FE', color: '#5B21B6' }}
        >
          <span className="text-base">📝</span>
          <div>
            <span className="font-semibold">טיוטה — ההזמנה לא אושרה עדיין.</span>
            <span className="mr-1">לחץ &quot;ערוך טיוטה&quot; כדי לסיים ולאשר.</span>
          </div>
        </div>
      )}

      {/* ════════ FINANCIAL DOCUMENTS — full width, above the main grid ═══ */}
      <FinancialActionsBar
        invoiceReceiptLoading={issuingDocType === 'invoice_receipt'}
        taxInvoiceLoading={issuingDocType === 'tax_invoice'}
        receiptLoading={issuingDocType === 'receipt'}
        busy={issuingDoc}
        onIssueInvoiceReceipt={() => setPayModalDocType('invoice_receipt')}
        onIssueReceipt={() => setPayModalDocType('receipt')}
        onIssueTaxInvoice={async () => {
          const all = order.חשבוניות ?? [];
          const exists = all.some(i => i.סוג_מסמך === 'tax_invoice');
          const baseMsg = 'להפיק חשבונית מס להזמנה זו?';
          const dupMsg = 'כבר קיימת חשבונית מס להזמנה זו. הפקה נוספת עלולה ליצור כפילות. להמשיך?';
          if (!window.confirm(exists ? dupMsg : baseMsg)) return;
          await issueDocument('tax_invoice', undefined, exists);
        }}
      />
      <FinancialDocumentsList invoices={order.חשבוניות ?? []} />

      {/* ════════ MAIN GRID ════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-5">

          {/* Greeting (highlighted card if set) */}
          {order.ברכה_טקסט && (
            <Card style={{ background: 'linear-gradient(180deg,#FFFDF8 0%,#FAF1E0 100%)' }}>
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: '#EFE4D3', color: '#8B5E34' }}>
                  <Icon name="gift" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: '#9B7A5A' }}>ברכה</p>
                  <p className="text-sm italic leading-relaxed" style={{ color: '#2B1A10' }}>
                    {order.ברכה_טקסט}
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* Combined: customer + delivery */}
          <Card>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
              {/* Customer column */}
              <div className="space-y-4">
                <p className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: '#8B5E34' }}>לקוח</p>
                <InfoField icon="user" label="שם">
                  {customer?.id ? (
                    <Link
                      href={`/customers/${customer.id}`}
                      className="font-semibold hover:underline"
                      style={{ color: '#8B5E34', textUnderlineOffset: '2px' }}
                    >
                      {customer.שם_פרטי} {customer.שם_משפחה}
                    </Link>
                  ) : (
                    <span className="font-semibold" style={{ color: '#2B1A10' }}>{customer?.שם_פרטי} {customer?.שם_משפחה}</span>
                  )}
                  {customer?.סוג_לקוח && (
                    <span className="ms-2"><StatusBadge status={customer.סוג_לקוח} type="customer" /></span>
                  )}
                </InfoField>
                <InfoField icon="phone" label="טלפון">
                  {customer?.טלפון ? (
                    <a href={`tel:${customer.טלפון}`} className="hover:underline" style={{ color: '#2B1A10' }}>{customer.טלפון}</a>
                  ) : <span style={{ color: '#9B7A5A' }}>—</span>}
                </InfoField>
                <InfoField icon="mail" label="אימייל">
                  {customer?.אימייל ? (
                    <a href={`mailto:${customer.אימייל}`} className="hover:underline break-all" style={{ color: '#2B1A10' }}>{customer.אימייל}</a>
                  ) : <span style={{ color: '#9B7A5A' }}>—</span>}
                </InfoField>
              </div>

              {/* Delivery column */}
              <div className="space-y-4 sm:border-r sm:pr-6" style={{ borderColor: '#EDE0CE' }}>
                <p className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: '#8B5E34' }}>אספקה</p>
                <InfoField icon="truck" label="סוג">
                  <span className="font-medium">{order.סוג_אספקה}</span>
                  {order.מקור_ההזמנה && (
                    <span className="ms-2 text-xs" style={{ color: '#6B4A2D' }}>· מקור: {order.מקור_ההזמנה}</span>
                  )}
                </InfoField>
                {order.סוג_אספקה === 'משלוח' ? (
                  <>
                    <InfoField icon="user" label="מקבל">
                      <span className="font-medium">{order.שם_מקבל || '—'}</span>
                      <span
                        className="ms-2 text-[11px] font-medium px-2 py-0.5 rounded-full"
                        style={recipientIsCustomer
                          ? { backgroundColor: '#DBEAFE', color: '#1E40AF' }
                          : { backgroundColor: '#FEF3C7', color: '#92400E' }}
                      >
                        {recipientIsCustomer ? 'הלקוח המזמין' : 'מישהו אחר'}
                      </span>
                      {order.טלפון_מקבל && (
                        <div className="mt-1 text-xs" style={{ color: '#6B4A2D' }}>
                          <a href={`tel:${order.טלפון_מקבל}`} className="hover:underline">{order.טלפון_מקבל}</a>
                        </div>
                      )}
                    </InfoField>
                    {(order.כתובת_מקבל_ההזמנה || order.עיר) && (
                      <InfoField icon="pin" label="כתובת">
                        <span>{order.כתובת_מקבל_ההזמנה}{order.עיר ? `, ${order.עיר}` : ''}</span>
                      </InfoField>
                    )}
                    {order.הוראות_משלוח && (
                      <InfoField icon="note" label="הוראות">
                        <span className="text-xs leading-snug" style={{ color: '#4A2F1B' }}>{order.הוראות_משלוח}</span>
                      </InfoField>
                    )}
                  </>
                ) : (
                  <InfoField icon="note" label="פרטים">
                    <span className="text-xs" style={{ color: '#6B4A2D' }}>איסוף עצמי — ללא משלוח</span>
                  </InfoField>
                )}
              </div>
            </div>
          </Card>

          {/* Notes */}
          {order.הערות_להזמנה && (
            <Card>
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 mt-0.5" style={{ color: '#9B7A5A' }}><Icon name="note" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: '#9B7A5A' }}>הערות</p>
                  <p className="text-sm leading-relaxed" style={{ color: '#2B1A10' }}>{order.הערות_להזמנה}</p>
                </div>
              </div>
            </Card>
          )}

          {/* Items list */}
          <Card>
            <CardHeader>
              <CardTitle>פריטים</CardTitle>
              <button
                onClick={openEditItems}
                title="עריכת מוצרים"
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors hover:bg-amber-50"
                style={{ borderColor: '#C6A77D', color: '#8B5E34' }}
              >
                <Icon name="edit" className="w-3 h-3" /> עריכה
              </button>
            </CardHeader>
            {(!order.מוצרים_בהזמנה || order.מוצרים_בהזמנה.length === 0) ? (
              <p className="text-sm text-center py-6" style={{ color: '#9B7A5A' }}>אין פריטים בהזמנה</p>
            ) : (
              <ul className="space-y-2">
                {order.מוצרים_בהזמנה.map(item => {
                  const isPackage = item.סוג_שורה === 'מארז';
                  const pfList = item.בחירת_פטיפורים_בהזמנה || [];
                  const isExpanded = expandedPackages.has(item.id);
                  const name = isPackage
                    ? (() => {
                        const pkg = packages.find(p => p.גודל_מארז === item.גודל_מארז);
                        const base = pkg?.שם_מארז || 'מארז פטיפורים';
                        const size = item.גודל_מארז ?? pkg?.גודל_מארז ?? '?';
                        return `${base} · ${size} יח׳`;
                      })()
                    : ((() => {
                        // Order items inserted via the WooCommerce webhook
                        // sometimes arrive with a null מוצר_id (auto-create
                        // fell through). The webhook then writes the WC name
                        // into הערות_לשורה — surface that here as the
                        // primary display name instead of "—" so the operator
                        // still sees what was ordered.
                        const linked = (item as OrderItem & { מוצרים_למכירה?: { שם_מוצר: string } }).מוצרים_למכירה?.שם_מוצר;
                        if (linked) return linked;
                        const note = (item as OrderItem).הערות_לשורה ?? '';
                        const wcMatch = note.match(/^מוצר מהאתר:\s*(.+?)(?:\s*\(SKU\b|$)/);
                        if (wcMatch) return wcMatch[1].trim();
                        return 'מוצר לא מזוהה';
                      })());
                  return (
                    <li
                      key={item.id}
                      className="rounded-xl border transition-colors"
                      style={{ borderColor: '#EAE0D4', backgroundColor: '#FFFFFF' }}
                    >
                      <div className="flex items-center gap-3 p-3 sm:p-4">
                        {isPackage ? (
                          <button
                            type="button"
                            onClick={() => togglePackage(item.id)}
                            className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all hover:bg-stone-100"
                            style={{ color: '#8B5E34' }}
                            aria-label={isExpanded ? 'סגור פטיפורים' : 'פתח פטיפורים'}
                          >
                            <Icon
                              name="chevron"
                              className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            />
                          </button>
                        ) : (
                          <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: '#FAF7F0', color: '#9B7A5A' }}>
                            ●
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold truncate" style={{ color: '#2B1A10' }} title={name}>
                              {name}
                            </span>
                            {isPackage && (
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: '#FEF3C7', color: '#92400E' }}>
                                מארז
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-xs" style={{ color: '#6B4A2D' }}>
                            <span>{item.כמות} × {formatCurrency(item.מחיר_ליחידה)}</span>
                            {item.הערות_לשורה && (
                              <span className="truncate" title={item.הערות_לשורה}>· {item.הערות_לשורה}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-left">
                          <span className="text-sm font-bold tabular-nums" style={{ color: '#8B5E34' }}>
                            {formatCurrency(item.סהכ)}
                          </span>
                        </div>
                      </div>
                      {isPackage && isExpanded && pfList.length > 0 && (
                        <div className="px-4 pb-3 pt-1 border-t" style={{ borderColor: '#F5ECD8' }}>
                          <p className="text-[11px] uppercase tracking-wider mb-2" style={{ color: '#9B7A5A' }}>סוגי פטיפורים</p>
                          <div className="flex flex-wrap gap-1.5">
                            {pfList.map(sel => (
                              <span
                                key={sel.id}
                                className="text-xs px-2.5 py-1 rounded-full font-medium"
                                style={{ backgroundColor: '#EFE4D3', color: '#4A2F1B' }}
                              >
                                {sel.סוגי_פטיפורים?.שם_פטיפור} <span className="opacity-60">×{sel.כמות}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {isPackage && isExpanded && pfList.length === 0 && (
                        <div className="px-4 pb-3 pt-1 border-t text-xs" style={{ borderColor: '#F5ECD8', color: '#9B7A5A' }}>
                          לא נבחרו סוגי פטיפורים למארז זה
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        {/* ════════ SIDEBAR ════════ */}
        <aside className="space-y-5 lg:sticky lg:top-5 lg:self-start">

          {/* Financial summary — hero card */}
          <Card style={{ background: 'linear-gradient(180deg,#FFFDF8 0%,#FBF5EA 100%)' }}>
            <p className="text-[11px] uppercase tracking-wider mb-3 font-semibold" style={{ color: '#8B5E34' }}>סיכום כספי</p>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt style={{ color: '#6B4A2D' }}>לפני הנחה</dt>
                <dd className="tabular-nums" style={{ color: '#2B1A10' }}>{formatCurrency(order.סכום_לפני_הנחה)}</dd>
              </div>
              {(order.סכום_הנחה || 0) > 0 && (
                <div className="flex justify-between" style={{ color: '#B91C1C' }}>
                  <dt>הנחה{order.סוג_הנחה === 'אחוז' ? ` (${order.ערך_הנחה}%)` : ''}</dt>
                  <dd className="tabular-nums">−{formatCurrency(order.סכום_הנחה)}</dd>
                </div>
              )}
              {(order.דמי_משלוח || 0) > 0 && (
                <div className="flex justify-between">
                  <dt style={{ color: '#6B4A2D' }}>דמי משלוח</dt>
                  <dd className="tabular-nums" style={{ color: '#2B1A10' }}>{formatCurrency(order.דמי_משלוח)}</dd>
                </div>
              )}
              {isBusinessForVat && (
                <>
                  <div className="flex justify-between pt-2" style={{ borderTop: '1px dashed #EDE0CE' }}>
                    <dt style={{ color: '#6B4A2D' }}>סה״כ לפני מע״מ</dt>
                    <dd className="tabular-nums" style={{ color: '#2B1A10' }}>{formatCurrency(baseTotal)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt style={{ color: '#6B4A2D' }}>מע״מ 18%</dt>
                    <dd className="tabular-nums" style={{ color: '#2B1A10' }}>{formatCurrency(vatAmount)}</dd>
                  </div>
                </>
              )}
            </dl>
            <div
              className="mt-4 pt-3 flex items-baseline justify-between"
              style={{ borderTop: '1px solid #E7D2A6' }}
            >
              <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: '#6B4A2D' }}>
                {isBusinessForVat ? 'סה״כ כולל מע״מ' : 'סך הכל'}
              </span>
              <span className="text-2xl font-bold tabular-nums" style={{ color: '#8B5E34' }}>
                {formatCurrency(displayedTotal)}
              </span>
            </div>
            {order.אופן_תשלום && (
              <p className="text-[11px] mt-2" style={{ color: '#9B7A5A' }}>
                אמצעי תשלום: <span style={{ color: '#6B4A2D' }}>{order.אופן_תשלום}</span>
              </p>
            )}
          </Card>

          {/* Order status timeline */}
          <Card>
            <p className="text-[11px] uppercase tracking-wider mb-4 font-semibold" style={{ color: '#8B5E34' }}>סטטוס הזמנה</p>
            <StatusTimeline
              statuses={ORDER_STATUSES}
              current={order.סטטוס_הזמנה}
              disabled={updatingStatus}
              onPick={updateStatus}
            />
          </Card>

          {/* Payment status — horizontal pills */}
          <Card>
            <p className="text-[11px] uppercase tracking-wider mb-3 font-semibold" style={{ color: '#8B5E34' }}>סטטוס תשלום</p>
            <div className="flex flex-wrap gap-1.5">
              {(['ממתין', 'שולם', 'חלקי', 'בוטל'] as const).map(s => {
                const isActive = order.סטטוס_תשלום === s;
                return (
                  <button
                    key={s}
                    onClick={() => updatePaymentStatus(s)}
                    disabled={isActive}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      isActive
                        ? PAYMENT_PILL[s] || 'bg-stone-200 text-stone-800 ring-1 ring-stone-300'
                        : 'bg-white text-stone-500 ring-1 ring-stone-200 hover:bg-stone-50 hover:text-stone-700'
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
            {/* Retry — re-mint the PayPlus payment page for this order. Only
                surfaced while status is still 'ממתין' (no point once paid).
                Opens in a new tab; does not change סטטוס_תשלום. */}
            {order.סטטוס_תשלום === 'ממתין' && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    const r = await fetch(`/api/orders/${order.id}/create-payment-link`, { method: 'POST' });
                    const j = await r.json();
                    if (!r.ok || !j.payment_url) throw new Error(j.error || 'PayPlus error');
                    const opened = window.open(j.payment_url, '_blank', 'noopener,noreferrer');
                    if (!opened) toast.error('הדפדפן חסם את חלון התשלום');
                    else toast.success('דף התשלום נפתח');
                  } catch (err: unknown) {
                    const reason = err instanceof Error ? err.message : String(err);
                    console.error('[order] payment-page retry failed:', reason);
                    toast.error(`לא הצלחנו לפתוח דף תשלום: ${reason}`, { duration: 10000 });
                  }
                }}
                className="mt-3 w-full px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
                style={{ backgroundColor: '#8B5E34', color: '#FFFFFF' }}
              >
                פתח דף תשלום
              </button>
            )}
          </Card>

          {/* Payments */}
          {order.תשלומים && order.תשלומים.length > 0 && (
            <Card>
              <p className="text-[11px] uppercase tracking-wider mb-3 font-semibold" style={{ color: '#8B5E34' }}>תשלומים</p>
              <ul className="space-y-1.5">
                {order.תשלומים.map(p => (
                  <li
                    key={p.id}
                    className="flex justify-between items-center text-sm px-3 py-2 rounded-lg"
                    style={{ backgroundColor: '#FAF7F0' }}
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate" style={{ color: '#2B1A10' }}>{p.אמצעי_תשלום}</div>
                      <div className="text-[11px]" style={{ color: '#9B7A5A' }}>{formatDate(p.תאריך_תשלום)}</div>
                    </div>
                    <span className="font-semibold tabular-nums flex-shrink-0" style={{ color: '#8B5E34' }}>
                      {formatCurrency(p.סכום)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Financial documents moved out of the aside — see <FinancialActionsBar />
              and <FinancialDocumentsList /> rendered full-width above the main grid. */}
        </aside>
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
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#8B5E34' }}>פרטי הזמנה</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium" style={{ color: '#6B4A2D' }}>סוג הזמנה:</span>
                  <div className="flex gap-1">
                    {(['רגיל', 'סאטמר'] as const).map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setEditForm(f => ({ ...f, סוג_הזמנה: t }))}
                        className="px-3 py-1 text-xs font-medium rounded-full border transition-colors"
                        style={editForm.סוג_הזמנה === t
                          ? { backgroundColor: '#8B5E34', color: '#fff', borderColor: '#8B5E34' }
                          : { backgroundColor: '#fff', color: '#6B4A2D', borderColor: '#DDD0BC' }}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium mb-2" style={{ color: '#6B4A2D' }}>סוג אספקה</label>
                  <DeliveryTypeCards
                    value={editForm.סוג_אספקה}
                    onChange={v => setEditForm(f => ({ ...f, סוג_אספקה: v }))}
                  />
                </div>
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

              <div className="grid grid-cols-2 gap-4">
                <FieldInput label="תאריך אספקה" type="date" value={editForm.תאריך_אספקה} onChange={v => setEditForm(f => ({ ...f, תאריך_אספקה: v }))} />
                <FieldInput label="שעת אספקה" type="time" value={editForm.שעת_אספקה} onChange={v => setEditForm(f => ({ ...f, שעת_אספקה: v }))} />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: '#2B1A10' }}>
                <input
                  type="checkbox"
                  checked={editForm.delivery_time_flexible}
                  onChange={e => setEditForm(f => ({ ...f, delivery_time_flexible: e.target.checked }))}
                  className="w-4 h-4"
                />
                גמיש
              </label>

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
                        <Combobox
                          label="מוצר"
                          value={item.מוצר_id || ''}
                          onChange={v => updateProductItem(idx, 'מוצר_id', v)}
                          options={(() => {
                            const visible = products
                              .filter(p => p.פעיל && p.סוג_מוצר === 'מוצר רגיל')
                              .filter(p => {
                                // Business-only products require any business customer type
                                // ('עסקי', 'עסקי - קבוע', 'עסקי - כמות'). Strict equality
                                // to 'עסקי' missed the compound types.
                                if (!p.לקוחות_עסקיים_בלבד) return true;
                                const t = order.לקוחות?.סוג_לקוח || '';
                                return t.startsWith('עסקי');
                              });
                            // Surface base-price hint when a name appears more than
                            // once — same disambiguation as the new-order combobox.
                            const nameCounts = visible.reduce<Record<string, number>>((acc, p) => {
                              const k = String(p.שם_מוצר ?? '').trim();
                              acc[k] = (acc[k] || 0) + 1;
                              return acc;
                            }, {});
                            return visible.map(p => {
                              const k = String(p.שם_מוצר ?? '').trim();
                              const isDup = (nameCounts[k] ?? 0) > 1;
                              return {
                                value: p.id,
                                label: p.שם_מוצר,
                                searchText: normalizeSearchText(p.שם_מוצר),
                                hint: isDup ? `₪${(p.מחיר ?? 0).toFixed(2)}` : undefined,
                              };
                            });
                          })()}
                          placeholder="בחר מוצר..."
                          searchPlaceholder="חיפוש מוצר..."
                          emptyText="לא נמצאו מוצרים"
                        />
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

                      {/* Petit-four selector — capacity-aware */}
                      {(() => {
                        const cap = pkg.גודל_מארז;
                        const info = getCapacityInfo(sumPetitFours(pkg.פטיפורים), cap);
                        const counterStyle = info.state === 'over'
                          ? { backgroundColor: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA' }
                          : info.state === 'full'
                          ? { backgroundColor: '#D5F0E3', color: '#1D6A3D', border: '1px solid #A8DCC0' }
                          : info.state === 'under'
                          ? { backgroundColor: '#FEF3C7', color: '#7C5A1E', border: '1px solid #FCD9A6' }
                          : { backgroundColor: '#EFE4D3', color: '#6B4A2D', border: '1px solid #DDD0BC' };
                        const availableTypes = petitFourTypes.filter(pf =>
                          pf.פעיל && !pkg.פטיפורים.find(x => x.פטיפור_id === pf.id),
                        );
                        return (
                          <div className="border-t pt-3" style={{ borderColor: '#EDE0CE' }}>
                            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold" style={{ color: '#4A2F1B' }}>פטיפורים</span>
                                <span
                                  className="text-[11px] font-medium px-2.5 py-1 rounded-full whitespace-nowrap"
                                  style={counterStyle}
                                >
                                  {info.message}
                                </span>
                              </div>
                              <select
                                value=""
                                onChange={e => { if (e.target.value) addPetitFour(pkgIdx, e.target.value); }}
                                disabled={availableTypes.length === 0 || info.state === 'over'}
                                className="text-xs px-3 py-1.5 rounded-full border bg-white transition-colors hover:bg-amber-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                style={{ borderColor: '#C6A77D', color: '#8B5E34' }}
                              >
                                <option value="">＋ הוסף סוג פטיפור</option>
                                {availableTypes.map(pf => (
                                  <option key={pf.id} value={pf.id}>{pf.שם_פטיפור}</option>
                                ))}
                              </select>
                            </div>
                            {pkg.פטיפורים.length === 0 ? (
                              <p className="text-xs text-center py-3" style={{ color: '#9B7A5A' }}>
                                עדיין לא נבחרו סוגי פטיפורים
                              </p>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2" dir="rtl">
                                {pkg.פטיפורים.map((pf, pfIdx) => {
                                  const others = info.selected - (Number(pf.כמות) || 0);
                                  const maxForThis = cap > 0 ? Math.max(1, cap - others) : undefined;
                                  return (
                                    <div
                                      key={pfIdx}
                                      className="group flex items-center gap-2 px-3 py-2 bg-white rounded-xl border transition-all hover:shadow-sm"
                                      style={{ borderColor: '#E7D2A6' }}
                                    >
                                      <span className="flex-1 text-xs font-medium truncate" style={{ color: '#2B1A10' }} title={pf.שם}>
                                        {pf.שם}
                                      </span>
                                      <input
                                        type="number"
                                        value={pf.כמות}
                                        onChange={e => updatePetitFourQty(pkgIdx, pfIdx, Number(e.target.value))}
                                        className="w-14 px-2 py-1 text-xs border rounded-lg text-center focus:outline-none focus:ring-1"
                                        style={{ borderColor: '#DDD0BC', color: '#2B1A10' }}
                                        min={1}
                                        max={maxForThis}
                                        aria-label={`כמות עבור ${pf.שם}`}
                                      />
                                      <button
                                        type="button"
                                        onClick={() => removePetitFour(pkgIdx, pfIdx)}
                                        className="w-6 h-6 rounded-full flex items-center justify-center transition-colors text-base leading-none opacity-50 group-hover:opacity-100 hover:bg-stone-100"
                                        style={{ color: '#9B7A5A' }}
                                        title="הסר"
                                        aria-label={`הסר ${pf.שם}`}
                                      >
                                        ×
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })()}

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

      {/* ══════════════════════════════════════════════════════════════════════
          Payment-method modal — opens only for receipt / invoice_receipt.
          tax_invoice doesn't use this; it goes through window.confirm directly.
          ══════════════════════════════════════════════════════════════════════ */}
      {payModalDocType && (
        <PaymentMethodModal
          orderNumber={order.מספר_הזמנה}
          documentType={payModalDocType}
          duplicate={(order.חשבוניות ?? []).some(i =>
            payModalDocType === 'invoice_receipt'
              ? (i.סוג_מסמך === 'invoice_receipt' || i.סוג_מסמך === 'חשבונית_מס_קבלה')
              : i.סוג_מסמך === payModalDocType,
          )}
          loading={issuingDoc}
          onClose={() => setPayModalDocType(null)}
          onIssue={async (paymentMethod, force) => {
            const ok = await issueDocument(payModalDocType, paymentMethod, force);
            if (ok) setPayModalDocType(null);
          }}
        />
      )}
    </div>
  );
}

// ─── FinancialActionsBar ─────────────────────────────────────────────────
// Horizontal full-width action bar (~110px tall on desktop) — replaces the
// previous tall card that was tucked into the order-detail aside. Title
// block sits on the start side (RTL = right) and the three action buttons
// fill a sub-grid on the end side. Buttons remain the same DocActionButton
// component used everywhere else; only the layout around them changed.

function FinancialActionsBar({
  invoiceReceiptLoading,
  taxInvoiceLoading,
  receiptLoading,
  busy,
  onIssueInvoiceReceipt,
  onIssueTaxInvoice,
  onIssueReceipt,
}: {
  invoiceReceiptLoading: boolean;
  taxInvoiceLoading: boolean;
  receiptLoading: boolean;
  busy: boolean;
  onIssueInvoiceReceipt: () => void;
  onIssueTaxInvoice: () => void;
  onIssueReceipt: () => void;
}) {
  return (
    <Card style={{ paddingTop: 18, paddingBottom: 18 }}>
      <div
        className="grid items-center gap-4"
        style={{
          // Title column 220-300px, action grid takes the rest. On md and
          // below the columns collapse to one (handled via media-query css
          // — Tailwind doesn't natively support minmax, so this works via
          // gridTemplateColumns at the breakpoint we want).
          gridTemplateColumns: 'minmax(0,1fr)',
        }}
      >
        {/* Inner responsive grid — desktop stacks title|buttons horizontally,
            tablet+mobile stacks them vertically. */}
        <div
          className="grid gap-4 lg:gap-5"
          style={{ gridTemplateColumns: 'minmax(220px,260px) 1fr' }}
        >
          {/* Title block */}
          <div className="min-w-0">
            <div className="flex items-baseline gap-2 mb-1">
              <h3 className="text-[15px] font-bold leading-tight" style={{ color: '#2B1A10', letterSpacing: '-0.01em' }}>
                מסמכים פיננסיים
              </h3>
              <span
                className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md whitespace-nowrap"
                style={{ backgroundColor: '#F4E8D8', color: '#7A4A27', letterSpacing: '0.06em' }}
              >
                ידני בלבד
              </span>
            </div>
            <p className="text-[11.5px] leading-snug" style={{ color: '#8A735F' }}>
              הפקה ידנית של חשבוניות וקבלות להזמנה
            </p>
          </div>

          {/* Action buttons — 3-up at desktop, collapses to 1 col on mobile */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <DocActionButton
              variant="primary"
              title="הפק חשבונית מס קבלה"
              hint="חשבונית וקבלה במסמך אחד"
              loading={invoiceReceiptLoading}
              disabled={busy && !invoiceReceiptLoading}
              onClick={onIssueInvoiceReceipt}
            />
            <DocActionButton
              variant="secondary"
              title="הפק חשבונית מס"
              hint="לתיעוד עסקה ללא קבלה"
              loading={taxInvoiceLoading}
              disabled={busy && !taxInvoiceLoading}
              onClick={onIssueTaxInvoice}
            />
            <DocActionButton
              variant="tertiary"
              title="הפק קבלה"
              hint="לאישור תשלום שהתקבל"
              loading={receiptLoading}
              disabled={busy && !receiptLoading}
              onClick={onIssueReceipt}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

// ─── FinancialDocumentsList ──────────────────────────────────────────────
// Documents list — grouped into the three doc-type categories. Renders
// nothing more than a tiny one-line empty state when there are no docs,
// so we don't bloat the page when the order has only just been created.

type InvRow = { id: string; מספר_חשבונית: string; סכום: number; סטטוס: string; קישור_חשבונית?: string | null; סוג_מסמך?: string | null; תאריך_יצירה?: string | null };

// Strip the internal `manual:` marker from displayed numbers and surface
// it as a "הופקה ידנית" badge instead. Mirrors the helper on /invoices.
function prettyDocNumber(raw: string): { display: string; isManual: boolean } {
  const t = (raw ?? '').trim();
  if (!t) return { display: '', isManual: false };
  if (t.startsWith('manual:')) return { display: t.slice('manual:'.length).trim(), isManual: true };
  return { display: t, isManual: false };
}

// Per-row Hebrew badge tone. Picked so that two same-numbered docs of
// different types are immediately distinguishable at a glance.
const DOC_ROW_BADGE: Record<'receipt' | 'tax_invoice' | 'invoice_receipt' | 'manual_other', { label: string; bg: string; fg: string }> = {
  receipt:         { label: 'קבלה',            bg: '#E8F4EC', fg: '#1F6B3E' },
  tax_invoice:     { label: 'חשבונית מס',       bg: '#EAF2FB', fg: '#1E4E8C' },
  invoice_receipt: { label: 'חשבונית מס קבלה',  bg: '#F4E9DC', fg: '#7A4A27' },
  manual_other:    { label: 'מסמך ידני',        bg: '#F1ECF7', fg: '#5B3A8C' },
};

function rowCategory(i: InvRow): keyof typeof DOC_ROW_BADGE {
  const v = (i.סוג_מסמך ?? '').trim();
  if (v === 'invoice_receipt' || v === 'חשבונית_מס_קבלה') return 'invoice_receipt';
  if (v === 'tax_invoice') return 'tax_invoice';
  if (v === 'receipt') return 'receipt';
  return 'manual_other';
}

function FinancialDocumentsList({ invoices }: { invoices: InvRow[] }) {
  const isInvoiceReceipt = (i: InvRow) => i.סוג_מסמך === 'invoice_receipt' || i.סוג_מסמך === 'חשבונית_מס_קבלה';
  const isTaxInvoice     = (i: InvRow) => i.סוג_מסמך === 'tax_invoice';
  const isReceipt        = (i: InvRow) => i.סוג_מסמך === 'receipt';
  // Fallback bucket: any document whose סוג_מסמך isn't one of the three
  // known types (legacy values, future types, manually-imported docs)
  // surfaces under "מסמכים נוספים" instead of vanishing from the UI.
  const isOther = (i: InvRow) =>
    !isInvoiceReceipt(i) && !isTaxInvoice(i) && !isReceipt(i);
  const groups: { label: string; items: InvRow[] }[] = [
    { label: 'חשבוניות מס קבלה', items: invoices.filter(isInvoiceReceipt) },
    { label: 'חשבוניות מס',      items: invoices.filter(isTaxInvoice) },
    { label: 'קבלות',            items: invoices.filter(isReceipt) },
    { label: 'מסמכים נוספים',    items: invoices.filter(isOther) },
  ].filter(g => g.items.length > 0);

  if (groups.length === 0) {
    return (
      <p className="text-[11.5px] py-1 px-2 text-center" style={{ color: '#8A735F' }}>
        עדיין לא הופקו מסמכים להזמנה זו.
      </p>
    );
  }

  return (
    <Card>
      <p className="text-[10px] uppercase tracking-wider font-semibold mb-3" style={{ color: '#8A735F', letterSpacing: '0.08em' }}>מסמכים שהופקו</p>
      <div className="space-y-3">
        {groups.map(g => (
          <div key={g.label}>
            <p className="text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: '#8A735F', letterSpacing: '0.06em' }}>
              {g.label}
            </p>
            <ul className="space-y-1">
              {g.items.map(inv => {
                const cat = rowCategory(inv);
                const tag = DOC_ROW_BADGE[cat];
                const { display, isManual } = prettyDocNumber(inv.מספר_חשבונית);
                const hasFile = !!inv.קישור_חשבונית;
                return (
                  <li
                    key={inv.id}
                    className="flex justify-between items-center gap-2 text-[13px] px-3 py-2 rounded-lg"
                    style={{ backgroundColor: '#FAF7F0' }}
                  >
                    <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
                      {/* Per-row Hebrew badge so each row carries its own
                          type label (the group header is the only other
                          place this is shown). */}
                      <span
                        className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: tag.bg, color: tag.fg }}
                      >
                        {tag.label}
                      </span>
                      {hasFile ? (
                        <a
                          href={inv.קישור_חשבונית as string}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold hover:underline"
                          style={{ color: '#8B5E34', textUnderlineOffset: '2px' }}
                        >
                          #{display}
                        </a>
                      ) : (
                        <span className="font-semibold" style={{ color: '#2B1A10' }}>#{display}</span>
                      )}
                      {isManual && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded"
                          style={{ color: '#8B5E34', backgroundColor: '#FBF3E4', border: '1px solid #E8D2A8' }}
                          title="המסמך הופק ידנית — לא דרך מורנינג"
                        >
                          הופקה ידנית
                        </span>
                      )}
                      {inv.תאריך_יצירה && (
                        <span className="text-[10.5px]" style={{ color: '#8A735F' }}>
                          {formatDate(inv.תאריך_יצירה)}
                        </span>
                      )}
                      {!hasFile && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded"
                          style={{ color: '#8A735F', backgroundColor: '#EAE0D2' }}
                          title="המסמך הופק ידנית ואין קובץ לצפייה"
                        >
                          אין קובץ במערכת
                        </span>
                      )}
                    </div>
                    <span className="font-semibold tabular-nums" style={{ color: '#8B5E34' }}>
                      {formatCurrency(inv.סכום)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── DocActionButton — premium action bar button for the financial documents
//
// Three variants matching the three doc types:
//   primary   — חשבונית מס קבלה. Mocha → muted-gold gradient, white text.
//               This is the most-used document; it gets the visual weight.
//   secondary — חשבונית מס. Cream surface with brown-gold border, brown text.
//   tertiary  — קבלה. White surface with a soft olive accent ring + brown text.
//
// Hover lifts the card by 1px, deepens the shadow, and strengthens the border.
// Active loading state replaces the title with "מפיק..." and disables the
// other buttons in the bar (handled by the parent through `disabled`).

type DocVariant = 'primary' | 'secondary' | 'tertiary';

function DocActionButton({
  variant, title, hint, onClick, loading, disabled,
}: {
  variant: DocVariant;
  title: string;
  hint: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  // Resting + hover styles per variant. Inline styles only — Tailwind doesn't
  // help with the gradient + brand colors we want here.
  const styles: Record<DocVariant, {
    bg:     string; bgHover: string;
    border: string; borderHover: string;
    text:   string; sub: string;
  }> = {
    primary: {
      bg:          'linear-gradient(135deg, #7A4A27 0%, #8B5E34 55%, #A88554 100%)',
      bgHover:     'linear-gradient(135deg, #6B4022 0%, #7E5230 55%, #B5915E 100%)',
      border:      '#5C3818',
      borderHover: '#4A2D14',
      text:        '#FFFFFF',
      sub:         'rgba(255, 245, 220, 0.82)',
    },
    secondary: {
      bg:          '#FFFCF7',
      bgHover:     '#FAF5E9',
      border:      '#D9B98F',
      borderHover: '#B89870',
      text:        '#2B1A10',
      sub:         '#8A735F',
    },
    tertiary: {
      bg:          '#FBFAF4',
      bgHover:     '#F4F2E8',
      border:      '#C9C8A7',
      borderHover: '#A0A077',
      text:        '#2B1A10',
      sub:         '#8A735F',
    },
  };
  const s = styles[variant];

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className="group text-right rounded-2xl px-4 py-3 transition-all disabled:cursor-not-allowed disabled:opacity-55"
      style={{
        background:    s.bg,
        border:        `1px solid ${s.border}`,
        boxShadow:     variant === 'primary'
                         ? '0 2px 6px rgba(122,74,39,0.20), 0 1px 0 rgba(255,255,255,0.05) inset'
                         : '0 1px 2px rgba(58,42,26,0.04), 0 1px 0 rgba(255,255,255,0.6) inset',
        minHeight:     60,
      }}
      onMouseEnter={e => {
        if (disabled || loading) return;
        e.currentTarget.style.background = s.bgHover;
        e.currentTarget.style.borderColor = s.borderHover;
        e.currentTarget.style.transform = 'translateY(-1px)';
        e.currentTarget.style.boxShadow = variant === 'primary'
          ? '0 4px 12px rgba(122,74,39,0.28), 0 1px 0 rgba(255,255,255,0.08) inset'
          : '0 3px 10px rgba(58,42,26,0.10), 0 1px 0 rgba(255,255,255,0.6) inset';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = s.bg;
        e.currentTarget.style.borderColor = s.border;
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = variant === 'primary'
          ? '0 2px 6px rgba(122,74,39,0.20), 0 1px 0 rgba(255,255,255,0.05) inset'
          : '0 1px 2px rgba(58,42,26,0.04), 0 1px 0 rgba(255,255,255,0.6) inset';
      }}
    >
      <div className="text-[13.5px] font-bold leading-tight" style={{ color: s.text, letterSpacing: '-0.01em' }}>
        {loading ? 'מפיק...' : title}
      </div>
      <div className="text-[10.5px] mt-1 leading-snug" style={{ color: s.sub }}>
        {hint}
      </div>
    </button>
  );
}

// ─── PaymentMethodModal — slim modal opened only by receipt + invoice_receipt
// Doc-type is decided by which button was pressed (no doc-type picker here).
// User picks a payment method and confirms. "אחר" reveals a free-text input;
// the server canonicalises and rejects unsupported names rather than picking
// a silent default.

type DocTypeWithPayment = 'receipt' | 'invoice_receipt';

const DOC_TITLE: Record<DocTypeWithPayment, string> = {
  receipt:         'קבלה',
  invoice_receipt: 'חשבונית מס קבלה',
};

const PAY_OPTIONS: readonly string[] = [
  'כרטיס אשראי', 'מזומן', 'העברה בנקאית', 'ביט', 'PayBox', 'PayPal', 'צ\'ק', 'אחר',
];

function PaymentMethodModal({
  orderNumber, documentType, duplicate, loading, onClose, onIssue,
}: {
  orderNumber: string;
  documentType: DocTypeWithPayment;
  duplicate: boolean;
  loading: boolean;
  onClose: () => void;
  onIssue: (paymentMethod: string, force: boolean) => void | Promise<void>;
}) {
  const [payMethod, setPayMethod] = useState<string>('');
  const [customMethod, setCustomMethod] = useState<string>('');

  const effectiveMethod = payMethod === 'אחר' ? customMethod.trim() : payMethod;
  const canSubmit = !!effectiveMethod;
  const title = DOC_TITLE[documentType];

  const handleIssue = async () => {
    if (!canSubmit) return;
    if (duplicate) {
      const ok = window.confirm(`כבר קיים מסמך מסוג ${title} להזמנה. הפקה נוספת עלולה ליצור כפילות. להמשיך?`);
      if (!ok) return;
    }
    await onIssue(effectiveMethod, duplicate);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 mb-6"
        style={{ direction: 'rtl' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between mb-1">
          <h3 className="text-lg font-bold" style={{ color: '#2B1A10' }}>הפקת {title}</h3>
          <span className="font-mono text-[11px] font-semibold" style={{ color: '#B89870', letterSpacing: '0.05em' }}>{orderNumber}</span>
        </div>
        <p className="text-[12px] mb-5" style={{ color: '#8A735F' }}>
          לפני הפקת ה{title} יש לבחור את אמצעי התשלום שיופיע על המסמך.
        </p>

        <div className="mb-5">
          <p className="text-[11px] uppercase tracking-wider font-semibold mb-2" style={{ color: '#8A735F', letterSpacing: '0.08em' }}>
            אמצעי תשלום <span style={{ color: '#A8442D' }}>*</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            {PAY_OPTIONS.map(m => {
              const active = payMethod === m;
              return (
                <button
                  key={m}
                  onClick={() => setPayMethod(m)}
                  className="text-[13px] font-medium h-10 rounded-lg transition-colors border"
                  style={{
                    backgroundColor: active ? '#7A4A27' : '#FFFFFF',
                    color: active ? '#FFFFFF' : '#2B1A10',
                    borderColor: active ? '#7A4A27' : '#E8DED2',
                  }}
                >
                  {m}
                </button>
              );
            })}
          </div>
          {payMethod === 'אחר' && (
            <div className="mt-2">
              <input
                type="text"
                value={customMethod}
                onChange={e => setCustomMethod(e.target.value)}
                placeholder="הקלידי אמצעי תשלום (PayPlus / Stripe / וכו')"
                className="w-full px-3 h-10 text-[13px] rounded-lg border focus:outline-none focus:ring-2"
                style={{ borderColor: '#E8DED2', color: '#2B1A10' }}
              />
              <p className="text-[10.5px] mt-1" style={{ color: '#8A735F' }}>
                הערך יעבור מיפוי לפי הכללים הקיימים. אם לא נתמך — תוצג שגיאה ולא יופק מסמך.
              </p>
            </div>
          )}
        </div>

        {/* Confirmation strip — visible only after a method is picked.
            Owner-mandated: the user must see the exact method that will go
            on the document before clicking "הפק". If this line shows
            something different from what was picked, do NOT issue. */}
        {effectiveMethod && (
          <div className="text-[12px] mb-3 px-3 py-2.5 rounded-lg" style={{ backgroundColor: '#F1F8EE', color: '#2F5C2C', border: '1px solid #B8D5A8' }}>
            ✓ המסמך יופק עם אמצעי תשלום: <strong>{effectiveMethod}</strong>
          </div>
        )}

        {duplicate && (
          <div className="text-[11.5px] mb-4 px-3 py-2 rounded-lg" style={{ backgroundColor: '#FFF7ED', color: '#92602A', border: '1px solid #FCD9A8' }}>
            ⚠ קיים כבר מסמך {title} להזמנה זו. הפקה נוספת תיצור כפילות (תידרש אישור נוסף).
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 h-10 text-[13px] font-medium rounded-lg border transition-colors disabled:opacity-50"
            style={{ borderColor: '#E8DED2', color: '#8A735F' }}
          >
            ביטול
          </button>
          <button
            onClick={handleIssue}
            disabled={!canSubmit || loading}
            className="px-5 h-10 text-[13px] font-semibold rounded-lg text-white transition-colors disabled:opacity-50"
            style={{ backgroundColor: '#7A4A27' }}
          >
            {loading ? 'מפיק...' : `הפק ${title}`}
          </button>
        </div>
      </div>
    </div>
  );
}
