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
        onClick={() => { if (!noRecord && !isDelivered) setOpen(v => !v); }}
        disabled={noRecord || isDelivered}
        className="inline-flex items-center gap-1 text-xs font-medium rounded-full px-2.5 py-0.5 border transition-all"
        style={{
          backgroundColor: style.bg,
          color: style.color,
          borderColor: style.border,
          cursor: (noRecord || isDelivered) ? 'default' : 'pointer',
          opacity: noRecord ? 0.7 : 1,
        }}
        title={isDelivered ? 'סטטוס סופי' : noRecord ? '' : 'לחץ לשינוי סטטוס'}
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
  const defaultDate = searchParams.get('date') || new Date().toISOString().split('T')[0];

  const [deliveries, setDeliveries] = useState<DeliveryWithCourier[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(defaultDate);
  const [statusFilter, setStatusFilter] = useState('');
  const [couriers, setCouriers] = useState<Courier[]>([]);

  const [placedDelivery, setPlacedDelivery] = useState<DeliveryWithCourier | null>(null);
  const [placedForm, setPlacedForm] = useState<PlacedForm>({ שעת_הנחה: '', מקום_הנחה: '', הערה: '' });
  const [savingPlaced, setSavingPlaced] = useState(false);
  const [creatingRecord, setCreatingRecord] = useState<string | null>(null);
  const [assigningCourier, setAssigningCourier] = useState<string | null>(null);
  const [generatingToken, setGeneratingToken] = useState<string | null>(null);

  // Load active couriers once
  useEffect(() => {
    fetch('/api/couriers')
      .then(r => r.json())
      .then(({ data }) => setCouriers((data || []).filter((c: CourierWithStats) => c.פעיל)));
  }, []);

  // Load deliveries on filter change
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (statusFilter) params.set('status', statusFilter);
    fetch(`/api/deliveries?${params}`)
      .then(r => r.json())
      .then(({ data }) => setDeliveries(data || []))
      .finally(() => setLoading(false));
  }, [date, statusFilter]);

  const updateDeliveryStatus = async (id: string, newStatus: string) => {
    const res = await fetch(`/api/deliveries/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ סטטוס_משלוח: newStatus }),
    });
    if (!res.ok) {
      const json = await res.json();
      toast.error(json.error || 'שגיאה בעדכון סטטוס');
      return;
    }
    setDeliveries(prev => prev.map(d =>
      d.id === id ? { ...d, סטטוס_משלוח: newStatus as Delivery['סטטוס_משלוח'] } : d,
    ));
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
      setDeliveries(prev => prev.map(d =>
        d.id === placedDelivery.id
          ? { ...d, סטטוס_משלוח: 'נמסר', שעת_משלוח: placedForm.שעת_הנחה || d.שעת_משלוח, הערות: note || d.הערות }
          : d,
      ));
      toast.success('המשלוח סומן כנמסר');
      setPlacedDelivery(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setSavingPlaced(false);
    }
  };

  const createDeliveryRecord = async (d: DeliveryWithCourier) => {
    setCreatingRecord(d.הזמנה_id);
    try {
      const order = (d as DeliveryWithCourier & { הזמנות?: { תאריך_אספקה?: string; שעת_אספקה?: string; כתובת_מקבל_ההזמנה?: string; עיר?: string; הוראות_משלוח?: string } }).הזמנות;
      const res = await fetch('/api/deliveries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          הזמנה_id: d.הזמנה_id,
          סטטוס_משלוח: 'ממתין',
          תאריך_משלוח: order?.תאריך_אספקה || null,
          שעת_משלוח: order?.שעת_אספקה || null,
          כתובת: d.כתובת || order?.כתובת_מקבל_ההזמנה || null,
          עיר: d.עיר || order?.עיר || null,
          הוראות_משלוח: d.הוראות_משלוח || order?.הוראות_משלוח || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error || 'שגיאה ביצירת רשומת משלוח'); return; }
      setDeliveries(prev => prev.map(row =>
        row.הזמנה_id === d.הזמנה_id
          ? { ...json.data, הזמנות: row.הזמנות, _noRecord: false }
          : row,
      ));
      toast.success('רשומת משלוח נוצרה');
    } finally {
      setCreatingRecord(null);
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
      if (!res.ok) {
        const json = await res.json();
        toast.error(json.error || 'שגיאה בשיוך שליח');
        return;
      }
      const assigned = courierId ? couriers.find(c => c.id === courierId) : null;
      setDeliveries(prev => prev.map(d =>
        d.id === deliveryId ? {
          ...d,
          courier_id: courierId,
          שליחים: assigned
            ? { id: assigned.id, שם_שליח: assigned.שם_שליח, טלפון_שליח: assigned.טלפון_שליח }
            : null,
        } : d,
      ));
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

  const sendToCourier = async (delivery: DeliveryWithCourier) => {
    const courier = delivery.courier_id ? couriers.find(c => c.id === delivery.courier_id) : null;
    if (!courier) { toast.error('לא שויך שליח'); return; }

    if (!courier.טלפון_שליח && !courier.אימייל_שליח) {
      toast.error('לא ניתן לשלוח — חסר טלפון או אימייל לשליח');
      return;
    }

    // ── WhatsApp path (phone exists) ──────────────────────────────
    if (courier.טלפון_שליח) {
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

      const order = (delivery as DeliveryWithCourier & { הזמנות?: OrderJoin }).הזמנות;
      const recipientName =
        order?.שם_מקבל ||
        (order?.לקוחות ? `${order.לקוחות.שם_פרטי} ${order.לקוחות.שם_משפחה}` : '') ||
        'לקוח';

      const message = `היי ${courier.שם_שליח},\nיש לך משלוח עבור ${recipientName}.\nלאחר המסירה, לחץ כאן:\n${link}`;
      let phone = courier.טלפון_שליח.replace(/[^0-9]/g, '');
      if (phone.startsWith('0')) phone = '972' + phone.slice(1);
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');

      await fetch(`/api/deliveries/${delivery.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whatsapp_sent_at: new Date().toISOString() }),
      });
      toast.success('נפתח WhatsApp לשליחה');
      return;
    }

    // ── Email path (no phone, email exists) ───────────────────────
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
          {VALID_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </Select>
        <span className="text-sm mr-auto" style={{ color: '#6B4A2D' }}>{deliveries.length} משלוחים</span>
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border bg-white hover:bg-[#FAF7F2] transition-all"
          style={{ borderColor: '#D8CCBA', color: '#8B5E34' }}
        >
          <IconExport className="w-3.5 h-3.5" />
          ייצוא לאקסל
        </button>
      </div>

      {/* Delivery cards */}
      {loading ? <PageLoading /> : deliveries.length === 0 ? (
        <EmptyState title="אין משלוחים" description="לא נמצאו משלוחים לתאריך זה" />
      ) : (
        <div className="space-y-3">
          {deliveries.map(d => {
            const order = (d as DeliveryWithCourier & { הזמנות?: OrderJoin }).הזמנות;
            const customerName = order?.לקוחות
              ? `${order.לקוחות.שם_פרטי} ${order.לקוחות.שם_משפחה}`
              : order?.שם_מקבל || null;
            const courierPhone = d.שליחים?.טלפון_שליח || d.טלפון_שליח || null;
            const assignedCourier = d.courier_id ? couriers.find(c => c.id === d.courier_id) : null;
            const canSendToCourier = !d._noRecord && !!assignedCourier &&
              !!(assignedCourier.טלפון_שליח || assignedCourier.אימייל_שליח);

            return (
              <Card key={d.id}>
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
                      {d._noRecord ? (
                        <span className="text-xs" style={{ color: '#B0A090' }}>שמור את המשלוח תחילה</span>
                      ) : (
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
                      )}
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

                    {d._noRecord && (
                      <button
                        onClick={() => createDeliveryRecord(d)}
                        disabled={creatingRecord === d.הזמנה_id}
                        className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap border"
                        style={{ backgroundColor: '#EFF6FF', color: '#1D4ED8', borderColor: '#BFDBFE' }}
                      >
                        {creatingRecord === d.הזמנה_id ? 'יוצר...' : '+ צור משלוח'}
                      </button>
                    )}

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

                    {canSendToCourier && (
                      <button
                        onClick={() => sendToCourier(d)}
                        title={assignedCourier?.טלפון_שליח ? 'שלח לשליח ב-WhatsApp' : 'שלח לשליח במייל'}
                        className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap border flex items-center gap-1"
                        style={{ backgroundColor: '#F0FDF4', color: '#15803D', borderColor: '#86EFAC' }}
                      >
                        {assignedCourier?.טלפון_שליח
                          ? <><IconWhatsApp className="w-3 h-3" />שלח לשליח</>
                          : <>✉️ שלח לשליח</>}
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

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
    if (!form.שם_שליח.trim() || !form.טלפון_שליח.trim()) {
      toast.error('שם וטלפון שדות חובה');
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
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="שם שליח"
              required
              value={form.שם_שליח}
              onChange={e => setForm(p => ({ ...p, שם_שליח: e.target.value }))}
            />
            <Input
              label="טלפון שליח"
              type="tel"
              value={form.טלפון_שליח}
              onChange={e => setForm(p => ({ ...p, טלפון_שליח: e.target.value }))}
            />
          </div>
          <Input
            label="אימייל שליח"
            type="email"
            value={form.אימייל_שליח}
            onChange={e => setForm(p => ({ ...p, אימייל_שליח: e.target.value }))}
            hint="אם אין טלפון, הקישור יישלח למייל"
          />
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

// ─── Page ──────────────────────────────────────────────────────────────────

export default function DeliveriesPage() {
  const [activeTab, setActiveTab] = useState('deliveries');
  return (
    <div className="space-y-4" dir="rtl">
      <Tabs
        tabs={[
          { key: 'deliveries', label: 'משלוחים' },
          { key: 'couriers', label: 'שליחים' },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />
      {activeTab === 'deliveries' ? (
        <Suspense fallback={<PageLoading />}>
          <DeliveriesContent />
        </Suspense>
      ) : (
        <CouriersContent />
      )}
    </div>
  );
}
