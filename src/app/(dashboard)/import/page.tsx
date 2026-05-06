'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import toast from 'react-hot-toast';
import type { PreviewRow, PreviewError } from '@/app/api/prices/import-preview/route';
import PricesManageTab from '@/components/prices/PricesManageTab';

// ─── General import types & helpers ───────────────────────────────────────

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

const ENTITY_TABLE: Record<EntityType, string> = {
  'לקוחות':          'לקוחות',
  'הזמנות':          'הזמנות',
  'מוצרים למכירה':   'מוצרים_למכירה',
  'מארזים':          'מארזים',
  'סוגי פטיפורים':   'סוגי_פטיפורים',
  'מלאי':            'מלאי_חומרי_גלם',
  'מתכונים':         'מתכונים',
  'משלוחים':         'משלוחים',
  'חשבוניות':        'חשבוניות',
};

const FIELD_ALIASES: Record<string, Record<string, string[]>> = {
  מוצרים_למכירה: {
    שם_מוצר:  ['שם מוצר', 'שם', 'מוצר', 'name', 'product', 'product name'],
    סוג_מוצר: ['סוג מוצר', 'סוג', 'קטגוריה', 'type', 'category'],
    מחיר:     ['מחיר', 'price', '₪', 'cost', 'מחיר מכירה'],
    פעיל:     ['פעיל', 'active', 'זמין'],
    תיאור:    ['תיאור', 'description', 'הסבר'],
    כמות_במארז: ['כמות במארז', 'כמות פטיפורים', 'גודל מארז'],
  },
  סוגי_פטיפורים: {
    שם_פטיפור: ['שם פטיפור', 'שם', 'פטיפור', 'name', 'סוג פטיפור'],
    פעיל:      ['פעיל', 'active'],
    כמות_במלאי: ['כמות', 'מלאי', 'stock', 'quantity'],
    הערות:     ['הערות', 'notes'],
  },
  מארזים: {
    שם_מארז:               ['שם מארז', 'שם', 'מארז', 'name'],
    גודל_מארז:             ['גודל מארז', 'גודל', 'size', 'כמות פטיפורים'],
    כמה_סוגים_מותר_לבחור: ['כמה סוגים', 'כמה מותר', 'מותר לבחור', 'סוגים', 'כמה', 'variants'],
    מחיר_מארז:             ['מחיר מארז', 'מחיר', 'price', '₪'],
    פעיל:                  ['פעיל', 'active'],
    הערות:                 ['הערות', 'notes'],
  },
  מלאי_חומרי_גלם: {
    שם_חומר_גלם:   ['שם חומר גלם', 'שם', 'חומר גלם', 'name', 'ingredient', 'חומר'],
    כמות_במלאי:    ['כמות במלאי', 'כמות', 'מלאי', 'stock', 'quantity'],
    יחידת_מידה:    ['יחידת מידה', 'יחידה', 'unit'],
    סף_מלאי_נמוך:  ['סף מלאי נמוך', 'מינימום', 'min', 'minimum'],
    סף_מלאי_קריטי: ['סף מלאי קריטי', 'קריטי', 'critical'],
    מחיר_ליחידה:   ['מחיר ליחידה', 'מחיר', 'price', '₪'],
    הערות:         ['הערות', 'notes'],
  },
  לקוחות: {
    שם_פרטי:   ['שם פרטי', 'פרטי', 'first name', 'name', 'שם'],
    שם_משפחה:  ['שם משפחה', 'משפחה', 'last name', 'family'],
    טלפון:     ['טלפון', 'phone', 'mobile', 'נייד', 'cell'],
    אימייל:    ['אימייל', 'email', 'mail', 'דואר אלקטרוני'],
    סוג_לקוח:  ['סוג לקוח', 'סוג', 'type', 'category'],
    מקור_הגעה: ['מקור הגעה', 'מקור', 'source'],
    אחוז_הנחה: ['אחוז הנחה', 'הנחה', 'discount'],
    הערות:     ['הערות', 'notes'],
  },
  מתכונים: {
    שם_מתכון:   ['שם מתכון', 'שם', 'מתכון', 'name', 'recipe'],
    כמות_תוצר:  ['כמות תוצר', 'כמות', 'yield', 'quantity'],
    הערות:      ['הערות', 'notes'],
  },
};

