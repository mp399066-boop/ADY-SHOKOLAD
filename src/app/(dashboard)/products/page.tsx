'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { PageLoading } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/utils';
import { exportToCsv } from '@/lib/exportCsv';
import { IconExport, IconEdit, IconTrash } from '@/components/icons';
import { ActionBtn } from '@/components/ui/RowActions';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { BulkActionBar } from '@/components/ui/BulkActionBar';
import toast from 'react-hot-toast';
import type { Product, Package, PetitFourType } from '@/types/database';

type Tab = 'products' | 'packages' | 'petitfours';

export default function ProductsPage() {
  const [tab, setTab] = useState<Tab>('products');
  const [products, setProducts] = useState<Product[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [petitFours, setPetitFours] = useState<PetitFourType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string | number | boolean>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; type: Tab } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Bulk state — one Set per tab
  const [selProducts, setSelProducts] = useState<Set<string>>(new Set());
  const [selPackages, setSelPackages] = useState<Set<string>>(new Set());
  const [selPF, setSelPF] = useState<Set<string>>(new Set());
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkToggling, setBulkToggling] = useState(false);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [priceMode, setPriceMode] = useState<'set' | 'add' | 'subtract' | 'percent'>('set');
  const [priceValue, setPriceValue] = useState<number>(0);
  const [bulkPricing, setBulkPricing] = useState(false);

  const currentSel = tab === 'products' ? selProducts : tab === 'packages' ? selPackages : selPF;
  const currentItems = tab === 'products' ? filteredProductsArr() : tab === 'packages' ? filteredPackagesArr() : filteredPFArr();

  function filteredProductsArr() {
    return products.filter(p => p.סוג_מוצר !== 'מארז פטיפורים' && (!search || p.שם_מוצר.includes(search)));
  }
  function filteredPackagesArr() {
    return packages.filter(p => !search || p.שם_מארז.includes(search));
  }
  function filteredPFArr() {
    return petitFours.filter(p => !search || p.שם_פטיפור.includes(search));
  }

  const setCurrentSel = (fn: (prev: Set<string>) => Set<string>) => {
    if (tab === 'products') setSelProducts(fn);
    else if (tab === 'packages') setSelPackages(fn);
    else setSelPF(fn);
  };

  const toggleSel = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentSel(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelAll = () => {
    const ids = currentItems.map((i: { id: string }) => i.id);
    setCurrentSel(prev => prev.size === ids.length ? new Set() : new Set(ids));
  };

  const clearSel = () => setCurrentSel(() => new Set());

  // Clear selection when tab or search changes
  useEffect(() => { clearSel(); }, [tab, search]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAll = () => {
    setLoading(true);
    Promise.all([
      fetch('/api/products').then(r => r.json()),
      fetch('/api/packages').then(r => r.json()),
      fetch('/api/petit-four-types').then(r => r.json()),
    ]).then(([p, pkg, pf]) => {
      setProducts(p.data || []);
      setPackages(pkg.data || []);
      setPetitFours(pf.data || []);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, []);

  const openAdd = () => {
    setEditMode(false);
    setEditId(null);
    if (tab === 'products') setForm({ שם_מוצר: '', סוג_מוצר: 'מוצר רגיל', מחיר: 0, פעיל: true, תיאור: '', price_availability: 'retail', לקוחות_עסקיים_בלבד: false });
    if (tab === 'packages') setForm({ שם_מארז: '', גודל_מארז: 0, כמה_סוגים_מותר_לבחור: 1, מחיר_מארז: 0, פעיל: true });
    if (tab === 'petitfours') setForm({ שם_פטיפור: '', פעיל: true, הערות: '' });
    setShowModal(true);
  };

  const openEdit = (item: Product | Package | PetitFourType) => {
    setEditMode(true);
    setEditId(item.id);
    setForm(item as unknown as Record<string, string | number | boolean>);
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let url = editMode && editId ? `/api/products/${editId}` : '/api/products';
      if (tab === 'packages') url = editMode && editId ? `/api/packages/${editId}` : '/api/packages';
      if (tab === 'petitfours') url = editMode && editId ? `/api/petit-four-types/${editId}` : '/api/petit-four-types';

      const body = tab === 'products'
        ? {
            ...form,
            לקוחות_עסקיים_בלבד: form.price_availability !== 'retail',
          }
        : form;

      const res = await fetch(url, {
        method: editMode ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success(editMode ? 'עודכן בהצלחה' : 'נשמר בהצלחה');
      setShowModal(false);
      fetchAll();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (id: string, active: boolean) => {
    await fetch(`/api/products/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ פעיל: !active }),
    });
    fetchAll();
  };

  const handleDelete = async (id: string, entityType: Tab) => {
    setDeleting(true);
    try {
      const url =
        entityType === 'packages' ? `/api/packages/${id}` :
        entityType === 'petitfours' ? `/api/petit-four-types/${id}` :
        `/api/products/${id}`;
      const res = await fetch(url, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) {
        const isFK = (json.error || '').includes('foreign key') || (json.error || '').includes('violates');
        toast.error(isFK ? 'לא ניתן למחוק כי קיימות רשומות מקושרות' : (json.error || 'שגיאה במחיקה'));
        return;
      }
      toast.success('נמחק בהצלחה');
      setConfirmDelete(null);
      fetchAll();
    } catch { toast.error('שגיאה במחיקה'); }
    finally { setDeleting(false); }
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      const ids = Array.from(currentSel);
      const res = await fetch('/api/products/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', ids }),
      });
      const { succeeded, failed } = await res.json();
      if (succeeded > 0) toast.success(`${succeeded} פריטים נמחקו`);
      if (failed > 0) toast.error(`${failed} פריטים לא נמחקו (קיימות רשומות מקושרות)`);
      clearSel();
      setShowBulkConfirm(false);
      fetchAll();
    } catch { toast.error('שגיאה במחיקה'); }
    finally { setBulkDeleting(false); }
  };

  const handleBulkPrice = async () => {
    setBulkPricing(true);
    try {
      const ids = Array.from(currentSel);
      const res = await fetch('/api/products/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_price', ids, mode: priceMode, value: priceValue }),
      });
      const { succeeded, failed } = await res.json();
      if (succeeded > 0) toast.success(`המחיר עודכן ל-${succeeded} מוצרים`);
      if (failed > 0) toast.error(`${failed} מוצרים לא עודכנו`);
      clearSel();
      setShowPriceModal(false);
      fetchAll();
    } catch { toast.error('שגיאה בעדכון מחיר'); }
    finally { setBulkPricing(false); }
  };

  const handleBulkToggle = async (activate: boolean) => {
    setBulkToggling(true);
    try {
      const ids = Array.from(currentSel);
      const res = await fetch('/api/products/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_active', ids, value: activate }),
      });
      const { succeeded, failed } = await res.json();
      if (succeeded > 0) toast.success(`${succeeded} מוצרים ${activate ? 'הופעלו' : 'הושבתו'}`);
      if (failed > 0) toast.error(`${failed} מוצרים לא עודכנו`);
      clearSel();
      fetchAll();
    } catch { toast.error('שגיאה בעדכון'); }
    finally { setBulkToggling(false); }
  };

  const tabList = [
    { key: 'products',   label: 'מוצרים למכירה',  count: products.filter(p => p.סוג_מוצר !== 'מארז פטיפורים').length },
    { key: 'packages',   label: 'מארזים',          count: packages.length },
    { key: 'petitfours', label: 'סוגי פטיפורים',   count: petitFours.length },
  ];

  const handleExport = () => {
    const fp = filteredProductsArr();
    const fpkg = filteredPackagesArr();
    const fpf = filteredPFArr();
    if (tab === 'products') {
      exportToCsv('מוצרים.csv',
        ['שם מוצר', 'סוג', 'מחיר', 'פעיל', 'כמות במלאי'],
        fp.map(p => [p.שם_מוצר, p.סוג_מוצר, p.מחיר, p.פעיל ? 'כן' : 'לא', p.כמות_במלאי]),
      );
    } else if (tab === 'packages') {
      exportToCsv('מארזים.csv',
        ['שם מארז', 'גודל', 'מחיר', 'פעיל'],
        fpkg.map(p => [p.שם_מארז, p.גודל_מארז, p.מחיר_מארז, p.פעיל ? 'כן' : 'לא']),
      );
    } else {
      exportToCsv('פטיפורים.csv',
        ['שם פטיפור', 'פעיל', 'כמות במלאי'],
        fpf.map(p => [p.שם_פטיפור, p.פעיל ? 'כן' : 'לא', p.כמות_במלאי]),
      );
    }
  };

  const filteredProducts = filteredProductsArr();
  const filteredPackages = filteredPackagesArr();
  const filteredPetitFours = filteredPFArr();

  const allSelected = currentItems.length > 0 && currentSel.size === currentItems.length;
  const someSelected = currentSel.size > 0 && currentSel.size < currentItems.length;

  // Bulk bar actions per tab
  const bulkActions = tab === 'products'
    ? [
        { label: 'שינוי מחיר', onClick: () => { setPriceMode('set'); setPriceValue(0); setShowPriceModal(true); } },
        { label: 'הפעל', onClick: () => handleBulkToggle(true) },
        { label: 'השבת', onClick: () => handleBulkToggle(false) },
        { label: 'מחיקה', variant: 'danger' as const, icon: <IconTrash className="w-3.5 h-3.5" />, onClick: () => setShowBulkConfirm(true) },
      ]
    : [
        { label: 'מחיקה', variant: 'danger' as const, icon: <IconTrash className="w-3.5 h-3.5" />, onClick: () => setShowBulkConfirm(true) },
      ];

  return (
    <div className="space-y-4">
      <Card className="p-0 overflow-hidden">
        <div className="px-5 pt-4">
          <Tabs tabs={tabList} activeTab={tab} onChange={k => setTab(k as Tab)} />
        </div>

        <div className="p-5">
          {/* Toolbar */}
          <div className="flex items-center gap-3 mb-5">
            <input
              type="text"
              placeholder="חיפוש..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-amber-100"
              style={{ borderColor: '#DDD0BC', color: '#2B1A10', maxWidth: '200px' }}
            />
            {/* Select all for card layouts */}
            {(tab === 'products' || tab === 'petitfours') && currentItems.length > 0 && (
              <label className="flex items-center gap-1.5 cursor-pointer text-xs" style={{ color: '#8B5E34' }}>
                <input
                  type="checkbox"
                  className="w-3.5 h-3.5 rounded cursor-pointer"
                  style={{ accentColor: '#8B5E34' }}
                  checked={allSelected}
                  ref={el => { if (el) el.indeterminate = someSelected; }}
                  onChange={toggleSelAll}
                />
                בחר הכל
              </label>
            )}
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border bg-white hover:bg-[#FAF7F2] transition-all duration-200"
              style={{ borderColor: '#D8CCBA', color: '#8B5E34' }}
            >
              <IconExport className="w-3.5 h-3.5" />
              ייצוא לאקסל
            </button>
          </div>

          {loading ? (
            <PageLoading />
          ) : (
            <>
              {/* Products tab — card grid */}
              {tab === 'products' && (
                filteredProducts.length === 0 ? (
                  <EmptyState
                    title="אין מוצרים"
                    description="הוסף מוצרים לקטלוג"
                    action={<Button onClick={openAdd}>+ מוצר חדש</Button>}
                  />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredProducts.map(p => {
                      const isSelected = selProducts.has(p.id);
                      return (
                        <div
                          key={p.id}
                          className="bg-white rounded-xl border overflow-hidden hover:shadow-md transition-all relative"
                          style={{ borderColor: isSelected ? '#C6A77D' : '#EDE0CE' }}
                        >
                          {/* Checkbox — top-right corner (RTL start) */}
                          <label
                            className="absolute z-10 flex items-center justify-center w-6 h-6 rounded-full cursor-pointer"
                            style={{ top: '8px', right: '8px', backgroundColor: 'rgba(255,255,255,0.92)' }}
                            onClick={e => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              className="w-3.5 h-3.5 cursor-pointer rounded"
                              style={{ accentColor: '#8B5E34' }}
                              checked={isSelected}
                              onChange={e => toggleSel(p.id, e as unknown as React.MouseEvent)}
                            />
                          </label>

                          {p.תמונה_url && (
                            <img src={p.תמונה_url} alt={p.שם_מוצר} className="w-full h-36 object-cover" />
                          )}
                          {!p.תמונה_url && (
                            <div className="w-full h-24 flex items-center justify-center" style={{ backgroundColor: '#F5ECD8' }}>
                              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.2} style={{ color: '#C7A46B' }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                              </svg>
                            </div>
                          )}
                          <div className="p-3">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <h3 className="font-semibold text-sm leading-tight" style={{ color: '#2B1A10' }}>
                                {p.שם_מוצר}
                              </h3>
                              <span
                                className="text-xs px-1.5 py-0.5 rounded-full flex-shrink-0"
                                style={
                                  p.פעיל
                                    ? { backgroundColor: '#D1FAE5', color: '#065F46' }
                                    : { backgroundColor: '#F3F4F6', color: '#6B7280' }
                                }
                              >
                                {p.פעיל ? 'פעיל' : 'לא פעיל'}
                              </span>
                            </div>
                            <p className="text-xs mb-2" style={{ color: '#9B7A5A' }}>
                              {p.סוג_מוצר}
                              {(p.price_availability === 'business_fixed' || p.price_availability === 'business_quantity' || (!p.price_availability && p.לקוחות_עסקיים_בלבד)) && (
                                <span className="mr-2 text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: '#EFF6FF', color: '#1D4ED8' }}>
                                  {p.price_availability === 'business_quantity' ? 'כמות' : 'עסקי בלבד'}
                                </span>
                              )}
                            </p>
                            {p.תיאור && (
                              <p className="text-xs mb-2 line-clamp-2" style={{ color: '#6B4A2D' }}>{p.תיאור}</p>
                            )}
                            <div className="flex items-center justify-between mt-2">
                              <span className="font-bold text-sm" style={{ color: '#8B5E34' }}>
                                {formatCurrency(p.מחיר)}
                              </span>
                              <div className="flex items-center gap-0.5">
                                <ActionBtn title="עריכה" onClick={() => openEdit(p)} icon={<IconEdit className="w-4 h-4" />} />
                                <button
                                  onClick={() => toggleActive(p.id, p.פעיל)}
                                  className="px-1.5 py-0.5 text-xs rounded transition-colors hover:bg-amber-50"
                                  style={{ color: '#9B7A5A' }}
                                >
                                  {p.פעיל ? 'השבת' : 'הפעל'}
                                </button>
                                <ActionBtn title="מחיקה" variant="danger" onClick={() => setConfirmDelete({ id: p.id, type: 'products' })} icon={<IconTrash className="w-4 h-4" />} />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              )}

              {/* Packages tab — table */}
              {tab === 'packages' && (
                filteredPackages.length === 0 ? (
                  <EmptyState title="אין מארזים" action={<Button onClick={openAdd}>+ מארז חדש</Button>} />
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
                              checked={allSelected}
                              ref={el => { if (el) el.indeterminate = someSelected; }}
                              onChange={toggleSelAll}
                            />
                          </th>
                          {['שם מארז', 'גודל', 'מקסימום סוגים', 'מחיר', 'סטטוס', ''].map(h => (
                            <th key={h} className="px-4 py-3 text-right text-xs font-semibold" style={{ color: '#6B4A2D' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPackages.map(pkg => {
                          const isSelected = selPackages.has(pkg.id);
                          return (
                            <tr
                              key={pkg.id}
                              className="border-b hover:bg-amber-50 transition-colors"
                              style={{ borderColor: '#F5ECD8', backgroundColor: isSelected ? '#FEF9EF' : undefined }}
                            >
                              <td className="px-4 py-3 w-9">
                                <input
                                  type="checkbox"
                                  className="w-3.5 h-3.5 cursor-pointer rounded"
                                  style={{ accentColor: '#8B5E34' }}
                                  checked={isSelected}
                                  onChange={e => toggleSel(pkg.id, e as unknown as React.MouseEvent)}
                                  onClick={e => e.stopPropagation()}
                                />
                              </td>
                              <td className="px-4 py-3 font-medium text-xs" style={{ color: '#2B1A10' }}>{pkg.שם_מארז}</td>
                              <td className="px-4 py-3 text-xs" style={{ color: '#6B4A2D' }}>{pkg.גודל_מארז} יח׳</td>
                              <td className="px-4 py-3 text-xs" style={{ color: '#6B4A2D' }}>{pkg.כמה_סוגים_מותר_לבחור} סוגים</td>
                              <td className="px-4 py-3 text-xs font-semibold" style={{ color: '#8B5E34' }}>{formatCurrency(pkg.מחיר_מארז)}</td>
                              <td className="px-4 py-3">
                                <span
                                  className="text-xs px-2 py-0.5 rounded-full"
                                  style={
                                    pkg.פעיל
                                      ? { backgroundColor: '#D1FAE5', color: '#065F46' }
                                      : { backgroundColor: '#F3F4F6', color: '#6B7280' }
                                  }
                                >
                                  {pkg.פעיל ? 'פעיל' : 'לא פעיל'}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-0.5">
                                  <ActionBtn title="עריכה" onClick={() => openEdit(pkg)} icon={<IconEdit className="w-4 h-4" />} />
                                  <ActionBtn title="מחיקה" variant="danger" onClick={() => setConfirmDelete({ id: pkg.id, type: 'packages' })} icon={<IconTrash className="w-4 h-4" />} />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              )}

              {/* Petit fours tab — small card grid */}
              {tab === 'petitfours' && (
                filteredPetitFours.length === 0 ? (
                  <EmptyState title="אין סוגי פטיפורים" action={<Button onClick={openAdd}>+ הוסף</Button>} />
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {filteredPetitFours.map(pf => {
                      const isSelected = selPF.has(pf.id);
                      return (
                        <div
                          key={pf.id}
                          className="bg-white rounded-xl border p-3 hover:shadow-sm transition-all"
                          style={{ borderColor: isSelected ? '#C6A77D' : '#EDE0CE' }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <input
                                type="checkbox"
                                className="w-3.5 h-3.5 cursor-pointer rounded flex-shrink-0"
                                style={{ accentColor: '#8B5E34' }}
                                checked={isSelected}
                                onChange={e => toggleSel(pf.id, e as unknown as React.MouseEvent)}
                                onClick={e => e.stopPropagation()}
                              />
                              <span className="font-medium text-xs truncate" style={{ color: '#2B1A10' }}>
                                {pf.שם_פטיפור}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <span
                                className="text-xs px-1.5 py-0.5 rounded-full"
                                style={
                                  pf.פעיל
                                    ? { backgroundColor: '#D1FAE5', color: '#065F46' }
                                    : { backgroundColor: '#F3F4F6', color: '#6B7280' }
                                }
                              >
                                {pf.פעיל ? '✓' : '—'}
                              </span>
                              <ActionBtn title="עריכה" onClick={() => openEdit(pf)} icon={<IconEdit className="w-4 h-4" />} />
                              <ActionBtn title="מחיקה" variant="danger" onClick={() => setConfirmDelete({ id: pf.id, type: 'petitfours' })} icon={<IconTrash className="w-4 h-4" />} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              )}
            </>
          )}
        </div>
      </Card>

      {/* Single delete confirm */}
      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => handleDelete(confirmDelete!.id, confirmDelete!.type)}
        loading={deleting}
      />

      {/* Bulk delete confirm */}
      <ConfirmModal
        open={showBulkConfirm}
        title={`מחיקת ${currentSel.size} פריטים`}
        description={`האם למחוק ${currentSel.size} פריטים? פעולה זו אינה ניתנת לביטול.`}
        confirmLabel="מחק הכל"
        onClose={() => setShowBulkConfirm(false)}
        onConfirm={handleBulkDelete}
        loading={bulkDeleting}
      />

      {/* Bulk action bar */}
      <BulkActionBar
        count={currentSel.size}
        onClear={clearSel}
        actions={bulkActions}
      />

      {/* Bulk price modal */}
      <Modal
        open={showPriceModal}
        onClose={() => setShowPriceModal(false)}
        title={`שינוי מחיר ל-${currentSel.size} מוצרים`}
        size="sm"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {([
              { key: 'set',      label: 'קביעת מחיר חדש' },
              { key: 'add',      label: 'הוספה למחיר' },
              { key: 'subtract', label: 'הפחתה מהמחיר' },
              { key: 'percent',  label: 'שינוי באחוזים' },
            ] as const).map(m => (
              <button
                key={m.key}
                onClick={() => setPriceMode(m.key)}
                className="px-3 py-2 text-xs rounded-lg border transition-all"
                style={{
                  borderColor: priceMode === m.key ? '#8B5E34' : '#E8DDD0',
                  backgroundColor: priceMode === m.key ? '#FEF9EF' : '#FFFFFF',
                  color: priceMode === m.key ? '#8B5E34' : '#6B4A2D',
                  fontWeight: priceMode === m.key ? 600 : 400,
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: '#6B4A2D' }}>
              {priceMode === 'percent' ? 'אחוז שינוי (חיובי להעלאה, שלילי להורדה)' : 'סכום (₪)'}
            </label>
            <input
              type="number"
              value={priceValue}
              onChange={e => setPriceValue(Number(e.target.value))}
              min={priceMode === 'percent' ? -100 : 0}
              step={priceMode === 'percent' ? 1 : 0.01}
              className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-amber-100"
              style={{ borderColor: '#DDD0BC', color: '#2B1A10' }}
              placeholder={priceMode === 'percent' ? 'לדוגמה: 10 להעלאה, -5 להורדה' : '0.00'}
            />
          </div>

          <div className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: '#FEF9EF', color: '#8B5E34', border: '1px solid #F0E0C0' }}>
            הפעולה תשפיע על {currentSel.size} מוצרים
          </div>

          <div className="flex gap-3 justify-end pt-1">
            <Button variant="outline" onClick={() => setShowPriceModal(false)}>ביטול</Button>
            <Button onClick={handleBulkPrice} loading={bulkPricing}>עדכן מחיר</Button>
          </div>
        </div>
      </Modal>

      {/* Floating action button */}
      <button
        onClick={openAdd}
        className="fixed bottom-6 left-6 z-30 flex items-center gap-2 px-5 py-3 rounded-2xl shadow-xl font-semibold text-sm transition-all hover:opacity-90 active:scale-95"
        style={{ backgroundColor: '#8B5E34', color: '#FFFFFF' }}
      >
        <span className="text-xl leading-none font-light">+</span>
        <span>
          {tab === 'products' ? 'מוצר חדש' : tab === 'packages' ? 'מארז חדש' : 'פטיפור חדש'}
        </span>
      </button>

      {/* Add / Edit Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={
          tab === 'products' ? (editMode ? 'עריכת מוצר' : 'מוצר חדש')
          : tab === 'packages' ? (editMode ? 'עריכת מארז' : 'מארז חדש')
          : (editMode ? 'עריכת פטיפור' : 'סוג פטיפור חדש')
        }
        size="md"
      >
        <div className="space-y-4">
          {tab === 'products' && (
            <>
              <Input
                label="שם מוצר"
                required
                value={String(form.שם_מוצר || '')}
                onChange={e => setForm(p => ({ ...p, שם_מוצר: e.target.value }))}
              />
              <Select
                label="סוג מוצר"
                value={String(form.סוג_מוצר || 'מוצר רגיל')}
                onChange={e => setForm(p => ({ ...p, סוג_מוצר: e.target.value }))}
              >
                <option value="מוצר רגיל">מוצר רגיל</option>
                <option value="מארז פטיפורים">מארז פטיפורים</option>
              </Select>
              <Input
                label="מחיר (₪)"
                type="number"
                value={Number(form.מחיר || 0)}
                onChange={e => setForm(p => ({ ...p, מחיר: Number(e.target.value) }))}
                min={0}
                step={0.01}
              />
              <Textarea
                label="תיאור"
                value={String(form.תיאור || '')}
                onChange={e => setForm(p => ({ ...p, תיאור: e.target.value }))}
                rows={2}
              />
              <Select
                label="זמינות מחירון"
                value={String(form.price_availability ?? 'retail')}
                onChange={e => setForm(p => ({ ...p, price_availability: e.target.value }))}
              >
                <option value="retail">זמין לכולם (מחיר קמעונאי)</option>
                <option value="business_fixed">לקוחות עסקיים קבועים (מחיר עסקי קבוע)</option>
                <option value="business_quantity">לקוחות עסקיים לפי כמות (מחיר כמות)</option>
              </Select>
            </>
          )}
          {tab === 'packages' && (
            <>
              <Input
                label="שם מארז"
                required
                value={String(form.שם_מארז || '')}
                onChange={e => setForm(p => ({ ...p, שם_מארז: e.target.value }))}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="גודל מארז (כמות פטיפורים)"
                  type="number"
                  value={Number(form.גודל_מארז || 0)}
                  onChange={e => setForm(p => ({ ...p, גודל_מארז: Number(e.target.value) }))}
                  min={1}
                />
                <Input
                  label="מקסימום סוגים"
                  type="number"
                  value={Number(form.כמה_סוגים_מותר_לבחור || 1)}
                  onChange={e => setForm(p => ({ ...p, כמה_סוגים_מותר_לבחור: Number(e.target.value) }))}
                  min={1}
                />
              </div>
              <Input
                label="מחיר מארז (₪)"
                type="number"
                value={Number(form.מחיר_מארז || 0)}
                onChange={e => setForm(p => ({ ...p, מחיר_מארז: Number(e.target.value) }))}
                min={0}
                step={0.01}
              />
              <Textarea
                label="הערות"
                value={String(form.הערות || '')}
                onChange={e => setForm(p => ({ ...p, הערות: e.target.value }))}
                rows={2}
              />
            </>
          )}
          {tab === 'petitfours' && (
            <>
              <Input
                label="שם פטיפור"
                required
                value={String(form.שם_פטיפור || '')}
                onChange={e => setForm(p => ({ ...p, שם_פטיפור: e.target.value }))}
              />
              <Textarea
                label="הערות"
                value={String(form.הערות || '')}
                onChange={e => setForm(p => ({ ...p, הערות: e.target.value }))}
                rows={2}
              />
            </>
          )}
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setShowModal(false)}>ביטול</Button>
            <Button onClick={handleSave} loading={saving}>{editMode ? 'שמור שינויים' : 'שמור'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
