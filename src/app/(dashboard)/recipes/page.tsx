'use client';

import { useEffect, useState } from 'react';
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
import type { Recipe, Product, RawMaterial, Production } from '@/types/database';

type Tab = 'recipes' | 'production';

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

  const [productionForm, setProductionForm] = useState({ מוצר_id: '', כמות_שיוצרה: 0, תאריך_ייצור: new Date().toISOString().split('T')[0], הערות: '' });

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

  const handleProduction = async () => {
    if (!productionForm.מוצר_id || !productionForm.כמות_שיוצרה) { toast.error('בחר מוצר וכמות'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productionForm),
      });
      const json = await res.json();
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={tab === t.key ? { backgroundColor: '#8B5E34', color: '#FFFFFF' } : { backgroundColor: '#FFFFFF', color: '#6B4A2D', border: '1px solid #E7D2A6' }}>
            {t.label}
          </button>
        ))}
        {tab === 'recipes' && (
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border bg-white hover:bg-[#FAF7F2] transition-all duration-200"
            style={{ borderColor: '#D8CCBA', color: '#8B5E34' }}
          >
            <IconExport className="w-3.5 h-3.5" />
            ייצוא לאקסל
          </button>
        )}
        <div className="mr-auto">
          {tab === 'recipes'
            ? <Button size="sm" onClick={() => setShowRecipeModal(true)}>+ מתכון חדש</Button>
            : <Button size="sm" onClick={() => setShowProductionModal(true)}>+ רשום ייצור</Button>}
        </div>
      </div>

      {loading ? <PageLoading /> : (
        <>
          {tab === 'recipes' && (
            recipes.length === 0 ? <EmptyState title="אין מתכונים" action={<Button onClick={() => setShowRecipeModal(true)}>+ מתכון חדש</Button>} /> : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {recipes.map(r => (
                  <Card key={r.id}>
                    <div className="flex justify-between mb-3">
                      <div>
                        <h3 className="font-semibold" style={{ color: '#2B1A10' }}>{r.שם_מתכון}</h3>
                        <p className="text-xs mt-0.5" style={{ color: '#6B4A2D' }}>
                          {(r as Recipe & { מוצרים_למכירה?: { שם_מוצר: string } }).מוצרים_למכירה?.שם_מוצר || 'לא משויך'} · תוצר: {r.כמות_תוצר}
                        </p>
                      </div>
                      <ActionBtn title="מחיקה" variant="danger" onClick={() => setConfirmId(r.id)} icon={<IconTrash className="w-4 h-4" />} />
                    </div>
                    {(r as Recipe & { רכיבי_מתכון?: { id: string; כמות_נדרשת: number; יחידת_מידה: string; מלאי_חומרי_גלם?: { שם_חומר_גלם: string } }[] }).רכיבי_מתכון?.length ? (
                      <div className="space-y-1">
                        {(r as Recipe & { רכיבי_מתכון?: { id: string; כמות_נדרשת: number; יחידת_מידה: string; מלאי_חומרי_גלם?: { שם_חומר_גלם: string } }[] }).רכיבי_מתכון!.map((ing, i) => (
                          <div key={i} className="flex justify-between text-xs p-1.5 rounded" style={{ backgroundColor: '#FAF7F0' }}>
                            <span>{ing.מלאי_חומרי_גלם?.שם_חומר_גלם || '-'}</span>
                            <span style={{ color: '#6B4A2D' }}>{ing.כמות_נדרשת} {ing.יחידת_מידה}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs" style={{ color: '#6B4A2D' }}>אין רכיבים</p>
                    )}
                  </Card>
                ))}
              </div>
            )
          )}

          {tab === 'production' && (
            productions.length === 0 ? <EmptyState title="אין רשומות ייצור" action={<Button onClick={() => setShowProductionModal(true)}>+ רשום ייצור</Button>} /> : (
              <Card className="p-0 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: '#FAF7F0', borderBottom: '1px solid #E7D2A6' }}>
                      {['מוצר', 'כמות שיוצרה', 'תאריך', 'הערות'].map(h => (
                        <th key={h} className="px-4 py-3 text-right text-xs font-semibold" style={{ color: '#6B4A2D' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {productions.map(p => (
                      <tr key={p.id} className="border-b" style={{ borderColor: '#F5ECD8' }}>
                        <td className="px-4 py-3">{(p as Production & { מוצרים_למכירה?: { שם_מוצר: string } }).מוצרים_למכירה?.שם_מוצר || '-'}</td>
                        <td className="px-4 py-3 font-medium">{p.כמות_שיוצרה}</td>
                        <td className="px-4 py-3" style={{ color: '#6B4A2D' }}>{p.תאריך_ייצור}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: '#6B4A2D' }}>{p.הערות || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )
          )}
        </>
      )}

      {/* Recipe Modal */}
      <Modal open={showRecipeModal} onClose={() => setShowRecipeModal(false)} title="מתכון חדש" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="שם מתכון *" value={recipeForm.שם_מתכון} onChange={e => setRecipeForm(p => ({ ...p, שם_מתכון: e.target.value }))} />
            <Combobox
              label="מוצר משויך"
              value={recipeForm.מוצר_id}
              onChange={v => setRecipeForm(p => ({ ...p, מוצר_id: v }))}
              options={products.map(p => ({ value: p.id, label: p.שם_מוצר }))}
              placeholder="ללא שיוך"
              searchPlaceholder="חיפוש מוצר..."
              emptyText="לא נמצאו מוצרים"
            />
            <Input label="כמות תוצר" type="number" value={recipeForm.כמות_תוצר} onChange={e => setRecipeForm(p => ({ ...p, כמות_תוצר: Number(e.target.value) }))} min={1} />
            <Textarea label="הערות" value={recipeForm.הערות} onChange={e => setRecipeForm(p => ({ ...p, הערות: e.target.value }))} rows={1} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium" style={{ color: '#2B1A10' }}>רכיבים</span>
              <Button size="sm" variant="outline" type="button" onClick={addIngredient}>+ הוסף רכיב</Button>
            </div>
            {recipeForm.רכיבים.map((ing, idx) => (
              <div key={idx} className="grid grid-cols-4 gap-2 mb-2">
                <div className="col-span-2">
                  <Select value={ing.חומר_גלם_id} onChange={e => updateIngredient(idx, 'חומר_גלם_id', e.target.value)}>
                    <option value="">בחר חומר גלם...</option>
                    {materials.map(m => <option key={m.id} value={m.id}>{m.שם_חומר_גלם}</option>)}
                  </Select>
                </div>
                <Input type="number" value={ing.כמות_נדרשת} onChange={e => updateIngredient(idx, 'כמות_נדרשת', Number(e.target.value))} min={0} step={0.001} placeholder="כמות" />
                <div className="flex items-center gap-1">
                  <Input value={ing.יחידת_מידה} onChange={e => updateIngredient(idx, 'יחידת_מידה', e.target.value)} placeholder="יחידה" />
                  <button type="button" onClick={() => setRecipeForm(p => ({ ...p, רכיבים: p.רכיבים.filter((_, i) => i !== idx) }))} className="text-red-500 flex-shrink-0">×</button>
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

      {/* Production Modal */}
      <Modal open={showProductionModal} onClose={() => setShowProductionModal(false)} title="רישום ייצור">
        <div className="space-y-4">
          <Combobox
            label="מוצר *"
            value={productionForm.מוצר_id}
            onChange={v => setProductionForm(p => ({ ...p, מוצר_id: v }))}
            options={products.map(p => ({ value: p.id, label: p.שם_מוצר }))}
            placeholder="בחר מוצר..."
            searchPlaceholder="חיפוש מוצר..."
            emptyText="לא נמצאו מוצרים"
          />
          <Input label="כמות שיוצרה *" type="number" value={productionForm.כמות_שיוצרה} onChange={e => setProductionForm(p => ({ ...p, כמות_שיוצרה: Number(e.target.value) }))} min={0} step={0.1} />
          <Input label="תאריך ייצור" type="date" value={productionForm.תאריך_ייצור} onChange={e => setProductionForm(p => ({ ...p, תאריך_ייצור: e.target.value }))} />
          <Textarea label="הערות" value={productionForm.הערות} onChange={e => setProductionForm(p => ({ ...p, הערות: e.target.value }))} rows={2} />
          <p className="text-xs" style={{ color: '#6B4A2D' }}>שים לב: הייצור יפחית את כמויות חומרי הגלם אוטומטית לפי המתכון</p>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setShowProductionModal(false)}>ביטול</Button>
            <Button onClick={handleProduction} loading={saving}>רשום ייצור</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