function scoreEntity(headers: string[], tableName: string): number {
  const aliases = FIELD_ALIASES[tableName];
  if (!aliases) return 0;
  let score = 0;
  for (const h of headers) {
    const hl = h.trim().toLowerCase();
    for (const aliasList of Object.values(aliases)) {
      if (aliasList.some(a => hl === a.toLowerCase())) { score += 3; break; }
      if (aliasList.some(a => hl.includes(a.toLowerCase()) || a.toLowerCase().includes(hl))) { score += 1; break; }
    }
  }
  return score;
}

function detectEntity(headers: string[]): EntityType | null {
  let best: EntityType | null = null;
  let bestScore = 0;
  for (const [label, tableName] of Object.entries(ENTITY_TABLE) as [EntityType, string][]) {
    const s = scoreEntity(headers, tableName);
    if (s > bestScore) { bestScore = s; best = label; }
  }
  return bestScore > 0 ? best : null;
}

function buildMapping(headers: string[], tableName: string): Record<string, string> {
  const aliases = FIELD_ALIASES[tableName];
  if (!aliases) return {};
  const mapping: Record<string, string> = {};
  for (const h of headers) {
    const hl = h.trim().toLowerCase();
    for (const [dbField, aliasList] of Object.entries(aliases)) {
      const exactMatch = aliasList.some(a => hl === a.toLowerCase());
      const partialMatch = aliasList.some(a => hl.includes(a.toLowerCase()) || a.toLowerCase().includes(hl));
      if (exactMatch || partialMatch) {
        const alreadyClaimed = Object.values(mapping).includes(dbField);
        if (!alreadyClaimed || exactMatch) { mapping[h] = dbField; break; }
      }
    }
  }
  return mapping;
}

function applyMapping(row: ParsedRow, mapping: Record<string, string>): ParsedRow {
  const out: ParsedRow = {};
  for (const [col, val] of Object.entries(row)) {
    const dbCol = mapping[col] ?? col.trim().replace(/ /g, '_');
    out[dbCol] = val;
  }
  return out;
}

// ─── General import tab ────────────────────────────────────────────────────

