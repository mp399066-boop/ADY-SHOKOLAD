'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PageLoading } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Tabs } from '@/components/ui/Tabs';
import { Modal } from '@/components/ui/Modal';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { IconAlert, IconExport, IconEdit, IconTrash } from '@/components/icons';
import { ActionBtn } from '@/components/ui/RowActions';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { BulkActionBar } from '@/components/ui/BulkActionBar';
import { exportToCsv } from '@/lib/exportCsv';
import { formatCurrency } from '@/lib/utils';
import toast from 'react-hot-toast';
import type { RawMaterial, Product, PetitFourType } from '@/types/database';

type ActiveTab = 'raw' | 'products' | 'petitfours' | 'alerts' | 'movements';
type QtyMode = 'add' | 'subtract' | 'set';

export default function InventoryPage() {
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [stockProducts, setStockProducts] = useState<Product[]>([]);
  const [stockPetitFours, setStockPetitFours] = useState<PetitFourType[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ActiveTab>('raw');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<Partial<RawMaterial> | null>(null);
  const [saving, setSaving] = useState(false);
  const [editStockId, setEditStockId] = useState<string | null>(null);
  const [editStockQty, setEditStockQty] = useState(0);
  const [savingStock, setSavingStock] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Separate confirm state for finished-product deletes — keeps the raw-material
  // delete flow untouched and lets us show a product-specific confirm message.
  const [confirmProduct, setConfirmProduct] = useState<{ id: string; name: string } | null>(null);
  const [deletingProduct, setDeletingProduct] = useState(false);
  // Inline threshold editor for finished products. The trigger added in
  // migration 021 recomputes סטטוס_מלאי from these values, so saving them
  // immediately reflects in the alerts tab and dashboard count.
  const [editThresholdId, setEditThresholdId] = useState<string | null>(null);
  const [editLow, setEditLow] = useState(0);
  const [editCritical, setEditCritical] = useState(0);
  const [savingThreshold, setSavingThreshold] = useState(false);

  // Bulk state
  const [selRaw, setSelRaw] = useState<Set<string>>(new Set());
  const [selProducts, setSelProducts] = useState<Set<string>>(new Set());
  const [selPF, setSelPF] = useState<Set<string>>(new Set());
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showQtyModal, setShowQtyModal] = useState(false);
  const [qtyMode, setQtyMode] = useState<QtyMode>('add');
  const [qtyValue, setQtyValue] = useState(0);
  const [savingBulkQty, setSavingBulkQty] = useState(false);

  const currentSel = tab === 'raw' ? selRaw : tab === 'products' ? selProducts : selPF;
  const setCurrentSel = (fn: (prev: Set<string>) => Set<string>) => {
    if (tab === 'raw') setSelRaw(fn);
    else if (tab === 'products') setSelProducts(fn);
    else setSelPF(fn);
  };
  const clearSel = () => setCurrentSel(() => new Set());

  useEffect(() => { clearSel(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSel = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentSel(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const fetchInventory = () => {
    setLoading(true);
    const params = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
    fetch(`/api/inventory${params}`)
      .then(r => r.json())
      .then(({ data }) => setMaterials(data || []))
      .finally(() => setLoading(false));
  };

  const fetchProductStock = () => {
    fetch('/api/products').then(r => r.json()).then(({ data }) => setStockProducts(data || []));
  };

  const fetchPetitFourStock = () => {
    fetch('/api/petit-four-types').then(r => r.json()).then(({ data }) => setStockPetitFours(data || []));
  };

  useEffect(() => { fetchInventory(); }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // Alerts tab also needs the product list — productAlerts is derived from it.
    if (tab === 'products' || tab === 'alerts') fetchProductStock();
    if (tab === 'petitfours') fetchPetitFourStock();
  }, [tab]);

  const saveProductStock = async (productId: string, qty: number) => {
    setSavingStock(true);
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ כמות_במלאי: qty }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'שגיאה בשמירה');
      // Use the row returned by the API — it carries the trigger-computed
      // סטטוס_מלאי so the badge updates without a separate refetch.
      const updated = json.data as Product | undefined;
      setStockProducts(prev => prev.map(p => p.id === productId
        ? (updated ? { ...p, ...updated } : { ...p, כמות_במלאי: qty })
        : p,
      ));
      setEditStockId(null);
      toast.success('מלאי עודכן');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'שגיאה בשמירה');
    } finally { setSavingStock(false); }
  };

  const saveProductThresholds = async (productId: string, low: number, critical: number) => {
    setSavingThreshold(true);
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ סף_מלאי_נמוך: low, סף_מלאי_קריטי: critical }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'שגיאה בשמירה');
      // Re-fetch the row so we get the trigger-recomputed סטטוס_מלאי. Avoids
      // any drift between client guess and the value Postgres just set.
      const updated = json.data as Product | undefined;
      if (updated) {
        setStockProducts(prev => prev.map(p => p.id === productId ? { ...p, ...updated } : p));
      }
      setEditThresholdId(null);
      toast.success('ספי התראה עודכנו');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'שגיאה בשמירה');
    } finally { setSavingThreshold(false); }
  };

  const savePetitFourStock = async (pfId: string, qty: number) => {
    setSavingStock(true);
    try {
      const res = await fetch(`/api/petit-four-types/${pfId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ כמות_במלאי: qty }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'שגיאה בשמירה');
      setStockPetitFours(prev => prev.map(p => p.id === pfId ? { ...p, כמות_במלאי: qty } : p));
      setEditStockId(null);
      toast.success('מלאי עודכן');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'שגיאה בשמירה');
    } finally { setSavingStock(false); }
  };

  const handleDeleteMaterial = async (id: string) => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/inventory/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) {
        const isFK = (json.error || '').includes('foreign key') || (json.error || '').includes('violates');
        toast.error(isFK ? 'לא ניתן למחוק כי קיימות רשומות מקושרות' : (json.error || 'שגיאה במחיקה'));
        return;
      }
      toast.success('נמחק בהצלחה');
      setConfirmId(null);
      fetchInventory();
    } catch { toast.error('שגיאה במחיקה'); }
    finally { setDeleting(false); }
  };

  const handleDeleteProduct = async (id: string) => {
    setDeletingProduct(true);
    try {
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) {
        // Same FK fallback shape as raw-material delete — products that already
        // appear in past orders / recipes / price-list rows can't be hard-deleted.
        const isFK = (json.error || '').includes('foreign key') || (json.error || '').includes('violates');
        toast.error(isFK ? 'לא ניתן למחוק כי קיימות הזמנות/מתכונים/מחירונים שמקושרים למוצר' : (json.error || 'שגיאה במחיקה'));
        return;
      }
      toast.success('מוצר נמחק');
      setStockProducts(prev => prev.filter(p => p.id !== id));
      setSelProducts(prev => { const next = new Set(prev); next.delete(id); return next; });
      setConfirmProduct(null);
    } catch { toast.error('שגיאה במחיקה'); }
    finally { setDeletingProduct(false); }
  };

  const handleBulkDeleteRaw = async () => {
    setBulkDeleting(true);
    try {
      const res = await fetch('/api/inventory/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', ids: Array.from(selRaw) }),
      });
      const { succeeded, failed } = await res.json();
      if (succeeded > 0) {
        toast.success(`${succeeded} פריטים נמחקו`);
        setMaterials(prev => prev.filter(m => !selRaw.has(m.id)));
        setSelRaw(new Set());
      }
      if (failed > 0) toast.error(`${failed} פריטים לא נמחקו (קיימות רשומות מקושרות)`);
      setShowBulkConfirm(false);
    } catch { toast.error('שגיאה במחיקה'); }
    finally { setBulkDeleting(false); }
  };

  const handleBulkQtyUpdate = async () => {
    setSavingBulkQty(true);
    try {
      let endpoint = '';
      let ids: string[] = [];

      if (tab === 'raw') {
        endpoint = '/api/inventory/bulk';
        ids = Array.from(selRaw);
      } else if (tab === 'products') {
        endpoint = '/api/products/bulk-stock';
        ids = Array.from(selProducts);
      } else {
        endpoint = '/api/petit-four-types/bulk';
        ids = Array.from(selPF);
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'adjust_qty', ids, mode: qtyMode, value: qtyValue }),
      });
      const { succeeded, failed } = await res.json();
      if (succeeded > 0) toast.success(`${succeeded} פריטים עודכנו`);
      if (failed > 0) toast.error(`${failed} פריטים לא עודכנו`);

      clearSel();
      setShowQtyModal(false);
      if (tab === 'raw') fetchInventory();
      else if (tab === 'products') fetchProductStock();
      else fetchPetitFourStock();
    } catch { toast.error('שגיאה בעדכון'); }
    finally { setSavingBulkQty(false); }
  };

  const openAdd = () => {
    setEditItem({
      שם_חומר_גלם: '', כמות_במלאי: 0, יחידת_מידה: 'ק"ג',
      סף_מלאי_נמוך: 0, סף_מלאי_קריטי: 0, מחיר_ליחידה: 0, הערות: '',
    });
    setShowModal(true);
  };

  const openEdit = (item: RawMaterial) => {
    setEditItem(item);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!editItem?.שם_חומר_גלם) { toast.error('שם חומר גלם הוא שדה חובה'); return; }
    setSaving(true);
    try {
      const isEdit = !!(editItem as RawMaterial).id;
      const url = isEdit ? `/api/inventory/${(editItem as RawMaterial).id}` : '/api/inventory';
      const method = isEdit ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editItem) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success('נשמר בהצלחה');
      setShowModal(false);
      fetchInventory();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'שגיאה');
    } finally { setSaving(false); }
  };

  const handleExport = () => {
    if (tab === 'products') {
      exportToCsv('מלאי_מוצרים.csv', ['שם מוצר', 'כמות במלאי'], stockProducts.map(p => [p.שם_מוצר, p.כמות_במלאי]));
    } else if (tab === 'petitfours') {
      exportToCsv('מלאי_פטיפורים.csv', ['שם פטיפור', 'כמות במלאי'], stockPetitFours.map(p => [p.שם_פטיפור, p.כמות_במלאי]));
    } else {
      exportToCsv('חומרי_גלם.csv',
        ['שם חומר גלם', 'כמות במלאי', 'יחידה', 'סף נמוך', 'סף קריטי', 'סטטוס', 'עלות ליחידה'],
        filtered.map(m => [m.שם_חומר_גלם, m.כמות_במלאי, m.יחידת_מידה, m.סף_מלאי_נמוך, m.סף_מלאי_קריטי, m.סטטוס_מלאי, m.מחיר_ליחידה ?? '']),
      );
    }
  };

  const alerts = materials.filter(m => m.סטטוס_מלאי !== 'תקין');
  const criticals = materials.filter(m => m.סטטוס_מלאי === 'קריטי' || m.סטטוס_מלאי === 'אזל מהמלאי');

  // Finished-product alerts — populated from the trigger added in migration 021.
  // Inactive products are excluded so an archived item never raises a flag.
  const productAlerts = stockProducts.filter(p => p.פעיל && p.סטטוס_מלאי && p.סטטוס_מלאי !== 'תקין');
  const productCriticals = productAlerts.filter(p => p.סטטוס_מלאי === 'קריטי' || p.סטטוס_מלאי === 'אזל מהמלאי');
  const productLow = productAlerts.filter(p => p.סטטוס_מלאי === 'מלאי נמוך');
  const totalAlertsCount = alerts.length + productAlerts.length;

  const filtered = materials.filter(m => {
    const matchSearch = !search || m.שם_חומר_גלם.includes(search);
    const matchStatus = !statusFilter || m.סטטוס_מלאי === statusFilter;
    return matchSearch && matchStatus;
  });

  const tabList = [
    { key: 'raw',        label: 'חומרי גלם',      count: materials.length },
    { key: 'products',   label: 'מוצרים מוגמרים', count: stockProducts.length },
    { key: 'petitfours', label: 'פטיפורים',        count: stockPetitFours.length },
    { key: 'alerts',     label: 'התראות מלאי',     count: totalAlertsCount },
    { key: 'movements',  label: 'תנועות מלאי' },
  ];

  // Select-all helpers for each tab
  const rawAllSel = filtered.length > 0 && selRaw.size === filtered.length;
  const rawSomeSel = selRaw.size > 0 && selRaw.size < filtered.length;
  const prodAllSel = stockProducts.length > 0 && selProducts.size === stockProducts.length;
  const prodSomeSel = selProducts.size > 0 && selProducts.size < stockProducts.length;
  const pfAllSel = stockPetitFours.length > 0 && selPF.size === stockPetitFours.length;
  const pfSomeSel = selPF.size > 0 && selPF.size < stockPetitFours.length;

  const openQtyModal = () => { setQtyMode('add'); setQtyValue(0); setShowQtyModal(true); };

  // Bulk bar actions per tab
  const bulkActions = tab === 'raw'
    ? [
        { label: 'עדכן כמות', onClick: openQtyModal },
        { label: 'מחיקה', variant: 'danger' as const, icon: <IconTrash className="w-3.5 h-3.5" />, onClick: () => setShowBulkConfirm(true) },
      ]
    : [{ label: 'עדכן כמות', onClick: openQtyModal }];

  return (
    <div className="space-y-4">
      {/* Critical alert banner */}
      {criticals.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl p-4 border" style={{ backgroundColor: '#FEF2F2', borderColor: '#FECACA' }}>
          <IconAlert className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-500" />
          <div>
            <p className="text-sm font-semibold text-red-700">{criticals.length} פריטים במצב קריטי / אזל מהמלאי</p>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {criticals.map(m => (
                <span key={m.id} className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: '#FEE2E2', color: '#991B1B' }}>
                  {m.שם_חומר_גלם}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <Card className="p-0 overflow-hidden">
        <div className="px-5 pt-4">
          <Tabs tabs={tabList} activeTab={tab} onChange={k => setTab(k as ActiveTab)} />
        </div>

        <div className="p-5">
          {/* Raw materials tab */}
          {tab === 'raw' && (
            <>
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <input
                  type="text"
                  placeholder="חיפוש שם..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="px-3 py-2 text-sm rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-amber-100"
                  style={{ borderColor: '#DDD0BC', color: '#2B1A10', maxWidth: '200px' }}
                />
                <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-40">
                  <option value="">כל הסטטוסים</option>
                  {['תקין', 'מלאי נמוך', 'קריטי', 'אזל מהמלאי'].map(s => <option key={s} value={s}>{s}</option>)}
                </Select>
                <button
                  onClick={handleExport}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border bg-white hover:bg-[#FAF7F2] transition-all duration-200"
                  style={{ borderColor: '#D8CCBA', color: '#8B5E34' }}
                >
                  <IconExport className="w-3.5 h-3.5" />
                  ייצוא לאקסל
                </button>
                <div className="mr-auto">
                  <Button size="sm" onClick={openAdd}>+ חומר גלם חדש</Button>
                </div>
              </div>

              {loading ? (
                <PageLoading />
              ) : filtered.length === 0 ? (
                <EmptyState title="אין חומרי גלם" description="הוסף חומרי גלם למעקב" action={<Button onClick={openAdd}>+ הוסף</Button>} />
              ) : (
                <div className="overflow-x-auto rounded-lg border" style={{ borderColor: '#EDE0CE' }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ backgroundColor: '#FAF7F0', borderBottom: '1px solid #EDE0CE' }}>
                        <th className="px-4 py-3 w-9">
                          <input
                            type="checkbox"
                            className="w-3.5 h-3.5 cursor-pointer rounded"
                            style={{ accentColor: '#8B5E34' }}
                            checked={rawAllSel}
                            ref={el => { if (el) el.indeterminate = rawSomeSel; }}
                            onChange={() => setSelRaw(prev => prev.size === filtered.length ? new Set() : new Set(filtered.map(m => m.id)))}
                          />
                        </th>
                        {['שם חומר גלם', 'כמות במלאי', 'יחידה', 'סף נמוך', 'סף קריטי', 'סטטוס', 'עלות ליח׳', ''].map(h => (
                          <th key={h} className="px-4 py-3 text-right text-xs font-semibold" style={{ color: '#6B4A2D' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(m => {
                        const isSelected = selRaw.has(m.id);
                        return (
                          <tr
                            key={m.id}
                            className="border-b hover:bg-amber-50 transition-colors"
                            style={{ borderColor: '#F5ECD8', backgroundColor: isSelected ? '#FEF9EF' : undefined }}
                          >
                            <td className="px-4 py-3 w-9">
                              <input
                                type="checkbox"
                                className="w-3.5 h-3.5 cursor-pointer rounded"
                                style={{ accentColor: '#8B5E34' }}
                                checked={isSelected}
                                onChange={e => toggleSel(m.id, e as unknown as React.MouseEvent)}
                                onClick={e => e.stopPropagation()}
                              />
                            </td>
                            <td className="px-4 py-3 font-medium text-xs" style={{ color: '#2B1A10' }}>{m.שם_חומר_גלם}</td>
                            <td className="px-4 py-3">
                              <span
                                className="text-xs font-semibold"
                                style={{
                                  color: m.כמות_במלאי === 0 ? '#991B1B'
                                    : m.כמות_במלאי <= m.סף_מלאי_קריטי ? '#B45309'
                                    : m.כמות_במלאי <= m.סף_מלאי_נמוך ? '#D97706'
                                    : '#2B1A10',
                                }}
                              >
                                {m.כמות_במלאי}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs" style={{ color: '#6B4A2D' }}>{m.יחידת_מידה}</td>
                            <td className="px-4 py-3 text-xs" style={{ color: '#6B4A2D' }}>{m.סף_מלאי_נמוך}</td>
                            <td className="px-4 py-3 text-xs" style={{ color: '#6B4A2D' }}>{m.סף_מלאי_קריטי}</td>
                            <td className="px-4 py-3"><StatusBadge status={m.סטטוס_מלאי} type="inventory" /></td>
                            <td className="px-4 py-3 text-xs">{m.מחיר_ליחידה ? formatCurrency(m.מחיר_ליחידה) : '—'}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-0.5">
                                <ActionBtn title="עריכה" onClick={() => openEdit(m)} icon={<IconEdit className="w-4 h-4" />} />
                                <ActionBtn title="מחיקה" variant="danger" onClick={() => setConfirmId(m.id)} icon={<IconTrash className="w-4 h-4" />} />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* Finished products tab */}
          {tab === 'products' && (
            <>
              <div className="flex justify-start mb-3">
                <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border bg-white hover:bg-[#FAF7F2] transition-all duration-200" style={{ borderColor: '#D8CCBA', color: '#8B5E34' }}>
                  <IconExport className="w-3.5 h-3.5" />ייצוא לאקסל
                </button>
              </div>
              <div className="overflow-x-auto rounded-lg border" style={{ borderColor: '#EDE0CE' }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: '#FAF7F0', borderBottom: '1px solid #EDE0CE' }}>
                      <th className="px-4 py-3 w-9">
                        <input
                          type="checkbox"
                          className="w-3.5 h-3.5 cursor-pointer rounded"
                          style={{ accentColor: '#8B5E34' }}
                          checked={prodAllSel}
                          ref={el => { if (el) el.indeterminate = prodSomeSel; }}
                          onChange={() => setSelProducts(prev => prev.size === stockProducts.length ? new Set() : new Set(stockProducts.map(p => p.id)))}
                        />
                      </th>
                      {['שם מוצר', 'סוג', 'מחיר ליח׳', 'כמות במלאי', 'ספים (נמוך / קריטי)', 'סטטוס', ''].map(h => (
                        <th key={h} className="px-4 py-3 text-right text-xs font-semibold" style={{ color: '#6B4A2D' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stockProducts.map(p => {
                      const isSelected = selProducts.has(p.id);
                      return (
                        <tr key={p.id} className="border-b hover:bg-amber-50 transition-colors" style={{ borderColor: '#F5ECD8', backgroundColor: isSelected ? '#FEF9EF' : undefined }}>
                          <td className="px-4 py-3 w-9">
                            <input
                              type="checkbox"
                              className="w-3.5 h-3.5 cursor-pointer rounded"
                              style={{ accentColor: '#8B5E34' }}
                              checked={isSelected}
                              onChange={e => toggleSel(p.id, e as unknown as React.MouseEvent)}
                              onClick={e => e.stopPropagation()}
                            />
                          </td>
                          <td className="px-4 py-3 font-medium text-xs" style={{ color: '#2B1A10' }}>{p.שם_מוצר}</td>
                          <td className="px-4 py-3 text-xs" style={{ color: '#6B4A2D' }}>{p.סוג_מוצר}</td>
                          <td className="px-4 py-3 text-xs">{formatCurrency(p.מחיר)}</td>
                          <td className="px-4 py-3">
                            {editStockId === p.id ? (
                              <div className="flex items-center gap-2">
                                <input type="number" className="w-20 px-2 py-1 text-xs border rounded" style={{ borderColor: '#DDD0BC' }} value={editStockQty} min={0} onChange={e => setEditStockQty(Number(e.target.value))} />
                                <button className="text-xs px-2 py-1 rounded" style={{ backgroundColor: '#8B5E34', color: '#FFF' }} onClick={() => saveProductStock(p.id, editStockQty)} disabled={savingStock}>שמור</button>
                                <button className="text-xs" style={{ color: '#9B7A5A' }} onClick={() => setEditStockId(null)}>ביטול</button>
                              </div>
                            ) : (
                              <span className="text-xs font-semibold" style={{ color: (p.כמות_במלאי || 0) === 0 ? '#991B1B' : '#2B1A10' }}>
                                {p.כמות_במלאי || 0} יח׳
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {editThresholdId === p.id ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number" min={0} value={editLow}
                                  onChange={e => setEditLow(Number(e.target.value))}
                                  className="w-14 px-1.5 py-1 text-xs border rounded text-center"
                                  style={{ borderColor: '#FDE68A' }}
                                  title="סף נמוך"
                                />
                                <span className="text-xs" style={{ color: '#9B7A5A' }}>/</span>
                                <input
                                  type="number" min={0} value={editCritical}
                                  onChange={e => setEditCritical(Number(e.target.value))}
                                  className="w-14 px-1.5 py-1 text-xs border rounded text-center"
                                  style={{ borderColor: '#FECACA' }}
                                  title="סף קריטי"
                                />
                                <button className="text-xs px-2 py-1 rounded" style={{ backgroundColor: '#8B5E34', color: '#FFF' }} onClick={() => saveProductThresholds(p.id, editLow, editCritical)} disabled={savingThreshold}>שמור</button>
                                <button className="text-xs" style={{ color: '#9B7A5A' }} onClick={() => setEditThresholdId(null)}>ביטול</button>
                              </div>
                            ) : (
                              <span className="text-xs tabular-nums" style={{ color: '#6B4A2D' }}>
                                {(p.סף_מלאי_נמוך ?? 0) === 0 && (p.סף_מלאי_קריטי ?? 0) === 0
                                  ? <span style={{ color: '#9B7A5A' }}>לא הוגדרו</span>
                                  : `${p.סף_מלאי_נמוך ?? 0} / ${p.סף_מלאי_קריטי ?? 0}`}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={p.סטטוס_מלאי || 'תקין'} type="inventory" />
                          </td>
                          <td className="px-4 py-3">
                            {editStockId !== p.id && editThresholdId !== p.id && (
                              <div className="flex items-center gap-2">
                                <button className="text-xs hover:underline" style={{ color: '#8B5E34' }} onClick={() => { setEditStockId(p.id); setEditStockQty(p.כמות_במלאי ?? 0); }}>
                                  עדכן מלאי
                                </button>
                                <button
                                  className="text-xs hover:underline"
                                  style={{ color: '#8B5E34' }}
                                  onClick={() => {
                                    setEditThresholdId(p.id);
                                    setEditLow(p.סף_מלאי_נמוך ?? 0);
                                    setEditCritical(p.סף_מלאי_קריטי ?? 0);
                                  }}
                                  title="ערוך ספי התראה"
                                >
                                  ספים
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmProduct({ id: p.id, name: p.שם_מוצר })}
                                  title="מחק מוצר"
                                  aria-label={`מחק ${p.שם_מוצר}`}
                                  className="w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-red-50"
                                  style={{ color: '#B91C1C' }}
                                >
                                  <IconTrash className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {stockProducts.length === 0 && <div className="py-12 text-center text-sm" style={{ color: '#9B7A5A' }}>אין מוצרים</div>}
              </div>
            </>
          )}

          {/* Petit fours tab */}
          {tab === 'petitfours' && (
            <>
              <div className="flex justify-start mb-3">
                <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border bg-white hover:bg-[#FAF7F2] transition-all duration-200" style={{ borderColor: '#D8CCBA', color: '#8B5E34' }}>
                  <IconExport className="w-3.5 h-3.5" />ייצוא לאקסל
                </button>
              </div>
              <div className="overflow-x-auto rounded-lg border" style={{ borderColor: '#EDE0CE' }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: '#FAF7F0', borderBottom: '1px solid #EDE0CE' }}>
                      <th className="px-4 py-3 w-9">
                        <input
                          type="checkbox"
                          className="w-3.5 h-3.5 cursor-pointer rounded"
                          style={{ accentColor: '#8B5E34' }}
                          checked={pfAllSel}
                          ref={el => { if (el) el.indeterminate = pfSomeSel; }}
                          onChange={() => setSelPF(prev => prev.size === stockPetitFours.length ? new Set() : new Set(stockPetitFours.map(p => p.id)))}
                        />
                      </th>
                      {['שם פטיפור', 'פעיל', 'כמות במלאי', ''].map(h => (
                        <th key={h} className="px-4 py-3 text-right text-xs font-semibold" style={{ color: '#6B4A2D' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stockPetitFours.map(pf => {
                      const isSelected = selPF.has(pf.id);
                      return (
                        <tr key={pf.id} className="border-b hover:bg-amber-50 transition-colors" style={{ borderColor: '#F5ECD8', backgroundColor: isSelected ? '#FEF9EF' : undefined }}>
                          <td className="px-4 py-3 w-9">
                            <input
                              type="checkbox"
                              className="w-3.5 h-3.5 cursor-pointer rounded"
                              style={{ accentColor: '#8B5E34' }}
                              checked={isSelected}
                              onChange={e => toggleSel(pf.id, e as unknown as React.MouseEvent)}
                              onClick={e => e.stopPropagation()}
                            />
                          </td>
                          <td className="px-4 py-3 font-medium text-xs" style={{ color: '#2B1A10' }}>{pf.שם_פטיפור}</td>
                          <td className="px-4 py-3">
                            <span className="text-xs px-2 py-0.5 rounded-full" style={pf.פעיל ? { backgroundColor: '#DCFCE7', color: '#166534' } : { backgroundColor: '#F3F4F6', color: '#6B7280' }}>
                              {pf.פעיל ? 'פעיל' : 'לא פעיל'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {editStockId === pf.id ? (
                              <div className="flex items-center gap-2">
                                <input type="number" className="w-20 px-2 py-1 text-xs border rounded" style={{ borderColor: '#DDD0BC' }} value={editStockQty} min={0} onChange={e => setEditStockQty(Number(e.target.value))} />
                                <button className="text-xs px-2 py-1 rounded" style={{ backgroundColor: '#8B5E34', color: '#FFF' }} onClick={() => savePetitFourStock(pf.id, editStockQty)} disabled={savingStock}>שמור</button>
                                <button className="text-xs" style={{ color: '#9B7A5A' }} onClick={() => setEditStockId(null)}>ביטול</button>
                              </div>
                            ) : (
                              <span className="text-xs font-semibold" style={{ color: (pf.כמות_במלאי || 0) === 0 ? '#991B1B' : '#2B1A10' }}>
                                {pf.כמות_במלאי || 0} יח׳
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {editStockId !== pf.id && (
                              <button className="text-xs hover:underline" style={{ color: '#8B5E34' }} onClick={() => { setEditStockId(pf.id); setEditStockQty(pf.כמות_במלאי ?? 0); }}>
                                עדכן מלאי
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {stockPetitFours.length === 0 && <div className="py-12 text-center text-sm" style={{ color: '#9B7A5A' }}>אין סוגי פטיפורים</div>}
              </div>
            </>
          )}

          {/* Alerts tab — combines raw materials AND finished products */}
          {tab === 'alerts' && (
            <>
              {totalAlertsCount === 0 ? (
                <EmptyState title="אין התראות מלאי" description="כל הפריטים — חומרי גלם ומוצרים מוכנים — במצב תקין" />
              ) : (
                <div className="space-y-5">
                  {/* RAW MATERIALS — critical */}
                  {criticals.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#DC2626' }}>חומרי גלם · קריטי / אזל</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {criticals.map(m => (
                          <div key={m.id} className="rounded-xl border p-4" style={{ borderColor: '#FECACA', backgroundColor: '#FFF5F5' }}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-semibold text-sm" style={{ color: '#2B1A10' }}>{m.שם_חומר_גלם}</span>
                              <StatusBadge status={m.סטטוס_מלאי} type="inventory" />
                            </div>
                            <div className="text-xs space-y-1" style={{ color: '#6B4A2D' }}>
                              <div>כמות: <span className="font-bold text-red-600">{m.כמות_במלאי} {m.יחידת_מידה}</span></div>
                              <div>מינימום: {m.סף_מלאי_נמוך} {m.יחידת_מידה}</div>
                            </div>
                            <button onClick={() => openEdit(m)} className="mt-3 text-xs hover:underline" style={{ color: '#8B5E34' }}>עדכן כמות</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* RAW MATERIALS — low */}
                  {(() => {
                    const low = alerts.filter(m => m.סטטוס_מלאי === 'מלאי נמוך');
                    return low.length > 0 ? (
                      <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#D97706' }}>חומרי גלם · מלאי נמוך</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {low.map(m => (
                            <div key={m.id} className="rounded-xl border p-4" style={{ borderColor: '#FDE68A', backgroundColor: '#FFFBEB' }}>
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-semibold text-sm" style={{ color: '#2B1A10' }}>{m.שם_חומר_גלם}</span>
                                <StatusBadge status={m.סטטוס_מלאי} type="inventory" />
                              </div>
                              <div className="text-xs space-y-1" style={{ color: '#6B4A2D' }}>
                                <div>כמות: <span className="font-bold text-amber-600">{m.כמות_במלאי} {m.יחידת_מידה}</span></div>
                                <div>מינימום: {m.סף_מלאי_נמוך} {m.יחידת_מידה}</div>
                              </div>
                              <button onClick={() => openEdit(m)} className="mt-3 text-xs hover:underline" style={{ color: '#8B5E34' }}>עדכן כמות</button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null;
                  })()}
                  {/* FINISHED PRODUCTS — critical */}
                  {productCriticals.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#DC2626' }}>מוצרים מוכנים · קריטי / אזל</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {productCriticals.map(p => (
                          <div key={p.id} className="rounded-xl border p-4" style={{ borderColor: '#FECACA', backgroundColor: '#FFF5F5' }}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-semibold text-sm" style={{ color: '#2B1A10' }}>{p.שם_מוצר}</span>
                              <StatusBadge status={p.סטטוס_מלאי || 'תקין'} type="inventory" />
                            </div>
                            <div className="text-xs space-y-1" style={{ color: '#6B4A2D' }}>
                              <div>כמות: <span className="font-bold text-red-600">{p.כמות_במלאי || 0} יח׳</span></div>
                              <div>סף קריטי: {p.סף_מלאי_קריטי ?? 0} יח׳</div>
                            </div>
                            <button
                              onClick={() => { setTab('products'); setEditStockId(p.id); setEditStockQty(p.כמות_במלאי ?? 0); }}
                              className="mt-3 text-xs hover:underline"
                              style={{ color: '#8B5E34' }}
                            >
                              עדכן כמות
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* FINISHED PRODUCTS — low */}
                  {productLow.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#D97706' }}>מוצרים מוכנים · מלאי נמוך</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {productLow.map(p => (
                          <div key={p.id} className="rounded-xl border p-4" style={{ borderColor: '#FDE68A', backgroundColor: '#FFFBEB' }}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-semibold text-sm" style={{ color: '#2B1A10' }}>{p.שם_מוצר}</span>
                              <StatusBadge status={p.סטטוס_מלאי || 'תקין'} type="inventory" />
                            </div>
                            <div className="text-xs space-y-1" style={{ color: '#6B4A2D' }}>
                              <div>כמות: <span className="font-bold text-amber-600">{p.כמות_במלאי || 0} יח׳</span></div>
                              <div>סף נמוך: {p.סף_מלאי_נמוך ?? 0} יח׳</div>
                            </div>
                            <button
                              onClick={() => { setTab('products'); setEditStockId(p.id); setEditStockQty(p.כמות_במלאי ?? 0); }}
                              className="mt-3 text-xs hover:underline"
                              style={{ color: '#8B5E34' }}
                            >
                              עדכן כמות
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {tab === 'movements' && (
            <EmptyState title="תנועות מלאי" description="היסטוריית תנועות מלאי תופיע כאן. פיצ׳ר זה יתווסף בקרוב." />
          )}
        </div>
      </Card>

      {/* Single delete confirm */}
      <ConfirmModal
        open={!!confirmId}
        onClose={() => setConfirmId(null)}
        onConfirm={() => handleDeleteMaterial(confirmId!)}
        loading={deleting}
      />

      {/* Product delete confirm */}
      <ConfirmModal
        open={!!confirmProduct}
        title={confirmProduct ? `מחיקת ${confirmProduct.name}` : 'מחיקת מוצר'}
        description="המוצר יוסר לצמיתות. אם קיימות הזמנות/מתכונים/מחירונים שמקושרים אליו — המחיקה תיחסם והמערכת תציג הודעה."
        confirmLabel="מחק מוצר"
        onClose={() => setConfirmProduct(null)}
        onConfirm={() => handleDeleteProduct(confirmProduct!.id)}
        loading={deletingProduct}
      />

      {/* Bulk delete confirm */}
      <ConfirmModal
        open={showBulkConfirm}
        title={`מחיקת ${selRaw.size} פריטים`}
        description={`האם למחוק ${selRaw.size} פריטים? פעולה זו אינה ניתנת לביטול.`}
        confirmLabel="מחק הכל"
        onClose={() => setShowBulkConfirm(false)}
        onConfirm={handleBulkDeleteRaw}
        loading={bulkDeleting}
      />

      {/* Bulk qty modal */}
      <Modal open={showQtyModal} onClose={() => setShowQtyModal(false)} title="עדכון כמות מרוכז" size="sm">
        <div className="space-y-5">
          <p className="text-sm" style={{ color: '#6B4A2D' }}>
            עדכון כמות עבור <strong>{currentSel.size}</strong> פריטים נבחרים
          </p>
          <div>
            <p className="text-xs font-medium mb-2" style={{ color: '#6B4A2D' }}>סוג עדכון</p>
            <div className="flex gap-2">
              {([['add', 'הוספה (+)'], ['subtract', 'הפחתה (-)'], ['set', 'קביעה (=)']] as [QtyMode, string][]).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => setQtyMode(mode)}
                  className="flex-1 py-2 text-xs rounded-xl border font-medium transition-colors"
                  style={
                    qtyMode === mode
                      ? { backgroundColor: '#8B5E34', color: '#FFF', borderColor: '#8B5E34' }
                      : { backgroundColor: '#FFF', color: '#6B4A2D', borderColor: '#DDD0BC' }
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <Input
            label="כמות"
            type="number"
            value={qtyValue}
            onChange={e => setQtyValue(Number(e.target.value))}
            min={0}
            step={0.01}
          />
          <div className="flex gap-3 justify-end pt-1">
            <Button variant="outline" onClick={() => setShowQtyModal(false)}>ביטול</Button>
            <Button onClick={handleBulkQtyUpdate} loading={savingBulkQty}>עדכן כמות</Button>
          </div>
        </div>
      </Modal>

      {/* Add / Edit raw material modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={(editItem as RawMaterial)?.id ? 'עריכת חומר גלם' : 'חומר גלם חדש'}>
        <div className="space-y-4">
          <Input label="שם חומר גלם" required value={editItem?.שם_חומר_גלם || ''} onChange={e => setEditItem(p => ({ ...p, שם_חומר_גלם: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="כמות במלאי" type="number" value={editItem?.כמות_במלאי ?? 0} onChange={e => setEditItem(p => ({ ...p, כמות_במלאי: Number(e.target.value) }))} min={0} step={0.01} />
            <Select label="יחידת מידה" value={editItem?.יחידת_מידה || 'ק"ג'} onChange={e => setEditItem(p => ({ ...p, יחידת_מידה: e.target.value }))}>
              {['ק"ג', 'גרם', 'ליטר', 'מ"ל', 'יח׳', 'כף', 'כוס'].map(u => <option key={u} value={u}>{u}</option>)}
            </Select>
            <Input label="סף מלאי נמוך" type="number" value={editItem?.סף_מלאי_נמוך ?? 0} onChange={e => setEditItem(p => ({ ...p, סף_מלאי_נמוך: Number(e.target.value) }))} min={0} step={0.01} />
            <Input label="סף מלאי קריטי" type="number" value={editItem?.סף_מלאי_קריטי ?? 0} onChange={e => setEditItem(p => ({ ...p, סף_מלאי_קריטי: Number(e.target.value) }))} min={0} step={0.01} />
            <Input label="מחיר ליחידה (₪)" type="number" value={editItem?.מחיר_ליחידה ?? 0} onChange={e => setEditItem(p => ({ ...p, מחיר_ליחידה: Number(e.target.value) }))} min={0} step={0.01} />
            <Input label="תאריך תפוגה" type="date" value={editItem?.תאריך_תפוגה || ''} onChange={e => setEditItem(p => ({ ...p, תאריך_תפוגה: e.target.value || null }))} />
          </div>
          <Textarea label="הערות" value={editItem?.הערות || ''} onChange={e => setEditItem(p => ({ ...p, הערות: e.target.value }))} rows={2} />
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setShowModal(false)}>ביטול</Button>
            <Button onClick={handleSave} loading={saving}>שמור</Button>
          </div>
        </div>
      </Modal>

      {/* Bulk action bar */}
      <BulkActionBar
        count={currentSel.size}
        onClear={clearSel}
        actions={bulkActions}
      />
    </div>
  );
}
