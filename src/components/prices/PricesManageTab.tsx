'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Input';
import toast from 'react-hot-toast';
import { PriceTypeBadge, PRICE_TYPE_LABELS } from '@/lib/priceTypeUtils';

type PriceType = 'retail' | 'business_fixed' | 'business_quantity' | 'retail_quantity';
const QUANTITY_TIERS: PriceType[] = ['retail_quantity', 'business_quantity'];

type PriceRow = {
  id: string;
  מוצר_id: string | null;
  sku: string | null;
  product_name_snapshot: string | null;
  price_type: PriceType | null;
  מחיר: number;
  min_quantity: number | null;
  includes_vat: boolean | null;
  פעיל: boolean | null;
  תאריך_עדכון: string | null;
  מוצרים_למכירה?: { שם_מוצר: string } | null;
};

type ProductOption = { id: string; שם_מוצר: string; פעיל: boolean };

const emptyAddForm = { productId: '', priceType: 'retail' as PriceType, price: '', minQuantity: '', includesVat: true };

export default function PricesManageTab({ onImportClick }: { onImportClick: () => void }) {
  const [rows, setRows] = useState<PriceRow[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [saving, setSaving] = useState(false);

  // Add-new-price modal — the manual counterpart to Excel import, for filling
  // in one missing price without building a spreadsheet.
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState(emptyAddForm);
  const [addSaving, setAddSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetch('/api/prices?manage=1')
      .then(r => r.json())
      .then(({ data }) => setRows(data || []))
      .catch(() => toast.error('שגיאה בטעינת המחירונים'))
      .finally(() => setLoading(false));
  };

  const loadProducts = () => {
    fetch('/api/products?active=true')
      .then(r => r.json())
      .then(({ data }) => setProducts((data || []).map((p: { id: string; שם_מוצר: string; פעיל: boolean }) => ({ id: p.id, שם_מוצר: p.שם_מוצר, פעיל: p.פעיל }))))
      .catch(() => { /* not critical to the read-only table view */ });
  };

  useEffect(() => { load(); loadProducts(); }, []);

  // Active products that have zero active מחירון rows of any type — these are
  // completely invisible in the table below, which is the real reason "there's
  // no price list" even though the table itself looks fine.
  const productsWithoutPrice = useMemo(() => {
    const pricedIds = new Set(rows.filter(r => r.פעיל).map(r => r.מוצר_id).filter(Boolean));
    return products.filter(p => p.פעיל && !pricedIds.has(p.id));
  }, [rows, products]);

  const openAddModal = (productId?: string) => {
    setAddForm({ ...emptyAddForm, productId: productId || '' });
    setShowAddModal(true);
  };

  const submitAdd = async () => {
    if (!addForm.productId) { toast.error('יש לבחור מוצר'); return; }
    const price = parseFloat(addForm.price);
    if (isNaN(price) || price < 0) { toast.error('מחיר לא תקין'); return; }
    const isQtyTier = QUANTITY_TIERS.includes(addForm.priceType);
    const minQuantity = isQtyTier ? parseInt(addForm.minQuantity, 10) : null;
    if (isQtyTier && (!Number.isFinite(minQuantity) || (minQuantity as number) < 1)) {
      toast.error('יש להזין כמות מינימלית תקינה');
      return;
    }
    setAddSaving(true);
    try {
      const res = await fetch('/api/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          'מוצר_id': addForm.productId,
          price_type: addForm.priceType,
          'מחיר': price,
          min_quantity: minQuantity,
          includes_vat: addForm.includesVat,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'שגיאה בהוספה');
      setRows(prev => [...prev, json.data]);
      toast.success('מחיר נוסף');
      setShowAddModal(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'שגיאה בהוספה');
    } finally {
      setAddSaving(false);
    }
  };

  const filtered = rows.filter(r => {
    if (!showInactive && !r.פעיל) return false;
    if (typeFilter && r.price_type !== typeFilter) return false;
    const name = (r.מוצרים_למכירה?.שם_מוצר || r.product_name_snapshot || '').toLowerCase();
    if (search && !name.includes(search.toLowerCase())) return false;
    return true;
  });

  const startEdit = (row: PriceRow) => { setEditingId(row.id); setEditPrice(String(row.מחיר)); };
  const cancelEdit = () => { setEditingId(null); setEditPrice(''); };

  const saveEdit = async (id: string) => {
    const price = parseFloat(editPrice);
    if (isNaN(price) || price < 0) { toast.error('מחיר לא תקין'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/prices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ מחיר: price }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'שגיאה');
      toast.success('מחיר עודכן');
      setRows(prev => prev.map(r => r.id === id ? { ...r, מחיר: price } : r));
      cancelEdit();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: PriceRow) => {
    try {
      const res = await fetch(`/api/prices/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ פעיל: !row.פעיל }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'שגיאה');
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, פעיל: !r.פעיל } : r));
      toast.success(row.פעיל ? 'מחיר הושבת' : 'מחיר הופעל');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'שגיאה');
    }
  };

  const activeCount = rows.filter(r => r.פעיל).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold" style={{ color: '#2B1A10' }}>ניהול מחירונים</h2>
          <p className="text-sm mt-0.5" style={{ color: '#9B7A5A' }}>
            {loading ? 'טוען...' : `${activeCount} מחירים פעילים מתוך ${rows.length}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => openAddModal()}>+ הוספת מחיר</Button>
          <Button variant="outline" size="sm" onClick={onImportClick}>ייבוא מאקסל</Button>
        </div>
      </div>

      {/* Products with no active price at all — these never show up in the table
          below since it's built from מחירון rows, not from the product catalog. */}
      {!loading && productsWithoutPrice.length > 0 && (
        <div className="rounded-xl border p-4" style={{ backgroundColor: '#FEF9EF', borderColor: '#F0DCA8' }}>
          <p className="text-sm font-semibold mb-2" style={{ color: '#7C5A1E' }}>
            {productsWithoutPrice.length} מוצרים פעילים בלי מחיר במחירון בכלל
          </p>
          <p className="text-xs mb-3" style={{ color: '#8A7664' }}>
            למוצרים האלה אין שום שורה במחירון — הם לא מופיעים בטבלה למטה, ובהזמנה חדשה יידרש להזין להם מחיר ידנית בכל פעם.
          </p>
          <div className="flex flex-wrap gap-2">
            {productsWithoutPrice.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => openAddModal(p.id)}
                className="text-xs px-2.5 py-1 rounded-full border bg-white transition-colors hover:bg-amber-50"
                style={{ borderColor: '#F0DCA8', color: '#7C5A1E' }}
              >
                {p.שם_מוצר} · הוסף מחיר
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap gap-3 items-center">
          <input
            type="text"
            placeholder="חיפוש לפי שם מוצר..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-1 w-52"
            style={{ borderColor: '#DDD0BC', color: '#2B1A10' }}
          />
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-1"
            style={{ borderColor: '#DDD0BC', color: '#2B1A10' }}
          >
            <option value="">כל הסוגים</option>
            <option value="retail">{PRICE_TYPE_LABELS.retail}</option>
            <option value="retail_quantity">{PRICE_TYPE_LABELS.retail_quantity}</option>
            <option value="business_fixed">{PRICE_TYPE_LABELS.business_fixed}</option>
            <option value="business_quantity">{PRICE_TYPE_LABELS.business_quantity}</option>
          </select>
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: '#6B4A2D' }}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={e => setShowInactive(e.target.checked)}
              className="rounded"
              style={{ accentColor: '#8B5E34' }}
            />
            הצג מושבתים
          </label>
        </div>
      </Card>

      {/* Table */}
      <Card>
        {loading ? (
          <p className="text-sm text-center py-10" style={{ color: '#9B7A5A' }}>טוען מחירונים...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 space-y-2">
            <p className="text-sm" style={{ color: '#9B7A5A' }}>
              {rows.length === 0 ? 'אין מחירים. ייבא מאקסל להתחיל.' : 'לא נמצאו תוצאות לסינון.'}
            </p>
            {rows.length === 0 && (
              <Button variant="outline" size="sm" onClick={onImportClick}>ייבוא מחירון מאקסל</Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ direction: 'rtl' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #EDE0CE' }}>
                  {['שם מוצר', 'SKU', 'סוג מחירון', 'כמות מינ׳', 'מחיר', 'כולל מע״מ', 'סטטוס', ''].map(h => (
                    <th
                      key={h}
                      className="text-right py-2.5 px-3 text-xs font-semibold whitespace-nowrap"
                      style={{ color: '#6B4A2D' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(row => {
                  const name = row.מוצרים_למכירה?.שם_מוצר || row.product_name_snapshot || '—';
                  const isEditing = editingId === row.id;
                  const inactive = !row.פעיל;
                  return (
                    <tr
                      key={row.id}
                      style={{ borderBottom: '1px solid #F0EAE0', opacity: inactive ? 0.55 : 1 }}
                    >
                      <td className="py-2.5 px-3 font-medium" style={{ color: '#2B1A10' }}>{name}</td>
                      <td className="py-2.5 px-3 font-mono text-xs" style={{ color: '#9B7A5A' }}>{row.sku || '—'}</td>
                      <td className="py-2.5 px-3">
                        <PriceTypeBadge type={row.price_type} />
                      </td>
                      <td className="py-2.5 px-3 text-center" style={{ color: '#6B4A2D' }}>
                        {row.min_quantity != null ? row.min_quantity : '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              value={editPrice}
                              onChange={e => setEditPrice(e.target.value)}
                              className="w-20 px-2 py-1 text-xs border rounded focus:outline-none"
                              style={{ borderColor: '#C6A77D', color: '#2B1A10' }}
                              step="0.01"
                              min="0"
                              autoFocus
                              onKeyDown={e => { if (e.key === 'Enter') saveEdit(row.id); if (e.key === 'Escape') cancelEdit(); }}
                            />
                            <span className="text-xs" style={{ color: '#6B4A2D' }}>₪</span>
                          </div>
                        ) : (
                          <span className="font-semibold" style={{ color: '#8B5E34' }}>
                            ₪{Number(row.מחיר).toFixed(2)}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center text-xs" style={{ color: '#6B4A2D' }}>
                        {row.includes_vat ? 'כן' : 'לא'}
                      </td>
                      <td className="py-2.5 px-3">
                        <button
                          type="button"
                          onClick={() => toggleActive(row)}
                          className="text-xs px-2 py-0.5 rounded-full border transition-colors"
                          style={row.פעיל
                            ? { backgroundColor: '#D1FAE5', color: '#065F46', borderColor: '#A7F3D0' }
                            : { backgroundColor: '#FEE2E2', color: '#991B1B', borderColor: '#FECACA' }
                          }
                        >
                          {row.פעיל ? 'פעיל' : 'מושבת'}
                        </button>
                      </td>
                      <td className="py-2.5 px-3">
                        {isEditing ? (
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => saveEdit(row.id)}
                              disabled={saving}
                              className="text-xs px-2 py-1 rounded font-medium transition-opacity"
                              style={{ backgroundColor: '#8B5E34', color: '#fff', opacity: saving ? 0.6 : 1 }}
                            >
                              שמור
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="text-xs px-2 py-1 rounded border"
                              style={{ borderColor: '#DDD0BC', color: '#6B4A2D' }}
                            >
                              ביטול
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startEdit(row)}
                            className="text-xs px-2 py-1 rounded border transition-colors hover:bg-amber-50"
                            style={{ borderColor: '#DDD0BC', color: '#6B4A2D' }}
                          >
                            עריכה
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && filtered.length > 0 && (
          <p className="mt-3 text-xs" style={{ color: '#B0A090' }}>{filtered.length} רשומות מוצגות</p>
        )}
      </Card>

      <Modal open={showAddModal} onClose={() => setShowAddModal(false)} title="הוספת מחיר חדש">
        <div className="space-y-3">
          <Select
            label="מוצר"
            required
            value={addForm.productId}
            onChange={e => setAddForm(f => ({ ...f, productId: e.target.value }))}
          >
            <option value="">בחר מוצר...</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.שם_מוצר}</option>)}
          </Select>
          <Select
            label="סוג מחירון"
            required
            value={addForm.priceType}
            onChange={e => setAddForm(f => ({ ...f, priceType: e.target.value as PriceType, minQuantity: '' }))}
          >
            {(['retail', 'retail_quantity', 'business_fixed', 'business_quantity'] as PriceType[]).map(t => (
              <option key={t} value={t}>{PRICE_TYPE_LABELS[t]}</option>
            ))}
          </Select>
          {QUANTITY_TIERS.includes(addForm.priceType) && (
            <div className="space-y-1">
              <label className="block text-xs font-medium" style={{ color: '#8A7664' }}>
                כמות מינימלית<span className="mr-0.5" style={{ color: '#A0362C' }}>*</span>
              </label>
              <input
                type="number"
                min="1"
                value={addForm.minQuantity}
                onChange={e => setAddForm(f => ({ ...f, minQuantity: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border bg-white focus:outline-none"
                style={{ borderColor: '#E8DED2', color: '#3A2A1A' }}
              />
            </div>
          )}
          <div className="space-y-1">
            <label className="block text-xs font-medium" style={{ color: '#8A7664' }}>
              מחיר (₪)<span className="mr-0.5" style={{ color: '#A0362C' }}>*</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={addForm.price}
              onChange={e => setAddForm(f => ({ ...f, price: e.target.value }))}
              className="w-full px-3 py-2 text-sm rounded-lg border bg-white focus:outline-none"
              style={{ borderColor: '#E8DED2', color: '#3A2A1A' }}
            />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: '#6B4A2D' }}>
            <input
              type="checkbox"
              checked={addForm.includesVat}
              onChange={e => setAddForm(f => ({ ...f, includesVat: e.target.checked }))}
              className="rounded"
              style={{ accentColor: '#8B5E34' }}
            />
            המחיר כולל מע״מ
          </label>
          <div className="flex gap-2 pt-2">
            <Button onClick={submitAdd} disabled={addSaving}>{addSaving ? 'שומר...' : 'הוספה'}</Button>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>ביטול</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
