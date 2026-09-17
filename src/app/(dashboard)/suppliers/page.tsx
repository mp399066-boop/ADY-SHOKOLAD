'use client';

import { Fragment, useState, useEffect, useMemo } from 'react';
import { IconPlus, IconEdit, IconWhatsApp } from '@/components/icons';

type PageTab = 'suppliers' | 'settings' | 'cart';

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

/** A line in the purchasing cart (migration 055 / /api/purchasing/cart). */
interface CartItem {
  id: string;
  חומר_גלם_id: string | null;
  שם_פריט: string;
  כמות: number;
  יחידה: string | null;
  ספק_id: string | null;
  הערה: string | null;
  הועבר_ידנית: boolean;
  תאריך_יצירה: string;
  מלאי_חומרי_גלם?: {
    id: string;
    שם_חומר_גלם: string;
    כמות_במלאי: number;
    יחידת_מידה: string;
    סטטוס_מלאי: string;
    שם_מוצר_אצל_הספק: string | null;
    מקט_ספק: string | null;
    יחידת_קניה: string | null;
    הערות_רכש: string | null;
    ספק_מועדף_id: string | null;
  } | null;
  ספקים?: { id: string; שם_ספק: string; טלפון: string | null; אימייל: string | null; איש_קשר: string | null } | null;
}

/** One printable/sendable line — what every export builder below consumes. */
interface ExportLine {
  name:  string;
  alias: string | null;
  sku:   string | null;
  qty:   number;
  unit:  string;
  note:  string | null;
}

