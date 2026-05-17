'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { PageLoading } from '@/components/ui/LoadingSpinner';
import toast from 'react-hot-toast';
import type { BusinessSettings } from '@/types/database';

const SETTINGS_TABS_BASE = [
  { href: '/settings',                    label: 'הגדרות עסק',         adminOnly: false },
  { href: '/settings/users',              label: 'משתמשים והרשאות',    adminOnly: false },
  { href: '/settings/inventory-backfill', label: 'תיקון מלאי',          adminOnly: true  },
  { href: '/settings/system-control',     label: 'מרכז בקרה',           adminOnly: true  },
] as const;

function SettingsTabs({ activeHref = '/settings', isAdmin = false, backfillCount = 0 }: {
  activeHref?: string; isAdmin?: boolean; backfillCount?: number;
}) {
  const tabs = SETTINGS_TABS_BASE.filter(t => !t.adminOnly || isAdmin);
  return (
    <div className="flex gap-1 mb-6 border-b" style={{ borderColor: '#EAE0D4' }}>
      {tabs.map(tab => {
        const isActive = tab.href === activeHref;
        const showBadge = tab.href === '/settings/inventory-backfill' && backfillCount > 0;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="px-4 py-2.5 text-sm font-medium relative transition-colors inline-flex items-center gap-1.5"
            style={isActive
              ? { color: '#5C3410', borderBottom: '2.5px solid #C9A46A', marginBottom: '-1px' }
              : { color: '#8A7664' }}
          >
            {tab.label}
            {showBadge && (
              <span
                className="text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none"
                title={`${backfillCount} הזמנות ששולמו ולא ירד להן מלאי`}
                style={{ backgroundColor: '#9D4B4A', color: '#FFFFFF', minWidth: '18px', textAlign: 'center' }}
              >
                {backfillCount}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

// SettingsTabs is also defined locally inside settings/users and
// settings/system-control. Not re-exported here because Next.js page.tsx
// files only allow the page-shape exports.

export default function SettingsPage() {
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [form, setForm] = useState<Partial<BusinessSettings>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  // Count of paid orders missing תנועות_מלאי deduction. Renders as a red
  // pill next to the "תיקון מלאי" tab so the admin sees at a glance that
  // backfill work is pending — without having to enter the page.
  const [backfillCount, setBackfillCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(({ data }) => { setSettings(data); setForm(data || {}); })
      .finally(() => setLoading(false));
    // Role lookup — only used to decide whether the "מרכז בקרה" tab shows.
    // Falls through silently if /api/me fails (tab just won't appear).
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(j => {
      if (j?.role === 'admin') {
        setIsAdmin(true);
        // Cheap dry-run scan — returns the count without performing any
        // deduction. Admin-only endpoint, so non-admins never trigger it.
        fetch('/api/admin/inventory/backfill-deductions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dry_run: true }),
        })
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d?.missing_ledger != null) setBackfillCount(d.missing_ledger); })
          .catch(() => {});
      }
    }).catch(() => {});
  }, []);

  const set = (field: keyof BusinessSettings, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setSettings(json.data);
      toast.success('הגדרות נשמרו');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (file: File) => {
    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('entity_type', 'business');
      formData.append('entity_id', settings?.id || 'default');
      formData.append('bucket', 'brand-assets');

      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      const logoUrl = json.data.file_url;
      setForm(prev => ({ ...prev, logo_url: logoUrl }));
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logo_url: logoUrl }),
      });
      toast.success('לוגו הועלה בהצלחה');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'שגיאה בהעלאת לוגו');
    } finally {
      setUploadingLogo(false);
    }
  };

  if (loading) return <PageLoading />;

  return (
    <div className="max-w-3xl space-y-5">
      <SettingsTabs activeHref="/settings" isAdmin={isAdmin} backfillCount={backfillCount} />
      {/* Logo */}
      <Card>
        <CardHeader><CardTitle>לוגו העסק</CardTitle></CardHeader>
        <div className="flex items-center gap-6">
          <div
            className="w-24 h-24 rounded-xl flex items-center justify-center border overflow-hidden flex-shrink-0"
            style={{ borderColor: '#E7D2A6', backgroundColor: '#FAF7F0' }}
          >
            {form.logo_url ? (
              <img src={form.logo_url} alt="לוגו" className="w-full h-full object-contain" />
            ) : (
              <span className="text-2xl font-bold" style={{ color: '#8B5E34' }}>
                {form.business_name?.charAt(0) || 'P'}
              </span>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-sm" style={{ color: '#6B4A2D' }}>העלה לוגו (PNG, JPG, SVG)</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => { if (e.target.files?.[0]) handleLogoUpload(e.target.files[0]); }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
              loading={uploadingLogo}
            >
              {form.logo_url ? 'החלף לוגו' : 'העלה לוגו'}
            </Button>
            {form.logo_url && (
              <button
                className="text-xs text-red-500 hover:underline block"
                onClick={() => setForm(p => ({ ...p, logo_url: undefined }))}
              >
                הסר לוגו
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* Business details */}
      <Card>
        <CardHeader><CardTitle>פרטי העסק</CardTitle></CardHeader>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="שם העסק"
            value={form.business_name || ''}
            onChange={e => set('business_name', e.target.value)}
          />
          <Input
            label="מטבע ברירת מחדל"
            value={form.default_currency || '₪'}
            onChange={e => set('default_currency', e.target.value)}
          />
          <Input
            label="טלפון"
            type="tel"
            value={form.phone || ''}
            onChange={e => set('phone', e.target.value)}
          />
          <Input
            label="אימייל"
            type="email"
            value={form.email || ''}
            onChange={e => set('email', e.target.value)}
          />
          <div className="col-span-2">
            <Input
              label="כתובת"
              value={form.address || ''}
              onChange={e => set('address', e.target.value)}
            />
          </div>
        </div>
      </Card>

      {/* Brand colors */}
      <Card>
        <CardHeader><CardTitle>צבעי מותג</CardTitle></CardHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium" style={{ color: '#2B1A10' }}>צבע ראשי</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.primary_color || '#8B5E34'}
                onChange={e => set('primary_color', e.target.value)}
                className="w-10 h-10 rounded cursor-pointer border"
                style={{ borderColor: '#E7D2A6' }}
              />
              <Input
                value={form.primary_color || '#8B5E34'}
                onChange={e => set('primary_color', e.target.value)}
                className="flex-1"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium" style={{ color: '#2B1A10' }}>צבע משני</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.secondary_color || '#C7A46B'}
                onChange={e => set('secondary_color', e.target.value)}
                className="w-10 h-10 rounded cursor-pointer border"
                style={{ borderColor: '#E7D2A6' }}
              />
              <Input
                value={form.secondary_color || '#C7A46B'}
                onChange={e => set('secondary_color', e.target.value)}
                className="flex-1"
              />
            </div>
          </div>
        </div>
        <div className="mt-4 p-4 rounded-lg flex gap-4 items-center" style={{ backgroundColor: '#FAF7F0' }}>
          <div className="w-8 h-8 rounded-full" style={{ backgroundColor: form.primary_color || '#8B5E34' }} />
          <div className="w-8 h-8 rounded-full" style={{ backgroundColor: form.secondary_color || '#C7A46B' }} />
          <span className="text-xs" style={{ color: '#6B4A2D' }}>תצוגה מקדימה של צבעי המותג</span>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} loading={saving}>שמור הגדרות</Button>
      </div>
    </div>
  );
}
