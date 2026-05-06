'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';

type PriceRow = {
  id: string;
  מוצר_id: string | null;
  sku: string | null;
  product_name_snapshot: string | null;
  price_type: 'retail' | 'business_fixed' | 'business_quantity' | null;
  מחיר: number;
  min_quantity: number | null;
  includes_vat: boolean | null;
  פעיל: boolean | null;
  תאריך_עדכון: string | null;
  מוצרים_למכירה?: { שם_מוצר: string } | null;
};

const TYPE_LABEL: Record<string, string> = {
  retail: 'פרטי / רגיל',
  business_fixed: 'עסקי קבוע',
  business_quantity: 'עסקי כמות',
};

const TYPE_COLOR: Record<string, { bg: string; color: string }> = {
  retail:            { bg: '#EFF6FF', color: '#1D4ED8' },
  business_fixed:    { bg: '#FEF3C7', color: '#92400E' },
  business_quantity: { bg: '#F0FDF4', color: '#166534' },
};

export default function PricesManageTab({ onImportClick }: { onImportClick: () => void }) {
  const [rows, setRows] = useState<PriceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetch('/api/prices?manage=1')
      .then(r => r.json())
      .then(({ data }) => setRows(data || []))
      .catch(() => toast.error('שגיאה בטעינת המחירונים'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

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
        <Button variant="outline" size="sm" onClick={onImportClick}>ייבוא מאקסל</Button>
      </div>

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
            <option value="retail">פרטי / רגיל</option>
            <option value="business_fixed">עסקי קבוע</option>
            <option value="business_quantity">עסקי כמות</option>
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
                  const typeStyle = TYPE_COLOR[row.price_type ?? ''] ?? { bg: '#F3F4F6', color: '#374151' };
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
                        <span
                          className="inline-block px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
                          style={{ backgroundColor: typeStyle.bg, color: typeStyle.color }}
                        >
                          {TYPE_LABEL[row.price_type ?? ''] ?? row.price_type ?? '—'}
                        </span>
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
    </div>
  );
}
