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
import { createClient } from '@/lib/supabase/client';
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
    <svg className="h-9 w-9" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.3} style={{ color: '#8B5E34' }}>
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
function ICalendar({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
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
      <div className="flex items-center gap-2">
        <span style={{ color: '#C6A77D' }}>{icon}</span>
        <div>
          <h3 className="font-semibold text-sm" style={{ color: '#3A2A1A' }}>{title}</h3>
          {subtitle && <p className="text-xs" style={{ color: '#8A7664' }}>{subtitle}</p>}
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
  void tone;
  return (
    <div
      className="rounded-2xl p-5 bg-white"
      style={{ border: '1px solid #E8DED2', boxShadow: '0 2px 8px rgba(58,42,26,0.04)' }}
    >
      <div className="mb-3" style={{ color: '#C6A77D' }}>{icon}</div>
      <div
        className="text-[1.75rem] font-bold tabular-nums leading-none mb-1.5"
        style={{ color: '#3A2A1A', letterSpacing: '-0.03em' }}
      >
        {value}
      </div>
      <div className="text-xs font-medium" style={{ color: '#8A7664' }}>{label}</div>
      {hint && <div className="text-xs mt-0.5" style={{ color: '#B0A090' }}>{hint}</div>}
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
      <div className="h-12 w-12 rounded-xl mx-auto mb-3 flex items-center justify-center" style={{ backgroundColor: '#F5EFE8', color: '#C6A77D' }}>
        {icon}
      </div>
      <p className="font-medium text-sm mb-1" style={{ color: '#3A2A1A' }}>{title}</p>
      {text && <p className="text-xs mb-4" style={{ color: '#8A7664' }}>{text}</p>}
      {action}
    </div>
  );
}

function StatusPill({ label, color }: { label: string; color: string }) {
  const map: Record<string, { bg: string; text: string; border: string }> = {
    פעיל:  { bg: '#E8F0EB', text: '#2D6648', border: '#BED3C4' },
    חוזר:  { bg: '#EAF0F5', text: '#2A4C6A', border: '#B6CCDD' },
    פרטי:  { bg: '#F5F1EB', text: '#6B4B32', border: '#E0D4C2' },
    עסקי:  { bg: '#EEEAF4', text: '#4A3868', border: '#CCC4D8' },
  };
  const s = map[color] || { bg: '#F5F1EB', text: '#6B4B32', border: '#E0D4C2' };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
      style={{ backgroundColor: s.bg, color: s.text, borderColor: s.border }}
    >
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
  const [businessLogoUrl, setBusinessLogoUrl] = useState<string | null>(null);
  const [pdfInvoice, setPdfInvoice] = useState<Invoice | null>(null);
  const [iframeBlocked, setIframeBlocked] = useState(false);

  useEffect(() => {
    fetch(`/api/customers/${id}`)
      .then(r => r.json())
      .then(({ data }) => { setCustomer(data); setEditForm(data); })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    const supabase = createClient();
    supabase.from('business_settings').select('logo_url').single()
      .then(({ data }: { data: any }) => { if (data?.logo_url) setBusinessLogoUrl(data.logo_url); });
  }, []);

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
        שם_פרטי:    editForm.שם_פרטי,
        שם_משפחה:   editForm.שם_משפחה,
        טלפון:      editForm.טלפון,
        אימייל:     editForm.אימייל,
        סוג_לקוח:   editForm.סוג_לקוח,
        סטטוס_לקוח: editForm.סטטוס_לקוח,
        מקור_הגעה:  editForm.מקור_הגעה,
        אחוז_הנחה:  editForm.אחוז_הנחה,
        הערות:      editForm.הערות,
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

  if (loading) return <PageLoading />;

  if (!customer) return (
    <div className="max-w-6xl">
      <Link href="/customers" className="flex items-center gap-1 text-sm mb-6 hover:underline" style={{ color: '#8A7664' }}>
        <IconChevronLeft className="w-4 h-4 rtl-flip" />
        חזרה לרשימת לקוחות
      </Link>
      <div className="rounded-2xl border p-12 text-center bg-white" style={{ borderColor: '#E8DED2' }}>
        <div className="h-12 w-12 rounded-xl mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: '#F5EFE8', color: '#C6A77D' }}>
          <IUser />
        </div>
        <h2 className="text-lg font-semibold mb-1" style={{ color: '#3A2A1A' }}>לא נמצא לקוח</h2>
        <p className="text-sm mb-4" style={{ color: '#8A7664' }}>המזהה המבוקש: <span className="font-mono">{id}</span></p>
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
    <>
    <div className="max-w-6xl space-y-6">

      {/* ── 1. back link ── */}
      <Link
        href="/customers"
        className="inline-flex items-center gap-1.5 text-sm hover:underline"
        style={{ color: '#8A7664' }}
      >
        <IconChevronLeft className="w-4 h-4 rtl-flip" />
        חזרה לרשימת לקוחות
      </Link>

      {/* ── edit form ── */}
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
            <Input label="שם פרטי"     value={editForm.שם_פרטי  || ''} onChange={e => setEditForm(p => ({ ...p, שם_פרטי:  e.target.value }))} />
            <Input label="שם משפחה"    value={editForm.שם_משפחה || ''} onChange={e => setEditForm(p => ({ ...p, שם_משפחה: e.target.value }))} />
            <Input label="טלפון"       value={editForm.טלפון    || ''} onChange={e => setEditForm(p => ({ ...p, טלפון:    e.target.value }))} />
            <Input label="אימייל"      value={editForm.אימייל   || ''} onChange={e => setEditForm(p => ({ ...p, אימייל:   e.target.value }))} />
            <Select label="סוג לקוח"   value={editForm.סוג_לקוח || 'פרטי'} onChange={e => setEditForm(p => ({ ...p, סוג_לקוח: e.target.value as Customer['סוג_לקוח'] }))}>
              {(['פרטי', 'חוזר', 'עסקי'] as const).map(t => <option key={t} value={t}>{t}</option>)}
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
      <div
        className="rounded-2xl bg-white border p-6"
        style={{ borderColor: '#E8DED2', boxShadow: '0 2px 12px rgba(58,42,26,0.05)' }}
      >
        {/* Row 1: avatar + name/tags | action buttons */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            {/* avatar — business logo or customer initial */}
            <div
              className="rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden"
              style={{
                width: '72px', height: '72px',
                backgroundColor: '#FFFFFF',
                border: '1px solid #E8DED2',
                boxShadow: '0 2px 10px rgba(58,42,26,0.08)',
                padding: businessLogoUrl ? '6px' : '0',
              }}
            >
              {businessLogoUrl ? (
                <img
                  src={businessLogoUrl}
                  alt="לוגו"
                  style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '50%' }}
                />
              ) : (
                <span style={{ fontSize: '1.75rem', fontWeight: 700, color: '#8B5E34', lineHeight: 1 }}>
                  {customer.שם_פרטי?.charAt(0) || '?'}
                </span>
              )}
            </div>

            {/* name + badges */}
            <div className="min-w-0">
              <h1
                className="font-bold leading-tight"
                style={{ color: '#3A2A1A', fontSize: '1.5rem', letterSpacing: '-0.02em' }}
              >
                {customer.שם_פרטי} {customer.שם_משפחה}
              </h1>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                <StatusPill label={customer.סוג_לקוח} color={customer.סוג_לקוח} />
                {customer.סטטוס_לקוח && (
                  <StatusPill label={customer.סטטוס_לקוח} color={customer.סטטוס_לקוח} />
                )}
              </div>
            </div>
          </div>

          {/* action buttons */}
          <div className="flex flex-wrap gap-2 flex-shrink-0">
            <button
              onClick={() => setEditing(e => !e)}
              className="h-9 px-4 rounded-lg flex items-center gap-1.5 font-medium border transition-all"
              style={{ borderColor: '#E8DED2', color: '#5C4A38', fontSize: '13px', backgroundColor: '#fff' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#FAF7F2')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#fff')}
            >
              <IconEdit className="w-3.5 h-3.5" />
              ערוך פרטים
            </button>
            {whatsappLink && (
              <a
                href={whatsappLink}
                target="_blank"
                rel="noopener noreferrer"
                className="h-9 px-4 rounded-lg flex items-center gap-1.5 font-medium transition-all hover:brightness-105"
                style={{ backgroundColor: '#22C55E', color: '#fff', fontSize: '13px' }}
              >
                <IconWhatsApp className="w-3.5 h-3.5" />
                WhatsApp
              </a>
            )}
            {customer.אימייל && (
              <a
                href={`mailto:${customer.אימייל}`}
                className="h-9 px-4 rounded-lg flex items-center gap-1.5 font-medium border transition-all"
                style={{ borderColor: '#E8DED2', color: '#5C4A38', fontSize: '13px', backgroundColor: '#fff' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#FAF7F2')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#fff')}
              >
                <IMail className="w-3.5 h-3.5" />
                מייל
              </a>
            )}
            <Link href="/orders/new">
              <button
                className="h-9 px-4 rounded-lg flex items-center gap-1.5 font-medium transition-all"
                style={{ backgroundColor: '#8B5E34', color: '#fff', fontSize: '13px' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#7A5230')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#8B5E34')}
              >
                <IconPlus className="w-3.5 h-3.5" />
                הזמנה חדשה
              </button>
            </Link>
            {customer.הזמנות.length === 0 && (
              <button
                onClick={handleDelete}
                className="h-9 px-4 rounded-lg flex items-center gap-1.5 font-medium border transition-all"
                style={{ borderColor: '#F0C4C0', color: '#8A3228', fontSize: '13px', backgroundColor: '#fff' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#FDF2F0')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#fff')}
              >
                מחק
              </button>
            )}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: '1px', backgroundColor: '#F0EAE0', margin: '20px 0' }} />

        {/* Row 2: contact info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" style={{ gap: '8px' }}>
          {customer.טלפון && (
            <a
              href={`tel:${customer.טלפון}`}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 12px', borderRadius: '12px',
                border: '1px solid #E8DED2', backgroundColor: '#FFFCF8',
                textDecoration: 'none', transition: 'border-color 0.15s, background-color 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#C6A77D';
                e.currentTarget.style.backgroundColor = '#FEF8F0';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = '#E8DED2';
                e.currentTarget.style.backgroundColor = '#FFFCF8';
              }}
            >
              <span style={{ color: '#8B5E34', lineHeight: 1, flexShrink: 0 }}>
                <IPhone className="w-4 h-4" />
              </span>
              <span className="flex flex-col" style={{ gap: '1px' }}>
                <span style={{ fontSize: '10px', fontWeight: 500, color: '#B0A090', letterSpacing: '0.04em' }}>טלפון</span>
                <span dir="ltr" style={{ fontSize: '17px', fontWeight: 700, color: '#3A2A1A', letterSpacing: '0.01em', lineHeight: 1.2 }}>
                  {customer.טלפון}
                </span>
              </span>
            </a>
          )}
          {customer.אימייל && (
            <a
              href={`mailto:${customer.אימייל}`}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 12px', borderRadius: '12px',
                border: '1px solid #E8DED2', backgroundColor: '#FFFCF8',
                textDecoration: 'none', transition: 'border-color 0.15s, background-color 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#C6A77D';
                e.currentTarget.style.backgroundColor = '#FEF8F0';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = '#E8DED2';
                e.currentTarget.style.backgroundColor = '#FFFCF8';
              }}
            >
              <span style={{ color: '#C6A77D', lineHeight: 1, flexShrink: 0 }}>
                <IMail className="w-4 h-4" />
              </span>
              <span className="flex flex-col" style={{ gap: '1px', minWidth: 0 }}>
                <span style={{ fontSize: '10px', fontWeight: 500, color: '#B0A090', letterSpacing: '0.04em' }}>מייל</span>
                <span dir="ltr" style={{ fontSize: '14px', fontWeight: 500, color: '#5C4A38', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {customer.אימייל}
                </span>
              </span>
            </a>
          )}
          {customer.מקור_הגעה && (
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 12px', borderRadius: '12px',
                border: '1px solid #E8DED2', backgroundColor: '#FFFCF8',
              }}
            >
              <span style={{ color: '#C6A77D', lineHeight: 1, flexShrink: 0 }}>
                <IMap className="w-4 h-4" />
              </span>
              <span className="flex flex-col" style={{ gap: '1px' }}>
                <span style={{ fontSize: '10px', fontWeight: 500, color: '#B0A090', letterSpacing: '0.04em' }}>מקור הגעה</span>
                <span style={{ fontSize: '14px', fontWeight: 400, color: '#8E7D6A', lineHeight: 1.2 }}>
                  {customer.מקור_הגעה}
                </span>
              </span>
            </div>
          )}
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '10px 12px', borderRadius: '12px',
              border: '1px solid #E8DED2', backgroundColor: '#FFFCF8',
            }}
          >
            <span style={{ color: '#C6A77D', lineHeight: 1, flexShrink: 0 }}>
              <ICalendar className="w-4 h-4" />
            </span>
            <span className="flex flex-col" style={{ gap: '1px' }}>
              <span style={{ fontSize: '10px', fontWeight: 500, color: '#B0A090', letterSpacing: '0.04em' }}>לקוח מאז</span>
              <span style={{ fontSize: '14px', fontWeight: 400, color: '#8E7D6A', lineHeight: 1.2 }}>
                {formatDate(customer.תאריך_יצירה)}
              </span>
            </span>
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
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            }
            title="פרטי לקוח"
          />
          <dl className="space-y-0 divide-y" style={{ '--tw-divide-opacity': 1 } as React.CSSProperties}>
            {[
              { label: 'סוג לקוח',    value: customer.סוג_לקוח,                                  pill: true  },
              { label: 'סטטוס',       value: customer.סטטוס_לקוח || '—',                         pill: !!customer.סטטוס_לקוח },
              { label: 'הנחה קבועה',  value: customer.אחוז_הנחה ? `${customer.אחוז_הנחה}%` : '—', icon: <ITag className="w-3 h-3 inline ml-1" /> },
              { label: 'מקור',        value: customer.מקור_הגעה || '—' },
              { label: 'מזהה לקוח',   value: customer.id,                                         mono: true  },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between py-2.5" style={{ borderColor: '#F0EAE0' }}>
                <dt className="text-xs flex items-center" style={{ color: '#8A7664' }}>
                  {row.icon}{row.label}
                </dt>
                <dd className="text-xs font-medium" style={{ color: '#3A2A1A' }}>
                  {row.pill
                    ? <StatusPill label={row.value as string} color={row.value as string} />
                    : row.mono
                    ? <span dir="ltr" className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#F5F0E8', color: '#5C4A38' }}>{String(row.value).slice(0, 12)}…</span>
                    : row.value
                  }
                </dd>
              </div>
            ))}
          </dl>
        </Card>

        {/* right: orders */}
        <div className="lg:col-span-2 space-y-6">
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
                icon={<ICart className="w-5 h-5" />}
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
              <div className="overflow-x-auto -mx-1">
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: '1px solid #F0EAE0' }}>
                      {['מספר הזמנה', 'תאריך אספקה', 'סכום', 'סטטוס', ''].map(h => (
                        <th
                          key={h}
                          className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide"
                          style={{ color: '#8A7664' }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {customer.הזמנות.slice(0, 8).map(o => (
                      <tr
                        key={o.id}
                        className="transition-colors cursor-pointer border-b"
                        style={{ borderColor: '#F5EEE4' }}
                        onClick={() => router.push(`/orders/${o.id}`)}
                        onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.backgroundColor = '#FAF7F2'}
                        onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.backgroundColor = ''}
                      >
                        <td className="px-3 py-3 font-mono text-xs font-semibold" style={{ color: '#8B5E34' }}>
                          {o.מספר_הזמנה}
                        </td>
                        <td className="px-3 py-3 text-xs" style={{ color: '#5C4A38' }}>
                          {o.תאריך_אספקה ? formatDate(o.תאריך_אספקה) : <span style={{ color: '#C6B8A8' }}>—</span>}
                        </td>
                        <td className="px-3 py-3 font-semibold text-xs" style={{ color: '#3A2A1A' }}>
                          {formatCurrency(o.סך_הכל_לתשלום)}
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge status={o.סטטוס_הזמנה} type="order" />
                        </td>
                        <td className="px-3 py-3">
                          <span style={{ color: '#C6A77D' }}><IEye className="w-3.5 h-3.5" /></span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* communication — full width, untouched */}
      <CustomerCommunication
        customerId={id}
        phone={customer.טלפון}
        email={customer.אימייל}
        history={customer.תיעוד_תקשורת || []}
        onSend={log => setCustomer(prev => prev ? { ...prev, תיעוד_תקשורת: [log, ...prev.תיעוד_תקשורת] } : prev)}
      />

      {/* ── 5. secondary tabs ── */}
      <Card className="p-0 overflow-hidden">
        <div className="px-5 pt-4">
          <Tabs tabs={sideTabs} activeTab={sideTab} onChange={k => setSideTab(k as SideTab)} />
        </div>
        <div className="p-5">

          {/* invoices */}
          {sideTab === 'invoices' && (
            customer.חשבוניות.length === 0 ? (
              <EmptyState icon={<IFile className="w-5 h-5" />} title="אין חשבוניות" />
            ) : (
              <div className="space-y-1.5">
                {customer.חשבוניות.map(inv => (
                  <div
                    key={inv.id}
                    className="flex justify-between items-center px-3 py-2.5 rounded-lg border"
                    style={{ borderColor: '#F0EAE0', backgroundColor: '#FEFCF9' }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-semibold text-xs" style={{ color: '#5C4A38' }}>
                        #{inv.מספר_חשבונית}
                      </span>
                      <span className="text-xs" style={{ color: '#B0A090' }}>{formatDate(inv.תאריך_יצירה)}</span>
                      <span
                        className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                        style={{
                          backgroundColor: inv.סטטוס === 'הופקה' ? '#E8F5E9' : '#FFF3E0',
                          color: inv.סטטוס === 'הופקה' ? '#2E7D32' : '#E65100',
                        }}
                      >
                        {inv.סטטוס}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs" style={{ color: '#3A2A1A' }}>{formatCurrency(inv.סכום)}</span>
                      {inv.קישור_חשבונית && (
                        <button
                          onClick={() => { setPdfInvoice(inv); setIframeBlocked(false); }}
                          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors"
                          style={{ backgroundColor: '#F5EFE7', color: '#8B5E34', border: '1px solid #E8DED2' }}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#EDE5D8')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#F5EFE7')}
                        >
                          <IEye className="w-3 h-3" />
                          PDF
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* files */}
          {sideTab === 'files' && (
            customer.קבצים.length === 0 ? (
              <EmptyState icon={<IFile className="w-5 h-5" />} title="אין קבצים" />
            ) : (
              <div className="space-y-1">
                {customer.קבצים.map(f => (
                  <a
                    key={f.id}
                    href={f.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors border border-transparent"
                    style={{ color: '#5C4A38' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#FAF7F2')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <span style={{ color: '#C6A77D' }}><IFile className="w-4 h-4 flex-shrink-0" /></span>
                    <span className="text-xs flex-1">{f.file_name}</span>
                    <span className="text-xs" style={{ color: '#B0A090' }}>{formatDate(f.uploaded_at)}</span>
                  </a>
                ))}
              </div>
            )
          )}

          {/* notes */}
          {sideTab === 'notes' && (
            customer.הערות ? (
              <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: '#5C4A38' }}>{customer.הערות}</p>
            ) : (
              <EmptyState
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6}>
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
    {/* ── PDF viewer modal ── */}
    {pdfInvoice && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ backgroundColor: 'rgba(30,18,8,0.55)' }}
        onClick={() => setPdfInvoice(null)}
      >
        <div
          className="relative flex flex-col rounded-2xl overflow-hidden"
          style={{
            width: 'min(900px, 96vw)',
            height: 'min(780px, 92vh)',
            backgroundColor: '#FFFFFF',
            boxShadow: '0 24px 80px rgba(30,18,8,0.28)',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* header */}
          <div
            className="flex items-center justify-between px-5 py-3 flex-shrink-0"
            style={{ borderBottom: '1px solid #F0EAE0', backgroundColor: '#FDFAF5' }}
          >
            <div className="flex items-center gap-3">
              <span style={{ color: '#C6A77D' }}><IFile className="w-4 h-4 flex-shrink-0" /></span>
              <span className="font-semibold text-sm" style={{ color: '#3A2A1A' }}>
                חשבונית #{pdfInvoice.מספר_חשבונית}
              </span>
              <span className="text-xs" style={{ color: '#B0A090' }}>{formatDate(pdfInvoice.תאריך_יצירה)}</span>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={`/api/invoices/${pdfInvoice.id}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={{ backgroundColor: '#F5EFE7', color: '#8B5E34', border: '1px solid #E8DED2' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#EDE5D8')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#F5EFE7')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                פתח בטאב חדש
              </a>
              <button
                onClick={() => setPdfInvoice(null)}
                className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors"
                style={{ color: '#8A7664' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#F5EFE7')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* iframe / blocked state */}
          {iframeBlocked ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4" style={{ backgroundColor: '#FAF7F2' }}>
              <span style={{ color: '#C6A77D' }}><IFile className="w-10 h-10" /></span>
              <p className="text-sm font-medium" style={{ color: '#3A2A1A' }}>לא ניתן להציג את ה-PDF בתוך המערכת</p>
              <a
                href={`/api/invoices/${pdfInvoice.id}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ backgroundColor: '#8B5E34', color: '#FFFFFF' }}
              >
                פתח PDF בטאב חדש
              </a>
            </div>
          ) : (
            <iframe
              key={pdfInvoice.id}
              src={`/api/invoices/${pdfInvoice.id}/pdf`}
              className="flex-1 w-full border-0"
              title={`חשבונית ${pdfInvoice.מספר_חשבונית}`}
              onError={() => setIframeBlocked(true)}
            />
          )}
        </div>
      </div>
    )}
    </>
  );
}
