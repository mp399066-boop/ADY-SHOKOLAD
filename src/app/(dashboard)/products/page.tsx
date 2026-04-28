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
    if (tab === 'products') setForm({ שם_מוצר: '', סוג_מוצר: 'מוצר רגיל', מחיר: 0, פעיל: true, תיאור: '' });
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

      const res = await fetch(url, {
        method: editMode ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
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

  const tabList = [
    { key: 'products',   label: 'מוצרים למכירה',  count: products.length },
    { key: 'packages',   label: 'מארזים',          count: packages.length },
    { key: 'petitfours', label: 'סוגי פטיפורים',   count: petitFours.length },
  ];

  const filteredProducts = products.filter(p =>
    p.סוג_מוצר !== 'מארז פטיפורים' && (!search || p.שם_מוצר.includes(search)),
  );
  const filteredPackages = packages.filter(p =>
    !search || p.שם_מארז.includes(search),
  );
  const filteredPetitFours = petitFours.filter(p =>
    !search || p.שם_פטיפור.includes(search),
  );

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
            <div className="mr-auto">
              <Button size="sm" onClick={openAdd}>+ הוסף</Button>
            </div>
          </div>

          {loading ? (
            <PageLoading />
          ) : (
            <>
              {/* Products tab */}
              {tab === 'products' && (
                filteredProducts.length === 0 ? (
                  <EmptyState
                    title="אין מוצרים"
                    description="הוסף מוצרים לקטלוג"
                    action={<Button onClick={openAdd}>+ מוצר חדש</Button>}
                  />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredProducts.map(p => (
                      <div
                        key={p.id}
                        className="bg-white rounded-xl border overflow-hidden hover:shadow-md transition-all"
                        style={{ borderColor: '#EDE0CE' }}
                      >
                        {p.תמונה_url && (
                          <img
                            src={p.תמונה_url}
                            alt={p.שם_מוצר}
                            className="w-full h-36 object-cover"
                          />
                        )}
                        {!p.תמונה_url && (
                          <div
                            className="w-full h-24 flex items-center justify-center"
                            style={{ backgroundColor: '#F5ECD8' }}
                          >
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
                          <p className="text-xs mb-2" style={{ color: '#9B7A5A' }}>{p.סוג_מוצר}</p>
                          {p.תיאור && (
                            <p className="text-xs mb-2 line-clamp-2" style={{ color: '#6B4A2D' }}>{p.תיאור}</p>
                          )}
                          <div className="flex items-center justify-between mt-2">
                            <span className="font-bold text-sm" style={{ color: '#8B5E34' }}>
                              {formatCurrency(p.מחיר)}
                            </span>
                            <div className="flex gap-2">
                              <button
                                onClick={() => openEdit(p)}
                                className="text-xs hover:underline"
                                style={{ color: '#8B5E34' }}
                              >
                                עריכה
                              </button>
                              <button
                                onClick={() => toggleActive(p.id, p.פעיל)}
                                className="text-xs hover:underline"
                                style={{ color: '#9B7A5A' }}
                              >
                                {p.פעיל ? 'השבת' : 'הפעל'}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {/* Packages tab */}
              {tab === 'packages' && (
                filteredPackages.length === 0 ? (
                  <EmptyState title="אין מארזים" action={<Button onClick={openAdd}>+ מארז חדש</Button>} />
                ) : (
                  <div className="overflow-x-auto rounded-lg border" style={{ borderColor: '#EDE0CE' }}>
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ backgroundColor: '#FAF7F0', borderBottom: '1px solid #EDE0CE' }}>
                          {['שם מארז', 'גודל', 'מקסימום סוגים', 'מחיר', 'סטטוס', ''].map(h => (
                            <th
                              key={h}
                              className="px-4 py-3 text-right text-xs font-semibold"
                              style={{ color: '#6B4A2D' }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPackages.map(pkg => (
                          <tr
                            key={pkg.id}
                            className="border-b hover:bg-amber-50 transition-colors"
                            style={{ borderColor: '#F5ECD8' }}
                          >
                            <td className="px-4 py-3 font-medium text-xs" style={{ color: '#2B1A10' }}>
                              {pkg.שם_מארז}
                            </td>
                            <td className="px-4 py-3 text-xs" style={{ color: '#6B4A2D' }}>
                              {pkg.גודל_מארז} יח׳
                            </td>
                            <td className="px-4 py-3 text-xs" style={{ color: '#6B4A2D' }}>
                              {pkg.כמה_סוגים_מותר_לבחור} סוגים
                            </td>
                            <td className="px-4 py-3 text-xs font-semibold" style={{ color: '#8B5E34' }}>
                              {formatCurrency(pkg.מחיר_מארז)}
                            </td>
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
                              <button
                                onClick={() => openEdit(pkg)}
                                className="text-xs hover:underline"
                                style={{ color: '#8B5E34' }}
                              >
                                עריכה
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}

              {/* Petit fours tab */}
              {tab === 'petitfours' && (
                filteredPetitFours.length === 0 ? (
                  <EmptyState title="אין סוגי פטיפורים" action={<Button onClick={openAdd}>+ הוסף</Button>} />
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {filteredPetitFours.map(pf => (
                      <div
                        key={pf.id}
                        className="bg-white rounded-xl border p-3 flex items-center justify-between hover:shadow-sm transition-all"
                        style={{ borderColor: '#EDE0CE' }}
                      >
                        <span className="font-medium text-sm" style={{ color: '#2B1A10' }}>
                          {pf.שם_פטיפור}
                        </span>
                        <div className="flex items-center gap-2">
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
                          <button
                            onClick={() => openEdit(pf)}
                            className="text-xs hover:underline"
                            style={{ color: '#8B5E34' }}
                          >
                            עריכה
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </>
          )}
        </div>
      </Card>

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
