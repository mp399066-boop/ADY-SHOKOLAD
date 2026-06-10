'use client';

// /settings/lists — "רשימות ניהול" (managed content lists).
//
// Phase 1 of the in-system settings area. Lets the operator add / edit /
// disable / delete the pure content lists that used to be hardcoded
// (product categories, payment methods, customer & order sources, units).
//
// Logic-driving enums (order/payment/delivery statuses, pricing tiers) are
// intentionally NOT managed here.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import toast from 'react-hot-toast';
import { OPTION_LISTS, getListDef, type OptionListRow } from '@/lib/option-lists';

// ── Settings tab strip (same visual as the other settings pages) ─────────────
const SETTINGS_TABS = [
  { href: '/settings',                label: 'הגדרות עסק',      adminOnly: false },
  { href: '/settings/lists',          label: 'רשימות ניהול',    adminOnly: false },
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

export default function ManagedListsPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedKey, setSelectedKey] = useState(OPTION_LISTS[0].key);

  const [rows, setRows] = useState<OptionListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableReady, setTableReady] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [newValue, setNewValue] = useState('');
  const [adding, setAdding] = useState(false);

  const [editRow, setEditRow] = useState<OptionListRow | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editLabel, setEditLabel] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<OptionListRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null);

  const def = getListDef(selectedKey)!;

  useEffect(() => {
    fetch('/api/me').then(r => (r.ok ? r.json() : null)).then(j => {
      if (j?.role === 'admin') setIsAdmin(true);
    }).catch(() => {});
  }, []);

  const load = useCallback(async (key: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/admin/option-lists?list_key=${encodeURIComponent(key)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'שגיאה בטעינה');
      setRows(json.data || []);
      setTableReady(json.tableReady !== false);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'שגיאה בטעינה');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(selectedKey); }, [selectedKey, load]);

  const handleAdd = async () => {
    const value = newValue.trim();
    if (!value) return;
    setAdding(true);
    try {
      const res = await fetch('/api/admin/option-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ list_key: selectedKey, value }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'שגיאה');
      setNewValue('');
      toast.success('הערך נוסף');
      await load(selectedKey);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setAdding(false);
    }
  };

  const toggleActive = async (row: OptionListRow) => {
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/admin/option-lists/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !row.is_active }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'שגיאה');
      toast.success(row.is_active ? 'הערך הושבת' : 'הערך הופעל');
      await load(selectedKey);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setBusyId(null);
    }
  };

  const openEdit = (row: OptionListRow) => {
    setEditRow(row);
    setEditValue(row.value);
    setEditLabel(row.label);
  };

  const handleSaveEdit = async () => {
    if (!editRow) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/admin/option-lists/${editRow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: editValue.trim(), label: editLabel.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'שגיאה');
      toast.success('הערך עודכן');
      setEditRow(null);
      await load(selectedKey);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/option-lists/${deleteTarget.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'שגיאה');
      toast.success('הערך נמחק');
      setDeleteTarget(null);
      await load(selectedKey);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-5">
      <SettingsTabs active="/settings/lists" isAdmin={isAdmin} />

      <div>
        <h1 className="text-lg font-semibold" style={{ color: '#3A2A1A' }}>רשימות ניהול</h1>
        <p className="text-sm mt-1" style={{ color: '#8A7664' }}>
          ניהול ערכים לבחירה בטפסים — קטגוריות, אמצעי תשלום, מקורות ויחידות מידה.
          סטטוסים של הזמנות/תשלומים/משלוחים אינם נערכים כאן כי הם משפיעים על לוגיקה עסקית.
        </p>
      </div>

      {!tableReady && (
        <div className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: '#EDCF98', backgroundColor: '#FBF5E6', color: '#7A5820' }}>
          טבלת הרשימות עדיין לא הוקמה במסד הנתונים. מוצגים ערכי ברירת המחדל בלבד (קריאה בלבד).
          יש להריץ את מיגרציה <span className="font-mono">049_system_option_lists.sql</span> ב-Supabase כדי לאפשר עריכה.
        </div>
      )}

      {/* List selector */}
      <div className="flex flex-wrap gap-2">
        {OPTION_LISTS.map(list => {
          const isActive = list.key === selectedKey;
          return (
            <button
              key={list.key}
              onClick={() => setSelectedKey(list.key)}
              className="px-3.5 py-2 rounded-xl text-sm font-medium border transition-colors"
              style={isActive
                ? { backgroundColor: '#8B5E34', color: '#FFFFFF', borderColor: '#8B5E34' }
                : { backgroundColor: '#FFFFFF', color: '#6B4A2D', borderColor: '#E8DED2' }}
            >
              {list.label}
            </button>
          );
        })}
      </div>

      <Card>
        <div className="mb-1">
          <h2 className="text-sm font-semibold" style={{ color: '#3A2A1A' }}>{def.label}</h2>
          <p className="text-xs mt-0.5" style={{ color: '#B0A090' }}>{def.description}</p>
        </div>

        {/* Add row */}
        <div className="flex items-end gap-2 mt-4 mb-5">
          <div className="flex-1">
            <Input
              label="הוספת ערך חדש"
              value={newValue}
              onChange={e => setNewValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
              placeholder="הקלד/י ערך ולחץ/י הוסף"
              disabled={!tableReady}
            />
          </div>
          <Button onClick={handleAdd} loading={adding} disabled={!tableReady || !newValue.trim()}>
            הוסף
          </Button>
        </div>

        {/* List body */}
        {loading ? (
          <div className="flex justify-center py-10"><LoadingSpinner /></div>
        ) : loadError ? (
          <div className="rounded-xl border px-4 py-6 text-center text-sm" style={{ borderColor: '#D8BCB6', backgroundColor: '#F7EEEC', color: '#8A3228' }}>
            {loadError}
            <div className="mt-3">
              <Button variant="outline" size="sm" onClick={() => load(selectedKey)}>נסה שוב</Button>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title="אין ערכים ברשימה" description="הוסף/י את הערך הראשון בעזרת השדה למעלה." />
        ) : (
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#EFE7DA' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: '#FAF7F0', color: '#8A7664' }}>
                  <th className="text-right font-medium px-4 py-2.5">ערך</th>
                  <th className="text-right font-medium px-4 py-2.5">תווית</th>
                  <th className="text-right font-medium px-4 py-2.5">סטטוס</th>
                  <th className="text-left font-medium px-4 py-2.5">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} className="border-t" style={{ borderColor: '#F0EAE0', opacity: row.is_active ? 1 : 0.6 }}>
                    <td className="px-4 py-2.5" style={{ color: '#3A2A1A' }}>
                      {row.value}
                      {row.is_system && (
                        <span className="mr-2 text-[11px] px-1.5 py-0.5 rounded" style={{ backgroundColor: '#F5EFE8', color: '#8A7664' }}>
                          ברירת מחדל
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5" style={{ color: '#6B4A2D' }}>{row.label}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={row.is_active
                          ? { backgroundColor: '#E4EEE8', color: '#2A5C38' }
                          : { backgroundColor: '#F0EAE8', color: '#8A3228' }}
                      >
                        {row.is_active ? 'פעיל' : 'מושבת'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-3 justify-end">
                        <button
                          onClick={() => openEdit(row)}
                          disabled={!tableReady}
                          className="text-xs font-medium hover:underline disabled:opacity-40"
                          style={{ color: '#2A4E6B' }}
                        >
                          עריכה
                        </button>
                        <button
                          onClick={() => toggleActive(row)}
                          disabled={!tableReady || busyId === row.id}
                          className="text-xs font-medium hover:underline disabled:opacity-40"
                          style={{ color: '#7A5820' }}
                        >
                          {row.is_active ? 'השבת' : 'הפעל'}
                        </button>
                        {!row.is_system && (
                          <button
                            onClick={() => setDeleteTarget(row)}
                            disabled={!tableReady}
                            className="text-xs font-medium hover:underline disabled:opacity-40"
                            style={{ color: '#8A3228' }}
                          >
                            מחיקה
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Edit modal */}
      <Modal open={!!editRow} onClose={() => setEditRow(null)} title="עריכת ערך" size="sm">
        <div className="space-y-4">
          <Input
            label="ערך"
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            disabled={!!editRow?.is_system}
          />
          {editRow?.is_system && (
            <p className="text-xs" style={{ color: '#B0A090' }}>
              ערך ברירת מחדל — ניתן לשנות את התווית בלבד.
            </p>
          )}
          <Input label="תווית להצגה" value={editLabel} onChange={e => setEditLabel(e.target.value)} />
          <div className="flex gap-3 justify-end pt-1">
            <Button variant="outline" onClick={() => setEditRow(null)}>ביטול</Button>
            <Button onClick={handleSaveEdit} loading={savingEdit} disabled={!editLabel.trim()}>שמור</Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        title="מחיקת ערך"
        description={`למחוק את "${deleteTarget?.value}"? אם הערך בשימוש לא ניתן יהיה למחוק אותו — ניתן להשבית במקום.`}
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
