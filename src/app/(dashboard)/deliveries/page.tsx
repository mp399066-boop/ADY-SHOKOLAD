'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { PageLoading } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ActionBtn } from '@/components/ui/RowActions';
import { IconEye } from '@/components/icons';
import { Modal } from '@/components/ui/Modal';
import type { Delivery } from '@/types/database';
import Link from 'next/link';
import { exportToCsv } from '@/lib/exportCsv';
import { IconExport } from '@/components/icons';
import toast from 'react-hot-toast';

const VALID_STATUSES: Delivery['סטטוס_משלוח'][] = [
  'ממתין', 'בהכנה', 'מוכן למשלוח', 'יצא למשלוח', 'בדרך', 'נמסר', 'נכשל',
];

const DROPDOWN_STATUSES: Delivery['סטטוס_משלוח'][] = [
  'ממתין', 'בהכנה', 'מוכן למשלוח', 'יצא למשלוח', 'בדרך', 'נכשל',
];

const STATUS_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  'ממתין':          { bg: '#F3F4F6', color: '#6B7280', border: '#D1D5DB' },
  'בהכנה':          { bg: '#FFF7ED', color: '#C2610F', border: '#FED7AA' },
  'מוכן למשלוח':   { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
  'יצא למשלוח':    { bg: '#F5F3FF', color: '#6D28D9', border: '#DDD6FE' },
  'בדרך':           { bg: '#F0FDFA', color: '#0F766E', border: '#99F6E4' },
  'נכשל':           { bg: '#FEF2F2', color: '#DC2626', border: '#FECACA' },
  'נמסר':           { bg: '#ECFDF5', color: '#065F46', border: '#6EE7B7' },
};

