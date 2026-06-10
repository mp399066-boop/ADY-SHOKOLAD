'use client';

// /settings/defaults — "ברירות מחדל" (safe system defaults).
//
// Phase 2. Edits only safe key/value defaults that forms pre-fill with
// (default payment method, order/customer source, delivery fee, stock
// thresholds, unit). No logic-driving enums, statuses, or pricing rules.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import toast from 'react-hot-toast';
import { useOptionList } from '@/hooks/useOptionList';
import { SYSTEM_CONFIG_DEFS, configDefaultsMap, validateConfig } from '@/lib/system-config';

const SETTINGS_TABS = [
  { href: '/settings',                label: 'הגדרות עסק',      adminOnly: false },
  { href: '/settings/lists',          label: 'רשימות ניהול',    adminOnly: false },
  { href: '/settings/defaults',       label: 'ברירות מחדל',     adminOnly: false },
  { href: '/settings/users',          label: 'משתמשים והרשאות', adminOnly: false },
  { href: '/settings/system-control', label: 'לוגים',           adminOnly: true  },
];

function SettingsTabs({ active, isAdmin }: { active: string; isAdmin: boolean }) {
  return (
    <div className="flex gap-1 mb-6 border-b" style={{ borderColor: '#EAE0D4' }}>
      {SETTINGS_TABS.filter(t => !t.adminOnly || isAdmin).map(tab => {
        const isActive = tab.href === active;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="px-4 py-2.5 text-sm font-medium relative transition-colors"
            style={isActive
              ? { color: '#5C3410', borderBottom: '2.5px solid #C9A46A', marginBottom: '-1px' }
              : { color: '#8A7664' }}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

export default function SystemDefaultsPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [form, setForm] = useState<Record<string, string>>(() => configDefaultsMap());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tableReady, setTableReady] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Source lists for the option_ref selects.
  const { values: paymentMethods } = useOptionList('payment_methods');
  const { values: orderSources }   = useOptionList('order_sources');
  const { values: customerSources } = useOptionList('customer_sources');
  const { values: units }          = useOptionList('units_of_measure');
  const listFor = useMemo(() => ({
    payment_methods:  paymentMethods,
    order_sources:    orderSources,
    customer_sources: customerSources,
    units_of_measure: units,
  } as Record<string, string[]>), [paymentMethods, orderSources, customerSources, units]);

  useEffect(() => {
    fetch('/api/me').then(r => (r.ok ? r.json() : null)).then(j => {
      if (j?.role === 'admin') setIsAdmin(true);
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/admin/system-config');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'שגיאה בטעינה');
      setForm({ ...configDefaultsMap(), ...(json.data || {}) });
      setTableReady(json.tableReady !== false);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'שגיאה בטעינה');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  const errors = useMemo(() => {
    const map: Record<string, string> = {};
    for (const e of validateConfig(form)) if (!map[e.key]) map[e.key] = e.message;
    return map;
  }, [form]);

  const handleSave = async () => {
    const validation = validateConfig(form);
    if (validation.length) { toast.error(validation[0].message); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/system-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'שגיאה');
      setForm({ ...configDefaultsMap(), ...(json.data || {}) });
      toast.success('ברירות המחדל נשמרו');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-5">
      <SettingsTabs active="/settings/defaults" isAdmin={isAdmin} />

      <div>
        <h1 className="text-lg font-semibold" style={{ color: '#3A2A1A' }}>ברירות מחדל</h1>
        <p className="text-sm mt-1" style={{ color: '#8A7664' }}>
          ערכי ברירת מחדל בטוחים שהטפסים ממלאים אוטומטית. שינוי כאן לא משפיע על רשומות קיימות —
          רק על מה שיוצע בפעם הבאה שתפתחי טופס חדש.
        </p>
      </div>

      {!tableReady && (
        <div className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: '#EDCF98', backgroundColor: '#FBF5E6', color: '#7A5820' }}>
          טבלת ההגדרות עדיין לא הוקמה במסד הנתונים. מוצגים ערכי ברירת המחדל בלבד (קריאה בלבד).
          יש להריץ את מיגרציה <span className="font-mono">050_system_config.sql</span> ב-Supabase כדי לאפשר עריכה.
        </div>
      )}

      <Card>
        {loading ? (
          <div className="flex justify-center py-10"><LoadingSpinner /></div>
        ) : loadError ? (
          <div className="rounded-xl border px-4 py-6 text-center text-sm" style={{ borderColor: '#D8BCB6', backgroundColor: '#F7EEEC', color: '#8A3228' }}>
            {loadError}
            <div className="mt-3"><Button variant="outline" size="sm" onClick={load}>נסה שוב</Button></div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {SYSTEM_CONFIG_DEFS.map(def => {
              const err = errors[def.key];
              if (def.type === 'option_ref') {
                const opts = listFor[def.sourceList || ''] || [];
                const current = form[def.key] ?? '';
                const withCurrent = current && !opts.includes(current) ? [...opts, current] : opts;
                return (
                  <div key={def.key} className="space-y-1">
                    <Select
                      label={def.label}
                      value={current}
                      error={err}
                      disabled={!tableReady}
                      onChange={e => set(def.key, e.target.value)}
                    >
                      {def.allowEmpty && <option value="">— ללא —</option>}
                      {withCurrent.map(v => <option key={v} value={v}>{v}</option>)}
                    </Select>
                    {def.description && !err && (
                      <p className="text-xs" style={{ color: '#B0A090' }}>{def.description}</p>
                    )}
                  </div>
                );
              }
              return (
                <div key={def.key} className="space-y-1">
                  <Input
                    label={def.label}
                    type="number"
                    min={def.min}
                    step={0.01}
                    value={form[def.key] ?? ''}
                    error={err}
                    disabled={!tableReady}
                    onChange={e => set(def.key, e.target.value)}
                  />
                  {def.description && !err && (
                    <p className="text-xs" style={{ color: '#B0A090' }}>{def.description}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} loading={saving} disabled={!tableReady || loading || Object.keys(errors).length > 0}>
          שמור ברירות מחדל
        </Button>
      </div>
    </div>
  );
}
