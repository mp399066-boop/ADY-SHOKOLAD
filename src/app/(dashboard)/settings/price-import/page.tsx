'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PageLoading } from '@/components/ui/LoadingSpinner';
import toast from 'react-hot-toast';
import type { PreviewRow, PreviewError } from '@/app/api/prices/import-preview/route';

const PRICE_TYPE_LABELS: Record<string, string> = {
  retail:            'פרטי',
  business_fixed:    'עסקי - קבוע',
  business_quantity: 'עסקי - כמות',
};

const SETTINGS_TABS = [
  { href: '/settings',              label: 'הגדרות עסק'      },
  { href: '/settings/users',        label: 'משתמשים והרשאות' },
  { href: '/settings/price-import', label: 'ייבוא מחירון'    },
];

function SettingsTabs() {
  return (
    <div className="flex gap-1 mb-6 border-b" style={{ borderColor: '#EAE0D4' }}>
      {SETTINGS_TABS.map(tab => {
        const isActive = tab.href === '/settings/price-import';
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="px-4 py-2.5 text-sm font-medium relative transition-colors"
            style={isActive
              ? { color: '#5C3410', borderBottom: '2.5px solid #C9A46A', marginBottom: '-1px' }
              : { color: '#8A7664' }}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

type Step = 'upload' | 'preview' | 'done';

export default function PriceImportPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [step, setStep] = useState<Step>('upload');
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [validRows, setValidRows] = useState<PreviewRow[]>([]);
  const [errors, setErrors] = useState<PreviewError[]>([]);
  const [importResult, setImportResult] = useState<{ inserted: number; updated: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/me').then(r => r.json()).then(d => {
      setIsAdmin(d?.role === 'admin');
    }).catch(() => setIsAdmin(false));
  }, []);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setValidRows([]);
    setErrors([]);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/prices/import-preview', { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error || 'שגיאה בקריאת הקובץ'); return; }
      setValidRows(json.validRows || []);
      setErrors(json.errors || []);
      setStep('preview');
    } catch {
      toast.error('שגיאה בהעלאת הקובץ');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleImport = async () => {
    if (validRows.length === 0) return;
    setImporting(true);
    try {
      const res = await fetch('/api/prices/import-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: validRows }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error || 'שגיאה בייבוא'); return; }
      setImportResult({ inserted: json.inserted, updated: json.updated });
      setStep('done');
    } catch {
      toast.error('שגיאה בייבוא המחירון');
    } finally {
      setImporting(false);
    }
  };

  if (isAdmin === null) return <PageLoading />;

  if (!isAdmin) {
    return (
      <div className="max-w-2xl">
        <SettingsTabs />
        <Card>
          <p className="text-sm" style={{ color: '#8A7664' }}>גישה לדף זה מוגבלת למנהלים בלבד.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl">
      <SettingsTabs />

      {/* Instructions */}
      <Card className="mb-4">
        <h2 className="text-sm font-semibold mb-3" style={{ color: '#2B1A10' }}>מבנה קובץ Excel נדרש</h2>
        <div className="overflow-x-auto">
          <table className="text-xs w-full border-collapse" dir="rtl">
            <thead>
              <tr style={{ backgroundColor: '#F5EFE6' }}>
                {['SKU', 'שם מוצר', 'סוג מחירון', 'מחיר', 'כמות מינימום', 'כולל מע״מ', 'פעיל'].map(h => (
                  <th key={h} className="border px-2 py-1 text-right font-medium" style={{ borderColor: '#DDD0BE', color: '#5C3410' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ['CAKE001', 'עוגת מוס', 'פרטי', '180', '', 'כן', 'כן'],
                ['CAKE001', 'עוגת מוס', 'עסקי - קבוע', '150', '', 'לא', 'כן'],
                ['CAKE001', 'עוגת מוס', 'עסקי - כמות', '135', '10', 'לא', 'כן'],
              ].map((row, i) => (
                <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#FFFFFF' : '#FBF7F2' }}>
                  {row.map((cell, j) => (
                    <td key={j} className="border px-2 py-1" style={{ borderColor: '#DDD0BE', color: '#3D2B1A' }}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="mt-3 text-xs space-y-1" style={{ color: '#6B5744' }}>
          <li>• <strong>סוג מחירון:</strong> פרטי / עסקי - קבוע / עסקי - כמות</li>
          <li>• <strong>מחיר עסקי</strong> נשמר לפני מע״מ — יש לסמן "לא" בעמודת כולל מע״מ</li>
          <li>• <strong>כמות מינימום</strong> חובה לסוג "עסקי - כמות", אופציונלי לשאר</li>
          <li>• <strong>שם מוצר</strong> חייב להתאים בדיוק לשם המוצר במערכת</li>
          <li>• מחירים קיימים יעודכנו; מחירים שאינם בקובץ לא יימחקו</li>
        </ul>
      </Card>

      {/* Upload */}
      {step === 'upload' && (
        <Card>
          <h2 className="text-sm font-semibold mb-4" style={{ color: '#2B1A10' }}>העלאת קובץ מחירון</h2>
          <label
            className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-10 cursor-pointer transition-colors"
            style={{ borderColor: uploading ? '#C9A46A' : '#DDD0BE', backgroundColor: '#FBF7F2' }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#C9A46A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <span className="text-sm font-medium" style={{ color: '#5C3410' }}>
              {uploading ? 'מעבד...' : 'לחץ לבחירת קובץ Excel'}
            </span>
            <span className="text-xs" style={{ color: '#8A7664' }}>.xlsx / .xls</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFile}
              disabled={uploading}
            />
          </label>
        </Card>
      )}

      {/* Preview */}
      {step === 'preview' && (
        <div className="space-y-4">
          {/* Error rows */}
          {errors.length > 0 && (
            <Card>
              <h3 className="text-sm font-semibold mb-3" style={{ color: '#B91C1C' }}>
                שגיאות ({errors.length} שורות) — לא ייובאו
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse" dir="rtl">
                  <thead>
                    <tr style={{ backgroundColor: '#FEF2F2' }}>
                      <th className="border px-2 py-1 text-right" style={{ borderColor: '#FECACA' }}>שורה</th>
                      <th className="border px-2 py-1 text-right" style={{ borderColor: '#FECACA' }}>שם מוצר</th>
                      <th className="border px-2 py-1 text-right" style={{ borderColor: '#FECACA' }}>שגיאות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errors.map((err, i) => (
                      <tr key={i} style={{ backgroundColor: '#FFF5F5' }}>
                        <td className="border px-2 py-1" style={{ borderColor: '#FECACA', color: '#7F1D1D' }}>{err.rowNumber}</td>
                        <td className="border px-2 py-1" style={{ borderColor: '#FECACA', color: '#7F1D1D' }}>{err.productName || err.sku || '—'}</td>
                        <td className="border px-2 py-1" style={{ borderColor: '#FECACA', color: '#B91C1C' }}>
                          {err.errors.join(' | ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Valid rows */}
          {validRows.length > 0 ? (
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold" style={{ color: '#2B1A10' }}>
                  תצוגה מקדימה — {validRows.length} שורות תקינות
                  <span className="mr-2 text-xs font-normal" style={{ color: '#6B9E6B' }}>
                    ({validRows.filter(r => r.isNew).length} חדשות, {validRows.filter(r => !r.isNew).length} עדכונים)
                  </span>
                </h3>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => { setStep('upload'); setValidRows([]); setErrors([]); }}
                  >
                    החלף קובץ
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleImport}
                    disabled={importing}
                  >
                    {importing ? 'מייבא...' : `ייבא ${validRows.length} שורות`}
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse" dir="rtl">
                  <thead>
                    <tr style={{ backgroundColor: '#F5EFE6' }}>
                      {['שורה', 'SKU', 'שם מוצר', 'סוג מחירון', 'מחיר', 'כמות מינ׳', 'כולל מע״מ', 'פעיל', 'פעולה'].map(h => (
                        <th key={h} className="border px-2 py-1 text-right" style={{ borderColor: '#DDD0BE', color: '#5C3410' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {validRows.map((row, i) => (
                      <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#FFFFFF' : '#FBF7F2' }}>
                        <td className="border px-2 py-1" style={{ borderColor: '#DDD0BE', color: '#6B5744' }}>{row.rowNumber}</td>
                        <td className="border px-2 py-1" style={{ borderColor: '#DDD0BE', color: '#3D2B1A' }}>{row.sku || '—'}</td>
                        <td className="border px-2 py-1" style={{ borderColor: '#DDD0BE', color: '#3D2B1A' }}>
                          {row.productName}
                          {!row.productFound && <span className="mr-1 text-amber-600">(לא נמצא)</span>}
                        </td>
                        <td className="border px-2 py-1" style={{ borderColor: '#DDD0BE', color: '#3D2B1A' }}>
                          {PRICE_TYPE_LABELS[row.priceType]}
                          {row.priceType !== 'retail' && (
                            <span className="mr-1 text-xs" style={{ color: '#8A7664' }}>(לפני מע״מ)</span>
                          )}
                        </td>
                        <td className="border px-2 py-1 font-medium" style={{ borderColor: '#DDD0BE', color: '#2B1A10' }}>
                          ₪{row.price.toFixed(2)}
                        </td>
                        <td className="border px-2 py-1" style={{ borderColor: '#DDD0BE', color: '#3D2B1A' }}>
                          {row.minQuantity ?? '—'}
                        </td>
                        <td className="border px-2 py-1" style={{ borderColor: '#DDD0BE', color: '#3D2B1A' }}>
                          {row.includesVat ? 'כן' : 'לא'}
                        </td>
                        <td className="border px-2 py-1" style={{ borderColor: '#DDD0BE', color: '#3D2B1A' }}>
                          {row.isActive ? 'כן' : 'לא'}
                        </td>
                        <td className="border px-2 py-1" style={{ borderColor: '#DDD0BE' }}>
                          <span
                            className="px-1.5 py-0.5 rounded text-xs font-medium"
                            style={row.isNew
                              ? { backgroundColor: '#DCFCE7', color: '#166534' }
                              : { backgroundColor: '#DBEAFE', color: '#1E40AF' }}
                          >
                            {row.isNew ? 'חדש' : 'עדכון'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : (
            <Card>
              <p className="text-sm text-center py-4" style={{ color: '#8A7664' }}>
                כל השורות בקובץ הכילו שגיאות — אין שורות תקינות לייבוא.
              </p>
              <div className="flex justify-center mt-2">
                <Button type="button" variant="outline" onClick={() => { setStep('upload'); setErrors([]); }}>
                  נסה קובץ אחר
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Done */}
      {step === 'done' && importResult && (
        <Card>
          <div className="flex flex-col items-center py-6 gap-4">
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: '#DCFCE7' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#166534" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <h3 className="text-base font-semibold" style={{ color: '#2B1A10' }}>ייבוא הושלם בהצלחה</h3>
            <div className="flex gap-6 text-sm">
              <span><strong style={{ color: '#166534' }}>{importResult.inserted}</strong> <span style={{ color: '#6B5744' }}>שורות חדשות</span></span>
              <span><strong style={{ color: '#1E40AF' }}>{importResult.updated}</strong> <span style={{ color: '#6B5744' }}>שורות עודכנו</span></span>
            </div>
            <div className="flex gap-3 mt-2">
              <Button type="button" variant="outline" onClick={() => { setStep('upload'); setValidRows([]); setErrors([]); setImportResult(null); }}>
                ייבא קובץ נוסף
              </Button>
              <Button type="button" onClick={() => router.push('/settings')}>
                חזור להגדרות
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