function DeliveryStatusBadge({
  status,
  deliveryId,
  noRecord,
  onUpdate,
}: {
  status: Delivery['סטטוס_משלוח'];
  deliveryId: string;
  noRecord?: boolean;
  onUpdate: (id: string, s: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const style = STATUS_STYLE[status] ?? STATUS_STYLE['ממתין'];

  return (
    <div ref={ref} className="relative inline-block" dir="rtl">
      <button
        onClick={() => { if (!noRecord) setOpen(v => !v); }}
        disabled={noRecord}
        className="inline-flex items-center gap-1 text-xs font-medium rounded-full px-2.5 py-0.5 border transition-all"
        style={{
          backgroundColor: style.bg,
          color: style.color,
          borderColor: style.border,
          cursor: noRecord ? 'default' : 'pointer',
          opacity: noRecord ? 0.7 : 1,
        }}
        title={noRecord ? '' : 'לחץ לשינוי סטטוס'}
      >
        {status}
        {!noRecord && (
          <svg className="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {open && (
        <div
          className="absolute top-full mt-1 right-0 z-50 rounded-xl shadow-lg border py-1 min-w-[130px]"
          style={{ backgroundColor: '#FFFFFF', borderColor: '#E5DDD3' }}
        >
          {DROPDOWN_STATUSES.map(s => {
            const st = STATUS_STYLE[s];
            const isCurrent = s === status;
            return (
              <button
                key={s}
                onClick={() => { onUpdate(deliveryId, s); setOpen(false); }}
                className="w-full text-right px-3 py-1.5 text-xs flex items-center gap-2 transition-colors"
                style={{
                  backgroundColor: isCurrent ? st.bg : 'transparent',
                  color: isCurrent ? st.color : '#3D2A1A',
                  fontWeight: isCurrent ? 600 : 400,
                }}
                onMouseEnter={e => { if (!isCurrent) (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#FAF7F2'; }}
                onMouseLeave={e => { if (!isCurrent) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; }}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: st.color }}
                />
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

interface PlacedForm {
  שעת_הנחה: string;
  מקום_הנחה: string;
  הערה: string;
}

function DeliveriesContent() {
  const searchParams = useSearchParams();
  const defaultDate = searchParams.get('date') || new Date().toISOString().split('T')[0];

  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(defaultDate);
  const [status, setStatus] = useState('');

  const [placedDelivery, setPlacedDelivery] = useState<Delivery | null>(null);
  const [placedForm, setPlacedForm] = useState<PlacedForm>({ שעת_הנחה: '', מקום_הנחה: '', הערה: '' });
  const [savingPlaced, setSavingPlaced] = useState(false);
  const [creatingRecord, setCreatingRecord] = useState<string | null>(null);

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

  const openPlacedModal = (delivery: Delivery) => {
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
        placedForm.הערה && placedForm.הערה,
      ].filter(Boolean);
      const note = parts.join(' | ');

      const res = await fetch(`/api/deliveries/${placedDelivery.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          סטטוס_משלוח: 'נמסר',
          שעת_משלוח: placedForm.שעת_הנחה || null,
          הערות: note || null,
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

  const createDeliveryRecord = async (d: Delivery) => {
    setCreatingRecord(d.הזמנה_id);
    try {
      const order = (d as Delivery & { הזמנות?: { תאריך_אספקה?: string; שעת_אספקה?: string; כתובת_מקבל_ההזמנה?: string; עיר?: string; הוראות_משלוח?: string } }).הזמנות;
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
      // Replace synthetic row with real delivery record
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

  const handleExport = () => {
    exportToCsv('משלוחים.csv',
      ['מספר הזמנה', 'לקוח', 'כתובת', 'עיר', 'תאריך משלוח', 'סטטוס'],
      deliveries.map(d => {
        const order = (d as Delivery & { הזמנות?: { מספר_הזמנה: string; שם_מקבל?: string; לקוח_id?: string; לקוחות?: { שם_פרטי: string; שם_משפחה: string } } }).הזמנות;
        const customerName = order?.לקוחות
          ? `${order.לקוחות.שם_פרטי} ${order.לקוחות.שם_משפחה}`
          : order?.שם_מקבל || '';
        return [order?.מספר_הזמנה || '', customerName, d.כתובת || '', d.עיר || '', d.תאריך_משלוח || '', d.סטטוס_משלוח];
      }),
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-44" label="" />
        <Select value={status} onChange={e => setStatus(e.target.value)} className="w-44">
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

      {loading ? <PageLoading /> : deliveries.length === 0 ? (
        <EmptyState title="אין משלוחים" description="לא נמצאו משלוחים לתאריך זה" />
      ) : (
        <div className="space-y-3">
          {deliveries.map(d => {
            type OrderJoin = { מספר_הזמנה: string; שם_מקבל: string; לקוח_id?: string; לקוחות?: { שם_פרטי: string; שם_משפחה: string } };
            const order = (d as Delivery & { הזמנות?: OrderJoin }).הזמנות;
            const customerName = order?.לקוחות
              ? `${order.לקוחות.שם_פרטי} ${order.לקוחות.שם_משפחה}`
              : order?.שם_מקבל || null;
            const isDelivered = d.סטטוס_משלוח === 'נמסר';
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
                      <DeliveryStatusBadge
                        status={d.סטטוס_משלוח}
                        deliveryId={d.id}
                        noRecord={!!d._noRecord}
                        onUpdate={updateDeliveryStatus}
                      />
                      {d.תאריך_משלוח && (
                        <span className="text-xs" style={{ color: '#7A5840' }}>
                          {d.תאריך_משלוח}{d.שעת_משלוח && ` · ${d.שעת_משלוח}`}
                        </span>
                      )}
                    </div>

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

                    {(d.כתובת || d.עיר) && (
                      <div className="text-xs" style={{ color: '#6B4A2D' }}>
                        {[d.כתובת, d.עיר].filter(Boolean).join(', ')}
                      </div>
                    )}

                    <div className="text-xs">
                      {d.שם_שליח ? (
                        <span style={{ color: '#6B4A2D' }}>
                          שליח: <span className="font-medium" style={{ color: '#1E120A' }}>{d.שם_שליח}</span>
                          {d.טלפון_שליח && (
                            <a href={`tel:${d.טלפון_שליח}`} className="mr-2 hover:underline" dir="ltr" style={{ color: '#7C5230' }}>
                              {d.טלפון_שליח}
                            </a>
                          )}
                        </span>
                      ) : (
                        <span style={{ color: '#B0A090' }}>שליח: לא משויך</span>
                      )}
                    </div>

                    {d.הוראות_משלוח && (
                      <div className="text-xs p-2 rounded" style={{ backgroundColor: '#FAF7F0', color: '#6B4A2D' }}>
                        {d.הוראות_משלוח}
                      </div>
                    )}

                    {d.הערות && (
                      <div className="text-xs p-2 rounded" style={{ backgroundColor: '#F0F9FF', color: '#1E3A5F' }}>
                        {d.הערות}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5 flex-shrink-0 items-end">
                    <ActionBtn title="צפייה בהזמנה" href={`/orders/${d.הזמנה_id}`} icon={<IconEye className="w-4 h-4" />} />
                    {d._noRecord ? (
                      <button
                        onClick={() => createDeliveryRecord(d)}
                        disabled={creatingRecord === d.הזמנה_id}
                        className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap border"
                        style={{ backgroundColor: '#EFF6FF', color: '#1D4ED8', borderColor: '#BFDBFE' }}
                      >
                        {creatingRecord === d.הזמנה_id ? 'יוצר...' : '+ צור משלוח'}
                      </button>
                    ) : (
                      !isDelivered && (
                        <button
                          onClick={() => openPlacedModal(d)}
                          className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap ring-1"
                          style={{ backgroundColor: '#ECFDF5', color: '#065F46', outline: '1px solid #6EE7B7' }}
                        >
                          ✓ סמן שנמסר
                        </button>
                      )
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* "הונח" confirmation modal */}
      <Modal
        open={!!placedDelivery}
        onClose={() => setPlacedDelivery(null)}
        title="סמן משלוח כנמסר"
      >
        <div className="space-y-4">
          <p className="text-sm" style={{ color: '#6B4A2D' }}>
            הזמנה: <span className="font-semibold" style={{ color: '#1E120A' }}>
              {(placedDelivery as Delivery & { הזמנות?: { מספר_הזמנה: string } } | null)?.הזמנות?.מספר_הזמנה || '—'}
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

export default function DeliveriesPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <DeliveriesContent />
    </Suspense>
  );
}
