'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Tabs } from '@/components/ui/Tabs';
import { PageLoading } from '@/components/ui/LoadingSpinner';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { IconWhatsApp, IconEdit, IconChevronLeft, IconPlus } from '@/components/icons';
import { CustomerCommunication } from '@/components/CustomerCommunication';
import { formatDate, formatCurrency } from '@/lib/utils';
import toast from 'react-hot-toast';
import type { Customer, Order, Invoice, CommunicationLog } from '@/types/database';

/* ─── types ──────────────────────────────────────────────────────────────── */
type FullCustomer = Customer & {
  הזמנות: Order[];
  חשבוניות: Invoice[];
  קבצים: { id: string; file_name: string; file_url: string; uploaded_at: string }[];
  תיעוד_תקשורת: CommunicationLog[];
};

type SideTab = 'invoices' | 'files' | 'notes';

/* ─── inline icon helpers ────────────────────────────────────────────────── */
function IUser() {
  return (
    <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.4} style={{ color: '#8B5E34' }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  );
}
function ICart({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
    </svg>
  );
}
function ITrend({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
    </svg>
  );
}
function IFile({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}
function ICard({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
    </svg>
  );
}
function ICal({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  );
}
function ITag({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
    </svg>
  );
}
function IEye({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
function IPhone({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
    </svg>
  );
}
function IMail({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  );
}
function IMap({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
  );
}

/* ─── helper components ──────────────────────────────────────────────────── */
function SectionHeader({ icon, title, subtitle, action }: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#F0E6D6', color: '#8B5E34' }}>
          {icon}
        </div>
        <div>
          <h3 className="font-semibold text-sm" style={{ color: '#2B1A10' }}>{title}</h3>
          {subtitle && <p className="text-xs" style={{ color: '#9B7A5A' }}>{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

function StatCard({ icon, label, value, hint, tone }: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  hint?: string;
  tone: 'primary' | 'success' | 'info' | 'warning';
}) {
  const tones = {
    primary: { bg: '#F0E6D6', color: '#8B5E34' },
    success: { bg: '#DCFCE7', color: '#166534' },
    info:    { bg: '#EFF6FF', color: '#1D4ED8' },
    warning: { bg: '#FEF3C7', color: '#D97706' },
  };
  const t = tones[tone];
  return (
    <div className="rounded-2xl p-4 bg-white border" style={{ borderColor: '#EDE0CE' }}>
      <div className="flex items-start justify-between mb-3">
        <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: t.bg, color: t.color }}>
          {icon}
        </div>
      </div>
      <div className="text-2xl font-bold tabular-nums mb-0.5" style={{ color: '#2B1A10' }}>{value}</div>
      <div className="text-xs font-medium" style={{ color: '#6B4A2D' }}>{label}</div>
      {hint && <div className="text-xs mt-0.5" style={{ color: '#9B7A5A' }}>{hint}</div>}
    </div>
  );
}

function EmptyState({ icon, title, text, action }: {
  icon: React.ReactNode;
  title: string;
  text?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="py-10 text-center">
      <div className="h-14 w-14 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ backgroundColor: '#F5ECD8' }}>
        {icon}
      </div>
      <p className="font-medium text-sm mb-1" style={{ color: '#6B4A2D' }}>{title}</p>
      {text && <p className="text-xs mb-4" style={{ color: '#9B7A5A' }}>{text}</p>}
      {action}
    </div>
  );
}

function StatusPill({ label, color }: { label: string; color: string }) {
  const map: Record<string, { bg: string; text: string }> = {
    פעיל:   { bg: '#DCFCE7', text: '#166534' },
    VIP:    { bg: '#FDF4FF', text: '#7E22CE' },
    חוזר:  { bg: '#EFF6FF', text: '#1D4ED8' },
    'מעצב אירועים': { bg: '#FEF9C3', text: '#854D0E' },
    פרטי:  { bg: '#F5ECD8', text: '#8B5E34' },
  };
  const s = map[color] || { bg: '#F5ECD8', text: '#8B5E34' };
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: s.bg, color: s.text }}>
      {label}
    </span>
  );
}

