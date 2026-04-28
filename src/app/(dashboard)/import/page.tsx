'use client';

import { useState, useRef } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import toast from 'react-hot-toast';

type EntityType = 'לקוחות' | 'הזמנות' | 'מוצרים למכירה' | 'מארזים' | 'סוגי פטיפורים' | 'מלאי' | 'מתכונים' | 'משלוחים' | 'חשבוניות';

interface ImportResult {
  added: number;
  updated: number;
  failed: number;
  errors: { row: number; error: string }[];
}

interface ParsedRow {
  [key: string]: string | number | boolean | null;
}

export default function ImportPage() {
  const [entity, setEntity] = useState<EntityType>('לקוחות');
  const [previewRows, setPreviewRows] = useState<ParsedRow[]>([]);
  const [allRows, setAllRows] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const ENTITIES: EntityType[] = ['לקוחות', 'הזמנות', 'מוצרים למכירה', 'מארזים', 'סוגי פטיפורים', 'מלאי', 'מתכונים', 'משלוחים', 'חשבוניות'];

  const parseCSV = (text: string): ParsedRow[] => {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];
    const hdrs = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    setHeaders(hdrs);
    return lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const row: ParsedRow = {};
      hdrs.forEach((h, i) => { row[h] = values[i] || null; });
      return row;
    }).filter(row => Object.values(row).some(v => v));
  };

  const handleFileChange = async (file: File) => {
    setFileName(file.name);
    setResult(null);

    if (file.name.endsWith('.csv')) {
      const text = await file.text();
      const rows = parseCSV(text);
      setAllRows(rows);
      setPreviewRows(rows.slice(0, 20));
    } else if (file.name.endsWith('.json')) {
      const text = await file.text();
      const data = JSON.parse(text);
      const rows = Array.isArray(data) ? data : [data];
      if (rows.length > 0) setHeaders(Object.keys(rows[0]));
      setAllRows(rows);
      setPreviewRows(rows.slice(0, 20));
    } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      try {
        const XLSX = await import('xlsx');
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer);
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<ParsedRow>(ws);
        if (rows.length > 0) setHeaders(Object.keys(rows[0]));
        setAllRows(rows);
        setPreviewRows(rows.slice(0, 20));
      } catch {
        toast.error('שגיאה בקריאת קובץ Excel');
      }
    } else {
      toast.error('סוג קובץ לא נתמך. אנא השתמש ב-CSV, XLSX, או JSON');
    }
  };

  const handleImport = async () => {
    if (allRows.length === 0) { toast.error('אין נתונים לייבוא'); return; }
    setImporting(true);
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity, rows: allRows }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setResult(json.data);
      const { added, updated, failed, errors } = json.data;
      const successParts = [];
      if (added > 0) successParts.push(`${added} נוספו`);
      if (updated > 0) successParts.push(`${updated} עודכנו`);
      if (failed === 0) {
        toast.success(`ייבוא הושלם: ${successParts.join(', ')}`);
      } else {
        const firstErr = errors?.[0] ? ` (שורה ${errors[0].row}: ${errors[0].error})` : '';
        const msg = successParts.length
          ? `ייבוא הסתיים: ${successParts.join(', ')}, ${failed} נכשלו${firstErr}`
          : `ייבוא נכשל: ${failed} שורות לא יובאו${firstErr}`;
        toast.error(msg, { duration: 8000 });
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'שגיאה בייבוא');
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setPreviewRows([]);
    setAllRows([]);
    setHeaders([]);
    setResult(null);
    setFileName('');
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="max-w-5xl space-y-5">
      {/* Config */}
      <Card>
        <CardHeader><CardTitle>ייבוא נתונים</CardTitle></CardHeader>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <Select
            label="סוג נתונים לייבוא"
            value={entity}
            onChange={e => { setEntity(e.target.value as EntityType); reset(); }}
          >
            {ENTITIES.map(e => <option key={e} value={e}>{e}</option>)}
          </Select>
          <div className="space-y-1">
            <label className="block text-sm font-medium" style={{ color: '#2B1A10' }}>קובץ</label>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls,.json"
              className="hidden"
              onChange={e => { if (e.target.files?.[0]) handleFileChange(e.target.files[0]); }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full px-3 py-2 text-sm rounded-lg border text-right transition-colors"
              style={{ borderColor: '#C7A46B', color: '#8B5E34', backgroundColor: '#FFFFFF' }}
            >
              {fileName || 'בחר קובץ CSV / XLSX / JSON...'}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-lg text-xs" style={{ backgroundColor: '#FAF7F0', color: '#6B4A2D' }}>
          <span>שגיאות בשורות בודדות לא יבטלו את שאר הייבוא</span>
          <span>·</span>
          <span>ייבוא מוסיף רשומות חדשות לטבלה</span>
        </div>
      </Card>

      {/* Preview */}
      {previewRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>תצוגה מקדימה ({Math.min(20, allRows.length)} מתוך {allRows.length} שורות)</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={reset}>נקה</Button>
              <Button size="sm" onClick={handleImport} loading={importing}>
                ייבא {allRows.length} רשומות
              </Button>
            </div>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ backgroundColor: '#FAF7F0', borderBottom: '1px solid #E7D2A6' }}>
                  {headers.map(h => (
                    <th key={h} className="px-3 py-2 text-right font-semibold whitespace-nowrap" style={{ color: '#6B4A2D' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => (
                  <tr key={i} className="border-b" style={{ borderColor: '#F5ECD8' }}>
                    {headers.map(h => (
                      <td key={h} className="px-3 py-1.5 whitespace-nowrap max-w-32 truncate" style={{ color: '#2B1A10' }}>
                        {String(row[h] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Result */}
      {result && (
        <Card>
          <CardHeader><CardTitle>תוצאות ייבוא</CardTitle></CardHeader>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center p-3 rounded-lg" style={{ backgroundColor: '#F0FDF4' }}>
              <div className="text-2xl font-bold text-green-600">{result.added}</div>
              <div className="text-xs text-green-600">נוספו</div>
            </div>
            <div className="text-center p-3 rounded-lg" style={{ backgroundColor: '#EFF6FF' }}>
              <div className="text-2xl font-bold text-blue-600">{result.updated}</div>
              <div className="text-xs text-blue-600">עודכנו</div>
            </div>
            <div className="text-center p-3 rounded-lg" style={{ backgroundColor: result.failed > 0 ? '#FEF2F2' : '#F0FDF4' }}>
              <div className={`text-2xl font-bold ${result.failed > 0 ? 'text-red-600' : 'text-green-600'}`}>{result.failed}</div>
              <div className={`text-xs ${result.failed > 0 ? 'text-red-600' : 'text-green-600'}`}>נכשלו</div>
            </div>
          </div>
          {result.errors.length > 0 && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              <p className="text-xs font-semibold text-red-600 mb-2">שגיאות:</p>
              {result.errors.map((err, i) => (
                <div key={i} className="text-xs p-2 rounded" style={{ backgroundColor: '#FEF2F2', color: '#991B1B' }}>
                  שורה {err.row}: {err.error}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Instructions */}
      {previewRows.length === 0 && !result && (
        <Card>
          <CardHeader><CardTitle>הוראות ייבוא</CardTitle></CardHeader>
          <div className="grid grid-cols-3 gap-4 text-sm" style={{ color: '#6B4A2D' }}>
            <div className="space-y-2">
              <div className="font-medium" style={{ color: '#2B1A10' }}>פורמטים נתמכים</div>
              <ul className="space-y-1 text-xs">
                <li>• CSV (UTF-8 with BOM)</li>
                <li>• Excel (.xlsx, .xls)</li>
                <li>• JSON (מערך)</li>
              </ul>
            </div>
            <div className="space-y-2">
              <div className="font-medium" style={{ color: '#2B1A10' }}>תהליך הייבוא</div>
              <ul className="space-y-1 text-xs">
                <li>1. בחר סוג נתונים</li>
                <li>2. העלה קובץ</li>
                <li>3. בדוק תצוגה מקדימה</li>
                <li>4. אשר ייבוא</li>
              </ul>
            </div>
            <div className="space-y-2">
              <div className="font-medium" style={{ color: '#2B1A10' }}>חשוב לדעת</div>
              <ul className="space-y-1 text-xs">
                <li>• שגיאות לא יבטלו שורות אחרות</li>
                <li>• רשומה חדשה תתווסף</li>
                <li>• שגיאות לא יבטלו שאר השורות</li>
              </ul>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