function GeneralImportTab() {
  const [entity, setEntity] = useState<EntityType>('מוצרים למכירה');
  const [previewRows, setPreviewRows] = useState<ParsedRow[]>([]);
  const [allRows, setAllRows] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const ENTITIES: EntityType[] = ['לקוחות', 'הזמנות', 'מוצרים למכירה', 'מארזים', 'סוגי פטיפורים', 'מלאי', 'מתכונים', 'משלוחים', 'חשבוניות'];

  function parseCSV(text: string): { rows: ParsedRow[]; hdrs: string[] } {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return { rows: [], hdrs: [] };
    const firstLine = lines[0].replace(/^﻿/, '');
    const hdrs = firstLine.split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const rows = lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const row: ParsedRow = {};
      hdrs.forEach((h, i) => { row[h] = values[i] ?? null; });
      return row;
    }).filter(row => Object.values(row).some(v => v !== null && v !== ''));
    return { rows, hdrs };
  }

  function afterParse(rows: ParsedRow[], hdrs: string[]) {
    setHeaders(hdrs);
    setAllRows(rows);
    setPreviewRows(rows.slice(0, 20));
    const detected = detectEntity(hdrs);
    const chosenEntity = detected ?? entity;
    if (detected) setEntity(detected);
    const mapping = buildMapping(hdrs, ENTITY_TABLE[chosenEntity]);
    setColumnMapping(mapping);
  }

  const handleFileChange = async (file: File) => {
    setFileName(file.name);
    setResult(null);
    if (file.name.endsWith('.csv')) {
      const text = await file.text();
      const { rows, hdrs } = parseCSV(text);
      afterParse(rows, hdrs);
    } else if (file.name.endsWith('.json')) {
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const rows: ParsedRow[] = Array.isArray(data) ? data : [data];
        const hdrs = rows.length > 0 ? Object.keys(rows[0]) : [];
        afterParse(rows, hdrs);
      } catch { toast.error('שגיאה בקריאת קובץ JSON'); }
    } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      try {
        const XLSX = await import('xlsx');
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer);
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<ParsedRow>(ws, { defval: null });
        const hdrs = rows.length > 0 ? Object.keys(rows[0]) : [];
        afterParse(rows, hdrs);
      } catch { toast.error('שגיאה בקריאת קובץ Excel'); }
    } else {
      toast.error('סוג קובץ לא נתמך. אנא השתמש ב-CSV, XLSX, או JSON');
    }
  };

  const handleEntityChange = (newEntity: EntityType) => {
    setEntity(newEntity);
    setResult(null);
    if (headers.length > 0) setColumnMapping(buildMapping(headers, ENTITY_TABLE[newEntity]));
  };

  const handleImport = async () => {
    if (allRows.length === 0) { toast.error('אין נתונים לייבוא'); return; }
    setImporting(true);
    try {
      const mappedRows = allRows.map(row => applyMapping(row, columnMapping));
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity, rows: mappedRows }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setResult(json.data);
      const { added, updated, failed, errors } = json.data;
      const parts: string[] = [];
      if (added > 0) parts.push(`${added} נוספו`);
      if (updated > 0) parts.push(`${updated} עודכנו`);
      if (failed === 0) {
        toast.success(`ייבוא הושלם: ${parts.join(', ')}`);
      } else {
        const firstErr = errors?.[0] ? ` — שורה ${errors[0].row}: ${errors[0].error}` : '';
        toast.error(
          parts.length
            ? `ייבוא הסתיים: ${parts.join(', ')}, ${failed} נכשלו${firstErr}`
            : `ייבוא נכשל: ${failed} שורות${firstErr}`,
          { duration: 8000 },
        );
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'שגיאה בייבוא');
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setPreviewRows([]); setAllRows([]); setHeaders([]);
    setColumnMapping({}); setResult(null); setFileName('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const unmappedHeaders = headers.filter(h => !columnMapping[h]);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader><CardTitle>ייבוא נתונים</CardTitle></CardHeader>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <Select
            label="סוג נתונים"
            value={entity}
            onChange={e => handleEntityChange(e.target.value as EntityType)}
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
        <div className="p-3 rounded-lg text-xs" style={{ backgroundColor: '#FAF7F0', color: '#6B4A2D' }}>
          המערכת מזהה סוג הנתונים ומפה עמודות אוטומטית — אין צורך בהגדרה ידנית
        </div>
      </Card>

      {headers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>מיפוי עמודות אוטומטי</CardTitle>
            {unmappedHeaders.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: '#FEF3C7', color: '#92400E' }}>
                {unmappedHeaders.length} לא מזוהות
              </span>
            )}
          </CardHeader>
          <div className="flex flex-wrap gap-2">
            {headers.map(h => {
              const dbField = columnMapping[h];
              return (
                <div
                  key={h}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
                  style={dbField
                    ? { backgroundColor: '#F0FDF4', color: '#166534', border: '1px solid #BBF7D0' }
                    : { backgroundColor: '#FEF9EC', color: '#92400E', border: '1px solid #FDE68A' }
                  }
                >
                  <span>{h}</span>
                  {dbField && (<><span style={{ opacity: 0.5 }}>→</span><span style={{ color: '#15803D' }}>{dbField}</span></>)}
                  {!dbField && <span style={{ opacity: 0.55 }}>(מתעלמים)</span>}
                </div>
              );
            })}
          </div>
        </Card>
      )}

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
                    <th key={h} className="px-3 py-2 text-right font-semibold whitespace-nowrap" style={{ color: '#6B4A2D' }}>
                      {columnMapping[h]
                        ? <span title={`קובץ: "${h}"`}>{columnMapping[h]}</span>
                        : <span style={{ color: '#B45309' }}>{h}</span>}
                    </th>
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

      {previewRows.length === 0 && !result && (
        <Card>
          <CardHeader><CardTitle>הוראות ייבוא</CardTitle></CardHeader>
          <div className="grid grid-cols-3 gap-4 text-sm" style={{ color: '#6B4A2D' }}>
            <div className="space-y-2">
              <div className="font-medium" style={{ color: '#2B1A10' }}>פורמטים נתמכים</div>
              <ul className="space-y-1 text-xs">
                <li>• CSV (UTF-8)</li>
                <li>• Excel (.xlsx, .xls)</li>
                <li>• JSON (מערך)</li>
              </ul>
            </div>
            <div className="space-y-2">
              <div className="font-medium" style={{ color: '#2B1A10' }}>מיפוי אוטומטי</div>
              <ul className="space-y-1 text-xs">
                <li>• &quot;שם&quot;, &quot;שם מוצר&quot; → שם_מוצר</li>
                <li>• &quot;מחיר&quot;, &quot;₪&quot; → מחיר</li>
                <li>• &quot;סוג&quot;, &quot;קטגוריה&quot; → סוג_מוצר</li>
                <li>• &quot;כמות&quot;, &quot;גודל&quot; → כמות</li>
              </ul>
            </div>
            <div className="space-y-2">
              <div className="font-medium" style={{ color: '#2B1A10' }}>חשוב לדעת</div>
              <ul className="space-y-1 text-xs">
                <li>• סוג נתונים מזוהה אוטומטית</li>
                <li>• עמודות לא מזוהות מתעלמים</li>
                <li>• שגיאה בשורה לא תעצור שאר הייבוא</li>
                <li>• רשומה קיימת תתעדכן</li>
              </ul>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Price import tab ──────────────────────────────────────────────────────

const PRICE_TYPE_LABELS: Record<string, string> = {
  retail:            'פרטי',
  retail_quantity:   'פרטי - אירוע',
  business_fixed:    'עסקי - קבוע',
  business_quantity: 'עסקי - כמות',
};

type PriceStep = 'upload' | 'preview' | 'done';

function PriceImportTab() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [step, setStep] = useState<PriceStep>('upload');
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [validRows, setValidRows] = useState<PreviewRow[]>([]);
  const [errors, setErrors] = useState<PreviewError[]>([]);
  const [importResult, setImportResult] = useState<{ inserted: number; updated: number; newProductsCreated: number } | null>(null);
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
      setImportResult({ inserted: json.inserted, updated: json.updated, newProductsCreated: json.newProductsCreated ?? 0 });
      setStep('done');
    } catch {
      toast.error('שגיאה בייבוא המחירון');
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setStep('upload');
    setValidRows([]);
    setErrors([]);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (isAdmin === null) {
    return <p className="text-sm py-8 text-center" style={{ color: '#9B7A5A' }}>בודק הרשאות...</p>;
  }

  if (!isAdmin) {
    return (
      <Card>
        <p className="text-sm" style={{ color: '#8A7664' }}>גישה לייבוא מחירון מוגבלת למנהלים בלבד.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Format instructions */}
      <Card>
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
          <li>• <strong>מחיר עסקי</strong> נשמר לפני מע״מ — יש לסמן &quot;לא&quot; בעמודת כולל מע״מ</li>
          <li>• <strong>כמות מינימום</strong> חובה לסוג &quot;עסקי - כמות&quot;, אופציונלי לשאר</li>
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
                        <td className="border px-2 py-1" style={{ borderColor: '#FECACA', color: '#B91C1C' }}>{err.errors.join(' | ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {validRows.length > 0 ? (
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold" style={{ color: '#2B1A10' }}>
                  תצוגה מקדימה — {validRows.length} שורות תקינות
                  <span className="mr-2 text-xs font-normal" style={{ color: '#6B9E6B' }}>
                    ({validRows.filter(r => r.isNew).length} חדשות, {validRows.filter(r => !r.isNew).length} עדכונים)
                  </span>
                  {(() => {
                    const newProdCount = new Set(validRows.filter(r => r.isNewProduct).map(r => r.productName)).size;
                    return newProdCount > 0 ? (
                      <span className="mr-2 text-xs font-normal" style={{ color: '#92400E' }}>
                        · {newProdCount} מוצרים חדשים ייצרו
                      </span>
                    ) : null;
                  })()}
                </h3>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={reset}>החלף קובץ</Button>
                  <Button type="button" size="sm" onClick={handleImport} disabled={importing}>
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
                          {row.isNewProduct && (
                            <span className="mr-1 text-xs px-1 py-0.5 rounded" style={{ backgroundColor: '#FFF3CD', color: '#92400E' }}>מוצר חדש</span>
                          )}
                        </td>
                        <td className="border px-2 py-1" style={{ borderColor: '#DDD0BE', color: '#3D2B1A' }}>
                          {PRICE_TYPE_LABELS[row.priceType]}
                          {row.priceType !== 'retail' && (
                            <span className="mr-1 text-xs" style={{ color: '#8A7664' }}>(לפני מע״מ)</span>
                          )}
                        </td>
                        <td className="border px-2 py-1 font-medium" style={{ borderColor: '#DDD0BE', color: '#2B1A10' }}>₪{row.price.toFixed(2)}</td>
                        <td className="border px-2 py-1" style={{ borderColor: '#DDD0BE', color: '#3D2B1A' }}>{row.minQuantity ?? '—'}</td>
                        <td className="border px-2 py-1" style={{ borderColor: '#DDD0BE', color: '#3D2B1A' }}>{row.includesVat ? 'כן' : 'לא'}</td>
                        <td className="border px-2 py-1" style={{ borderColor: '#DDD0BE', color: '#3D2B1A' }}>{row.isActive ? 'כן' : 'לא'}</td>
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
                <Button type="button" variant="outline" onClick={reset}>נסה קובץ אחר</Button>
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
            <div className="flex gap-6 text-sm flex-wrap justify-center">
              <span><strong style={{ color: '#166534' }}>{importResult.inserted}</strong> <span style={{ color: '#6B5744' }}>שורות חדשות</span></span>
              <span><strong style={{ color: '#1E40AF' }}>{importResult.updated}</strong> <span style={{ color: '#6B5744' }}>שורות עודכנו</span></span>
              {importResult.newProductsCreated > 0 && (
                <span><strong style={{ color: '#92400E' }}>{importResult.newProductsCreated}</strong> <span style={{ color: '#6B5744' }}>מוצרים נוצרו</span></span>
              )}
            </div>
            <Button type="button" variant="outline" onClick={reset}>ייבא קובץ נוסף</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────

type Tab = 'general' | 'prices' | 'price';

const TABS: { key: Tab; label: string }[] = [
  { key: 'general', label: 'ייבוא נתונים'  },
  { key: 'prices',  label: 'מחירונים'       },
  { key: 'price',   label: 'ייבוא מחירון'  },
];

export default function ImportPage() {
  const [activeTab, setActiveTab] = useState<Tab>('general');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab === 'price') setActiveTab('price');
    else if (tab === 'prices') setActiveTab('prices');
  }, []);

  return (
    <div className="max-w-5xl">
      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b" style={{ borderColor: '#EAE0D4' }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className="px-4 py-2.5 text-sm font-medium relative transition-colors"
            style={activeTab === tab.key
              ? { color: '#5C3410', borderBottom: '2.5px solid #C9A46A', marginBottom: '-1px' }
              : { color: '#8A7664' }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'general' && <GeneralImportTab />}
      {activeTab === 'prices'  && <PricesManageTab onImportClick={() => setActiveTab('price')} />}
      {activeTab === 'price'   && <PriceImportTab />}
    </div>
  );
}
