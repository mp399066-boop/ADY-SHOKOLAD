'use client';

import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PageLoading } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Tabs } from '@/components/ui/Tabs';
import { Modal } from '@/components/ui/Modal';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { IconAlert } from '@/components/icons';
import { formatCurrency } from '@/lib/utils';
import toast from 'react-hot-toast';
import type { RawMaterial, Product, PetitFourType } from '@/types/database';

type ActiveTab = 'raw' | 'products' | 'petitfours' | 'alerts' | 'movements';

export default function InventoryPage() {
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [stockProducts, setStockProducts] = useState<Product[]>([]);
  const [stockPetitFours, setStockPetitFours] = useState<PetitFourType[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ActiveTab>('raw');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<Partial<RawMaterial> | null>(null);
  const [saving, setSaving] = useState(false);
  const [editStockId, setEditStockId] = useState<string | null>(null);
  const [editStockQty, setEditStockQty] = useState(0);
  const [savingStock, setSavingStock] = useState(false);

  const fetchInventory = () => {
    setLoading(true);
    const params = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
    fetch(`/api/inventory${params}`)
      .then(r => r.json())
      .then(({ data }) => setMaterials(data || []))
      .finally(() => setLoading(false));
  };

  const fetchProductStock = () => {
    fetch('/api/products')
      .then(r => r.json())
      .then(({ data }) => setStockProducts(data || []));
  };

  const fetchPetitFourStock = () => {
    fetch('/api/petit-four-types')
      .then(r => r.json())
      .then(({ data }) => setStockPetitFours(data || []));
  };

  useEffect(() => { fetchInventory(); }, [statusFilter]);

  useEffect(() => {
    if (tab === 'products') fetchProductStock();
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
      setStockProducts(prev => prev.map(p => p.id === productId ? { ...p, כמות_במלאי: qty } : p));
      setEditStockId(null);
      toast.success('מלאי עודכן');
    } catch (err: unknown) {
      console.error('saveProductStock error:', err);
      toast.error(err instanceof Error ? err.message : 'שגיאה בשמירה');
    } finally { setSavingStock(false); }
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
      console.error('savePetitFourStock error:', err);
      toast.error(err instanceof Error ? err.message : 'שגיאה בשמירה');
    } finally { setSavingStock(false); }
  };

  const handleDeleteMaterial = async (id: string) => {
    if (!window.confirm('האם אתה בטוח שברצונך למחוק את חומר הגלם?')) return;
    try {
      const res = await fetch(`/api/inventory/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) {
        const isFK = (json.error || '').includes('foreign key') || (json.error || '').includes('violates');
        toast.error(isFK ? 'לא ניתן למחוק כי קיימות רשומות מקושרות' : (json.error || 'שגיאה במחיקה'));
        return;
      }
      toast.success('נמחק בהצלחה');
      fetchInventory();
    } catch { toast.error('שגיאה במחיקה'); }
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
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editItem),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success('נשמר בהצלחה');
      setShowModal(false);
      fetchInventory();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setSaving(false);
    }
  };

  const alerts = materials.filter(m => m.סטטוס_מלאי !== 'תקין');
  const criticals = materials.filter(m => m.סטטוס_מלאי === 'קריטי' || m.סטטוס_מלאי === 'אזל מהמלאי');

  const filtered = materials.filter(m => {
    const matchSearch = !search || m.שם_חומר_גלם.includes(search);
    const matchStatus = !statusFilter || m.סטטוס_מלאי === statusFilter;
    return matchSearch && matchStatus;
  });

  const tabList = [
    { key: 'raw',        label: 'חומרי גלם',      count: materials.length },
    { key: 'products',   label: 'מוצרים מוגמרים', count: stockProducts.length },
    { key: 'petitfours', label: 'פטיפורים',        count: stockPetitFours.length },
    { key: 'alerts',     label: 'התראות מלאי',     count: alerts.length },
    { key: 'movements',  label: 'תנועות מלאי' },
  ];

  return (
    <div className="space-y-4">
      {/* Critical alert banner */}
      {criticals.length > 0 && (
        <div
          className="flex items-start gap-3 rounded-xl p-4 border"
          style={{ backgroundColor: '#FEF2F2', borderColor: '#FECACA' }}
        >
          <IconAlert className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-500" />
          <div>
            <p className="text-sm font-semibold text-red-700">
              {criticals.length} פריטים במצב קריטי / אזל מהמלאי
            </p>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {criticals.map(m => (
                <span
                  key={m.id}
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: '#FEE2E2', color: '#991B1B' }}
                >
                  {m.שם_חומר_גלם}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Card className="p-0 overflow-hidden">
        <div className="px-5 pt-4">
          <Tabs
            tabs={tabList}
            activeTab={tab}
            onChange={k => setTab(k as ActiveTab)}
          />
        </div>

        <div className="p-5">
          {tab === 'raw' && (
            <>
              {/* Filters row */}
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <input
                  type="text"
                  placeholder="חיפוש שם..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="px-3 py-2 text-sm rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-amber-100"
                  style={{ borderColor: '#DDD0BC', color: '#2B1A10', maxWidth: '200px' }}
                />
                <Select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="w-40"
                >
                  <option value="">כל הסטטוסים</option>
                  {['תקין', 'מלאי נמוך', 'קריטי', 'אזל מהמלאי'].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </Select>
                <div className="mr-auto">
                  <Button size="sm" onClick={openAdd}>+ חומר גלם חדש</Button>
                </div>
              </div>

              {loading ? (
                <PageLoading />
              ) : filtered.length === 0 ? (
                <EmptyState
                  title="אין חומרי גלם"
                  description="הוסף חומרי גלם למעקב"
                  action={<Button onClick={openAdd}>+ הוסף</Button>}
                />
              ) : (
                <div className="overflow-x-auto rounded-lg border" style={{ borderColor: '#EDE0CE' }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ backgroundColor: '#FAF7F0', borderBottom: '1px solid #EDE0CE' }}>
                        {['שם חומר גלם', 'כמות במלאי', 'יחידה', 'סף נמוך', 'סף קריטי', 'סטטוס', 'עלות ליח׳', ''].map(h => (
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
                      {filtered.map(m => (
                        <tr
                          key={m.id}
                          className="border-b hover:bg-amber-50 transition-colors"
                          style={{ borderColor: '#F5ECD8' }}
                        >
                          <td className="px-4 py-3 font-medium text-xs" style={{ color: '#2B1A10' }}>
                            {m.שם_חומר_גלם}
                          </td>
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
                          <td className="px-4 py-3">
                            <StatusBadge status={m.סטטוס_מלאי} type="inventory" />
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {m.מחיר_ליחידה ? formatCurrency(m.מחיר_ליחידה) : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => openEdit(m)}
                                className="text-xs hover:underline"
                                style={{ color: '#8B5E34' }}
                              >
                                עריכה
                              </button>
                              <button
                                onClick={() => handleDeleteMaterial(m.id)}
                                className="text-xs hover:underline"
                                style={{ color: '#C0392B' }}
                              >
                                מחק
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {tab === 'products' && (
            <div className="overflow-x-auto rounded-lg border" style={{ borderColor: '#EDE0CE' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: '#FAF7F0', borderBottom: '1px solid #EDE0CE' }}>
                    {['שם מוצר', 'סוג', 'מחיר ליח׳', 'כמות במלאי', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-right text-xs font-semibold" style={{ color: '#6B4A2D' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stockProducts.map(p => (
                    <tr key={p.id} className="border-b hover:bg-amber-50 transition-colors" style={{ borderColor: '#F5ECD8' }}>
                      <td className="px-4 py-3 font-medium text-xs" style={{ color: '#2B1A10' }}>{p.שם_מוצר}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: '#6B4A2D' }}>{p.סוג_מוצר}</td>
                      <td className="px-4 py-3 text-xs">{formatCurrency(p.מחיר)}</td>
                      <td className="px-4 py-3">
                        {editStockId === p.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              className="w-20 px-2 py-1 text-xs border rounded"
                              style={{ borderColor: '#DDD0BC' }}
                              value={editStockQty}
                              min={0}
                              onChange={e => setEditStockQty(Number(e.target.value))}
                            />
                            <button
                              className="text-xs px-2 py-1 rounded"
                              style={{ backgroundColor: '#8B5E34', color: '#FFF' }}
                              onClick={() => saveProductStock(p.id, editStockQty)}
                              disabled={savingStock}
                            >
                              שמור
                            </button>
                            <button className="text-xs" style={{ color: '#9B7A5A' }} onClick={() => setEditStockId(null)}>ביטול</button>
                          </div>
                        ) : (
                          <span
                            className="text-xs font-semibold"
                            style={{ color: (p.כמות_במלאי || 0) === 0 ? '#991B1B' : '#2B1A10' }}
                          >
                            {p.כמות_במלאי || 0} יח׳
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editStockId !== p.id && (
                          <button
                            className="text-xs hover:underline"
                            style={{ color: '#8B5E34' }}
                            onClick={() => { setEditStockId(p.id); setEditStockQty(p.כמות_במלאי ?? 0); }}
                          >
                            עדכן מלאי
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {stockProducts.length === 0 && (
                <div className="py-12 text-center text-sm" style={{ color: '#9B7A5A' }}>אין מוצרים</div>
              )}
            </div>
          )}

          {tab === 'petitfours' && (
            <div className="overflow-x-auto rounded-lg border" style={{ borderColor: '#EDE0CE' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: '#FAF7F0', borderBottom: '1px solid #EDE0CE' }}>
                    {['שם פטיפור', 'פעיל', 'כמות במלאי', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-right text-xs font-semibold" style={{ color: '#6B4A2D' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stockPetitFours.map(pf => (
                    <tr key={pf.id} className="border-b hover:bg-amber-50 transition-colors" style={{ borderColor: '#F5ECD8' }}>
                      <td className="px-4 py-3 font-medium text-xs" style={{ color: '#2B1A10' }}>{pf.שם_פטיפור}</td>
                      <td className="px-4 py-3">
                        <span
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={pf.פעיל ? { backgroundColor: '#DCFCE7', color: '#166534' } : { backgroundColor: '#F3F4F6', color: '#6B7280' }}
                        >
                          {pf.פעיל ? 'פעיל' : 'לא פעיל'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {editStockId === pf.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              className="w-20 px-2 py-1 text-xs border rounded"
                              style={{ borderColor: '#DDD0BC' }}
                              value={editStockQty}
                              min={0}
                              onChange={e => setEditStockQty(Number(e.target.value))}
                            />
                            <button
                              className="text-xs px-2 py-1 rounded"
                              style={{ backgroundColor: '#8B5E34', color: '#FFF' }}
                              onClick={() => savePetitFourStock(pf.id, editStockQty)}
                              disabled={savingStock}
                            >
                              שמור
                            </button>
                            <button className="text-xs" style={{ color: '#9B7A5A' }} onClick={() => setEditStockId(null)}>ביטול</button>
                          </div>
                        ) : (
                          <span
                            className="text-xs font-semibold"
                            style={{ color: (pf.כמות_במלאי || 0) === 0 ? '#991B1B' : '#2B1A10' }}
                          >
                            {pf.כמות_במלאי || 0} יח׳
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editStockId !== pf.id && (
                          <button
                            className="text-xs hover:underline"
                            style={{ color: '#8B5E34' }}
                            onClick={() => { setEditStockId(pf.id); setEditStockQty(pf.כמות_במלאי ?? 0); }}
                          >
                            עדכן מלאי
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {stockPetitFours.length === 0 && (
                <div className="py-12 text-center text-sm" style={{ color: '#9B7A5A' }}>אין סוגי פטיפורים</div>
              )}
            </div>
          )}

          {tab === 'alerts' && (
            <>
              {alerts.length === 0 ? (
                <EmptyState title="אין התראות מלאי" description="כל חומרי הגלם במצב תקין" />
              ) : (
                <div className="space-y-3">
                  {/* Critical */}
                  {criticals.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#DC2626' }}>
                        קריטי / אזל מהמלאי
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {criticals.map(m => (
                          <div
                            key={m.id}
                            className="rounded-xl border p-4"
                            style={{ borderColor: '#FECACA', backgroundColor: '#FFF5F5' }}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-semibold text-sm" style={{ color: '#2B1A10' }}>
                                {m.שם_חומר_גלם}
                              </span>
                              <StatusBadge status={m.סטטוס_מלאי} type="inventory" />
                            </div>
                            <div className="text-xs space-y-1" style={{ color: '#6B4A2D' }}>
                              <div>כמות: <span className="font-bold text-red-600">{m.כמות_במלאי} {m.יחידת_מידה}</span></div>
                              <div>מינימום: {m.סף_מלאי_נמוך} {m.יחידת_מידה}</div>
                            </div>
                            <button
                              onClick={() => openEdit(m)}
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

                  {/* Low but not critical */}
                  {(() => {
                    const low = alerts.filter(m => m.סטטוס_מלאי === 'מלאי נמוך');
                    return low.length > 0 ? (
                      <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wide mb-2 mt-4" style={{ color: '#D97706' }}>
                          מלאי נמוך
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {low.map(m => (
                            <div
                              key={m.id}
                              className="rounded-xl border p-4"
                              style={{ borderColor: '#FDE68A', backgroundColor: '#FFFBEB' }}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-semibold text-sm" style={{ color: '#2B1A10' }}>
                                  {m.שם_חומר_גלם}
                                </span>
                                <StatusBadge status={m.סטטוס_מלאי} type="inventory" />
                              </div>
                              <div className="text-xs space-y-1" style={{ color: '#6B4A2D' }}>
                                <div>כמות: <span className="font-bold text-amber-600">{m.כמות_במלאי} {m.יחידת_מידה}</span></div>
                                <div>מינימום: {m.סף_מלאי_נמוך} {m.יחידת_מידה}</div>
                              </div>
                              <button
                                onClick={() => openEdit(m)}
                                className="mt-3 text-xs hover:underline"
                                style={{ color: '#8B5E34' }}
                              >
                                עדכן כמות
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null;
                  })()}
                </div>
              )}
            </>
          )}

          {tab === 'movements' && (
            <EmptyState
              title="תנועות מלאי"
              description="היסטוריית תנועות מלאי תופיע כאן. פיצ׳ר זה יתווסף בקרוב."
            />
          )}
        </div>
      </Card>

      {/* Add / Edit Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={(editItem as RawMaterial)?.id ? 'עריכת חומר גלם' : 'חומר גלם חדש'}
      >
        <div className="space-y-4">
          <Input
            label="שם חומר גלם"
            required
            value={editItem?.שם_חומר_גלם || ''}
            onChange={e => setEditItem(p => ({ ...p, שם_חומר_גלם: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="כמות במלאי"
              type="number"
              value={editItem?.כמות_במלאי ?? 0}
              onChange={e => setEditItem(p => ({ ...p, כמות_במלאי: Number(e.target.value) }))}
              min={0}
              step={0.01}
            />
            <Select
              label="יחידת מידה"
              value={editItem?.יחידת_מידה || 'ק"ג'}
              onChange={e => setEditItem(p => ({ ...p, יחידת_מידה: e.target.value }))}
            >
              {['ק"ג', 'גרם', 'ליטר', 'מ"ל', 'יח׳', 'כף', 'כוס'].map(u => (
                <option key={u} value={u}>{u}</option>
              ))}
            </Select>
            <Input
              label="סף מלאי נמוך"
              type="number"
              value={editItem?.סף_מלאי_נמוך ?? 0}
              onChange={e => setEditItem(p => ({ ...p, סף_מלאי_נמוך: Number(e.target.value) }))}
              min={0}
              step={0.01}
            />
            <Input
              label="סף מלאי קריטי"
              type="number"
              value={editItem?.סף_מלאי_קריטי ?? 0}
              onChange={e => setEditItem(p => ({ ...p, סף_מלאי_קריטי: Number(e.target.value) }))}
              min={0}
              step={0.01}
            />
            <Input
              label="מחיר ליחידה (₪)"
              type="number"
              value={editItem?.מחיר_ליחידה ?? 0}
              onChange={e => setEditItem(p => ({ ...p, מחיר_ליחידה: Number(e.target.value) }))}
              min={0}
              step={0.01}
            />
            <Input
              label="תאריך תפוגה"
              type="date"
              value={editItem?.תאריך_תפוגה || ''}
              onChange={e => setEditItem(p => ({ ...p, תאריך_תפוגה: e.target.value || null }))}
            />
          </div>
          <Textarea
            label="הערות"
            value={editItem?.הערות || ''}
            onChange={e => setEditItem(p => ({ ...p, הערות: e.target.value }))}
            rows={2}
          />
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setShowModal(false)}>ביטול</Button>
            <Button onClick={handleSave} loading={saving}>שמור</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
