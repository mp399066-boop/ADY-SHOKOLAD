'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PageLoading } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Combobox } from '@/components/ui/Combobox';
import toast from 'react-hot-toast';
import { exportToCsv } from '@/lib/exportCsv';
import { IconExport, IconTrash } from '@/components/icons';
import { ActionBtn } from '@/components/ui/RowActions';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import type { Recipe, Product, RawMaterial, Production, RecipeIngredient } from '@/types/database';

type Tab = 'recipes' | 'production';

type IngCheck = {
  id: string;
  name: string;
  required: number;
  available: number;
  unit: string;
  stockUnit: string;
  ok: boolean;
  unitMismatch: boolean;
};

export default function RecipesPage() {
  const [tab, setTab] = useState<Tab>('recipes');
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [productions, setProductions] = useState<Production[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRecipeModal, setShowRecipeModal] = useState(false);
  const [showProductionModal, setShowProductionModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const [recipeForm, setRecipeForm] = useState<{
    שם_מתכון: string; מוצר_id: string; כמות_תוצר: number; הערות: string;
    רכיבים: { חומר_גלם_id: string; כמות_נדרשת: number; יחידת_מידה: string }[];
  }>({ שם_מתכון: '', מוצר_id: '', כמות_תוצר: 1, הערות: '', רכיבים: [] });

  // ── Auto-link recipes → products (preview + confirm) ─────────────────────
  type AutoLinkSafe    = { recipeId: string; recipeName: string; productId: string; productName: string; matchType: 'exact' | 'contains' };
  type AutoLinkCand    = { productId: string; productName: string; matchType: 'exact' | 'contains' };
  type AutoLinkReview  = { recipeId: string; recipeName: string; candidates: AutoLinkCand[] };
  type AutoLinkUnmatch = { recipeId: string; recipeName: string };
  type AutoLinkPreview = {
    safe: AutoLinkSafe[];
    review: AutoLinkReview[];
    unmatched: AutoLinkUnmatch[];
    totals: { unlinkedRecipes: number; activeProducts: number; safe: number; review: number; unmatched: number };
  };
  const [autoLinkOpen, setAutoLinkOpen]       = useState(false);
  const [autoLinkLoading, setAutoLinkLoading] = useState(false);
  const [autoLinkApplying, setAutoLinkApplying] = useState(false);
  const [autoLinkPreview, setAutoLinkPreview] = useState<AutoLinkPreview | null>(null);
  const [autoLinkChecked, setAutoLinkChecked] = useState<Set<string>>(new Set());

  const openAutoLink = async () => {
    setAutoLinkOpen(true);
    setAutoLinkLoading(true);
    setAutoLinkPreview(null);
    try {
      const res = await fetch('/api/recipes/auto-link-preview');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'שגיאה בטעינת הצעות שיוך');
      setAutoLinkPreview(json as AutoLinkPreview);
      setAutoLinkChecked(new Set((json.safe ?? []).map((r: AutoLinkSafe) => r.recipeId)));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'שגיאה בטעינת הצעות שיוך');
      setAutoLinkOpen(false);
    } finally {
      setAutoLinkLoading(false);
    }
  };

  const applyAutoLink = async () => {
    if (!autoLinkPreview) return;
    const pairs = autoLinkPreview.safe
      .filter(r => autoLinkChecked.has(r.recipeId))
      .map(r => ({ recipeId: r.recipeId, productId: r.productId }));
    if (pairs.length === 0) {
      toast('לא נבחרו זוגות לאישור', { icon: 'ℹ️' });
      return;
    }
    setAutoLinkApplying(true);
    try {
      const res = await fetch('/api/recipes/auto-link-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairs }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'שגיאה בשיוך');
      const reviewCount = autoLinkPreview.review.length;
      toast.success(`נשייכו ${json.linked} מתכונים · ${json.skipped?.length ?? 0} דולגו · ${reviewCount} ממתינים לבדיקה ידנית`);
      setAutoLinkOpen(false);
      setAutoLinkPreview(null);
      fetchAll();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'שגיאה בשיוך');
    } finally {
      setAutoLinkApplying(false);
    }
  };

  const toggleAutoLinkRow = (recipeId: string) => {
    setAutoLinkChecked(prev => {
      const next = new Set(prev);
      if (next.has(recipeId)) next.delete(recipeId); else next.add(recipeId);
      return next;
    });
  };

  // ── Manual per-recipe link modal ──────────────────────────────────────
  // Primary workflow: pick one recipe → pick a target TYPE → pick the
  // matching row. PATCH /api/recipes/[id] validates and writes the new
  // polymorphic columns (production_target_type / production_target_id).
  const [linkRecipeId, setLinkRecipeId]             = useState<string | null>(null);
  const [linkTargetType, setLinkTargetType]         = useState<'sale_product' | 'petit_four'>('sale_product');
  const [linkSelectedTargetId, setLinkSelectedTargetId] = useState<string>('');
  const [linkSaving, setLinkSaving]                 = useState(false);
  const [petitFourTypes, setPetitFourTypes]         = useState<{ id: string; שם_פטיפור: string; פעיל?: boolean }[]>([]);
  const linkRecipe = recipes.find(r => r.id === linkRecipeId) || null;

  // Load active petit-four types alongside the existing fetches so the
  // picker can render them without an extra round-trip on modal open.
  useEffect(() => {
    fetch('/api/petit-four-types?active=true')
      .then(r => r.json())
      .then(({ data }) => setPetitFourTypes(Array.isArray(data) ? data.filter((p: { פעיל?: boolean }) => p.פעיל !== false) : []))
      .catch(() => {});
  }, []);

  const openLinkModal = (
    recipeId: string,
    currentTargetType: 'sale_product' | 'petit_four' | null,
    currentTargetId: string | null,
  ) => {
    setLinkRecipeId(recipeId);
    setLinkTargetType(currentTargetType ?? 'sale_product');
    setLinkSelectedTargetId(currentTargetId ?? '');
  };

  const saveLink = async () => {
    if (!linkRecipeId || !linkSelectedTargetId) {
      toast.error('יש לבחור יעד לפני שמירה');
      return;
    }
    setLinkSaving(true);
    try {
      const res = await fetch(`/api/recipes/${linkRecipeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          production_target_type: linkTargetType,
          production_target_id:   linkSelectedTargetId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'שגיאה בשיוך');
      toast.success(linkTargetType === 'petit_four' ? 'המתכון שויך לסוג פטיפור' : 'המתכון שויך למוצר');
      setLinkRecipeId(null);
      setLinkSelectedTargetId('');
      fetchAll();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'שגיאה בשיוך');
    } finally {
      setLinkSaving(false);
    }
  };

  const today = new Date().toISOString().split('T')[0];
  const [productionForm, setProductionForm] = useState({
    מתכון_id: '',
    כמות_שיוצרה: 1,
    תאריך_ייצור: today,
    הערות: '',
  });

  const fetchAll = () => {
    setLoading(true);
    Promise.all([
      fetch('/api/recipes').then(r => r.json()),
      fetch('/api/production').then(r => r.json()),
      fetch('/api/products?active=true').then(r => r.json()),
      fetch('/api/inventory').then(r => r.json()),
    ]).then(([rec, prod, p, mat]) => {
      setRecipes(rec.data || []);
      setProductions(prod.data || []);
      setProducts(p.data || []);
      setMaterials(mat.data || []);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, []);

  // ── Recipe form helpers ─────────────────────────────────────────────────

  const addIngredient = () => {
    setRecipeForm(prev => ({
      ...prev,
      רכיבים: [...prev.רכיבים, { חומר_גלם_id: '', כמות_נדרשת: 0, יחידת_מידה: 'ק"ג' }],
    }));
  };

  const updateIngredient = (idx: number, field: string, value: string | number) => {
    setRecipeForm(prev => {
      const ingredients = [...prev.רכיבים];
      ingredients[idx] = { ...ingredients[idx], [field]: value };
      if (field === 'חומר_גלם_id') {
        const mat = materials.find(m => m.id === value);
        if (mat) ingredients[idx].יחידת_מידה = mat.יחידת_מידה;
      }
      return { ...prev, רכיבים: ingredients };
    });
  };

  const handleSaveRecipe = async () => {
    if (!recipeForm.שם_מתכון) { toast.error('שם מתכון הוא שדה חובה'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recipeForm),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success('מתכון נשמר');
      setShowRecipeModal(false);
      fetchAll();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setSaving(false);
    }
  };

  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteRecipe = async (id: string) => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/recipes/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) {
        const isFK = (json.error || '').includes('foreign key') || (json.error || '').includes('violates');
        toast.error(isFK ? 'לא ניתן למחוק כי קיימות רשומות מקושרות' : (json.error || 'שגיאה במחיקה'));
        return;
      }
      toast.success('מתכון נמחק');
      setConfirmId(null);
      fetchAll();
    } catch { toast.error('שגיאה במחיקה'); }
    finally { setDeleting(false); }
  };

  // ── Production form helpers ─────────────────────────────────────────────

  function openProductionModal(recipeId?: string) {
    setProductionForm({
      מתכון_id: recipeId || '',
      כמות_שיוצרה: 1,
      תאריך_ייצור: today,
      הערות: '',
    });
    setShowProductionModal(true);
  }

  // Resolve selected recipe object (used for stock check and display)
  const selectedRecipe = useMemo(
    () => recipes.find(r => r.id === productionForm.מתכון_id) ?? null,
    [recipes, productionForm.מתכון_id],
  );

  // Live stock check — runs whenever recipe or batch count changes
  const ingredientChecks = useMemo<IngCheck[]>(() => {
    if (!selectedRecipe) return [];
    const ings = (selectedRecipe as Recipe & { רכיבי_מתכון?: RecipeIngredient[] }).רכיבי_מתכון ?? [];
    const batches = productionForm.כמות_שיוצרה || 1;
    return ings.map(ing => {
      const mat = materials.find(m => m.id === ing.חומר_גלם_id);
      const required = ing.כמות_נדרשת * batches;
      const available = mat ? Number(mat.כמות_במלאי) || 0 : 0;
      const unitMismatch = !!(mat && ing.יחידת_מידה !== mat.יחידת_מידה);
      return {
        id: ing.id,
        name: (ing.מלאי_חומרי_גלם as { שם_חומר_גלם?: string } | undefined)?.שם_חומר_גלם || '-',
        required,
        available,
        unit: ing.יחידת_מידה,
        stockUnit: mat?.יחידת_מידה ?? ing.יחידת_מידה,
        ok: !unitMismatch && required <= available,
        unitMismatch,
      };
    });
  }, [selectedRecipe, materials, productionForm.כמות_שיוצרה]);

  const canProduce =
    productionForm.מתכון_id !== '' &&
    productionForm.כמות_שיוצרה > 0 &&
    ingredientChecks.length > 0 &&
    ingredientChecks.every(c => c.ok);

  const hasProblems = ingredientChecks.some(c => !c.ok);

  const handleProduction = async () => {
    if (!productionForm.מתכון_id || productionForm.כמות_שיוצרה <= 0) {
      toast.error('בחר מתכון וכמות');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productionForm),
      });
      const json = await res.json();
      if (res.status === 422) {
        const msgs = [...(json.insufficiency ?? []), ...(json.unitMismatch ?? [])];
        msgs.forEach(m => toast.error(m, { duration: 6000 }));
        return;
      }
      if (!res.ok) throw new Error(json.error);
      toast.success('ייצור נרשם ומלאי עודכן');
      setShowProductionModal(false);
      fetchAll();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setSaving(false);
    }
  };

  // ── Misc ────────────────────────────────────────────────────────────────

  const tabs = [
    { key: 'recipes' as Tab, label: 'מתכונים' },
    { key: 'production' as Tab, label: 'ייצור' },
  ];

  const handleExport = () => {
    exportToCsv('מתכונים.csv',
      ['שם מתכון', 'מוצר', 'כמות תוצר', 'הערות'],
      recipes.map(r => [
        r.שם_מתכון,
        (r as Recipe & { מוצרים_למכירה?: { שם_מוצר: string } }).מוצרים_למכירה?.שם_מוצר || '',
        r.כמות_תוצר,
        r.הערות || '',
      ]),
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center gap-3 flex-wrap">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={tab === t.key
              ? { backgroundColor: '#8B5E34', color: '#FFFFFF' }
              : { backgroundColor: '#FFFFFF', color: '#6B4A2D', border: '1px solid #E7D2A6' }}>
            {t.label}
          </button>
        ))}
        {tab === 'recipes' && (
          <button onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border bg-white hover:bg-[#FAF7F2] transition-all"
            style={{ borderColor: '#D8CCBA', color: '#8B5E34' }}>
            <IconExport className="w-3.5 h-3.5" />
            ייצוא לאקסל
          </button>
        )}
        {tab === 'recipes' && (
          // Secondary action — main workflow is manual per-recipe linking.
          // Tooltip + helper toast inside the modal explain when it's safe
          // to use this shortcut.
          <button onClick={openAutoLink}
            className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-lg border bg-transparent hover:bg-[#FAF7F2] transition-all opacity-75 hover:opacity-100"
            style={{ borderColor: '#E7D2A6', color: '#9B7A5A' }}
            title="אופציונלי — מתאים רק כששמות המתכונים והמוצרים זהים וברורים.">
            שייכי אוטומטית לפי שמות
          </button>
        )}
        <div className="mr-auto">
          {tab === 'recipes'
            ? <Button size="sm" onClick={() => setShowRecipeModal(true)}>+ מתכון חדש</Button>
            : <Button size="sm" onClick={() => openProductionModal()}>+ רשום ייצור</Button>}
        </div>
      </div>

      {loading ? <PageLoading /> : (
        <>
          {/* ── Recipes tab ──────────────────────────────────────────────── */}
          {tab === 'recipes' && (
            recipes.length === 0
              ? <EmptyState title="אין מתכונים" action={<Button onClick={() => setShowRecipeModal(true)}>+ מתכון חדש</Button>} />
              : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {recipes.map(r => {
                    const ings = (r as Recipe & { רכיבי_מתכון?: RecipeIngredient[] }).רכיבי_מתכון ?? [];
                    const targetType = (r as Recipe & { production_target_type?: 'sale_product' | 'petit_four' | null }).production_target_type ?? null;
                    const targetId   = (r as Recipe & { production_target_id?: string | null }).production_target_id ?? null;
                    const linkedSaleProduct = targetType === 'sale_product' && targetId
                      ? products.find(p => p.id === targetId) ?? null
                      : null;
                    const linkedPetitFour   = targetType === 'petit_four' && targetId
                      ? petitFourTypes.find(p => p.id === targetId) ?? null
                      : null;
                    const isLinked = !!(linkedSaleProduct || linkedPetitFour);
                    const linkedLabel = linkedSaleProduct
                      ? `מוצר למכירה: ${linkedSaleProduct.שם_מוצר}`
                      : linkedPetitFour
                        ? `סוג פטיפור: ${linkedPetitFour.שם_פטיפור}`
                        : null;
                    return (
                      <Card key={r.id}>
                        <div className="flex justify-between mb-3">
                          <div>
                            <h3 className="font-semibold" style={{ color: '#2B1A10' }}>{r.שם_מתכון}</h3>
                            <p className="text-xs mt-0.5" style={{ color: '#9B7A5A' }}>
                              יוצא מהמתכון: {r.כמות_תוצר} יחידות
                            </p>
                          </div>
                          <div className="flex items-start gap-1">
                            <button
                              type="button"
                              onClick={() => openProductionModal(r.id)}
                              className="text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-colors hover:bg-amber-50"
                              style={{ borderColor: '#D4A96A', color: '#8B5E34', backgroundColor: '#FDF6EC' }}
                              title="הפק ייצור"
                            >
                              הפק ייצור
                            </button>
                            <ActionBtn title="מחיקה" variant="danger" onClick={() => setConfirmId(r.id)} icon={<IconTrash className="w-4 h-4" />} />
                          </div>
                        </div>

                        {/* ── Production-target link row ────────────────────
                            Every recipe card surfaces its target so the
                            operator always knows whether production will
                            close the loop (and to WHICH inventory table). */}
                        <div
                          className="flex items-center justify-between gap-2 mb-3 px-2.5 py-2 rounded-lg border"
                          style={isLinked
                            ? { backgroundColor: '#F1F8EE', borderColor: '#B8D5A8', color: '#2F5C2C' }
                            : { backgroundColor: '#FFF7ED', borderColor: '#FCD9A8', color: '#92602A' }}
                        >
                          <div className="text-[12px] leading-snug">
                            <span className="font-bold">משויך לייצור: </span>
                            {linkedLabel ? (
                              <span className="font-semibold">{linkedLabel}</span>
                            ) : (
                              <span>לא משויך — ייצור לא יעדכן מלאי מוגמר</span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => openLinkModal(r.id, targetType, targetId)}
                            className="text-[11.5px] px-2.5 py-1 rounded-md font-bold text-white shrink-0"
                            style={{ backgroundColor: isLinked ? '#7A4A27' : '#A8442D' }}
                          >
                            {isLinked ? 'שני שיוך' : 'שייכי למלאי'}
                          </button>
                        </div>

                        {/* Ingredients section */}
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="text-xs font-semibold" style={{ color: '#2B1A10' }}>
                            חומרי גלם במתכון
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: '#F0E8DC', color: '#6B4A2D' }}>
                            {ings.length > 0 ? `${ings.length} חומרי גלם` : 'אין חומרי גלם'}
                          </span>
                        </div>

                        {ings.length > 0 ? (
                          <div className="space-y-1">
                            {ings.map((ing, i) => {
                              const mat = materials.find(m => m.id === ing.חומר_גלם_id);
                              const ingName = (ing.מלאי_חומרי_גלם as { שם_חומר_גלם?: string } | undefined)?.שם_חומר_גלם
                                || mat?.שם_חומר_גלם
                                || 'דורש שיוך לחומר גלם';
                              const isUnlinked = !ing.חומר_גלם_id;
                              const stock = mat ? Number(mat.כמות_במלאי) : null;
                              const enough = stock !== null && stock >= ing.כמות_נדרשת;
                              return (
                                <div key={i} className="flex justify-between items-center text-xs p-1.5 rounded"
                                  style={{ backgroundColor: isUnlinked ? '#FEF3C7' : '#FAF7F0' }}>
                                  <span style={{ color: isUnlinked ? '#92400E' : '#2B1A10' }}>
                                    {isUnlinked && <span className="ml-1">⚠</span>}
                                    {ingName}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <span style={{ color: '#6B4A2D' }}>{ing.כמות_נדרשת} {ing.יחידת_מידה}</span>
                                    {stock !== null && (
                                      <span
                                        className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                                        style={enough
                                          ? { backgroundColor: '#E8F5EE', color: '#2A7A4F' }
                                          : { backgroundColor: '#FDE8E7', color: '#A0362C' }}
                                      >
                                        {stock} {mat?.יחידת_מידה}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-xs italic" style={{ color: '#9B7A5A' }}>הוסיפי חומרי גלם למתכון</p>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )
          )}

          {/* ── Production tab ───────────────────────────────────────────── */}
          {tab === 'production' && (
            productions.length === 0
              ? <EmptyState title="אין רשומות ייצור" action={<Button onClick={() => openProductionModal()}>+ רשום ייצור</Button>} />
              : (
                <Card className="p-0 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ backgroundColor: '#FAF7F0', borderBottom: '1px solid #E7D2A6' }}>
                        {['מתכון / מוצר', 'כמות / אצוות', 'תאריך', 'הערות'].map(h => (
                          <th key={h} className="px-4 py-3 text-right text-xs font-semibold" style={{ color: '#6B4A2D' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {productions.map(p => {
                        const label = p.מתכונים?.שם_מתכון
                          || (p as Production & { מוצרים_למכירה?: { שם_מוצר: string } }).מוצרים_למכירה?.שם_מוצר
                          || '-';
                        const batchLabel = p.מתכון_id
                          ? `${p.כמות_שיוצרה} אצווה${p.כמות_שיוצרה !== 1 ? 'ות' : ''}`
                          : String(p.כמות_שיוצרה);
                        return (
                          <tr key={p.id} className="border-b" style={{ borderColor: '#F5ECD8' }}>
                            <td className="px-4 py-3 font-medium">{label}</td>
                            <td className="px-4 py-3">{batchLabel}</td>
                            <td className="px-4 py-3" style={{ color: '#6B4A2D' }}>{p.תאריך_ייצור}</td>
                            <td className="px-4 py-3 text-xs" style={{ color: '#6B4A2D' }}>{p.הערות || '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </Card>
              )
          )}
        </>
      )}

      {/* ── Recipe modal ──────────────────────────────────────────────────── */}
      <Modal open={showRecipeModal} onClose={() => setShowRecipeModal(false)} title="מתכון חדש" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="שם מתכון *" value={recipeForm.שם_מתכון}
              onChange={e => setRecipeForm(p => ({ ...p, שם_מתכון: e.target.value }))} />
            <div>
              <Combobox label="משויך למוצר למכירה" value={recipeForm.מוצר_id}
                onChange={v => setRecipeForm(p => ({ ...p, מוצר_id: v }))}
                options={products.map(p => ({ value: p.id, label: p.שם_מוצר }))}
                placeholder="ללא שיוך" searchPlaceholder="חיפוש מוצר..." emptyText="לא נמצאו מוצרים" />
              <p className="text-[10.5px] mt-1" style={{ color: '#8A735F' }}>
                שיוך זה מאפשר לרישום ייצור להוסיף מלאי למוצר המוגמר.
              </p>
            </div>
            <Input label="כמות תוצר לאצווה" type="number" value={recipeForm.כמות_תוצר}
              onChange={e => setRecipeForm(p => ({ ...p, כמות_תוצר: Number(e.target.value) }))} min={1} />
            <Textarea label="הערות" value={recipeForm.הערות}
              onChange={e => setRecipeForm(p => ({ ...p, הערות: e.target.value }))} rows={1} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium" style={{ color: '#2B1A10' }}>רכיבים לאצווה אחת</span>
              <Button size="sm" variant="outline" type="button" onClick={addIngredient}>+ הוסף רכיב</Button>
            </div>
            {recipeForm.רכיבים.map((ing, idx) => (
              <div key={idx} className="grid grid-cols-4 gap-2 mb-2">
                <div className="col-span-2">
                  <Select value={ing.חומר_גלם_id}
                    onChange={e => updateIngredient(idx, 'חומר_גלם_id', e.target.value)}>
                    <option value="">בחר חומר גלם...</option>
                    {materials.map(m => <option key={m.id} value={m.id}>{m.שם_חומר_גלם}</option>)}
                  </Select>
                </div>
                <Input type="number" value={ing.כמות_נדרשת}
                  onChange={e => updateIngredient(idx, 'כמות_נדרשת', Number(e.target.value))}
                  min={0} step={0.001} placeholder="כמות" />
                <div className="flex items-center gap-1">
                  <Input value={ing.יחידת_מידה}
                    onChange={e => updateIngredient(idx, 'יחידת_מידה', e.target.value)}
                    placeholder="יחידה" />
                  <button type="button"
                    onClick={() => setRecipeForm(p => ({ ...p, רכיבים: p.רכיבים.filter((_, i) => i !== idx) }))}
                    className="text-red-500 flex-shrink-0 text-lg leading-none">×</button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setShowRecipeModal(false)}>ביטול</Button>
            <Button onClick={handleSaveRecipe} loading={saving}>שמור מתכון</Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!confirmId}
        onClose={() => setConfirmId(null)}
        onConfirm={() => handleDeleteRecipe(confirmId!)}
        loading={deleting}
      />

      {/* ── Production modal ──────────────────────────────────────────────── */}
      <Modal open={showProductionModal} onClose={() => setShowProductionModal(false)} title="רישום ייצור" size="lg">
        <div className="space-y-4" dir="rtl">

          {/* Recipe selector */}
          <Combobox
            label="מתכון *"
            value={productionForm.מתכון_id}
            onChange={v => setProductionForm(p => ({ ...p, מתכון_id: v }))}
            options={recipes.map(r => ({ value: r.id, label: r.שם_מתכון }))}
            placeholder="בחר מתכון..."
            searchPlaceholder="חיפוש מתכון..."
            emptyText="לא נמצאו מתכונים"
          />

          {/* Batches */}
          <Input
            label="מספר אצוות *"
            type="number"
            value={productionForm.כמות_שיוצרה}
            onChange={e => setProductionForm(p => ({ ...p, כמות_שיוצרה: Math.max(1, Number(e.target.value)) }))}
            min={1}
            step={1}
          />

          {/* Live stock check — shown once recipe is selected */}
          {selectedRecipe && ingredientChecks.length > 0 && (
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#E7D2A6' }}>
              <div className="px-3 py-2 flex items-center justify-between" style={{ backgroundColor: '#FAF7F0' }}>
                <span className="text-xs font-semibold" style={{ color: '#2B1A10' }}>
                  סיכום מרכיבים — {productionForm.כמות_שיוצרה} אצווה{productionForm.כמות_שיוצרה !== 1 ? 'ות' : ''}
                </span>
                <span className={`text-xs font-bold ${hasProblems ? 'text-red-600' : 'text-green-700'}`}>
                  {hasProblems ? '⚠ חסר מלאי' : '✓ מלאי מספיק'}
                </span>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ backgroundColor: '#F5ECD8' }}>
                    <th className="px-3 py-1.5 text-right font-medium" style={{ color: '#6B4A2D' }}>חומר גלם</th>
                    <th className="px-3 py-1.5 text-center font-medium" style={{ color: '#6B4A2D' }}>נדרש</th>
                    <th className="px-3 py-1.5 text-center font-medium" style={{ color: '#6B4A2D' }}>קיים</th>
                    <th className="px-3 py-1.5 text-center font-medium" style={{ color: '#6B4A2D' }}>יחידה</th>
                    <th className="px-3 py-1.5 text-center font-medium" style={{ color: '#6B4A2D' }}>סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {ingredientChecks.map(c => (
                    <tr key={c.id} className="border-t" style={{ borderColor: '#F0E5D8' }}>
                      <td className="px-3 py-2" style={{ color: '#2B1A10' }}>{c.name}</td>
                      <td className="px-3 py-2 text-center font-medium" style={{ color: '#2B1A10' }}>{c.required.toFixed(3)}</td>
                      <td className="px-3 py-2 text-center" style={{ color: c.ok ? '#476D53' : '#9D4B4A' }}>{c.available}</td>
                      <td className="px-3 py-2 text-center" style={{ color: '#6B4A2D' }}>
                        {c.unitMismatch
                          ? <span className="text-orange-600">{c.unit} ≠ {c.stockUnit}</span>
                          : c.unit}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {c.unitMismatch ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                            style={{ backgroundColor: '#FEF3C7', color: '#92400E' }}>יחידות שונות</span>
                        ) : c.ok ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                            style={{ backgroundColor: '#E8F5EE', color: '#2A7A4F' }}>✓</span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                            style={{ backgroundColor: '#FDE8E7', color: '#A0362C' }}>חסר {(c.required - c.available).toFixed(3)}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Insufficiency warnings */}
              {hasProblems && (
                <div className="px-3 py-2 space-y-1" style={{ backgroundColor: '#FDE8E7' }}>
                  {ingredientChecks.filter(c => !c.ok).map(c => (
                    <p key={c.id} className="text-xs font-medium" style={{ color: '#A0362C' }}>
                      {c.unitMismatch
                        ? `⚠ ${c.name}: יחידות לא תואמות — מתכון: ${c.unit}, מלאי: ${c.stockUnit}`
                        : `⚠ אין מספיק מלאי עבור: ${c.name}. נדרש ${c.required.toFixed(3)} ${c.unit}, קיים ${c.available} ${c.stockUnit}`}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {selectedRecipe && ingredientChecks.length === 0 && (
            <div className="rounded-lg border px-3 py-2 text-xs text-center" style={{ borderColor: '#E7D2A6', color: '#6B4A2D' }}>
              אין רכיבים מוגדרים במתכון זה
            </div>
          )}

          {/* Date + notes */}
          <div className="grid grid-cols-2 gap-4">
            <Input label="תאריך ייצור" type="date" value={productionForm.תאריך_ייצור}
              onChange={e => setProductionForm(p => ({ ...p, תאריך_ייצור: e.target.value }))} />
            <Textarea label="הערות" value={productionForm.הערות}
              onChange={e => setProductionForm(p => ({ ...p, הערות: e.target.value }))} rows={2} />
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setShowProductionModal(false)}>ביטול</Button>
            <Button
              onClick={handleProduction}
              loading={saving}
              disabled={!canProduce}
              title={!canProduce && hasProblems ? 'יש לתקן את המלאי לפני הייצור' : undefined}
            >
              אישור ייצור
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Auto-link preview modal ───────────────────────────────────────
          Three sections per spec: ready-to-link (checkboxes, default
          checked), needs-manual-review (with candidate lists), and
          no-match. Confirm sends only the checked safe pairs to
          /api/recipes/auto-link-apply, which re-validates server-side
          before writing מתכונים.מוצר_id. */}
      <Modal open={autoLinkOpen} onClose={() => setAutoLinkOpen(false)} title="שיוך מתכונים למוצרים אוטומטית" size="lg">
        <div className="space-y-4" dir="rtl">
          {autoLinkLoading && (
            <p className="text-sm py-6 text-center" style={{ color: '#8A735F' }}>טוען הצעות שיוך…</p>
          )}

          {!autoLinkLoading && autoLinkPreview && (
            <>
              <p className="text-[11.5px] px-3 py-2 rounded-lg" style={{ backgroundColor: '#FFF7ED', color: '#92602A', border: '1px solid #FCD9A8' }}>
                אופציונלי — מתאים רק כששמות המתכונים והמוצרים זהים וברורים. השיוך הרגיל הוא ידני, ישירות מכרטיס המתכון.
              </p>
              <div className="text-[11.5px] flex flex-wrap gap-x-4 gap-y-1 px-3 py-2 rounded-lg" style={{ backgroundColor: '#FAF7F0', color: '#6B4A2D' }}>
                <span>מתכונים ללא שיוך: <strong>{autoLinkPreview.totals.unlinkedRecipes}</strong></span>
                <span>מוצרים פעילים: <strong>{autoLinkPreview.totals.activeProducts}</strong></span>
                <span style={{ color: '#2F5C2C' }}>מוכן לשיוך: <strong>{autoLinkPreview.totals.safe}</strong></span>
                <span style={{ color: '#92602A' }}>צריך בדיקה ידנית: <strong>{autoLinkPreview.totals.review}</strong></span>
                <span style={{ color: '#7A2E2E' }}>לא נמצא מוצר: <strong>{autoLinkPreview.totals.unmatched}</strong></span>
              </div>

              {/* Ready to link */}
              <section>
                <h4 className="text-sm font-bold mb-2" style={{ color: '#2F5C2C' }}>מוכן לשיוך</h4>
                {autoLinkPreview.safe.length === 0 ? (
                  <p className="text-xs px-2 py-3 rounded-lg" style={{ backgroundColor: '#F4F4F4', color: '#8A735F' }}>אין מתכונים שמוכנים לשיוך אוטומטי.</p>
                ) : (
                  <div className="border rounded-lg overflow-hidden" style={{ borderColor: '#E8DED2' }}>
                    <table className="w-full text-xs">
                      <thead style={{ backgroundColor: '#F1F8EE' }}>
                        <tr>
                          <th className="px-2 py-2 w-8"></th>
                          <th className="px-2 py-2 text-right font-bold" style={{ color: '#2B1A10' }}>שם מתכון</th>
                          <th className="px-2 py-2 text-right font-bold" style={{ color: '#2B1A10' }}>מוצר מוצע</th>
                          <th className="px-2 py-2 text-right font-bold" style={{ color: '#2B1A10' }}>סוג התאמה</th>
                        </tr>
                      </thead>
                      <tbody>
                        {autoLinkPreview.safe.map(row => (
                          <tr key={row.recipeId} className="border-t" style={{ borderColor: '#EDE0CE' }}>
                            <td className="px-2 py-2">
                              <input
                                type="checkbox"
                                checked={autoLinkChecked.has(row.recipeId)}
                                onChange={() => toggleAutoLinkRow(row.recipeId)}
                              />
                            </td>
                            <td className="px-2 py-2" style={{ color: '#2B1A10' }}>{row.recipeName}</td>
                            <td className="px-2 py-2" style={{ color: '#2B1A10' }}>{row.productName}</td>
                            <td className="px-2 py-2" style={{ color: '#8A735F' }}>
                              {row.matchType === 'exact' ? 'התאמה מדויקת' : 'התאמה לפי הכלה'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Needs manual review */}
              {autoLinkPreview.review.length > 0 && (
                <section>
                  <h4 className="text-sm font-bold mb-2" style={{ color: '#92602A' }}>צריך בדיקה ידנית</h4>
                  <div className="border rounded-lg overflow-hidden" style={{ borderColor: '#FCD9A8' }}>
                    <table className="w-full text-xs">
                      <thead style={{ backgroundColor: '#FFF7ED' }}>
                        <tr>
                          <th className="px-2 py-2 text-right font-bold" style={{ color: '#2B1A10' }}>שם מתכון</th>
                          <th className="px-2 py-2 text-right font-bold" style={{ color: '#2B1A10' }}>מועמדים</th>
                        </tr>
                      </thead>
                      <tbody>
                        {autoLinkPreview.review.map(row => (
                          <tr key={row.recipeId} className="border-t" style={{ borderColor: '#FCD9A8' }}>
                            <td className="px-2 py-2" style={{ color: '#2B1A10' }}>{row.recipeName}</td>
                            <td className="px-2 py-2" style={{ color: '#2B1A10' }}>
                              {row.candidates.map(c => `${c.productName} (${c.matchType === 'exact' ? 'מדויקת' : 'הכלה'})`).join(' · ')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* No match found */}
              {autoLinkPreview.unmatched.length > 0 && (
                <section>
                  <h4 className="text-sm font-bold mb-2" style={{ color: '#7A2E2E' }}>לא נמצא מוצר מתאים</h4>
                  <div className="border rounded-lg overflow-hidden" style={{ borderColor: '#E4C2BE' }}>
                    <table className="w-full text-xs">
                      <thead style={{ backgroundColor: '#FBEDEB' }}>
                        <tr>
                          <th className="px-2 py-2 text-right font-bold" style={{ color: '#2B1A10' }}>שם מתכון</th>
                        </tr>
                      </thead>
                      <tbody>
                        {autoLinkPreview.unmatched.map(row => (
                          <tr key={row.recipeId} className="border-t" style={{ borderColor: '#E4C2BE' }}>
                            <td className="px-2 py-2" style={{ color: '#2B1A10' }}>{row.recipeName}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[11px] mt-1.5" style={{ color: '#8A735F' }}>
                    יש לפתוח כל מתכון ולשייך אותו ידנית למוצר למכירה דרך טופס המתכון.
                  </p>
                </section>
              )}

              <div className="flex gap-3 justify-end pt-2 border-t" style={{ borderColor: '#EDE0CE' }}>
                <Button variant="outline" onClick={() => setAutoLinkOpen(false)} disabled={autoLinkApplying}>בטלי</Button>
                <Button
                  onClick={applyAutoLink}
                  disabled={autoLinkApplying || autoLinkPreview.safe.length === 0 || autoLinkChecked.size === 0}
                >
                  {autoLinkApplying ? 'משייכת…' : `אשרי שיוך אוטומטי (${autoLinkChecked.size})`}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* ── Manual per-recipe link picker ──────────────────────────────────
          Asks the operator first for the target TYPE (sale product / petit
          four), then renders the matching dropdown. PATCHes the recipe's
          production_target_type + production_target_id via
          /api/recipes/[id]; server re-validates the row is active. */}
      <Modal open={!!linkRecipeId} onClose={() => setLinkRecipeId(null)} title="שיוך מתכון למלאי מוגמר" size="md">
        <div className="space-y-4" dir="rtl">
          {linkRecipe && (
            <p className="text-[12px]" style={{ color: '#6B4A2D' }}>
              מתכון: <strong style={{ color: '#2B1A10' }}>{linkRecipe.שם_מתכון}</strong>
            </p>
          )}

          {/* Target-type selector — two big radio-style buttons */}
          <div>
            <p className="text-[12px] font-bold mb-2" style={{ color: '#2B1A10' }}>
              לאיזה מלאי המתכון הזה מוסיף כמות?
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'sale_product' as const, label: 'מוצר למכירה' },
                { value: 'petit_four'  as const, label: 'סוג פטיפור' },
              ].map(opt => {
                const active = linkTargetType === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { setLinkTargetType(opt.value); setLinkSelectedTargetId(''); }}
                    className="text-[13px] font-medium h-10 rounded-lg transition-colors border"
                    style={{
                      backgroundColor: active ? '#7A4A27' : '#FFFFFF',
                      color:           active ? '#FFFFFF' : '#2B1A10',
                      borderColor:     active ? '#7A4A27' : '#E8DED2',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Matching picker — sale-product or petit-four based on type */}
          {linkTargetType === 'sale_product' ? (
            <div>
              <Combobox
                label="בחרי את המוצר למכירה"
                value={linkSelectedTargetId}
                onChange={setLinkSelectedTargetId}
                options={products.map(p => ({ value: p.id, label: p.שם_מוצר }))}
                placeholder="בחירת מוצר…"
                searchPlaceholder="חיפוש מוצר..."
                emptyText="לא נמצאו מוצרים"
              />
              <p className="text-[10.5px] mt-1.5" style={{ color: '#8A735F' }}>
                כשנרשום ייצור למתכון הזה, המערכת תוסיף מלאי למוצר שבחרת כאן.
              </p>
            </div>
          ) : (
            <div>
              <Combobox
                label="בחרי את סוג הפטיפור"
                value={linkSelectedTargetId}
                onChange={setLinkSelectedTargetId}
                options={petitFourTypes.map(p => ({ value: p.id, label: p.שם_פטיפור }))}
                placeholder="בחירת סוג פטיפור…"
                searchPlaceholder="חיפוש סוג פטיפור..."
                emptyText="לא נמצאו סוגי פטיפורים פעילים"
              />
              <p className="text-[10.5px] mt-1.5" style={{ color: '#8A735F' }}>
                כשנרשום ייצור למתכון הזה, המערכת תוסיף מלאי לסוג הפטיפור שבחרת כאן.
              </p>
            </div>
          )}

          <div className="flex gap-3 justify-end pt-2 border-t" style={{ borderColor: '#EDE0CE' }}>
            <Button variant="outline" onClick={() => setLinkRecipeId(null)} disabled={linkSaving}>ביטול</Button>
            <Button onClick={saveLink} disabled={linkSaving || !linkSelectedTargetId}>
              {linkSaving ? 'שומרת…' : 'שמירה'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
