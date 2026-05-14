'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { PageLoading } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ActionBtn } from '@/components/ui/RowActions';
import { Tabs } from '@/components/ui/Tabs';
import { Modal } from '@/components/ui/Modal';
import { IconEye, IconExport, IconEdit, IconTrash, IconWhatsApp } from '@/components/icons';
import type { Delivery, Courier } from '@/types/database';
import Link from 'next/link';
import { exportToCsv } from '@/lib/exportCsv';
import { buildCourierWhatsAppMessage, type CourierItem } from '@/lib/courier-notification';
import toast from 'react-hot-toast';

// ─── Status config ─────────────────────────────────────────────────────────

const VALID_STATUSES: Delivery['סטטוס_משלוח'][] = ['ממתין', 'נאסף', 'נמסר'];

const STATUS_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  'ממתין': { bg: '#FEFCE8', color: '#854D0E', border: '#FEF08A' },
  'נאסף':  { bg: '#FFF7ED', color: '#C2610F', border: '#FED7AA' },
  'נמסר':  { bg: '#ECFDF5', color: '#065F46', border: '#6EE7B7' },
};

// ─── Status badge ──────────────────────────────────────────────────────────

function DeliveryStatusBadge({
  status,
  deliveryId,
  noRecord,
  onUpdate,
  onMarkDelivered,
}: {
  status: Delivery['סטטוס_משלוח'];
  deliveryId: string;
  noRecord?: boolean;
  onUpdate: (id: string, s: string) => void;
  onMarkDelivered?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isDelivered = status === 'נמסר';

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const style = STATUS_STYLE[status] ?? STATUS_STYLE['ממתין'];

  const handleSelect = (s: Delivery['סטטוס_משלוח']) => {
    setOpen(false);
    if (s === 'נמסר') {
      onMarkDelivered?.();
    } else {
      onUpdate(deliveryId, s);
    }
  };

  return (
    <div ref={ref} className="relative inline-block" dir="rtl">
      <button
        onClick={() => { if (!isDelivered) setOpen(v => !v); }}
        disabled={isDelivered}
        className="inline-flex items-center gap-1 text-xs font-medium rounded-full px-2.5 py-0.5 border transition-all"
        style={{
          backgroundColor: style.bg,
          color: style.color,
          borderColor: style.border,
          cursor: isDelivered ? 'default' : 'pointer',
        }}
        title={isDelivered ? 'סטטוס סופי' : 'לחץ לשינוי סטטוס'}
      >
        {status}
        {!noRecord && !isDelivered && (
          <svg className="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {open && (
        <div
          className="absolute top-full mt-1 right-0 z-50 rounded-xl shadow-lg border py-1 min-w-[110px]"
          style={{ backgroundColor: '#FFFFFF', borderColor: '#E5DDD3' }}
        >
          {VALID_STATUSES.map(s => {
            const st = STATUS_STYLE[s];
            const isCurrent = s === status;
            return (
              <button
                key={s}
                onClick={() => handleSelect(s)}
                className="w-full text-right px-3 py-1.5 text-xs flex items-center gap-2 transition-colors"
                style={{
                  backgroundColor: isCurrent ? st.bg : 'transparent',
                  color: isCurrent ? st.color : '#3D2A1A',
                  fontWeight: isCurrent ? 600 : 400,
                }}
                onMouseEnter={e => { if (!isCurrent) (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#FAF7F2'; }}
                onMouseLeave={e => { if (!isCurrent) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; }}
              >
                <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: st.color }} />
                {s}
                {isCurrent && <span className="mr-auto text-xs opacity-60">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Types ─────────────────────────────────────────────────────────────────

type DeliveryWithCourier = Delivery & {
  שליחים?: { id: string; שם_שליח: string; טלפון_שליח: string } | null;
};

type OrderJoin = {
  מספר_הזמנה: string;
  שם_מקבל?: string | null;
  לקוח_id?: string;
  לקוחות?: { שם_פרטי: string; שם_משפחה: string } | null;
};

interface CourierWithStats extends Courier {
  stats: { ממתין: number; נאסף: number; נמסר: number; total: number };
}

interface PlacedForm {
  שעת_הנחה: string;
  מקום_הנחה: string;
  הערה: string;
}

// ─── Deliveries tab ────────────────────────────────────────────────────────

function DeliveriesContent() {
  const searchParams = useSearchParams();
  // Default: no date filter — show all deliveries
  const defaultDate = searchParams.get('date') || '';
  // Optional ?highlight=<deliveryId> from the dashboard's "פתח משלוח" button.
  // The matching row gets a soft golden ring + scrollIntoView when the data
  // arrives. Highlight clears on first user interaction.
  const highlightId = searchParams.get('highlight') || '';

  const [deliveries, setDeliveries] = useState<DeliveryWithCourier[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(defaultDate);
  const [statusFilter, setStatusFilter] = useState('');
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [highlight, setHighlight] = useState(highlightId);

  const [placedDelivery, setPlacedDelivery] = useState<DeliveryWithCourier | null>(null);
  const [placedForm, setPlacedForm] = useState<PlacedForm>({ שעת_הנחה: '', מקום_הנחה: '', הערה: '' });
  const [savingPlaced, setSavingPlaced] = useState(false);
  const [assigningCourier, setAssigningCourier] = useState<string | null>(null);
  const [generatingToken, setGeneratingToken] = useState<string | null>(null);
  // Popup-blocked fallback: when window.open() returns null, surface a manual button
  const [blockedWhatsApp, setBlockedWhatsApp] = useState<string | null>(null);
  // Delete-confirmation modal state. Holds the delivery being deleted; null = closed.
  const [deletingDelivery, setDeletingDelivery] = useState<DeliveryWithCourier | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Delete a single delivery row. The DELETE endpoint is admin-only and only
  // touches the משלוחים table — the order, customer, invoices, and inventory
  // ledger are explicitly NOT touched (see route.ts). Synthetic placeholder
  // rows (no underlying DB record) are removed from local state without an
  // API call.
  const confirmDeleteDelivery = async () => {
    if (!deletingDelivery) return;
    const target = deletingDelivery;

    // Synthetic row — there's no משלוחים row to DELETE; the row is
    // re-generated from the order on every refetch. To make the dismissal
    // stick, mark the order itself with hide_from_deliveries=true so the
    // placeholder query in /api/deliveries skips it forever (added in
    // migration 031). Then refetch — proves the row really is gone.
    if (target._noRecord || target.id.startsWith('no-record-')) {
      const orderId = target.הזמנה_id;
      if (!orderId) {
        toast.error('לא ניתן למחוק — חסר מזהה הזמנה.');
        return;
      }
      setDeleting(true);
      try {
        const res = await fetch(`/api/orders/${orderId}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ hide_from_deliveries: true }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(json.error || 'לא ניתן להסיר את המשלוח. נסי שוב.');
          return;
        }
        setDeletingDelivery(null);
        toast.success('המשלוח נמחק בהצלחה');
        await loadDeliveries(); // Refetch — proves it's gone, not just hidden in state.
      } catch {
        toast.error('לא ניתן להסיר את המשלוח. נסי שוב.');
      } finally {
        setDeleting(false);
      }
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch(`/api/deliveries/${target.id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || 'לא ניתן למחוק את המשלוח. נסי שוב.');
        return;
      }
      setDeletingDelivery(null);
      toast.success('המשלוח נמחק בהצלחה');
      await loadDeliveries(); // Refetch — confirms the row is gone server-side.
    } catch {
      toast.error('לא ניתן למחוק את המשלוח. נסי שוב.');
    } finally {
      setDeleting(false);
    }
  };

  // Load active couriers once
  useEffect(() => {
    fetch('/api/couriers')
      .then(r => r.json())
      .then(({ data }) => setCouriers((data || []).filter((c: CourierWithStats) => c.פעיל)));
  }, []);

  // Once the deliveries are loaded, scroll the highlighted row into view
  // (a one-shot effect — the highlight is cleared after a few seconds so a
  // refresh doesn't keep flashing the same row).
  useEffect(() => {
    if (!highlight || loading || deliveries.length === 0) return;
    const t = window.setTimeout(() => {
      const el = document.getElementById(`delivery-row-${highlight}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
    const clearAt = window.setTimeout(() => setHighlight(''), 4000);
    return () => { window.clearTimeout(t); window.clearTimeout(clearAt); };
  }, [highlight, loading, deliveries]);

  // Reload deliveries from the server. Extracted so the delete handler
  // can refetch after a synthetic-row dismissal — without a refetch the
  // placeholder query would re-generate the row from scratch and the
  // operator would see it come back.
  const loadDeliveries = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (statusFilter) params.set('status', statusFilter);
    try {
      const res = await fetch(`/api/deliveries?${params}`);
      const { data, error } = await res.json();
      console.log('[deliveries] received:', (data || []).length, 'rows | date filter:', date || 'none', '| error:', error || 'none');
      setDeliveries(data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDeliveries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, statusFilter]);

  // Try to open WhatsApp; returns false if browser blocked the popup.
  const openWhatsAppWithFallback = (url: string): boolean => {
    const win = window.open(url, '_blank');
    return !!(win && !win.closed);
  };

  const updateDeliveryStatus = async (id: string, newStatus: string) => {
    const res = await fetch(`/api/deliveries/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ סטטוס_משלוח: newStatus }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error || 'שגיאה בעדכון סטטוס');
      return;
    }

    // Update local state — if a delivery record was just auto-created, replace synthetic row
    setDeliveries(prev => prev.map(d => {
      if (d.id !== id) return d;
      const order = (d as DeliveryWithCourier & { הזמנות?: OrderJoin }).הזמנות;
      if (json.was_created && json.data) {
        return { ...d, ...json.data, _noRecord: false, הזמנות: order, שליחים: d.שליחים };
      }
      return {
        ...d,
        סטטוס_משלוח: newStatus as Delivery['סטטוס_משלוח'],
        delivery_token: json.token || d.delivery_token,
        whatsapp_sent_at: json.data?.whatsapp_sent_at || d.whatsapp_sent_at,
        email_sent_at: json.data?.email_sent_at || d.email_sent_at,
      };
    }));

    if (newStatus === 'נאסף') {
      console.log('[deliveries] נאסף trigger — whatsapp_url:', !!json.whatsapp_url, '| send_error:', json.send_error);

      if (json.send_error) {
        // e.g. "חסר טלפון לשליח" — surface verbatim
        toast.error(json.send_error);
        return;
      }

      if (json.whatsapp_url) {
        const opened = openWhatsAppWithFallback(json.whatsapp_url);
        if (opened) {
          toast.success('וואטסאפ נפתח לשליח — יש ללחוץ שליחה');
        } else {
          setBlockedWhatsApp(json.whatsapp_url);
          toast('הדפדפן חסם את הפתיחה — יש ללחוץ "פתח וואטסאפ לשליח"', { icon: '⚠️' });
        }
      } else {
        toast.success('סטטוס עודכן ל"נאסף"');
      }
    }
  };

  const openPlacedModal = (delivery: DeliveryWithCourier) => {
    setPlacedDelivery(delivery);
    setPlacedForm({ שעת_הנחה: '', מקום_הנחה: '', הערה: '' });
  };

  const confirmPlaced = async () => {
    if (!placedDelivery) return;
    setSavingPlaced(true);
    try {
      const parts = [
        placedForm.מקום_הנחה && `הונח ב: ${placedForm.מקום_הנחה}`,
        placedForm.שעת_הנחה && `שעה: ${placedForm.שעת_הנחה}`,
        placedForm.הערה,
      ].filter(Boolean);
      const note = parts.join(' | ');
      const res = await fetch(`/api/deliveries/${placedDelivery.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          סטטוס_משלוח: 'נמסר',
          שעת_משלוח: placedForm.שעת_הנחה || null,
          הערות: note || null,
          delivered_at: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'שגיאה');
      }
      // Remove from active list — it moves to archive tab
      setDeliveries(prev => prev.filter(d => d.id !== placedDelivery.id));
      toast.success('המשלוח סומן כנמסר ועבר לארכיון');
      setPlacedDelivery(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setSavingPlaced(false);
    }
  };

  const assignCourier = async (deliveryId: string, courierId: string | null) => {
    setAssigningCourier(deliveryId);
    try {
      const res = await fetch(`/api/deliveries/${deliveryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courier_id: courierId || null }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'שגיאה בשיוך שליח');
        return;
      }
      const assigned = courierId ? couriers.find(c => c.id === courierId) : null;
      setDeliveries(prev => prev.map(d => {
        if (d.id !== deliveryId) return d;
        const order = (d as DeliveryWithCourier & { הזמנות?: OrderJoin }).הזמנות;
        const courierData = assigned
          ? { id: assigned.id, שם_שליח: assigned.שם_שליח, טלפון_שליח: assigned.טלפון_שליח }
          : null;
        if (json.was_created && json.data) {
          return { ...d, ...json.data, _noRecord: false, הזמנות: order, שליחים: courierData };
        }
        return { ...d, courier_id: courierId, שליחים: courierData };
      }));
      toast.success(courierId ? 'שליח שויך' : 'שליח הוסר');
    } finally {
      setAssigningCourier(null);
    }
  };

  const generateLink = async (delivery: DeliveryWithCourier) => {
    setGeneratingToken(delivery.id);
    try {
      const res = await fetch(`/api/deliveries/${delivery.id}/token`, { method: 'POST' });
      const { link, token, error } = await res.json();
      if (error) { toast.error(error); return; }
      await navigator.clipboard.writeText(link);
      setDeliveries(prev => prev.map(d =>
        d.id === delivery.id ? { ...d, delivery_token: token } : d,
      ));
      toast.success('קישור הועתק ללוח');
    } catch {
      toast.error('שגיאה ביצירת קישור');
    } finally {
      setGeneratingToken(null);
    }
  };

  // Manual "שלח לשליח" — always WhatsApp (per user spec). Email lives on a separate ✉️ button.
  const handleSendToCourier = (delivery: DeliveryWithCourier) => {
    const courier = delivery.courier_id ? couriers.find(c => c.id === delivery.courier_id) : null;
    if (!courier) { toast.error('לא שויך שליח'); return; }
    if (!courier.טלפון_שליח) { toast.error('חסר טלפון לשליח'); return; }
    sendToCourier(delivery, 'whatsapp');
  };

  const sendToCourier = async (delivery: DeliveryWithCourier, channel: 'whatsapp' | 'email') => {
    const courier = delivery.courier_id ? couriers.find(c => c.id === delivery.courier_id) : null;
    if (!courier) { toast.error('לא שויך שליח'); return; }

    if (channel === 'whatsapp') {
      if (!courier.טלפון_שליח) { toast.error('חסר טלפון לשליח'); return; }

      let link = '';
      let token = delivery.delivery_token;
      if (!token) {
        const res = await fetch(`/api/deliveries/${delivery.id}/token`, { method: 'POST' });
        const data = await res.json();
        if (data.error) { toast.error(data.error); return; }
        link = data.link;
        token = data.token as string;
        setDeliveries(prev => prev.map(d =>
          d.id === delivery.id ? { ...d, delivery_token: token as string } : d,
        ));
      } else {
        link = `${window.location.origin}/delivery-update/${token}`;
      }

      // Pull full delivery + order details from the public token endpoint
      // (same source the courier link page uses) so the WhatsApp body and
      // the courier page render identical content. Best-effort — if the
      // fetch fails the message degrades to "open the link".
      type DetailsResponse = {
        delivery?: {
          recipientName?: string | null; recipientPhone?: string | null;
          addressStreet?: string | null; addressCity?: string | null;
          deliveryDate?: string | null;  deliveryTime?: string | null;
          deliveryNotes?: string | null;
          orderNumber?: string | null;
          items?: CourierItem[];
        };
      };
      let details: DetailsResponse['delivery'] = {};
      try {
        const r = await fetch(`/api/delivery-update/${token}`);
        if (r.ok) {
          const j = (await r.json()) as DetailsResponse;
          details = j.delivery || {};
        }
      } catch { /* fall through with empty details */ }

      const message = buildCourierWhatsAppMessage({
        deliveryUpdateUrl: link,
        recipientName:  details?.recipientName  ?? null,
        recipientPhone: details?.recipientPhone ?? null,
        addressStreet:  details?.addressStreet  ?? null,
        addressCity:    details?.addressCity    ?? null,
        deliveryDate:   details?.deliveryDate   ?? null,
        deliveryTime:   details?.deliveryTime   ?? null,
        orderNumber:    details?.orderNumber    ?? null,
        items:          details?.items          ?? [],
        deliveryNotes:  details?.deliveryNotes  ?? null,
      });

      let phone = courier.טלפון_שליח.replace(/[^0-9]/g, '');
      if (phone.startsWith('0')) phone = '972' + phone.slice(1);
      const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
      const opened = openWhatsAppWithFallback(url);

      await fetch(`/api/deliveries/${delivery.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whatsapp_sent_at: new Date().toISOString() }),
      });
      setDeliveries(prev => prev.map(d =>
        d.id === delivery.id ? { ...d, whatsapp_sent_at: new Date().toISOString() } : d,
      ));

      if (opened) {
        toast.success('וואטסאפ נפתח לשליח — יש ללחוץ שליחה');
      } else {
        setBlockedWhatsApp(url);
        toast('הדפדפן חסם את הפתיחה — יש ללחוץ "פתח וואטסאפ לשליח"', { icon: '⚠️' });
      }
      return;
    }

    // Email — manual only, separate ✉️ button
    if (!courier.אימייל_שליח) { toast.error('אין אימייל לשליח'); return; }
    const res = await fetch(`/api/deliveries/${delivery.id}/send-courier-email`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error || 'שגיאה בשליחת מייל'); return; }
    setDeliveries(prev => prev.map(d =>
      d.id === delivery.id
        ? { ...d, email_sent_at: new Date().toISOString(), delivery_token: data.token || d.delivery_token }
        : d,
    ));
    toast.success(`מייל נשלח לשליח (${courier.אימייל_שליח})`);
  };

  const handleExport = () => {
    exportToCsv('משלוחים.csv',
      ['מספר הזמנה', 'לקוח', 'כתובת', 'עיר', 'תאריך משלוח', 'סטטוס', 'שליח'],
      deliveries.map(d => {
        const order = (d as DeliveryWithCourier & { הזמנות?: OrderJoin }).הזמנות;
        const customerName = order?.לקוחות
          ? `${order.לקוחות.שם_פרטי} ${order.לקוחות.שם_משפחה}`
          : order?.שם_מקבל || '';
        const courierName = d.שליחים?.שם_שליח || d.שם_שליח || '';
        return [order?.מספר_הזמנה || '', customerName, d.כתובת || '', d.עיר || '', d.תאריך_משלוח || '', d.סטטוס_משלוח, courierName];
      }),
    );
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3">
        <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-44" label="" />
        <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-44">
          <option value="">כל הסטטוסים</option>
          {(['ממתין', 'נאסף'] as const).map(s => <option key={s} value={s}>{s}</option>)}
        </Select>
        {/* Active deliveries: hide נמסר — those live in ארכיון tab */}
        <span className="text-sm mr-auto" style={{ color: '#6B4A2D' }}>
          {deliveries.filter(d => d.סטטוס_משלוח !== 'נמסר').length} משלוחים פעילים
        </span>
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border bg-white hover:bg-[#FAF7F2] transition-all"
          style={{ borderColor: '#D8CCBA', color: '#8B5E34' }}
        >
          <IconExport className="w-3.5 h-3.5" />
          ייצוא לאקסל
        </button>
      </div>

      {/* Delivery cards — active only (exclude נמסר) */}
      {loading ? <PageLoading /> : deliveries.filter(d => d.סטטוס_משלוח !== 'נמסר').length === 0 ? (
        <EmptyState title="אין משלוחים פעילים" description="כל המשלוחים נמסרו או אין משלוחים לתצוגה" />
      ) : (
        <div className="space-y-3">
          {deliveries.filter(d => d.סטטוס_משלוח !== 'נמסר').map(d => {
            const order = (d as DeliveryWithCourier & { הזמנות?: OrderJoin }).הזמנות;
            const customerName = order?.לקוחות
              ? `${order.לקוחות.שם_פרטי} ${order.לקוחות.שם_משפחה}`
              : order?.שם_מקבל || null;
            const courierPhone = d.שליחים?.טלפון_שליח || d.טלפון_שליח || null;
            const assignedCourier = d.courier_id ? couriers.find(c => c.id === d.courier_id) : null;
            const canSendToCourier = !d._noRecord && !!assignedCourier &&
              !!(assignedCourier.טלפון_שליח || assignedCourier.אימייל_שליח);
            const isHighlighted = !!highlight && d.id === highlight;

            return (
              <div
                key={d.id}
                id={`delivery-row-${d.id}`}
                style={isHighlighted ? {
                  borderRadius: '14px',
                  boxShadow: '0 0 0 3px #C9A46A, 0 8px 22px rgba(201,164,106,0.18)',
                  transition: 'box-shadow 400ms ease',
                } : undefined}
              >
              <Card>
                <div className="flex items-start justify-between gap-4">
                  {/* Left: info */}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    {/* Order # + status + date */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/orders/${d.הזמנה_id}`}
                        className="font-mono text-xs font-semibold hover:underline"
                        style={{ color: '#7C5230' }}
                      >
                        {order?.מספר_הזמנה || `#${d.הזמנה_id?.slice(0, 8)}`}
                      </Link>
                      <DeliveryStatusBadge
                        status={d.סטטוס_משלוח}
                        deliveryId={d.id}
                        noRecord={!!d._noRecord}
                        onUpdate={updateDeliveryStatus}
                        onMarkDelivered={() => openPlacedModal(d)}
                      />
                      {d.תאריך_משלוח && (
                        <span className="text-xs" style={{ color: '#7A5840' }}>
                          {d.תאריך_משלוח}{d.שעת_משלוח && ` · ${d.שעת_משלוח}`}
                        </span>
                      )}
                    </div>

                    {/* Customer */}
                    <div className="text-sm font-medium">
                      {customerName ? (
                        order?.לקוח_id ? (
                          <Link href={`/customers/${order.לקוח_id}`} className="hover:underline" style={{ color: '#1E120A' }}>
                            {customerName}
                          </Link>
                        ) : (
                          <span style={{ color: '#1E120A' }}>{customerName}</span>
                        )
                      ) : (
                        <span style={{ color: '#9B7A5A' }}>לא משויך</span>
                      )}
                    </div>

                    {/* Address */}
                    {(d.כתובת || d.עיר) && (
                      <div className="text-xs" style={{ color: '#6B4A2D' }}>
                        {[d.כתובת, d.עיר].filter(Boolean).join(', ')}
                      </div>
                    )}

                    {/* Courier selector */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs" style={{ color: '#7A5840' }}>שליח:</span>
                      <select
                        value={d.courier_id || ''}
                        onChange={e => assignCourier(d.id, e.target.value || null)}
                        disabled={assigningCourier === d.id}
                        className="text-xs rounded-lg px-2 py-0.5 border"
                        style={{
                          borderColor: '#C8B89E',
                          color: d.courier_id ? '#1E120A' : '#B0A090',
                          backgroundColor: 'white',
                          minWidth: '130px',
                        }}
                      >
                        <option value="">— לא משויך —</option>
                        {couriers.map(c => (
                          <option key={c.id} value={c.id}>{c.שם_שליח}</option>
                        ))}
                      </select>
                      {courierPhone && !d._noRecord && (
                        <a href={`tel:${courierPhone}`} dir="ltr" className="text-xs hover:underline" style={{ color: '#7C5230' }}>
                          {courierPhone}
                        </a>
                      )}
                    </div>

                    {/* Sent indicator */}
                    {(d.whatsapp_sent_at || d.email_sent_at) && (
                      <div className="text-xs flex items-center gap-1" style={{ color: '#059669' }}>
                        {d.whatsapp_sent_at
                          ? <><IconWhatsApp className="w-3 h-3" />WhatsApp נשלח</>
                          : <>✉️ מייל נשלח לשליח</>}
                      </div>
                    )}

                    {/* Delivery instructions */}
                    {d.הוראות_משלוח && (
                      <div className="text-xs p-2 rounded" style={{ backgroundColor: '#FAF7F0', color: '#6B4A2D' }}>
                        {d.הוראות_משלוח}
                      </div>
                    )}

                    {/* Notes */}
                    {d.הערות && (
                      <div className="text-xs p-2 rounded" style={{ backgroundColor: '#F0F9FF', color: '#1E3A5F' }}>
                        {d.הערות}
                      </div>
                    )}
                  </div>

                  {/* Right: actions */}
                  <div className="flex flex-col gap-1.5 flex-shrink-0 items-end">
                    <ActionBtn title="צפייה בהזמנה" href={`/orders/${d.הזמנה_id}`} icon={<IconEye className="w-4 h-4" />} />

                    {!d._noRecord && (
                      <button
                        onClick={() => generateLink(d)}
                        disabled={generatingToken === d.id}
                        title={d.delivery_token ? 'העתק קישור לשליח' : 'צור קישור לשליח'}
                        className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap border"
                        style={{
                          backgroundColor: d.delivery_token ? '#F0FDF4' : '#F5F3FF',
                          color: d.delivery_token ? '#15803D' : '#6D28D9',
                          borderColor: d.delivery_token ? '#BBF7D0' : '#DDD6FE',
                        }}
                      >
                        {generatingToken === d.id ? '...' : d.delivery_token ? '🔗 העתק קישור' : '🔗 צור קישור'}
                      </button>
                    )}

                    {canSendToCourier && assignedCourier?.טלפון_שליח && (
                      <button
                        onClick={() => handleSendToCourier(d)}
                        title="שלח לשליח בוואטסאפ"
                        className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap border flex items-center gap-1"
                        style={{ backgroundColor: '#F0FDF4', color: '#15803D', borderColor: '#86EFAC' }}
                      >
                        <IconWhatsApp className="w-3 h-3" />שלח לשליח
                      </button>
                    )}
                    {canSendToCourier && assignedCourier?.אימייל_שליח && (
                      <button
                        onClick={() => sendToCourier(d, 'email')}
                        title="שלח אימייל לשליח"
                        className="text-xs px-2 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap border"
                        style={{ backgroundColor: '#FFF', color: '#6B4A2D', borderColor: '#DDD0BC' }}
                      >
                        ✉️
                      </button>
                    )}

                    {/* Delete delivery — last in the column so it doesn't compete
                        with the primary actions. Deletes the משלוחים row only;
                        the linked order is untouched. Confirmed in a modal. */}
                    <button
                      onClick={() => setDeletingDelivery(d)}
                      title="מחק משלוח"
                      aria-label="מחק משלוח"
                      className="text-xs px-2 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap border flex items-center gap-1"
                      style={{ backgroundColor: '#FFFFFF', color: '#9D4B4A', borderColor: '#E4C2BE' }}
                    >
                      <IconTrash className="w-3.5 h-3.5" />
                      מחק
                    </button>
                  </div>
                </div>
              </Card>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete-delivery confirmation. Stronger warning copy when the row was
          already 'נמסר' (the operator is unwinding a completed delivery). */}
      <Modal
        open={!!deletingDelivery}
        onClose={() => { if (!deleting) setDeletingDelivery(null); }}
        title="מחיקת משלוח"
      >
        {deletingDelivery && (
          <div className="space-y-4">
            {deletingDelivery.סטטוס_משלוח === 'נמסר' ? (
              <p className="text-sm" style={{ color: '#9D4B4A', fontWeight: 600 }}>
                המשלוח כבר סומן כנמסר. למחוק בכל זאת?
              </p>
            ) : (
              <p className="text-sm" style={{ color: '#1E120A', fontWeight: 600 }}>
                למחוק את המשלוח?
              </p>
            )}
            <p className="text-xs" style={{ color: '#6B4A2D' }}>
              הפעולה תמחק את רשומת המשלוח בלבד. ההזמנה עצמה לא תימחק.
              {deletingDelivery.delivery_token && ' הקישור הציבורי שנשלח לשליח כבר לא יעבוד.'}
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setDeletingDelivery(null)} disabled={deleting}>
                ביטול
              </Button>
              <button
                onClick={confirmDeleteDelivery}
                disabled={deleting}
                className="px-4 h-10 text-sm font-semibold rounded-xl text-white transition-colors disabled:opacity-60"
                style={{ backgroundColor: '#9D4B4A' }}
              >
                {deleting ? 'מוחק...' : 'מחק משלוח'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Mark delivered modal */}
      <Modal open={!!placedDelivery} onClose={() => setPlacedDelivery(null)} title="סמן משלוח כנמסר">
        <div className="space-y-4">
          <p className="text-sm" style={{ color: '#6B4A2D' }}>
            הזמנה:{' '}
            <span className="font-semibold" style={{ color: '#1E120A' }}>
              {(placedDelivery as (DeliveryWithCourier & { הזמנות?: { מספר_הזמנה: string } }) | null)?.הזמנות?.מספר_הזמנה || '—'}
            </span>
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="שעת מסירה"
              type="time"
              value={placedForm.שעת_הנחה}
              onChange={e => setPlacedForm(p => ({ ...p, שעת_הנחה: e.target.value }))}
            />
            <Input
              label="מקום מסירה"
              placeholder="לדוגמה: דלת כניסה"
              value={placedForm.מקום_הנחה}
              onChange={e => setPlacedForm(p => ({ ...p, מקום_הנחה: e.target.value }))}
            />
          </div>
          <Textarea
            label="הערה"
            rows={2}
            placeholder="הערה נוספת (לא חובה)"
            value={placedForm.הערה}
            onChange={e => setPlacedForm(p => ({ ...p, הערה: e.target.value }))}
          />
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setPlacedDelivery(null)}>ביטול</Button>
            <Button onClick={confirmPlaced} loading={savingPlaced}>אשר מסירה</Button>
          </div>
        </div>
      </Modal>

      {/* Popup-blocked fallback: shows when window.open() was blocked by the browser */}
      <Modal
        open={!!blockedWhatsApp}
        onClose={() => setBlockedWhatsApp(null)}
        title='פתיחת וואטסאפ נחסמה ע״י הדפדפן'
      >
        {blockedWhatsApp && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: '#6B4A2D' }}>
              הדפדפן חסם את הפתיחה האוטומטית. לחצי על הכפתור כדי לפתוח את וואטסאפ עם ההודעה המוכנה.
            </p>
            <a
              href={blockedWhatsApp}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setBlockedWhatsApp(null)}
              className="flex items-center justify-center gap-2 w-full px-4 py-4 rounded-xl text-base font-bold transition-all"
              style={{ backgroundColor: '#15803D', color: '#FFF' }}
            >
              <IconWhatsApp className="w-5 h-5" />
              פתח וואטסאפ לשליח
            </a>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(blockedWhatsApp);
                toast.success('הקישור הועתק');
              }}
              className="w-full py-2.5 text-sm font-medium rounded-xl border transition-all"
              style={{ borderColor: '#DDD0BC', color: '#6B4A2D', backgroundColor: '#FFFFFF' }}
            >
              העתק קישור
            </button>
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setBlockedWhatsApp(null)}>ביטול</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── Couriers tab ──────────────────────────────────────────────────────────

function CouriersContent() {
  const [couriers, setCouriers] = useState<CourierWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CourierWithStats | null>(null);
  const [form, setForm] = useState({ שם_שליח: '', טלפון_שליח: '', אימייל_שליח: '', הערות: '', פעיל: true });
  const [saving, setSaving] = useState(false);

  const loadCouriers = () => {
    setLoading(true);
    fetch('/api/couriers')
      .then(r => r.json())
      .then(({ data }) => setCouriers(data || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadCouriers(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ שם_שליח: '', טלפון_שליח: '', אימייל_שליח: '', הערות: '', פעיל: true });
    setModalOpen(true);
  };

  const openEdit = (c: CourierWithStats) => {
    setEditing(c);
    setForm({ שם_שליח: c.שם_שליח, טלפון_שליח: c.טלפון_שליח, אימייל_שליח: c.אימייל_שליח || '', הערות: c.הערות || '', פעיל: c.פעיל });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.שם_שליח.trim()) {
      toast.error('שם שליח הוא שדה חובה');
      return;
    }
    if (!form.טלפון_שליח.trim() && !form.אימייל_שליח.trim()) {
      toast.error('חובה להזין טלפון או אימייל לשליח');
      return;
    }
    setSaving(true);
    try {
      const url = editing ? `/api/couriers/${editing.id}` : '/api/couriers';
      const method = editing ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const j = await res.json();
        toast.error(j.error || 'שגיאה בשמירה');
        return;
      }
      toast.success(editing ? 'שליח עודכן' : 'שליח נוסף');
      setModalOpen(false);
      loadCouriers();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('לסמן שליח זה כלא פעיל?')) return;
    const res = await fetch(`/api/couriers/${id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error('שגיאה במחיקה'); return; }
    toast.success('שליח הוסר');
    setCouriers(prev => prev.map(c => c.id === id ? { ...c, פעיל: false } : c));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm" style={{ color: '#6B4A2D' }}>
          {couriers.filter(c => c.פעיל).length} שליחים פעילים
        </span>
        <Button size="sm" onClick={openNew}>+ הוסף שליח</Button>
      </div>

      {loading ? <PageLoading /> : couriers.length === 0 ? (
        <EmptyState title="אין שליחים" description="הוסף שליח ראשון" />
      ) : (
        <div className="space-y-3">
          {couriers.map(c => (
            <Card key={c.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm" style={{ color: '#1E120A' }}>{c.שם_שליח}</span>
                    {!c.פעיל && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: '#F3F4F6', color: '#6B7280', border: '1px solid #E5E7EB' }}
                      >
                        לא פעיל
                      </span>
                    )}
                  </div>
                  <a href={`tel:${c.טלפון_שליח}`} dir="ltr" className="text-sm hover:underline block" style={{ color: '#7C5230' }}>
                    {c.טלפון_שליח}
                  </a>
                  {c.הערות && (
                    <div className="text-xs" style={{ color: '#7A5840' }}>{c.הערות}</div>
                  )}
                  {/* Delivery stats */}
                  <div className="flex gap-2 flex-wrap pt-0.5">
                    {c.stats.total === 0 ? (
                      <span className="text-xs" style={{ color: '#B0A090' }}>אין משלוחים</span>
                    ) : (
                      (['ממתין', 'נאסף', 'נמסר'] as const).map(s => {
                        const count = c.stats[s];
                        if (count === 0) return null;
                        const st = STATUS_STYLE[s];
                        return (
                          <span
                            key={s}
                            className="text-xs px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: st.bg, color: st.color, border: `1px solid ${st.border}` }}
                          >
                            {s}: {count}
                          </span>
                        );
                      })
                    )}
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <ActionBtn title="עריכה" onClick={() => openEdit(c)} icon={<IconEdit className="w-4 h-4" />} />
                  {c.פעיל && (
                    <ActionBtn
                      title="הסרה"
                      variant="danger"
                      onClick={() => handleDelete(c.id)}
                      icon={<IconTrash className="w-4 h-4" />}
                    />
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'עריכת שליח' : 'הוספת שליח'}
      >
        <div className="space-y-4">
          <Input
            label="שם שליח"
            required
            value={form.שם_שליח}
            onChange={e => setForm(p => ({ ...p, שם_שליח: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="טלפון שליח"
              type="tel"
              value={form.טלפון_שליח}
              onChange={e => setForm(p => ({ ...p, טלפון_שליח: e.target.value }))}
              hint="לשליחה ב-WhatsApp"
            />
            <Input
              label="אימייל שליח"
              type="email"
              value={form.אימייל_שליח}
              onChange={e => setForm(p => ({ ...p, אימייל_שליח: e.target.value }))}
              hint="לשליחה במייל"
            />
          </div>
          <p className="text-xs" style={{ color: '#9B7A5A' }}>חובה למלא לפחות טלפון או אימייל</p>
          <Textarea
            label="הערות"
            rows={2}
            value={form.הערות}
            onChange={e => setForm(p => ({ ...p, הערות: e.target.value }))}
          />
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="courier-active"
              checked={form.פעיל}
              onChange={e => setForm(p => ({ ...p, פעיל: e.target.checked }))}
              className="w-4 h-4 rounded"
              style={{ accentColor: '#7C5230' }}
            />
            <label htmlFor="courier-active" className="text-sm cursor-pointer" style={{ color: '#3D2A1A' }}>
              שליח פעיל
            </label>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setModalOpen(false)}>ביטול</Button>
            <Button onClick={handleSave} loading={saving}>
              {editing ? 'שמור שינויים' : 'הוסף שליח'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Archive tab ──────────────────────────────────────────────────────────────

type ArchiveRow = {
  id: string;
  הזמנה_id: string;
  כתובת: string | null;
  עיר: string | null;
  delivered_at: string | null;
  סטטוס_משלוח: string;
  delivery_token: string | null;
  הזמנות?: {
    id: string;
    מספר_הזמנה: string;
    שם_מקבל: string | null;
    לקוח_id: string;
    לקוחות?: { שם_פרטי: string; שם_משפחה: string } | null;
  } | null;
  שליחים?: { שם_שליח: string } | null;
};

function ArchiveContent() {
  const [rows, setRows] = useState<ArchiveRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Delete-confirm state — same shape as the active tab. Archive rows are
  // always 'נמסר' so the modal always uses the stronger wording.
  const [deletingRow, setDeletingRow] = useState<ArchiveRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetch('/api/deliveries?mode=archive')
      .then(r => r.json())
      .then(({ data }) => setRows(data || []))
      .finally(() => setLoading(false));
  }, []);

  const confirmDelete = async () => {
    if (!deletingRow) return;
    const target = deletingRow;
    setDeleting(true);
    try {
      const res = await fetch(`/api/deliveries/${target.id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || 'לא ניתן למחוק את המשלוח. נסי שוב.');
        return;
      }
      setRows(prev => prev.filter(r => r.id !== target.id));
      setDeletingRow(null);
      toast.success('המשלוח נמחק בהצלחה');
    } catch {
      toast.error('לא ניתן למחוק את המשלוח. נסי שוב.');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <PageLoading />;
  if (rows.length === 0) return <EmptyState title="ארכיון ריק" description="אין משלוחים שסומנו כנמסרו עדיין" />;

  return (
    <div className="space-y-3">
      <span className="text-sm" style={{ color: '#6B4A2D' }}>{rows.length} משלוחים נמסרו</span>
      {rows.map(d => {
        const order = d.הזמנות;
        const customerName = order?.לקוחות
          ? `${order.לקוחות.שם_פרטי} ${order.לקוחות.שם_משפחה}`
          : order?.שם_מקבל || null;
        const deliveredDate = d.delivered_at
          ? new Date(d.delivered_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })
          : null;

        return (
          <Card key={d.id}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link
                    href={`/orders/${d.הזמנה_id}`}
                    className="font-mono text-xs font-semibold hover:underline"
                    style={{ color: '#7C5230' }}
                  >
                    {order?.מספר_הזמנה || `#${d.הזמנה_id?.slice(0, 8)}`}
                  </Link>
                  <span
                    className="inline-flex items-center text-xs font-medium rounded-full px-2.5 py-0.5 border"
                    style={{ backgroundColor: '#ECFDF5', color: '#065F46', borderColor: '#6EE7B7' }}
                  >
                    נמסר
                  </span>
                  {deliveredDate && (
                    <span className="text-xs" style={{ color: '#6B7280' }}>{deliveredDate}</span>
                  )}
                </div>

                {customerName && (
                  <div className="text-sm font-medium" style={{ color: '#1E120A' }}>{customerName}</div>
                )}

                {(d.כתובת || d.עיר) && (
                  <div className="text-xs" style={{ color: '#6B4A2D' }}>
                    {[d.כתובת, d.עיר].filter(Boolean).join(', ')}
                  </div>
                )}

                {d.שליחים?.שם_שליח && (
                  <div className="text-xs" style={{ color: '#7A5840' }}>
                    שליח: {d.שליחים.שם_שליח}
                  </div>
                )}
              </div>

              {/* Delete archived delivery — single right-side action */}
              <button
                onClick={() => setDeletingRow(d)}
                title="מחק משלוח"
                aria-label="מחק משלוח"
                className="text-xs px-2 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap border flex items-center gap-1 self-start"
                style={{ backgroundColor: '#FFFFFF', color: '#9D4B4A', borderColor: '#E4C2BE' }}
              >
                <IconTrash className="w-3.5 h-3.5" />
                מחק
              </button>
            </div>
          </Card>
        );
      })}

      <Modal
        open={!!deletingRow}
        onClose={() => { if (!deleting) setDeletingRow(null); }}
        title="מחיקת משלוח מהארכיון"
      >
        {deletingRow && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: '#9D4B4A', fontWeight: 600 }}>
              המשלוח כבר סומן כנמסר. למחוק בכל זאת?
            </p>
            <p className="text-xs" style={{ color: '#6B4A2D' }}>
              הפעולה תמחק את רשומת המשלוח בלבד. ההזמנה עצמה לא תימחק.
              {deletingRow.delivery_token && ' הקישור הציבורי שנשלח לשליח כבר לא יעבוד.'}
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setDeletingRow(null)} disabled={deleting}>
                ביטול
              </Button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="px-4 h-10 text-sm font-semibold rounded-xl text-white transition-colors disabled:opacity-60"
                style={{ backgroundColor: '#9D4B4A' }}
              >
                {deleting ? 'מוחק...' : 'מחק משלוח'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function DeliveriesPage() {
  const [activeTab, setActiveTab] = useState('deliveries');
  return (
    <div className="space-y-4" dir="rtl">
      <Tabs
        tabs={[
          { key: 'deliveries', label: 'משלוחים פעילים' },
          { key: 'couriers',   label: 'שליחים' },
          { key: 'archive',    label: 'ארכיון' },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />
      {activeTab === 'deliveries' ? (
        <Suspense fallback={<PageLoading />}>
          <DeliveriesContent />
        </Suspense>
      ) : activeTab === 'couriers' ? (
        <CouriersContent />
      ) : (
        <ArchiveContent />
      )}
    </div>
  );
}
