'use client';

import { useState, useEffect, useMemo } from 'react';
import { IconPlus, IconEdit, IconWhatsApp } from '@/components/icons';

type PageTab = 'suppliers' | 'settings' | 'shopping';

interface Supplier {
  id: string;
  שם_ספק: string;
  טלפון: string | null;
  אימייל: string | null;
  איש_קשר: string | null;
  הערות: string | null;
  פעיל: boolean;
  תאריך_יצירה: string;
}

interface PurchaseMaterial {
  id: string;
  שם_חומר_גלם: string;
  כמות_במלאי: number;
  יחידת_מידה: string;
  סטטוס_מלאי: string;
  ספק_מועדף_id: string | null;
  שם_מוצר_אצל_הספק: string | null;
  מקט_ספק: string | null;
  כמות_מינימום: number;
  כמות_להזמנה: number | null;
  יחידת_קניה: string | null;
  הערות_רכש: string | null;
  ספקים?: { id: string; שם_ספק: string; טלפון: string | null; אימייל: string | null } | null;
}

const EMPTY_FORM = { שם_ספק: '', טלפון: '', אימייל: '', איש_קשר: '', הערות: '', פעיל: true as boolean };

export default function SuppliersPage() {
  const [tab, setTab] = useState<PageTab>('suppliers');

  // ── Suppliers tab state ──────────────────────────────────────────────────
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editSup, setEditSup] = useState<Supplier | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [formSaving, setFormSaving] = useState(false);

  // ── Settings tab state ───────────────────────────────────────────────────
  const [materials, setMaterials] = useState<PurchaseMaterial[]>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [materialsLoaded, setMaterialsLoaded] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [rowForm, setRowForm] = useState<Partial<PurchaseMaterial>>({});
  const [rowSaving, setRowSaving] = useState(false);
  const [matSearch, setMatSearch] = useState('');

  // ── Shopping tab state ───────────────────────────────────────────────────
  const [needed, setNeeded] = useState<PurchaseMaterial[]>([]);
  const [loadingNeeded, setLoadingNeeded] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [orderQty, setOrderQty] = useState<Record<string, number>>({});
  const [orderSaving, setOrderSaving] = useState<string | null>(null);

  // ── Toast ────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

  function showToast(text: string, ok = true) {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 3000);
  }

  // ── Initial loads ────────────────────────────────────────────────────────
  useEffect(() => { fetchSuppliers(); }, []);

  useEffect(() => {
    if (tab === 'settings' && !materialsLoaded) fetchMaterials();
    if (tab === 'shopping') fetchNeeded();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // ── API helpers ──────────────────────────────────────────────────────────
  async function fetchSuppliers() {
    setLoadingSuppliers(true);
    try {
      const res = await fetch('/api/suppliers');
      const json = await res.json();
      if (json.data) setSuppliers(json.data);
    } finally {
      setLoadingSuppliers(false);
    }
  }

  async function fetchMaterials() {
    setLoadingMaterials(true);
    try {
      const res = await fetch('/api/purchasing?all=1');
      const json = await res.json();
      if (json.data) { setMaterials(json.data); setMaterialsLoaded(true); }
    } finally {
      setLoadingMaterials(false);
    }
  }

  async function fetchNeeded() {
    setLoadingNeeded(true);
    try {
      const res = await fetch('/api/purchasing');
      const json = await res.json();
      if (json.data) {
        const items: PurchaseMaterial[] = json.data;
        setNeeded(items);
        setSelected(new Set(items.map(i => i.id)));
        const qty: Record<string, number> = {};
        for (const item of items) qty[item.id] = item.כמות_להזמנה ?? item.כמות_מינימום;
        setOrderQty(qty);
      }
    } finally {
      setLoadingNeeded(false);
    }
  }

  async function handleSaveSupplier() {
    if (!form.שם_ספק.trim()) { showToast('שם ספק הוא שדה חובה', false); return; }
    setFormSaving(true);
    try {
      const url = editSup ? `/api/suppliers/${editSup.id}` : '/api/suppliers';
      const res = await fetch(url, {
        method: editSup ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          שם_ספק:  form.שם_ספק.trim(),
          טלפון:   form.טלפון   || null,
          אימייל:  form.אימייל  || null,
          איש_קשר: form.איש_קשר || null,
          הערות:   form.הערות   || null,
          פעיל:    form.פעיל,
        }),
      });
      const json = await res.json();
      if (!res.ok) { showToast(json.error || 'שגיאה', false); return; }
      showToast(editSup ? 'ספק עודכן' : 'ספק נוצר');
      setShowModal(false);
      fetchSuppliers();
    } catch { showToast('שגיאת רשת', false); }
    finally { setFormSaving(false); }
  }

  async function handleSaveRow(id: string) {
    setRowSaving(true);
    try {
      const res = await fetch(`/api/inventory/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ספק_מועדף_id:          rowForm.ספק_מועדף_id       || null,
          שם_מוצר_אצל_הספק:      rowForm.שם_מוצר_אצל_הספק  || null,
          מקט_ספק:               rowForm.מקט_ספק             || null,
          כמות_מינימום:          Number(rowForm.כמות_מינימום) || 0,
          כמות_להזמנה:           rowForm.כמות_להזמנה != null ? Number(rowForm.כמות_להזמנה) : null,
          יחידת_קניה:            rowForm.יחידת_קניה           || null,
          הערות_רכש:             rowForm.הערות_רכש             || null,
        }),
      });
      if (!res.ok) { showToast('שגיאה בשמירה', false); return; }
      setMaterials(prev => prev.map(m => m.id === id ? { ...m, ...rowForm } as PurchaseMaterial : m));
      setEditingRowId(null);
      showToast('נשמר');
    } catch { showToast('שגיאת רשת', false); }
    finally { setRowSaving(false); }
  }

  async function handleMarkOrdered(supplierId: string | null, groupItems: PurchaseMaterial[]) {
    const items = groupItems.filter(i => selected.has(i.id));
    if (items.length === 0) { showToast('לא נבחרו פריטים', false); return; }
    const key = supplierId ?? 'none';
    setOrderSaving(key);
    try {
      const res = await fetch('/api/purchasing/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ספק_id: supplierId,
          items: items.map(i => ({
            חומר_גלם_id: i.id,
            שם_פריט:     i.שם_חומר_גלם,
            כמות:        orderQty[i.id] ?? i.כמות_להזמנה ?? i.כמות_מינימום,
            יחידה:       i.יחידת_קניה || i.יחידת_מידה,
          })),
        }),
      });
      if (!res.ok) { showToast('שגיאה', false); return; }
      const orderedIds = new Set(items.map(i => i.id));
      setNeeded(prev => prev.filter(i => !orderedIds.has(i.id)));
      setSelected(prev => { const s = new Set(prev); orderedIds.forEach(id => s.delete(id)); return s; });
      showToast('הזמנת רכש נוצרה');
    } catch { showToast('שגיאת רשת', false); }
    finally { setOrderSaving(null); }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  function openAdd() { setEditSup(null); setForm({ ...EMPTY_FORM }); setShowModal(true); }
  function openEdit(s: Supplier) {
    setEditSup(s);
    setForm({ שם_ספק: s.שם_ספק, טלפון: s.טלפון || '', אימייל: s.אימייל || '', איש_קשר: s.איש_קשר || '', הערות: s.הערות || '', פעיל: s.פעיל });
    setShowModal(true);
  }
  function startEditRow(mat: PurchaseMaterial) {
    setEditingRowId(mat.id);
    setRowForm({ ספק_מועדף_id: mat.ספק_מועדף_id, שם_מוצר_אצל_הספק: mat.שם_מוצר_אצל_הספק, מקט_ספק: mat.מקט_ספק, כמות_מינימום: mat.כמות_מינימום, כמות_להזמנה: mat.כמות_להזמנה, יחידת_קניה: mat.יחידת_קניה, הערות_רכש: mat.הערות_רכש });
  }

  function buildWaUrl(supplier: Supplier, items: PurchaseMaterial[]): string {
    const raw = supplier.טלפון?.replace(/\D/g, '') ?? '';
    const phone = raw.startsWith('972') ? raw : raw.startsWith('0') ? '972' + raw.slice(1) : raw;
    const lines = items.filter(i => selected.has(i.id))
      .map(i => `• ${i.שם_מוצר_אצל_הספק || i.שם_חומר_גלם} — ${orderQty[i.id] ?? i.כמות_להזמנה ?? i.כמות_מינימום} ${i.יחידת_קניה || i.יחידת_מידה}`)
      .join('\n');
    return `https://wa.me/${phone}?text=${encodeURIComponent(`שלום ${supplier.שם_ספק},\nברצוני להזמין:\n\n${lines}\n\nתודה רבה,\nעדי תכשיט שוקולד`)}`;
  }

  function buildCopyText(supplierName: string, items: PurchaseMaterial[]): string {
    const lines = items.filter(i => selected.has(i.id))
      .map(i => `• ${i.שם_מוצר_אצל_הספק || i.שם_חומר_גלם} — ${orderQty[i.id] ?? i.כמות_להזמנה ?? i.כמות_מינימום} ${i.יחידת_קניה || i.יחידת_מידה}`)
      .join('\n');
    return `שלום ${supplierName},\nברצוני להזמין:\n\n${lines}\n\nתודה רבה,\nעדי תכשיט שוקולד`;
  }

  // ── Computed ─────────────────────────────────────────────────────────────
  const filteredSuppliers = useMemo(
    () => suppliers.filter(s => !search || s.שם_ספק.includes(search) || s.טלפון?.includes(search) || s.אימייל?.includes(search)),
    [suppliers, search],
  );

  const filteredMaterials = useMemo(
    () => !matSearch ? materials : materials.filter(m => m.שם_חומר_גלם.includes(matSearch)),
    [materials, matSearch],
  );

  const supplierGroups = useMemo(() => {
    const map = new Map<string | null, { supplier: Supplier | null; items: PurchaseMaterial[] }>();
    for (const item of needed) {
      const sid = item.ספק_מועדף_id ?? null;
      if (!map.has(sid)) {
        map.set(sid, { supplier: sid ? (suppliers.find(s => s.id === sid) ?? null) : null, items: [] });
      }
      map.get(sid)!.items.push(item);
    }
    // Suppliers with items first, then "no supplier" group last
    const entries = Array.from(map.entries());
    entries.sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : 0));
    return entries.map(([supplierId, g]) => ({ supplierId, ...g }));
  }, [needed, suppliers]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div dir="rtl" className="min-h-screen" style={{ background: '#F8F4EF' }}>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.text}
        </div>
      )}

      {/* Header + Tabs */}
      <div className="px-6 py-5" style={{ background: '#2A1A0E' }}>
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold mb-4" style={{ color: '#FAF7F0' }}>ספקים / קניות</h1>
          <div className="flex gap-1">
            {([
              ['suppliers', 'ספקים'],
              ['settings',  'הגדרות רכש'],
              ['shopping',  'רשימת קניות'],
            ] as [PageTab, string][]).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors relative ${tab === id ? 'bg-[#F8F4EF] text-[#2A1A0E]' : 'text-[#A88B6A] hover:text-[#FAF7F0]'}`}
              >
                {label}
                {id === 'shopping' && needed.length > 0 && (
                  <span className="absolute -top-1 -left-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">{needed.length}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">

        {/* ── TAB 1: Suppliers list ──────────────────────────────────────── */}
        {tab === 'suppliers' && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <input
                placeholder="חיפוש ספק..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:border-[#C7A46B] bg-white"
              />
              <button
                onClick={openAdd}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
                style={{ background: '#C7A46B' }}
              >
                <IconPlus className="w-4 h-4" />
                הוסף ספק
              </button>
            </div>

            {loadingSuppliers ? (
              <div className="text-center py-16 text-gray-400">טוען...</div>
            ) : filteredSuppliers.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                {search ? 'לא נמצאו ספקים' : 'אין ספקים עדיין. הוסף את הספק הראשון.'}
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: '#F3EDE4' }}>
                      <th className="text-right px-5 py-3 font-semibold text-gray-700">שם ספק</th>
                      <th className="text-right px-5 py-3 font-semibold text-gray-700">טלפון</th>
                      <th className="text-right px-5 py-3 font-semibold text-gray-700">אימייל</th>
                      <th className="text-right px-5 py-3 font-semibold text-gray-700">איש קשר</th>
                      <th className="text-right px-5 py-3 font-semibold text-gray-700">הערות</th>
                      <th className="text-right px-5 py-3 font-semibold text-gray-700">סטטוס</th>
                      <th className="px-5 py-3 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSuppliers.map(s => (
                      <tr key={s.id} className="border-t border-gray-100 hover:bg-amber-50/30">
                        <td className="px-5 py-3 font-medium text-gray-900">{s.שם_ספק}</td>
                        <td className="px-5 py-3 text-gray-600 font-mono text-xs">{s.טלפון || '—'}</td>
                        <td className="px-5 py-3 text-gray-600 text-xs">{s.אימייל || '—'}</td>
                        <td className="px-5 py-3 text-gray-600">{s.איש_קשר || '—'}</td>
                        <td className="px-5 py-3 text-gray-500 text-xs max-w-[200px] truncate">{s.הערות || '—'}</td>
                        <td className="px-5 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.פעיל ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {s.פעיל ? 'פעיל' : 'לא פעיל'}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <button onClick={() => openEdit(s)} className="text-gray-400 hover:text-gray-700 p-1">
                            <IconEdit className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 2: Purchase settings ───────────────────────────────────── */}
        {tab === 'settings' && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">הגדרות רכש לחומרי גלם</h2>
                <p className="text-sm text-gray-500 mt-0.5">הגדר ספק מועדף, כמות מינימום וכמות הזמנה לכל חומר גלם</p>
              </div>
              <input
                placeholder="חיפוש חומר גלם..."
                value={matSearch}
                onChange={e => setMatSearch(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-52 focus:outline-none focus:border-[#C7A46B] bg-white"
              />
            </div>

            {loadingMaterials ? (
              <div className="text-center py-16 text-gray-400">טוען...</div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
                <table className="w-full text-sm min-w-[960px]">
                  <thead>
                    <tr style={{ background: '#F3EDE4' }}>
                      <th className="text-right px-4 py-3 font-semibold text-gray-700">חומר גלם</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-700">במלאי</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-700">ספק מועדף</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-700">שם אצל ספק</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-700">מינימום</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-700">כמות להזמנה</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-700">יחידת קניה</th>
                      <th className="px-4 py-3 w-28" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMaterials.map(mat => {
                      const isEditing = editingRowId === mat.id;
                      return (
                        <tr key={mat.id} className={`border-t border-gray-100 ${isEditing ? 'bg-amber-50/40' : 'hover:bg-gray-50'}`}>
                          <td className="px-4 py-2.5 font-medium text-gray-900">{mat.שם_חומר_גלם}</td>
                          <td className="px-4 py-2.5 text-gray-600 text-xs tabular-nums">
                            {mat.כמות_במלאי} {mat.יחידת_מידה}
                          </td>

                          {isEditing ? (
                            <>
                              <td className="px-2 py-1.5">
                                <select
                                  value={rowForm.ספק_מועדף_id || ''}
                                  onChange={e => setRowForm(f => ({ ...f, ספק_מועדף_id: e.target.value || null }))}
                                  className="border border-gray-300 rounded px-2 py-1 text-sm w-full"
                                >
                                  <option value="">— ללא ספק —</option>
                                  {suppliers.filter(s => s.פעיל).map(s => (
                                    <option key={s.id} value={s.id}>{s.שם_ספק}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="text"
                                  value={rowForm.שם_מוצר_אצל_הספק || ''}
                                  onChange={e => setRowForm(f => ({ ...f, שם_מוצר_אצל_הספק: e.target.value }))}
                                  className="border border-gray-300 rounded px-2 py-1 text-sm w-full"
                                  placeholder="שם לפי קטלוג ספק"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="number"
                                  value={rowForm.כמות_מינימום ?? 0}
                                  onChange={e => setRowForm(f => ({ ...f, כמות_מינימום: Number(e.target.value) }))}
                                  className="border border-gray-300 rounded px-2 py-1 text-sm w-24"
                                  min={0}
                                  step="0.001"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="number"
                                  value={rowForm.כמות_להזמנה ?? ''}
                                  onChange={e => setRowForm(f => ({ ...f, כמות_להזמנה: e.target.value !== '' ? Number(e.target.value) : null }))}
                                  className="border border-gray-300 rounded px-2 py-1 text-sm w-24"
                                  min={0}
                                  step="0.001"
                                  placeholder="כמות"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="text"
                                  value={rowForm.יחידת_קניה || ''}
                                  onChange={e => setRowForm(f => ({ ...f, יחידת_קניה: e.target.value }))}
                                  className="border border-gray-300 rounded px-2 py-1 text-sm w-20"
                                  placeholder='ק"ג'
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <div className="flex gap-1.5">
                                  <button
                                    onClick={() => handleSaveRow(mat.id)}
                                    disabled={rowSaving}
                                    className="px-3 py-1 rounded text-xs text-white font-medium disabled:opacity-50"
                                    style={{ background: '#C7A46B' }}
                                  >
                                    {rowSaving ? '...' : 'שמור'}
                                  </button>
                                  <button
                                    onClick={() => setEditingRowId(null)}
                                    className="px-3 py-1 rounded text-xs text-gray-600 hover:bg-gray-100"
                                  >
                                    ביטול
                                  </button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-4 py-2.5 text-gray-600">{mat.ספקים?.שם_ספק || <span className="text-gray-300">—</span>}</td>
                              <td className="px-4 py-2.5 text-gray-600 text-xs">{mat.שם_מוצר_אצל_הספק || <span className="text-gray-300">—</span>}</td>
                              <td className="px-4 py-2.5 text-gray-600 tabular-nums text-xs">
                                {mat.כמות_מינימום > 0 ? `${mat.כמות_מינימום} ${mat.יחידת_מידה}` : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-4 py-2.5 text-gray-600 tabular-nums text-xs">
                                {mat.כמות_להזמנה ? `${mat.כמות_להזמנה} ${mat.יחידת_קניה || mat.יחידת_מידה}` : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-4 py-2.5 text-gray-600 text-xs">{mat.יחידת_קניה || <span className="text-gray-300">—</span>}</td>
                              <td className="px-4 py-2.5">
                                <button onClick={() => startEditRow(mat)} className="text-gray-400 hover:text-[#C7A46B] p-1 transition-colors">
                                  <IconEdit className="w-4 h-4" />
                                </button>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filteredMaterials.length === 0 && !loadingMaterials && (
                  <div className="text-center py-10 text-gray-400">אין חומרי גלם</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 3: Shopping list ──────────────────────────────────────── */}
        {tab === 'shopping' && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">רשימת קניות</h2>
                <p className="text-sm text-gray-500 mt-0.5">חומרי גלם שמלאיהם ירד מתחת לכמות המינימום</p>
              </div>
              <button
                onClick={fetchNeeded}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-white text-gray-600"
              >
                רענן
              </button>
            </div>

            {loadingNeeded ? (
              <div className="text-center py-16 text-gray-400">טוען...</div>
            ) : needed.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-5xl mb-3">✓</div>
                <div className="text-gray-700 font-semibold text-lg">כל המלאי תקין</div>
                <div className="text-sm text-gray-400 mt-1">אין פריטים שצריך להזמין כרגע</div>
              </div>
            ) : (
              <div className="space-y-5">
                {supplierGroups.map(group => {
                  const gKey = group.supplierId ?? 'none';
                  const selectedInGroup = group.items.filter(i => selected.has(i.id));
                  return (
                    <div key={gKey} className="bg-white rounded-xl shadow-sm overflow-hidden">
                      {/* Group header */}
                      <div className="px-5 py-4" style={{ background: '#F3EDE4', borderBottom: '1px solid #E8DED4' }}>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-semibold text-gray-900 text-base">
                              {group.supplier?.שם_ספק ?? 'ללא ספק מוגדר'}
                            </div>
                            <div className="flex gap-3 mt-0.5">
                              {group.supplier?.טלפון && (
                                <span className="text-sm text-gray-500 font-mono">{group.supplier.טלפון}</span>
                              )}
                              {group.supplier?.אימייל && (
                                <span className="text-sm text-gray-500">{group.supplier.אימייל}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap justify-end">
                            <button
                              onClick={() => {
                                const text = buildCopyText(group.supplier?.שם_ספק ?? 'ספק', group.items);
                                navigator.clipboard?.writeText(text).then(() => showToast('הועתק ללוח'));
                              }}
                              className="px-3 py-1.5 rounded-lg text-xs border border-gray-300 hover:bg-white text-gray-600 transition-colors"
                            >
                              העתק טקסט
                            </button>

                            {group.supplier?.טלפון && (
                              <a
                                href={buildWaUrl(group.supplier, group.items)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white font-medium transition-opacity hover:opacity-90"
                                style={{ background: '#25D366' }}
                              >
                                <IconWhatsApp className="w-3.5 h-3.5" />
                                WhatsApp
                              </a>
                            )}

                            <button
                              onClick={() => handleMarkOrdered(group.supplierId, group.items)}
                              disabled={orderSaving === gKey || selectedInGroup.length === 0}
                              className="px-3 py-1.5 rounded-lg text-xs text-white font-medium disabled:opacity-40 transition-opacity"
                              style={{ background: '#C7A46B' }}
                            >
                              {orderSaving === gKey ? 'שומר...' : `סמן כנשלח (${selectedInGroup.length})`}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Items */}
                      <div>
                        {group.items.map(item => (
                          <div
                            key={item.id}
                            className={`flex items-center px-5 py-3 gap-4 border-b border-gray-50 last:border-b-0 transition-opacity ${selected.has(item.id) ? '' : 'opacity-40'}`}
                          >
                            <input
                              type="checkbox"
                              checked={selected.has(item.id)}
                              onChange={e => {
                                const s = new Set(selected);
                                e.target.checked ? s.add(item.id) : s.delete(item.id);
                                setSelected(s);
                              }}
                              className="w-4 h-4 rounded accent-amber-600 flex-shrink-0"
                            />

                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-gray-900 text-sm">{item.שם_חומר_גלם}</div>
                              {item.שם_מוצר_אצל_הספק && item.שם_מוצר_אצל_הספק !== item.שם_חומר_גלם && (
                                <div className="text-xs text-gray-400 mt-0.5">{item.שם_מוצר_אצל_הספק}</div>
                              )}
                              {item.מקט_ספק && (
                                <div className="text-xs text-gray-400">מקט: {item.מקט_ספק}</div>
                              )}
                            </div>

                            <div className="text-xs text-gray-500 text-left flex-shrink-0">
                              <div>במלאי: <span className="font-semibold text-red-600">{item.כמות_במלאי}</span> {item.יחידת_מידה}</div>
                              <div>מינימום: {item.כמות_מינימום} {item.יחידת_מידה}</div>
                            </div>

                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <span className="text-xs text-gray-500">כמות:</span>
                              <input
                                type="number"
                                value={orderQty[item.id] ?? item.כמות_להזמנה ?? item.כמות_מינימום}
                                onChange={e => setOrderQty(q => ({ ...q, [item.id]: Number(e.target.value) }))}
                                className="border border-gray-300 rounded px-2 py-1 text-sm w-20 text-center focus:outline-none focus:border-[#C7A46B]"
                                min={0}
                                step="0.001"
                              />
                              <span className="text-xs text-gray-500 w-10 truncate">{item.יחידת_קניה || item.יחידת_מידה}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Supplier Modal ──────────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" dir="rtl">
            <div className="px-6 py-4" style={{ borderBottom: '1px solid #F0E8DC' }}>
              <h2 className="text-lg font-semibold text-gray-900">{editSup ? 'עריכת ספק' : 'הוספת ספק'}</h2>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">שם ספק *</label>
                <input
                  type="text"
                  value={form.שם_ספק}
                  onChange={e => setForm(f => ({ ...f, שם_ספק: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleSaveSupplier()}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C7A46B]"
                  placeholder="שם הספק"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">טלפון</label>
                  <input
                    type="tel"
                    value={form.טלפון}
                    onChange={e => setForm(f => ({ ...f, טלפון: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C7A46B]"
                    placeholder="05x-xxxxxxx"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">אימייל</label>
                  <input
                    type="email"
                    value={form.אימייל}
                    onChange={e => setForm(f => ({ ...f, אימייל: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C7A46B]"
                    placeholder="info@supplier.co.il"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">איש קשר</label>
                <input
                  type="text"
                  value={form.איש_קשר}
                  onChange={e => setForm(f => ({ ...f, איש_קשר: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C7A46B]"
                  placeholder="שם איש הקשר"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">הערות</label>
                <textarea
                  value={form.הערות}
                  onChange={e => setForm(f => ({ ...f, הערות: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C7A46B] resize-none"
                  rows={2}
                  placeholder="הערות נוספות..."
                />
              </div>
              {editSup && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.פעיל}
                    onChange={e => setForm(f => ({ ...f, פעיל: e.target.checked }))}
                    className="w-4 h-4 rounded accent-amber-600"
                  />
                  <span className="text-sm text-gray-700">ספק פעיל</span>
                </label>
              )}
            </div>
            <div className="px-6 py-4 flex gap-2 justify-end" style={{ borderTop: '1px solid #F0E8DC' }}>
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                ביטול
              </button>
              <button
                onClick={handleSaveSupplier}
                disabled={formSaving}
                className="px-4 py-2 text-sm text-white rounded-lg font-medium disabled:opacity-50 transition-opacity"
                style={{ background: '#C7A46B' }}
              >
                {formSaving ? 'שומר...' : editSup ? 'עדכן ספק' : 'הוסף ספק'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