function toExportLines(items: CartItem[]): ExportLine[] {
  return items.map(item => {
    const mat = item.מלאי_חומרי_גלם ?? null;
    return {
      name:  item.שם_פריט,
      alias: mat?.שם_מוצר_אצל_הספק && mat.שם_מוצר_אצל_הספק !== item.שם_פריט ? mat.שם_מוצר_אצל_הספק : null,
      sku:   mat?.מקט_ספק ?? null,
      qty:   Number(item.כמות),
      unit:  item.יחידה || mat?.יחידת_מידה || '',
      note:  item.הערה,
    };
  });
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
  const [expandedSupId, setExpandedSupId] = useState<string | null>(null);

  // ── Settings tab state ───────────────────────────────────────────────────
  const [materials, setMaterials] = useState<PurchaseMaterial[]>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [materialsLoaded, setMaterialsLoaded] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [rowForm, setRowForm] = useState<Partial<PurchaseMaterial>>({});
  const [rowSaving, setRowSaving] = useState(false);
  const [matSearch, setMatSearch] = useState('');

  // ── Cart tab state ───────────────────────────────────────────────────────
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loadingCart, setLoadingCart] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [addingId, setAddingId] = useState<string | null>(null);
  const [lowStockAdding, setLowStockAdding] = useState(false);
  const [clearing, setClearing] = useState(false);
  // Quantity inputs are uncontrolled drafts while typing, saved on blur.
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({});
  const [qtySaving, setQtySaving] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [orderSaving, setOrderSaving] = useState<string | null>(null);
  const [executedGroups, setExecutedGroups] = useState<Set<string>>(new Set());
  // Drag & drop: "carry" a line from one supplier group to another.
  const [dragItemId, setDragItemId] = useState<string | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);

  // ── Toast ────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

  function showToast(text: string, ok = true) {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 3000);
  }

  // ── Initial loads ────────────────────────────────────────────────────────
  // The cart loads on mount too, so the tab badge shows its size right away.
  useEffect(() => { fetchSuppliers(); fetchCart(); }, []);

  useEffect(() => {
    if (tab === 'settings' && !materialsLoaded) fetchMaterials();
    // The cart's product picker needs the full raw-material list.
    if (tab === 'cart') { fetchCart(); if (!materialsLoaded) fetchMaterials(); }
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

  // ── Cart ─────────────────────────────────────────────────────────────────
  async function fetchCart() {
    setLoadingCart(true);
    try {
      const res = await fetch('/api/purchasing/cart');
      const json = await res.json();
      if (json.data) {
        const items: CartItem[] = json.data;
        setCart(items);
        setSelected(new Set(items.map(i => i.id)));
        setQtyDraft({});
        setExecutedGroups(new Set());
      }
    } catch { /* keep whatever is on screen */ }
    finally { setLoadingCart(false); }
  }

  /** Inserts or replaces one line in local state, keeping it selected. */
  function upsertCartItem(item: CartItem) {
    setCart(prev => {
      const idx = prev.findIndex(i => i.id === item.id);
      if (idx === -1) return [...prev, item];
      const next = [...prev];
      next[idx] = item;
      return next;
    });
    setSelected(prev => new Set(prev).add(item.id));
    setQtyDraft(d => { const n = { ...d }; delete n[item.id]; return n; });
    setExecutedGroups(new Set());
  }

  // Adds a raw material to the cart. The name, unit and supplier are resolved
  // server-side from the raw material, so the line always lands under the
  // supplier assigned to that product in הגדרות רכש.
  async function addToCart(materialId: string, name: string) {
    setAddingId(materialId);
    try {
      const res = await fetch('/api/purchasing/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ חומר_גלם_id: materialId }),
      });
      const json = await res.json();
      if (!res.ok) { showToast(json.error || 'שגיאה בהוספה לסל', false); return; }
      upsertCartItem(json.data as CartItem);
      showToast(json.merged ? `${name} — הכמות בסל עודכנה` : `${name} נוסף לסל`);
    } catch { showToast('שגיאת רשת', false); }
    finally { setAddingId(null); }
  }

  // Free-text line — something that has no raw-material card in the system.
  async function addFreeTextToCart(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setAddingId('free-text');
    try {
      const res = await fetch('/api/purchasing/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ שם_פריט: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) { showToast(json.error || 'שגיאה בהוספה לסל', false); return; }
      upsertCartItem(json.data as CartItem);
      setAddSearch('');
      showToast(`${trimmed} נוסף לסל`);
    } catch { showToast('שגיאת רשת', false); }
    finally { setAddingId(null); }
  }

  async function addLowStockToCart() {
    setLowStockAdding(true);
    try {
      const res = await fetch('/api/purchasing/cart/low-stock', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) { showToast(json.error || 'שגיאה', false); return; }
      if (!json.added) { showToast('אין חוסרים חדשים להוספה'); return; }
      await fetchCart();
      showToast(`${json.added} פריטים חסרים נוספו לסל`);
    } catch { showToast('שגיאת רשת', false); }
    finally { setLowStockAdding(false); }
  }

  async function saveQty(itemId: string, raw: string) {
    const current = cart.find(i => i.id === itemId);
    if (!current) return;
    const clearDraft = () => setQtyDraft(d => { const n = { ...d }; delete n[itemId]; return n; });
    const qty = Number(raw);
    if (!Number.isFinite(qty) || qty <= 0) {
      clearDraft();
      showToast('כמות חייבת להיות גדולה מאפס', false);
      return;
    }
    if (Number(current.כמות) === qty) { clearDraft(); return; }
    setQtySaving(prev => { const s = new Set(prev); s.add(itemId); return s; });
    try {
      const res = await fetch(`/api/purchasing/cart/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ כמות: qty }),
      });
      const json = await res.json();
      if (!res.ok) { showToast(json.error || 'שמירת כמות נכשלה', false); clearDraft(); return; }
      setCart(prev => prev.map(i => i.id === itemId ? { ...i, כמות: Number(json.data.כמות) } : i));
      clearDraft();
    } catch { showToast('שגיאת רשת', false); clearDraft(); }
    finally {
      setQtySaving(prev => { const s = new Set(prev); s.delete(itemId); return s; });
    }
  }

  // "Carry" a line to another supplier — when one supplier is out of something
  // and another has it. Stays there: the server marks the line as moved by hand.
  async function moveToSupplier(itemId: string, supplierId: string | null) {
    const item = cart.find(i => i.id === itemId);
    if (!item || (item.ספק_id ?? null) === supplierId) return;
    try {
      const res = await fetch(`/api/purchasing/cart/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ספק_id: supplierId }),
      });
      const json = await res.json();
      if (!res.ok) { showToast(json.error || 'ההעברה נכשלה', false); return; }
      upsertCartItem(json.data as CartItem);
      const target = supplierId ? (suppliers.find(s => s.id === supplierId)?.שם_ספק ?? 'ספק') : 'ללא ספק מוגדר';
      showToast(`${item.שם_פריט} הועבר ל${target}`);
    } catch { showToast('שגיאת רשת', false); }
  }

  async function removeFromCart(itemId: string) {
    try {
      const res = await fetch(`/api/purchasing/cart/${itemId}`, { method: 'DELETE' });
      if (!res.ok) { showToast('הסרת הפריט נכשלה', false); return; }
      setCart(prev => prev.filter(i => i.id !== itemId));
      setSelected(prev => { const s = new Set(prev); s.delete(itemId); return s; });
      setQtyDraft(d => { const n = { ...d }; delete n[itemId]; return n; });
    } catch { showToast('שגיאת רשת', false); }
  }

  async function clearCart() {
    if (!window.confirm('לרוקן את כל הסל?')) return;
    setClearing(true);
    try {
      const res = await fetch('/api/purchasing/cart?all=1', { method: 'DELETE' });
      if (!res.ok) { showToast('ריקון הסל נכשל', false); return; }
      setCart([]);
      setSelected(new Set());
      setQtyDraft({});
      setExecutedGroups(new Set());
      showToast('הסל רוקן');
    } catch { showToast('שגיאת רשת', false); }
    finally { setClearing(false); }
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

  // Turns the selected lines of one supplier group into a purchase order.
  // The server reads the quantities from the cart itself and removes the
  // ordered lines, so nothing is trusted from the browser.
  async function handleMarkOrdered(supplierId: string | null, groupItems: CartItem[]) {
    const items = groupItems.filter(i => selected.has(i.id));
    if (items.length === 0) { showToast('לא נבחרו פריטים', false); return; }
    const key = supplierId ?? 'none';
    setOrderSaving(key);
    try {
      const res = await fetch('/api/purchasing/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cart_item_ids: items.map(i => i.id) }),
      });
      const json = await res.json();
      if (!res.ok) { showToast(json.error || 'שגיאה ביצירת הזמנת רכש', false); return; }
      const orderedIds = new Set(items.map(i => i.id));
      setCart(prev => prev.filter(i => !orderedIds.has(i.id)));
      setSelected(prev => { const s = new Set(prev); orderedIds.forEach(id => s.delete(id)); return s; });
      setExecutedGroups(prev => new Set(prev).add(key));
      showToast(`הזמנת רכש נוצרה — ${items.length} פריטים הוסרו מהסל`);
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

  function toggleExpandSupplier(supId: string) {
    setExpandedSupId(prev => prev === supId ? null : supId);
    if (!materialsLoaded) fetchMaterials();
  }

  function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function buildCopyText(supplierName: string, lines: ExportLine[]): string {
    const body = lines.map(l => `• ${l.alias || l.name} — ${l.qty} ${l.unit}`).join('\n');
    return `שלום ${supplierName},\nברצוני להזמין:\n\n${body}\n\nתודה רבה,\nעדי תכשיט שוקולד`;
  }

  function buildMailUrl(supplier: Supplier, lines: ExportLine[]): string {
    const subject = `הזמנת רכש — ${new Date().toLocaleDateString('he-IL')}`;
    const body = buildCopyText(supplier.שם_ספק, lines);
    return `mailto:${supplier.אימייל}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  function safeFileName(s: string): string {
    return s.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80);
  }

  function downloadWord(supplier: Supplier | null, items: ExportLine[]) {
    if (!items.length) { showToast('לא נבחרו פריטים', false); return; }
    const today = new Date().toLocaleDateString('he-IL');
    const supplierName = supplier?.שם_ספק ?? 'ללא ספק מוגדר';
    const rows = items.map(i => {
      const alias = i.alias ? ` (${escapeHtml(i.alias)})` : '';
      return `<tr>
        <td>${escapeHtml(i.name || '')}${alias}${i.sku ? `<br><span style="color:#777;font-size:11px">מק"ט ${escapeHtml(i.sku)}</span>` : ''}</td>
        <td>${escapeHtml(supplierName)}</td>
        <td style="text-align:left">${i.qty}</td>
        <td>${escapeHtml(i.unit || '')}</td>
        <td>${escapeHtml(i.note || '')}</td>
      </tr>`;
    }).join('');
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40" dir="rtl" lang="he">
<head><meta charset="UTF-8"><title>הזמנת רכש</title>
<style>body{font-family:Arial,Helvetica,sans-serif;direction:rtl;color:#222}
h1{font-size:20px;margin:0 0 6px}
.meta{color:#555;font-size:12px;margin-bottom:18px}
table{border-collapse:collapse;width:100%;font-size:13px}
th,td{border:1px solid #C9BFB1;padding:6px 8px;text-align:right;vertical-align:top}
th{background:#F3EDE4}</style></head>
<body>
<h1>הזמנת רכש — ${escapeHtml(supplierName)}</h1>
<div class="meta">תאריך: ${today}${supplier?.איש_קשר ? `  |  איש קשר: ${escapeHtml(supplier.איש_קשר)}` : ''}${supplier?.טלפון ? `  |  טלפון: ${escapeHtml(supplier.טלפון)}` : ''}</div>
<table><thead><tr><th>שם מוצר</th><th>ספק</th><th>כמות</th><th>יחידה</th><th>הערה</th></tr></thead><tbody>${rows}</tbody></table>
</body></html>`;
    const blob = new Blob(['﻿', html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `הזמנת_רכש_${safeFileName(supplierName)}_${today}.doc`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function downloadExcel(supplier: Supplier | null, items: ExportLine[]): Promise<boolean> {
    if (!items.length) { showToast('לא נבחרו פריטים', false); return false; }
    try {
      const XLSX = await import('xlsx');
      const supplierName = supplier?.שם_ספק ?? 'ללא ספק מוגדר';
      const today = new Date().toLocaleDateString('he-IL');
      const header = ['שם מוצר', 'כמות', 'יחידה', 'שם אצל ספק', 'מק"ט', 'ספק', 'הערה'];
      const rows = items.map(i => ({
        'שם מוצר':      i.name || '',
        'כמות':         i.qty,
        'יחידה':        i.unit || '',
        'שם אצל ספק':   i.alias || '',
        'מק"ט':         i.sku || '',
        'ספק':          supplierName,
        'הערה':         i.note || '',
      }));
      const ws = XLSX.utils.json_to_sheet(rows, { header });
      ws['!cols'] = [{ wch: 26 }, { wch: 10 }, { wch: 10 }, { wch: 22 }, { wch: 14 }, { wch: 20 }, { wch: 28 }];
      // RTL view (SheetJS reads `!views` with uppercase `RTL`)
      (ws as unknown as { '!views'?: Array<{ RTL: boolean }> })['!views'] = [{ RTL: true }];
      const wb = XLSX.utils.book_new();
      (wb as unknown as { Workbook?: { Views?: Array<{ RTL: boolean }> } }).Workbook = { Views: [{ RTL: true }] };
      XLSX.utils.book_append_sheet(wb, ws, 'הזמנת רכש');
      XLSX.writeFile(wb, `הזמנת_רכש_${safeFileName(supplierName)}_${today}.xlsx`);
      return true;
    } catch {
      showToast('שגיאה ביצירת קובץ Excel', false);
      return false;
    }
  }

  function downloadDesigned(supplier: Supplier | null, items: ExportLine[]) {
    if (!items.length) { showToast('לא נבחרו פריטים', false); return; }
    const today = new Date().toLocaleDateString('he-IL');
    const supplierName = supplier?.שם_ספק ?? 'ללא ספק מוגדר';
    const orderRef = `PO-${Date.now().toString().slice(-8)}`;
    const logoUrl = `${window.location.origin}/logo.png`;
    const rows = items.map((i, idx) => `
      <tr>
        <td class="num idx">${idx + 1}</td>
        <td>
          <div class="prod-name">${escapeHtml(i.name || '')}</div>
          ${i.sku ? `<div class="prod-meta">מק"ט ${escapeHtml(i.sku)}</div>` : ''}
        </td>
        <td>${escapeHtml(i.alias || '—')}</td>
        <td class="num qty">${i.qty}</td>
        <td>${escapeHtml(i.unit || '')}</td>
        <td>${escapeHtml(i.note || '')}</td>
      </tr>`).join('');
    const itemNotes = items.filter(i => i.note)
      .map(i => `• ${escapeHtml(i.name)} — ${escapeHtml(i.note!)}`)
      .join('<br>');
    const downloadName = `הזמנת_רכש_${safeFileName(supplierName)}_${today}.html`;
    const html = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8">
<title>הזמנת רכש — ${escapeHtml(supplierName)}</title>
<style>
  :root { --gold:#C7A46B; --brown:#2A1A0E; --bg:#FAF7F0; --ink:#2A1A0E; --soft:#7A6A55; --line:#E8DED4; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #ECE5DA; }
  body { font-family: 'Segoe UI', Arial, Helvetica, sans-serif; direction: rtl; color: var(--ink); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .toolbar { position: sticky; top: 0; z-index: 10; background: var(--brown); color: #FAF7F0; padding: 10px 16px; display: flex; gap: 8px; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,.15); }
  .toolbar button { background: var(--gold); color: var(--brown); border: 0; padding: 8px 18px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
  .toolbar button.ghost { background: transparent; color: #FAF7F0; border: 1px solid #FAF7F0; }
  .sheet { width: 210mm; min-height: 297mm; margin: 24px auto; background: #FFFFFF; padding: 22mm 18mm; box-shadow: 0 4px 24px rgba(0,0,0,.08); position: relative; }
  .sheet::before { content: ''; position: absolute; top: 0; right: 0; left: 0; height: 6px; background: linear-gradient(90deg, var(--gold), #E5C892, var(--gold)); }
  .header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  .brand { display: flex; align-items: center; gap: 14px; }
  .brand img { width: 64px; height: 64px; object-fit: contain; }
  .brand h1 { margin: 0; font-size: 22px; color: var(--brown); letter-spacing: .5px; }
  .brand .tag { color: var(--soft); font-size: 12px; margin-top: 2px; }
  .doc-meta { text-align: left; font-size: 12px; color: var(--soft); line-height: 1.7; }
  .doc-meta b { color: var(--ink); font-weight: 600; }
  .title-bar { margin: 26px 0 14px; padding: 10px 14px; background: var(--bg); border-right: 4px solid var(--gold); display: flex; align-items: center; justify-content: space-between; }
  .title-bar h2 { margin: 0; font-size: 20px; color: var(--brown); }
  .title-bar .ref { font-size: 12px; color: var(--soft); font-variant-numeric: tabular-nums; }
  .sup-card { border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px 18px; font-size: 12.5px; }
  .sup-card .lbl { color: var(--soft); font-size: 11px; }
  .sup-card .val { color: var(--ink); font-weight: 600; margin-top: 1px; }
  table.items { width: 100%; border-collapse: separate; border-spacing: 0; margin-top: 18px; font-size: 13px; }
  table.items thead th { background: var(--brown); color: #FAF7F0; padding: 10px; text-align: right; font-size: 12.5px; font-weight: 600; letter-spacing: .3px; }
  table.items thead th:first-child { border-radius: 0 8px 0 0; }
  table.items thead th:last-child  { border-radius: 8px 0 0 0; }
  table.items tbody td { padding: 9px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
  table.items tbody tr:nth-child(even) td { background: #FBF8F2; }
  table.items .idx { color: var(--soft); width: 28px; }
  table.items .num { font-variant-numeric: tabular-nums; }
  table.items .qty { font-weight: 700; text-align: left; color: var(--brown); }
  table.items .prod-name { font-weight: 600; color: var(--ink); }
  table.items .prod-meta { font-size: 11px; color: var(--soft); margin-top: 2px; }
  .summary { margin-top: 14px; display: flex; justify-content: space-between; font-size: 12.5px; color: var(--soft); }
  .summary b { color: var(--ink); }
  .notes { margin-top: 22px; border: 1px dashed var(--line); border-radius: 10px; padding: 12px 14px; min-height: 60px; font-size: 12.5px; color: var(--ink); }
  .notes .lbl { color: var(--soft); font-size: 11px; margin-bottom: 6px; }
  .signature { margin-top: 28px; display: flex; justify-content: space-between; gap: 32px; }
  .sig-block { flex: 1; }
  .sig-block .line { border-bottom: 1px solid #999; height: 36px; }
  .sig-block .lbl { font-size: 11.5px; color: var(--soft); margin-top: 6px; text-align: center; }
  .footer-bar { margin-top: 28px; padding-top: 10px; border-top: 1px solid var(--line); display: flex; justify-content: space-between; font-size: 11px; color: var(--soft); }
  @media print {
    body { background: #fff; }
    .toolbar { display: none; }
    .sheet { box-shadow: none; margin: 0; padding: 14mm 14mm; width: auto; min-height: auto; }
    @page { size: A4; margin: 0; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">🖨 הדפס / שמור PDF</button>
    <button id="dl">⬇ שמור קובץ</button>
    <button class="ghost" onclick="window.close()">סגור</button>
  </div>

  <div class="sheet">
    <div class="header">
      <div class="brand">
        <img src="${logoUrl}" onerror="this.style.display='none'" alt="">
        <div>
          <h1>עדי תכשיט שוקולד</h1>
          <div class="tag">שוקולד בעבודת יד</div>
        </div>
      </div>
      <div class="doc-meta">
        <div><b>תאריך:</b> ${today}</div>
        <div><b>מס׳ הזמנה:</b> ${orderRef}</div>
      </div>
    </div>

    <div class="title-bar">
      <h2>הזמנת רכש</h2>
      <span class="ref">סה״כ פריטים: ${items.length}</span>
    </div>

    <div class="sup-card">
      <div><div class="lbl">ספק</div><div class="val">${escapeHtml(supplierName)}</div></div>
      <div>${supplier?.איש_קשר ? `<div class="lbl">איש קשר</div><div class="val">${escapeHtml(supplier.איש_קשר)}</div>` : ''}</div>
      <div>${supplier?.טלפון ? `<div class="lbl">טלפון</div><div class="val" dir="ltr" style="text-align:right">${escapeHtml(supplier.טלפון)}</div>` : ''}</div>
      ${supplier?.אימייל ? `<div style="grid-column: span 3"><div class="lbl">אימייל</div><div class="val" dir="ltr" style="text-align:right">${escapeHtml(supplier.אימייל)}</div></div>` : ''}
    </div>

    <table class="items">
      <thead>
        <tr>
          <th>#</th>
          <th>שם מוצר</th>
          <th>שם אצל ספק</th>
          <th>כמות</th>
          <th>יחידה</th>
          <th>הערה</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="summary">
      <span>* הכמויות לפי סל הקניות</span>
      <span><b>סה״כ שורות:</b> ${items.length}</span>
    </div>

    <div class="notes">
      <div class="lbl">הערות כלליות</div>
      ${itemNotes || '&nbsp;'}
    </div>

    <div class="signature">
      <div class="sig-block">
        <div class="line"></div>
        <div class="lbl">חתימת ספק / קבלת הזמנה</div>
      </div>
      <div class="sig-block">
        <div class="line"></div>
        <div class="lbl">תאריך אספקה</div>
      </div>
    </div>

    <div class="footer-bar">
      <span>עדי תכשיט שוקולד · הופק אוטומטית</span>
      <span>${today} · ${orderRef}</span>
    </div>
  </div>

<script>
  document.getElementById('dl').addEventListener('click', function () {
    var blob = new Blob(['\\ufeff', document.documentElement.outerHTML], { type: 'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = ${JSON.stringify(downloadName)};
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
  });
</script>
</body>
</html>`;
    const w = window.open('', '_blank');
    if (!w) { showToast('לא ניתן לפתוח חלון — אפשר חלונות קופצים בדפדפן', false); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
  }

  async function whatsappWithFile(supplier: Supplier, items: ExportLine[]) {
    if (!items.length) { showToast('לא נבחרו פריטים', false); return; }
    const ok = await downloadExcel(supplier, items);
    if (!ok) return;
    showToast('הקובץ הורד — צרף אותו בוואטסאפ', true);
    const raw = supplier.טלפון?.replace(/\D/g, '') ?? '';
    const phone = raw.startsWith('972') ? raw : raw.startsWith('0') ? '972' + raw.slice(1) : raw;
    const msg = `שלום ${supplier.שם_ספק},\nרשימת ההזמנה מצורפת.\nתודה רבה,\nעדי תכשיט שוקולד`;
    setTimeout(() => {
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
    }, 500);
  }

  function downloadPdf(supplier: Supplier | null, items: ExportLine[]) {
    if (!items.length) { showToast('לא נבחרו פריטים', false); return; }
    const today = new Date().toLocaleDateString('he-IL');
    const supplierName = supplier?.שם_ספק ?? 'ללא ספק מוגדר';
    const rows = items.map(i => {
      const productName = i.name.trim() || 'שם מוצר חסר';
      const supplierAlias = i.alias?.trim()
        ? `<div class="alias">${escapeHtml(i.alias)}${i.sku ? ` · מק"ט ${escapeHtml(i.sku)}` : ''}</div>`
        : i.sku ? `<div class="alias">מק"ט ${escapeHtml(i.sku)}</div>` : '';
      return `
      <tr>
        <td><div class="name">${escapeHtml(productName)}</div>${supplierAlias}</td>
        <td>${escapeHtml(supplierName)}</td>
        <td class="num">${i.qty}</td>
        <td>${escapeHtml(i.unit || '')}</td>
        <td>${escapeHtml(i.note || '')}</td>
      </tr>`;
    }).join('');
    const meta = [
      supplier?.איש_קשר ? `איש קשר: ${escapeHtml(supplier.איש_קשר)}` : '',
      supplier?.טלפון   ? `טלפון: ${escapeHtml(supplier.טלפון)}`     : '',
      supplier?.אימייל  ? `אימייל: ${escapeHtml(supplier.אימייל)}`   : '',
      `תאריך: ${today}`,
    ].filter(Boolean).join('  |  ');
    const html = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8">
<title>הזמנת רכש — ${escapeHtml(supplierName)}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; direction: rtl; padding: 32px; color: #222; font-size: 14px; }
  h1 { font-size: 22px; margin: 0 0 6px; }
  .meta { color: #555; font-size: 13px; margin-bottom: 28px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #F3EDE4; text-align: right; padding: 9px 12px; font-size: 13px; border-bottom: 2px solid #E8DED4; }
  td { padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 13px; }
  td.num { text-align: left; font-variant-numeric: tabular-nums; }
  td .name { font-weight: 600; color: #222; }
  td .alias { color: #777; font-size: 12px; margin-top: 2px; }
  .footer { margin-top: 32px; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 12px; }
  @media print { @page { margin: 20mm; } body { padding: 0; } }
</style>
</head>
<body>
  <h1>הזמנת רכש — ${escapeHtml(supplierName)}</h1>
  <div class="meta">${meta}</div>
  <table>
    <thead><tr><th>שם מוצר</th><th>ספק</th><th>כמות</th><th>יחידה</th><th>הערה</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">עדי תכשיט שוקולד &bull; הופק ב-${today}</div>
</body>
</html>`;
    const w = window.open('', '_blank');
    if (!w) { showToast('לא ניתן לפתוח חלון — אפשר חלונות קופצים בדפדפן', false); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 500);
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

  // The cart, grouped by the supplier each line currently belongs to.
  const cartGroups = useMemo(() => {
    const map = new Map<string | null, { supplier: Supplier | null; items: CartItem[] }>();
    for (const item of cart) {
      const sid = item.ספק_id ?? null;
      if (!map.has(sid)) {
        let supplier: Supplier | null = sid ? (suppliers.find(s => s.id === sid) ?? null) : null;
        // Fall back to the supplier embedded in the cart row (suppliers list not loaded yet).
        if (!supplier && sid && item.ספקים) {
          supplier = {
            id: item.ספקים.id, שם_ספק: item.ספקים.שם_ספק, טלפון: item.ספקים.טלפון,
            אימייל: item.ספקים.אימייל, איש_קשר: item.ספקים.איש_קשר,
            הערות: null, פעיל: true, תאריך_יצירה: '',
          };
        }
        map.set(sid, { supplier, items: [] });
      }
      map.get(sid)!.items.push(item);
    }
    // Named suppliers first (alphabetical), "no supplier" group last
    const entries = Array.from(map.entries());
    entries.sort(([aId, a], [bId, b]) => {
      if (aId === null) return 1;
      if (bId === null) return -1;
      return (a.supplier?.שם_ספק ?? '').localeCompare(b.supplier?.שם_ספק ?? '', 'he');
    });
    return entries.map(([supplierId, g]) => ({ supplierId, ...g }));
  }, [cart, suppliers]);

  // Product picker — raw materials matching the search box, in-cart ones marked.
  const cartMaterialIds = useMemo(
    () => new Set(cart.map(i => i.חומר_גלם_id).filter((id): id is string => !!id)),
    [cart],
  );

  const pickerResults = useMemo(() => {
    const q = addSearch.trim();
    if (!q) return [];
    return materials
      .filter(m => m.שם_חומר_גלם.includes(q) || m.שם_מוצר_אצל_הספק?.includes(q) || m.מקט_ספק?.includes(q))
      .slice(0, 12);
  }, [materials, addSearch]);

  const lowStockCount = useMemo(
    () => materials.filter(m => Number(m.כמות_מינימום) > 0 && Number(m.כמות_במלאי) <= Number(m.כמות_מינימום)).length,
    [materials],
  );

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
              ['cart',      'סל קניות'],
            ] as [PageTab, string][]).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors relative ${tab === id ? 'bg-[#F8F4EF] text-[#2A1A0E]' : 'text-[#A88B6A] hover:text-[#FAF7F0]'}`}
              >
                {label}
                {id === 'cart' && cart.length > 0 && (
                  <span className="absolute -top-1 -left-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">{cart.length}</span>
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
                      <th className="px-5 py-3 w-24" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSuppliers.map(s => {
                      const isExpanded = expandedSupId === s.id;
                      const linkedMats = materials.filter(m => m.ספק_מועדף_id === s.id);
                      return (
                        <Fragment key={s.id}>
                          <tr className="border-t border-gray-100 hover:bg-amber-50/30">
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
                              <div className="flex items-center gap-1">
                                <button onClick={() => openEdit(s)} className="text-gray-400 hover:text-gray-700 p-1" title="ערוך ספק">
                                  <IconEdit className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => toggleExpandSupplier(s.id)}
                                  className="text-gray-400 hover:text-[#C7A46B] p-1 transition-colors text-xs leading-none"
                                  title={isExpanded ? 'סגור' : 'הצג חומרי גלם'}
                                >
                                  {isExpanded ? '▲' : '▼'}
                                </button>
                              </div>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="border-t border-gray-100" style={{ background: '#FDFAF6' }}>
                              <td colSpan={7} className="px-6 py-4">
                                <div className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">חומרי גלם מקושרים</div>
                                {loadingMaterials ? (
                                  <div className="text-xs text-gray-400">טוען...</div>
                                ) : linkedMats.length === 0 ? (
                                  <div className="text-xs text-gray-400">
                                    לא נמצאו חומרי גלם מקושרים. ניתן לקשר בלשונית &ldquo;הגדרות רכש&rdquo;.
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                                    {linkedMats.map(m => (
                                      <div key={m.id} className="bg-white rounded-lg border border-gray-200 px-3 py-2">
                                        <div className="font-medium text-gray-800 text-xs">{m.שם_חומר_גלם}</div>
                                        {m.שם_מוצר_אצל_הספק && m.שם_מוצר_אצל_הספק !== m.שם_חומר_גלם && (
                                          <div className="text-gray-400 text-xs mt-0.5">{m.שם_מוצר_אצל_הספק}</div>
                                        )}
                                        {m.מקט_ספק && (
                                          <div className="text-gray-400 text-xs">מקט: {m.מקט_ספק}</div>
                                        )}
                                        <div className="text-gray-500 text-xs mt-0.5">
                                          {m.כמות_במלאי} {m.יחידת_מידה} במלאי
                                          {m.כמות_מינימום > 0 && ` · מינ׳ ${m.כמות_מינימום}`}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
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

        {/* ── TAB 3: Purchasing cart ────────────────────────────────────── */}
        {tab === 'cart' && (
          <div>
            {/* Add to cart */}
            <div className="bg-white rounded-xl shadow-sm p-4 mb-5">
              <div className="flex items-start gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[260px]">
                  <input
                    placeholder="חפש מוצר והוסף לסל..."
                    value={addSearch}
                    onChange={e => setAddSearch(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Escape') { setAddSearch(''); return; }
                      if (e.key !== 'Enter') return;
                      if (pickerResults.length === 1) addToCart(pickerResults[0].id, pickerResults[0].שם_חומר_גלם);
                      else if (pickerResults.length === 0 && addSearch.trim()) addFreeTextToCart(addSearch);
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C7A46B]"
                  />
                  {addSearch.trim() && (
                    <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto">
                      {loadingMaterials && (
                        <div className="px-3 py-3 text-xs text-gray-400">טוען מוצרים...</div>
                      )}
                      {pickerResults.map(m => {
                        const supplierName = suppliers.find(s => s.id === m.ספק_מועדף_id)?.שם_ספק
                          ?? m.ספקים?.שם_ספק ?? 'ללא ספק מוגדר';
                        return (
                          <button
                            key={m.id}
                            onClick={() => addToCart(m.id, m.שם_חומר_גלם)}
                            disabled={addingId === m.id}
                            className="w-full text-right px-3 py-2 hover:bg-amber-50 border-b border-gray-50 last:border-b-0 disabled:opacity-50"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-gray-900 truncate">
                                  {m.שם_חומר_גלם}
                                  {cartMaterialIds.has(m.id) && (
                                    <span className="mr-2 text-[10px] text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">בסל</span>
                                  )}
                                </div>
                                <div className="text-xs text-gray-400 truncate">
                                  {supplierName} · במלאי {m.כמות_במלאי} {m.יחידת_מידה}
                                </div>
                              </div>
                              <span className="text-xs font-medium text-[#C7A46B] flex-shrink-0">
                                {addingId === m.id ? '...' : '+ הוסף'}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                      {!loadingMaterials && (
                        <button
                          onClick={() => addFreeTextToCart(addSearch)}
                          disabled={addingId === 'free-text'}
                          className="w-full text-right px-3 py-2 hover:bg-amber-50 text-xs text-gray-500 disabled:opacity-50"
                        >
                          + הוסף &ldquo;{addSearch.trim()}&rdquo; כפריט חופשי (ללא כרטיס מלאי)
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <button
                  onClick={addLowStockToCart}
                  disabled={lowStockAdding}
                  className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-amber-50 text-gray-600 disabled:opacity-50"
                  title="מוסיף לסל כל חומר גלם שהמלאי שלו ירד לכמות המינימום"
                >
                  {lowStockAdding ? 'מוסיף...' : `הוסף חוסרי מלאי${lowStockCount ? ` (${lowStockCount})` : ''}`}
                </button>
                <button
                  onClick={fetchCart}
                  className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-white text-gray-600"
                >
                  רענן
                </button>
                {cart.length > 0 && (
                  <button
                    onClick={clearCart}
                    disabled={clearing}
                    className="px-4 py-2 text-sm rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    {clearing ? 'מרוקן...' : 'רוקן סל'}
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-2">
                כל מוצר שנוסף לסל מקבל כמות ונכנס אוטומטית לספק שהוגדר לו בלשונית &ldquo;הגדרות רכש&rdquo;.
                אפשר לגרור פריט לקבוצה של ספק אחר, או להעביר דרך &ldquo;העבר לספק&rdquo; — למשל כשלספק אחד חסר משהו שיש לאחר.
              </p>
            </div>

            {loadingCart && cart.length === 0 ? (
              <div className="text-center py-16 text-gray-400">טוען...</div>
            ) : cart.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-5xl mb-3">🛒</div>
                <div className="text-gray-700 font-semibold text-lg">הסל ריק</div>
                <div className="text-sm text-gray-400 mt-1">חפש מוצר בשורת החיפוש והוסף אותו לסל</div>
              </div>
            ) : (
              <div className="space-y-5">
                {cartGroups.map(group => {
                  const gKey = group.supplierId ?? 'none';
                  const selectedInGroup = group.items.filter(i => selected.has(i.id));
                  const groupLines = toExportLines(selectedInGroup);
                  const isExecuted = executedGroups.has(gKey);
                  const isDropTarget = dragItemId !== null && dragOverGroup === gKey;
                  return (
                    <div
                      key={gKey}
                      onDragOver={e => { if (dragItemId) { e.preventDefault(); setDragOverGroup(gKey); } }}
                      onDragLeave={() => setDragOverGroup(prev => (prev === gKey ? null : prev))}
                      onDrop={e => {
                        e.preventDefault();
                        const id = dragItemId;
                        setDragOverGroup(null);
                        setDragItemId(null);
                        if (id) moveToSupplier(id, group.supplierId);
                      }}
                      className="bg-white rounded-xl shadow-sm overflow-hidden"
                      style={isDropTarget ? { outline: '2px dashed #C7A46B', outlineOffset: 2 } : undefined}
                    >
                      {/* Group header */}
                      <div className="px-5 py-4" style={{ background: '#F3EDE4', borderBottom: '1px solid #E8DED4' }}>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-semibold text-gray-900 text-base flex items-center gap-2">
                              <span>{group.supplier?.שם_ספק ?? 'ללא ספק מוגדר'}</span>
                              {isExecuted && (
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                  ✓ הוזמן · הפריטים הוסרו מהסל
                                </span>
                              )}
                            </div>
                            <div className="flex gap-3 mt-0.5 flex-wrap">
                              <span className="text-sm text-gray-500">{group.items.length} פריטים בסל</span>
                              {group.supplier?.טלפון && (
                                <span className="text-sm text-gray-500 font-mono">{group.supplier.טלפון}</span>
                              )}
                              {group.supplier?.אימייל && (
                                <span className="text-sm text-gray-500">{group.supplier.אימייל}</span>
                              )}
                              {group.supplier?.איש_קשר && (
                                <span className="text-sm text-gray-500">{group.supplier.איש_קשר}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap justify-end">
                            {/* PDF download */}
                            <button
                              onClick={() => downloadPdf(group.supplier, groupLines)}
                              className="px-3 py-1.5 rounded-lg text-xs border border-gray-300 hover:bg-white text-gray-600 transition-colors"
                              title="הורד PDF"
                            >
                              PDF
                            </button>

                            {/* Word download */}
                            <button
                              onClick={() => downloadWord(group.supplier, groupLines)}
                              className="px-3 py-1.5 rounded-lg text-xs border border-gray-300 hover:bg-white text-gray-600 transition-colors"
                              title="הורד Word"
                            >
                              Word
                            </button>

                            {/* Excel download */}
                            <button
                              onClick={() => downloadExcel(group.supplier, groupLines)}
                              className="px-3 py-1.5 rounded-lg text-xs border border-gray-300 hover:bg-white text-gray-600 transition-colors"
                              title="הורד Excel"
                            >
                              Excel
                            </button>

                            {/* Designed branded file */}
                            <button
                              onClick={() => downloadDesigned(group.supplier, groupLines)}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-opacity hover:opacity-90"
                              style={{ background: '#C7A46B' }}
                              title="קובץ מעוצב — תצוגה מקדימה, הדפסה ושמירה"
                            >
                              קובץ מעוצב
                            </button>

                            {/* WhatsApp — generates Excel then opens WhatsApp with prefilled note */}
                            {group.supplier?.טלפון && (
                              <button
                                onClick={() => whatsappWithFile(group.supplier!, groupLines)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white font-medium transition-opacity hover:opacity-90"
                                style={{ background: '#25D366' }}
                                title="הורד קובץ ופתח וואטסאפ"
                              >
                                <IconWhatsApp className="w-3.5 h-3.5" />
                                WhatsApp + קובץ
                              </button>
                            )}

                            {/* Copy text */}
                            <button
                              onClick={() => {
                                const text = buildCopyText(group.supplier?.שם_ספק ?? 'ספק', groupLines);
                                navigator.clipboard?.writeText(text).then(() => showToast('הועתק ללוח'));
                              }}
                              className="px-3 py-1.5 rounded-lg text-xs border border-gray-300 hover:bg-white text-gray-600 transition-colors"
                            >
                              העתק טקסט
                            </button>

                            {/* Email */}
                            {group.supplier?.אימייל && (
                              <a
                                href={buildMailUrl(group.supplier, groupLines)}
                                className="px-3 py-1.5 rounded-lg text-xs border border-gray-300 hover:bg-white text-gray-600 transition-colors"
                              >
                                שלח מייל
                              </a>
                            )}

                            {/* Execute (mark as ordered) */}
                            <button
                              onClick={() => handleMarkOrdered(group.supplierId, group.items)}
                              disabled={orderSaving === gKey || selectedInGroup.length === 0}
                              className="px-3 py-1.5 rounded-lg text-xs text-white font-medium disabled:opacity-40 transition-opacity"
                              style={{ background: '#C7A46B' }}
                            >
                              {orderSaving === gKey ? 'שומר...' : `הזמן (${selectedInGroup.length})`}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Items */}
                      <div>
                        {group.items.map(item => {
                          const mat = item.מלאי_חומרי_גלם ?? null;
                          const unit = item.יחידה || mat?.יחידת_מידה || '';
                          const qtyValue = qtyDraft[item.id] ?? String(item.כמות);
                          return (
                            <div
                              key={item.id}
                              draggable
                              onDragStart={() => setDragItemId(item.id)}
                              onDragEnd={() => { setDragItemId(null); setDragOverGroup(null); }}
                              className={`flex items-center px-5 py-3 gap-4 border-b border-gray-50 last:border-b-0 transition-opacity cursor-grab active:cursor-grabbing ${selected.has(item.id) ? '' : 'opacity-40'} ${dragItemId === item.id ? 'opacity-50' : ''}`}
                            >
                              <input
                                type="checkbox"
                                checked={selected.has(item.id)}
                                onChange={e => {
                                  const s = new Set(selected);
                                  if (e.target.checked) s.add(item.id); else s.delete(item.id);
                                  setSelected(s);
                                }}
                                className="w-4 h-4 rounded accent-amber-600 flex-shrink-0"
                                title="כלול בהזמנה / בקובץ"
                              />

                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-gray-900 text-sm flex items-center gap-2 flex-wrap">
                                  <span>{item.שם_פריט}</span>
                                  {!item.חומר_גלם_id && (
                                    <span className="text-[10px] text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">פריט חופשי</span>
                                  )}
                                  {item.הועבר_ידנית && (
                                    <span className="text-[10px] text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">הועבר ידנית</span>
                                  )}
                                </div>
                                {mat?.שם_מוצר_אצל_הספק && mat.שם_מוצר_אצל_הספק !== item.שם_פריט && (
                                  <div className="text-xs text-gray-400 mt-0.5">{mat.שם_מוצר_אצל_הספק}</div>
                                )}
                                {mat?.מקט_ספק && (
                                  <div className="text-xs text-gray-400">מקט: {mat.מקט_ספק}</div>
                                )}
                                {item.הערה && (
                                  <div className="text-xs text-amber-700 mt-0.5">{item.הערה}</div>
                                )}
                              </div>

                              {mat && (
                                <div className="text-xs text-gray-500 text-left flex-shrink-0">
                                  במלאי: <span className="font-semibold text-gray-700">{mat.כמות_במלאי}</span> {mat.יחידת_מידה}
                                </div>
                              )}

                              {/* Move the line to another supplier */}
                              <select
                                value={item.ספק_id ?? ''}
                                onChange={e => moveToSupplier(item.id, e.target.value || null)}
                                className="border border-gray-300 rounded px-2 py-1 text-xs bg-white text-gray-600 max-w-[150px] focus:outline-none focus:border-[#C7A46B]"
                                title="העבר לספק אחר"
                              >
                                <option value="">ללא ספק מוגדר</option>
                                {suppliers.map(s => (
                                  <option key={s.id} value={s.id}>{s.שם_ספק}</option>
                                ))}
                              </select>

                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <span className="text-xs text-gray-500">כמות:</span>
                                <input
                                  type="number"
                                  value={qtyValue}
                                  onChange={e => setQtyDraft(d => ({ ...d, [item.id]: e.target.value }))}
                                  onBlur={e => saveQty(item.id, e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                  className="border border-gray-300 rounded px-2 py-1 text-sm w-20 text-center focus:outline-none focus:border-[#C7A46B]"
                                  min={0}
                                  step="0.001"
                                />
                                <span className="text-xs text-gray-500 w-10 truncate">{unit}</span>
                                {qtySaving.has(item.id) && (
                                  <span className="text-[10px] text-gray-400">שומר...</span>
                                )}
                              </div>

                              <button
                                onClick={() => removeFromCart(item.id)}
                                className="text-gray-300 hover:text-red-600 transition-colors text-lg leading-none px-1 flex-shrink-0"
                                title="הסר מהסל"
                              >
                                ×
                              </button>
                            </div>
                          );
                        })}
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
