'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { exportToCsv } from '@/lib/exportCsv';
import { IconExport, IconEye, IconEdit, IconTrash } from '@/components/icons';
import { ActionBtn } from '@/components/ui/RowActions';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { BulkActionBar } from '@/components/ui/BulkActionBar';
import toast from 'react-hot-toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PageLoading } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Input';
import type { Customer } from '@/types/database';

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [count, setCount] = useState(0);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    setSelected(prev => prev.size === customers.length ? new Set() : new Set(customers.map(c => c.id)));
  };
  const clearSelected = () => setSelected(new Set());

  useEffect(() => { clearSelected(); }, [search, typeFilter]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (typeFilter) params.set('type', typeFilter);
    params.set('limit', '100');

    fetch(`/api/customers?${params}`)
      .then(r => r.json())
      .then(({ data, count }) => { setCustomers(data || []); setCount(count || 0); })
      .finally(() => setLoading(false));
  }, [search, typeFilter]);

  const handleDelete = async () => {
    if (!confirmId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/customers/${confirmId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error || 'שגיאה במחיקה'); return; }
      setCustomers(prev => prev.filter(c => c.id !== confirmId));
      setCount(prev => prev - 1);
      toast.success('לקוח נמחק');
      setConfirmId(null);
    } catch { toast.error('שגיאה במחיקה'); }
    finally { setDeleting(false); }
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      const res = await fetch('/api/customers/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', ids: Array.from(selected) }),
      });
      const { succeeded, failed } = await res.json();
      if (succeeded > 0) {
        toast.success(`${succeeded} לקוחות נמחקו`);
        setCustomers(prev => prev.filter(c => !selected.has(c.id)));
        setCount(prev => prev - succeeded);
      }
      if (failed > 0) toast.error(`${failed} לקוחות לא נמחקו`);
      clearSelected();
      setShowBulkConfirm(false);
    } catch { toast.error('שגיאה במחיקה'); }
    finally { setBulkDeleting(false); }
  };

  const handleExport = () => {
    exportToCsv('לקוחות.csv',
      ['שם פרטי', 'שם משפחה', 'טלפון', 'אימייל', 'סוג לקוח'],
      customers.map(c => [c.שם_פרטי, c.שם_משפחה, c.טלפון || '', c.אימייל || '', c.סוג_לקוח]),
    );
  };

  const allSelected = customers.length > 0 && selected.size === customers.length;
  const someSelected = selected.size > 0 && selected.size < customers.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Input
          placeholder="חיפוש שם, טלפון, אימייל..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="w-40"
        >
          <option value="">כל הסוגים</option>
          {['פרטי', 'חוזר', 'עסקי'].map(t => <option key={t} value={t}>{t}</option>)}
        </Select>
        <span className="text-sm mr-auto" style={{ color: '#6B4A2D' }}>{count} לקוחות</span>
        <Link href="/customers/new"><Button size="sm">+ לקוח חדש</Button></Link>
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border bg-white hover:bg-[#FAF7F2] transition-all duration-200"
          style={{ borderColor: '#D8CCBA', color: '#8B5E34' }}
        >
          <IconExport className="w-3.5 h-3.5" />
          ייצוא לאקסל
        </button>
      </div>

      {loading ? <PageLoading /> : customers.length === 0 ? (
        <EmptyState title="אין לקוחות" description="לא נמצאו לקוחות" action={<Link href="/customers/new"><Button>+ לקוח חדש</Button></Link>} />
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: '#FAF7F0', borderBottom: '1px solid #E7D2A6' }}>
                  <th className="px-4 py-3 w-9">
                    <input
                      type="checkbox"
                      className="w-3.5 h-3.5 cursor-pointer rounded"
                      style={{ accentColor: '#8B5E34' }}
                      checked={allSelected}
                      ref={el => { if (el) el.indeterminate = someSelected; }}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  {['שם מלא', 'טלפון', 'אימייל', 'סוג לקוח', 'הנחה', 'פעולות'].map(h => (
                    <th key={h} className="px-4 py-3 text-right text-xs font-semibold" style={{ color: '#6B4A2D' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {customers.map(c => {
                  const isSelected = selected.has(c.id);
                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-amber-50 transition-colors border-b cursor-pointer"
                      style={{
                        borderColor: '#F5ECD8',
                        backgroundColor: isSelected ? '#FEF9EF' : undefined,
                      }}
                      onClick={() => router.push(`/customers/${c.id}`)}
                    >
                      <td className="px-4 py-3 w-9" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="w-3.5 h-3.5 cursor-pointer rounded"
                          style={{ accentColor: '#8B5E34' }}
                          checked={isSelected}
                          onChange={e => toggleSelect(c.id, e as unknown as React.MouseEvent)}
                          onClick={e => e.stopPropagation()}
                        />
                      </td>
                      <td className="px-4 py-3 font-medium" style={{ color: '#2B1A10' }}>
                        {c.שם_פרטי} {c.שם_משפחה}
                      </td>
                      <td className="px-4 py-3" style={{ color: '#6B4A2D' }}>{c.טלפון || '-'}</td>
                      <td className="px-4 py-3" style={{ color: '#6B4A2D' }}>{c.אימייל || '-'}</td>
                      <td className="px-4 py-3"><StatusBadge status={c.סוג_לקוח} type="customer" /></td>
                      <td className="px-4 py-3">{c.אחוז_הנחה ? `${c.אחוז_הנחה}%` : '-'}</td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-0.5">
                          <ActionBtn title="צפייה" href={`/customers/${c.id}`} icon={<IconEye className="w-4 h-4" />} />
                          <ActionBtn title="עריכה" href={`/customers/${c.id}`} icon={<IconEdit className="w-4 h-4" />} />
                          <ActionBtn title="מחיקה" variant="danger" onClick={() => setConfirmId(c.id)} icon={<IconTrash className="w-4 h-4" />} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <ConfirmModal
        open={!!confirmId}
        onClose={() => setConfirmId(null)}
        onConfirm={handleDelete}
        loading={deleting}
      />

      <ConfirmModal
        open={showBulkConfirm}
        title={`מחיקת ${selected.size} לקוחות`}
        description={`האם למחוק ${selected.size} לקוחות? פעולה זו אינה ניתנת לביטול.`}
        confirmLabel="מחק הכל"
        onClose={() => setShowBulkConfirm(false)}
        onConfirm={handleBulkDelete}
        loading={bulkDeleting}
      />

      <BulkActionBar
        count={selected.size}
        onClear={clearSelected}
        actions={[
          {
            label: 'מחיקה',
            variant: 'danger',
            icon: <IconTrash className="w-3.5 h-3.5" />,
            onClick: () => setShowBulkConfirm(true),
          },
        ]}
      />
    </div>
  );
}