/* ─── page ───────────────────────────────────────────────────────────────── */
export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [customer, setCustomer] = useState<FullCustomer | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Customer>>({});
  const [sideTab, setSideTab] = useState<SideTab>('invoices');

  useEffect(() => {
    fetch(`/api/customers/${id}`)
      .then(r => r.json())
      .then(({ data }) => { setCustomer(data); setEditForm(data); })
      .finally(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    if (!window.confirm('האם למחוק את הלקוח לצמיתות?')) return;
    try {
      const res = await fetch(`/api/customers/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success('הלקוח נמחק');
      router.push('/customers');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'שגיאה במחיקה');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Partial<Customer> = {
        שם_פרטי: editForm.שם_פרטי,
        שם_משפחה: editForm.שם_משפחה,
        טלפון: editForm.טלפון,
        אימייל: editForm.אימייל,
        סוג_לקוח: editForm.סוג_לקוח,
        סטטוס_לקוח: editForm.סטטוס_לקוח,
        מקור_הגעה: editForm.מקור_הגעה,
        אחוז_הנחה: editForm.אחוז_הנחה,
        הערות: editForm.הערות,
      };
      const res = await fetch(`/api/customers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setCustomer(prev => prev ? { ...prev, ...json.data } : prev);
      setEditing(false);
      toast.success('לקוח עודכן');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'שגיאה בשמירה');
    } finally { setSaving(false); }
  };

  /* ── loading / error ── */
  if (loading) return <PageLoading />;

  if (!customer) return (
    <div className="max-w-6xl">
      <Link href="/customers" className="flex items-center gap-1 text-sm mb-6 hover:underline" style={{ color: '#8B5E34' }}>
        <IconChevronLeft className="w-4 h-4 rtl-flip" />
        חזרה לרשימת לקוחות
      </Link>
      <div className="rounded-2xl border p-12 text-center bg-white" style={{ borderColor: '#EDE0CE' }}>
        <div className="h-14 w-14 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: '#F5ECD8' }}>
          <IUser />
        </div>
        <h2 className="text-lg font-semibold mb-1" style={{ color: '#2B1A10' }}>לא נמצא לקוח</h2>
        <p className="text-sm mb-4" style={{ color: '#9B7A5A' }}>המזהה המבוקש: <span className="font-mono">{id}</span></p>
        <Link href="/customers">
          <Button variant="outline" size="sm">חזרה לרשימה</Button>
        </Link>
      </div>
    </div>
  );

  /* ── derived stats ── */
  const completedOrders = customer.הזמנות.filter(o => o.סטטוס_הזמנה === 'הושלמה בהצלחה');
  const totalSpend = completedOrders.reduce((s, o) => s + (o.סך_הכל_לתשלום || 0), 0);
  const pendingBalance = customer.הזמנות
    .filter(o => o.סטטוס_תשלום === 'ממתין' || o.סטטוס_תשלום === 'חלקי')
    .reduce((s, o) => s + (o.סך_הכל_לתשלום || 0), 0);

  const whatsappLink = customer.טלפון
    ? `https://wa.me/972${customer.טלפון.replace(/^0/, '').replace(/-/g, '')}`
    : null;

  const sideTabs = [
    { key: 'invoices', label: 'חשבוניות', count: customer.חשבוניות.length },
    { key: 'files',    label: 'קבצים',    count: customer.קבצים.length },
    { key: 'notes',    label: 'הערות' },
  ];

  return (
    <div className="max-w-6xl space-y-6">

      {/* ── 1. back link ── */}
      <Link
        href="/customers"
        className="inline-flex items-center gap-1.5 text-sm hover:underline"
        style={{ color: '#9B7A5A' }}
      >
        <IconChevronLeft className="w-4 h-4 rtl-flip" />
        חזרה לרשימת לקוחות
      </Link>

      {/* ── edit form (inline, collapsible) ── */}
      {editing && (
        <Card>
          <CardHeader>
            <CardTitle>עריכת פרטי לקוח</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} loading={saving}>שמור</Button>
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}>ביטול</Button>
            </div>
          </CardHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="שם פרטי" value={editForm.שם_פרטי || ''} onChange={e => setEditForm(p => ({ ...p, שם_פרטי: e.target.value }))} />
            <Input label="שם משפחה" value={editForm.שם_משפחה || ''} onChange={e => setEditForm(p => ({ ...p, שם_משפחה: e.target.value }))} />
            <Input label="טלפון" value={editForm.טלפון || ''} onChange={e => setEditForm(p => ({ ...p, טלפון: e.target.value }))} />
            <Input label="אימייל" value={editForm.אימייל || ''} onChange={e => setEditForm(p => ({ ...p, אימייל: e.target.value }))} />
            <Select label="סוג לקוח" value={editForm.סוג_לקוח || 'פרטי'} onChange={e => setEditForm(p => ({ ...p, סוג_לקוח: e.target.value as Customer['סוג_לקוח'] }))}>
              {(['פרטי', 'חוזר', 'VIP', 'מעצב אירועים'] as const).map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
            <Input label="אחוז הנחה (%)" type="number" value={editForm.אחוז_הנחה ?? 0} onChange={e => setEditForm(p => ({ ...p, אחוז_הנחה: Number(e.target.value) }))} />
            <div className="col-span-2">
              <Input label="מקור הגעה" value={editForm.מקור_הגעה || ''} onChange={e => setEditForm(p => ({ ...p, מקור_הגעה: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Textarea label="הערות" value={editForm.הערות || ''} onChange={e => setEditForm(p => ({ ...p, הערות: e.target.value }))} rows={2} />
            </div>
          </div>
        </Card>
      )}

      {/* ── 2. hero card ── */}
      <div className="rounded-3xl overflow-hidden border bg-white shadow-sm" style={{ borderColor: '#EDE0CE' }}>
        {/* gradient strip */}
        <div className="h-24" style={{ background: 'linear-gradient(135deg, #8B5E34 0%, #C7A46B 100%)' }} />

        {/* floating content */}
        <div className="px-6 pb-6 -mt-12">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            {/* avatar */}
            <div className="h-24 w-24 rounded-2xl border-4 border-white bg-white shadow-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#FAF7F0' }}>
              <IUser />
            </div>

            {/* name + badges + actions */}
            <div className="flex-1 min-w-0 pb-1">
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <h1 className="text-2xl md:text-3xl font-bold" style={{ color: '#2B1A10' }}>
                  {customer.שם_פרטי} {customer.שם_משפחה}
                </h1>
                <StatusPill label={customer.סוג_לקוח} color={customer.סוג_לקוח} />
                {customer.סטטוס_לקוח && (
                  <StatusPill label={customer.סטטוס_לקוח} color={customer.סטטוס_לקוח} />
                )}
              </div>
              <div className="flex items-center gap-1.5 text-sm" style={{ color: '#9B7A5A' }}>
                <ICal className="w-3.5 h-3.5 flex-shrink-0" />
                <span>לקוח מאז {formatDate(customer.תאריך_יצירה)}</span>
              </div>
            </div>

            {/* action buttons */}
            <div className="flex flex-wrap gap-2 pb-1">
              <button
                onClick={() => setEditing(e => !e)}
                className="h-9 px-3 rounded-xl flex items-center gap-1.5 text-xs font-medium border transition-all hover:bg-amber-50"
                style={{ borderColor: '#C7A46B', color: '#8B5E34' }}
              >
                <IconEdit className="w-3.5 h-3.5" />
                עריכה
              </button>
              {whatsappLink && (
                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-9 px-3 rounded-xl flex items-center gap-1.5 text-xs font-medium transition-all hover:brightness-105"
                  style={{ backgroundColor: '#25D366', color: '#fff' }}
                >
                  <IconWhatsApp className="w-3.5 h-3.5" />
                  WhatsApp
                </a>
              )}
              {customer.אימייל && (
                <a
                  href={`mailto:${customer.אימייל}`}
                  className="h-9 px-3 rounded-xl flex items-center gap-1.5 text-xs font-medium border transition-all hover:bg-amber-50"
                  style={{ borderColor: '#C7A46B', color: '#8B5E34' }}
                >
                  <IMail className="w-3.5 h-3.5" />
                  מייל
                </a>
              )}
              <Link href="/orders/new">
                <button
                  className="h-9 px-3 rounded-xl flex items-center gap-1.5 text-xs font-medium text-white transition-all hover:brightness-110"
                  style={{ backgroundColor: '#8B5E34' }}
                >
                  <IconPlus className="w-3.5 h-3.5" />
                  הזמנה חדשה
                </button>
              </Link>
              {customer.הזמנות.length === 0 && (
                <button
                  onClick={handleDelete}
                  className="h-9 px-3 rounded-xl flex items-center gap-1.5 text-xs font-medium border transition-all hover:bg-red-50"
                  style={{ borderColor: '#FECACA', color: '#DC2626' }}
                >
                  מחק לקוח
                </button>
              )}
            </div>
          </div>

          {/* contact strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5 pt-5" style={{ borderTop: '1px solid #EDE0CE' }}>
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#F0E6D6', color: '#8B5E34' }}>
                <IPhone className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs mb-0.5" style={{ color: '#9B7A5A' }}>טלפון</p>
                {customer.טלפון
                  ? <a href={`tel:${customer.טלפון}`} dir="ltr" className="text-sm font-medium hover:underline" style={{ color: '#2B1A10' }}>{customer.טלפון}</a>
                  : <span className="text-sm" style={{ color: '#BFB09A' }}>—</span>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#F0E6D6', color: '#8B5E34' }}>
                <IMail className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs mb-0.5" style={{ color: '#9B7A5A' }}>אימייל</p>
                {customer.אימייל
                  ? <a href={`mailto:${customer.אימייל}`} dir="ltr" className="text-sm font-medium hover:underline truncate block" style={{ color: '#2B1A10' }}>{customer.אימייל}</a>
                  : <span className="text-sm" style={{ color: '#BFB09A' }}>—</span>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#F0E6D6', color: '#8B5E34' }}>
                <IMap className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs mb-0.5" style={{ color: '#9B7A5A' }}>מקור הגעה</p>
                <span className="text-sm font-medium" style={{ color: '#2B1A10' }}>{customer.מקור_הגעה || '—'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 3. activity stats ── */}
      <div>
        <SectionHeader
          icon={<ITrend className="w-4 h-4" />}
          title="סיכום פעילות"
        />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={<ICart className="w-4 h-4" />}
            label="הזמנות"
            value={customer.הזמנות.length}
            hint={`${completedOrders.length} הושלמו`}
            tone="primary"
          />
          <StatCard
            icon={<ITrend className="w-4 h-4" />}
            label="סה״כ הוצאות"
            value={formatCurrency(totalSpend)}
            tone="success"
          />
          <StatCard
            icon={<IFile className="w-4 h-4" />}
            label="חשבוניות"
            value={customer.חשבוניות.length}
            tone="info"
          />
          <StatCard
            icon={<ICard className="w-4 h-4" />}
            label="יתרה לתשלום"
            value={formatCurrency(pendingBalance)}
            tone={pendingBalance > 0 ? 'warning' : 'success'}
          />
        </div>
      </div>

      {/* ── 4. main grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* left: customer details */}
        <Card>
          <SectionHeader
            icon={
              <svg className="w-4 h-4" fill="none" stroke="#8B5E34" viewBox="0 0 24 24" strokeWidth={1.6}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            }
            title="פרטי לקוח"
          />
          <dl className="space-y-0 divide-y" style={{ '--tw-divide-opacity': 1 } as React.CSSProperties}>
            {[
              { label: 'סוג לקוח', value: customer.סוג_לקוח, pill: true },
              { label: 'סטטוס', value: customer.סטטוס_לקוח || '—', pill: !!customer.סטטוס_לקוח },
              { label: 'הנחה קבועה', value: customer.אחוז_הנחה ? `${customer.אחוז_הנחה}%` : '—', icon: <ITag className="w-3 h-3 inline ml-1" /> },
              { label: 'מקור', value: customer.מקור_הגעה || '—' },
              { label: 'מזהה לקוח', value: customer.id, mono: true, ltr: true },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between py-2.5">
                <dt className="text-xs flex items-center" style={{ color: '#9B7A5A' }}>
                  {row.icon}{row.label}
                </dt>
                <dd className="text-xs font-medium" style={{ color: '#2B1A10' }}>
                  {row.pill
                    ? <StatusPill label={row.value as string} color={row.value as string} />
                    : row.mono
                    ? <span dir="ltr" className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#F5ECD8', color: '#8B5E34' }}>{String(row.value).slice(0, 12)}…</span>
                    : row.value
                  }
                </dd>
              </div>
            ))}
          </dl>
        </Card>

        {/* right: orders + communication */}
        <div className="lg:col-span-2 space-y-6">

          {/* orders card */}
          <Card>
            <SectionHeader
              icon={<ICart className="w-4 h-4" />}
              title="הזמנות אחרונות"
              subtitle={`${customer.הזמנות.length} הזמנות בסך הכל`}
              action={
                <Link href="/orders/new">
                  <Button size="sm" variant="outline">
                    <IconPlus className="w-3.5 h-3.5" />
                    הזמנה
                  </Button>
                </Link>
              }
            />
            {customer.הזמנות.length === 0 ? (
              <EmptyState
                icon={<ICart className="w-6 h-6" />}
                title="אין הזמנות עדיין"
                text="לחיצה על 'הזמנה' תפתח הזמנה חדשה עבור לקוח זה"
                action={
                  <Link href="/orders/new">
                    <Button size="sm">
                      <IconPlus className="w-3.5 h-3.5" />
                      הזמנה חדשה
                    </Button>
                  </Link>
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid #EDE0CE' }}>
                      {['מספר', 'תאריך', 'סכום', 'סטטוס', 'פעולות'].map(h => (
                        <th key={h} className="py-2 pb-3 text-right text-xs font-semibold" style={{ color: '#6B4A2D' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {customer.הזמנות.slice(0, 8).map(o => (
                      <tr
                        key={o.id}
                        className="border-b hover:bg-amber-50 transition-colors"
                        style={{ borderColor: '#F5ECD8' }}
                      >
                        <td className="py-2.5 font-mono text-xs font-semibold" style={{ color: '#8B5E34' }}>
                          {o.מספר_הזמנה}
                        </td>
                        <td className="py-2.5 text-xs" style={{ color: '#6B4A2D' }}>
                          {formatDate(o.תאריך_אספקה)}
                        </td>
                        <td className="py-2.5 font-semibold text-xs" style={{ color: '#2B1A10' }}>
                          {formatCurrency(o.סך_הכל_לתשלום)}
                        </td>
                        <td className="py-2.5">
                          <StatusBadge status={o.סטטוס_הזמנה} type="order" />
                        </td>
                        <td className="py-2.5">
                          <button
                            onClick={() => router.push(`/orders/${o.id}`)}
                            className="h-7 w-7 rounded-lg flex items-center justify-center transition-colors hover:bg-amber-100"
                            style={{ color: '#8B5E34' }}
                          >
                            <IEye className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* communication */}
          <CustomerCommunication
            customerId={id}
            phone={customer.טלפון}
            email={customer.אימייל}
            history={customer.תיעוד_תקשורת || []}
            onSend={log => setCustomer(prev => prev ? { ...prev, תיעוד_תקשורת: [log, ...prev.תיעוד_תקשורת] } : prev)}
          />
        </div>
      </div>

      {/* ── 5. secondary tabs (invoices / files / notes) ── */}
      <Card className="p-0 overflow-hidden">
        <div className="px-5 pt-4">
          <Tabs tabs={sideTabs} activeTab={sideTab} onChange={k => setSideTab(k as SideTab)} />
        </div>
        <div className="p-5">
          {/* invoices */}
          {sideTab === 'invoices' && (
            customer.חשבוניות.length === 0 ? (
              <EmptyState
                icon={<IFile className="w-5 h-5" />}
                title="אין חשבוניות"
              />
            ) : (
              <div className="space-y-2">
                {customer.חשבוניות.map(inv => (
                  <div key={inv.id} className="flex justify-between items-center p-3 rounded-xl text-sm" style={{ backgroundColor: '#FAF7F0' }}>
                    <div>
                      <span className="font-mono font-semibold text-xs" style={{ color: '#8B5E34' }}>#{inv.מספר_חשבונית}</span>
                      <span className="mr-3 text-xs" style={{ color: '#6B4A2D' }}>{formatDate(inv.תאריך_יצירה)}</span>
                    </div>
                    <span className="font-semibold text-xs" style={{ color: '#2B1A10' }}>{formatCurrency(inv.סכום)}</span>
                  </div>
                ))}
              </div>
            )
          )}

          {/* files */}
          {sideTab === 'files' && (
            customer.קבצים.length === 0 ? (
              <EmptyState
                icon={<IFile className="w-5 h-5" />}
                title="אין קבצים"
              />
            ) : (
              <div className="space-y-1.5">
                {customer.קבצים.map(f => (
                  <a
                    key={f.id}
                    href={f.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-amber-50 text-sm transition-colors"
                    style={{ color: '#8B5E34' }}
                  >
                    <IFile className="w-4 h-4 flex-shrink-0" />
                    <span className="text-xs flex-1">{f.file_name}</span>
                    <span className="text-xs" style={{ color: '#9B7A5A' }}>{formatDate(f.uploaded_at)}</span>
                  </a>
                ))}
              </div>
            )
          )}

          {/* notes */}
          {sideTab === 'notes' && (
            customer.הערות ? (
              <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: '#2B1A10' }}>{customer.הערות}</p>
            ) : (
              <EmptyState
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="#8B5E34" viewBox="0 0 24 24" strokeWidth={1.6}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                  </svg>
                }
                title="אין הערות"
                text='לחץ על "עריכה" להוספת הערות'
              />
            )
          )}
        </div>
      </Card>
    </div>
  );
}
