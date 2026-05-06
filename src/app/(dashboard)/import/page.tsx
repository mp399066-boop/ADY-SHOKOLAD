'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
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

// ─── Smart mapping tables ──────────────────────────────────────────────────

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

// DB field → list of recognized column-name aliases (case-insensitive, spaces ok)
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

// Score how well a set of headers matches an entity's aliases
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

// Auto-detect best entity type from file headers
function detectEntity(headers: string[]): EntityType | null {
  let best: EntityType | null = null;
  let bestScore = 0;
  for (const [label, tableName] of Object.entries(ENTITY_TABLE) as [EntityType, string][]) {
    const s = scoreEntity(headers, tableName);
    if (s > bestScore) { bestScore = s; best = label; }
  }
  return bestScore > 0 ? best : null;
}

// Build file-column → DB-field mapping for an entity
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
        // Don't overwrite a field already claimed by an earlier (exact) match
        const alreadyClaimed = Object.values(mapping).includes(dbField);
        if (!alreadyClaimed || exactMatch) {
          mapping[h] = dbField;
          break;
        }
      }
    }
  }
  return mapping;
}

// Apply mapping to a row; fall back to spaces→underscores for unmapped columns
function applyMapping(row: ParsedRow, mapping: Record<string, string>): ParsedRow {
  const out: ParsedRow = {};
  for (const [col, val] of Object.entries(row)) {
    const dbCol = mapping[col] ?? col.trim().replace(/ /g, '_');
    out[dbCol] = val;
  }
  return out;
}

// ─── Component ────────────────────────────────────────────────────────────

export default function ImportPage() {
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
    // Strip UTF-8 BOM if present
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

    // Auto-detect entity and build mapping
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
      } catch {
        toast.error('שגיאה בקריאת קובץ JSON');
      }
    } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      try {
        const XLSX = await import('xlsx');
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer);
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<ParsedRow>(ws, { defval: null });
        const hdrs = rows.length > 0 ? Object.keys(rows[0]) : [];
        afterParse(rows, hdrs);
      } catch {
        toast.error('שגיאה בקריאת קובץ Excel');
      }
    } else {
      toast.error('סוג קובץ לא נתמך. אנא השתמש ב-CSV, XLSX, או JSON');
    }
  };

  const handleEntityChange = (newEntity: EntityType) => {
    setEntity(newEntity);
    setResult(null);
    if (headers.length > 0) {
      setColumnMapping(buildMapping(headers, ENTITY_TABLE[newEntity]));
    }
  };

  const handleImport = async () => {
    if (allRows.length === 0) { toast.error('אין נתונים לייבוא'); return; }
    setImporting(true);
    try {
      const mappedRows = allRows.map(row => applyMapping(row, columnMapping));
      console.log('[Import] entity:', entity, '| rows:', mappedRows.length, '| sample:', mappedRows[0]);
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
    <div className="max-w-5xl space-y-5">

      {/* Price list import — dedicated screen */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold" style={{ color: '#2B1A10' }}>ייבוא מחירון</h2>
            <p className="text-xs mt-0.5" style={{ color: '#9B7A5A' }}>טעינת מחירון עסקי / קמעוני מקובץ אקסל</p>
          </div>
          <Link href="/settings/price-import">
            <Button variant="outline" size="sm">פתח מסך ייבוא מחירון</Button>
          </Link>
        </div>
      </Card>

      {/* Config */}
      <Card>
        <CardHeader><CardTitle>ייבוא נתונים כלליים</CardTitle></CardHeader>
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

      {/* Auto-mapping display */}
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
                  {dbField && (
                    <>
                      <span style={{ opacity: 0.5 }}>→</span>
                      <span style={{ color: '#15803D' }}>{dbField}</span>
                    </>
                  )}
                  {!dbField && <span style={{ opacity: 0.55 }}>(מתעלמים)</span>}
                </div>
              );
            })}
          </div>
        </Card>
      )}

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
                    <th key={h} className="px-3 py-2 text-right font-semibold whitespace-nowrap" style={{ color: '#6B4A2D' }}>
                      {columnMapping[h] ? (
                        <span title={`קובץ: "${h}"`}>{columnMapping[h]}</span>
                      ) : (
                        <span style={{ color: '#B45309' }}>{h}</span>
                      )}
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
                <li>• CSV (UTF-8)</li>
                <li>• Excel (.xlsx, .xls)</li>
                <li>• JSON (מערך)</li>
              </ul>
            </div>
            <div className="space-y-2">
              <div className="font-medium" style={{ color: '#2B1A10' }}>מיפוי אוטומטי</div>
              <ul className="space-y-1 text-xs">
                <li>• "שם", "שם מוצר" → שם_מוצר</li>
                <li>• "מחיר", "₪" → מחיר</li>
                <li>• "סוג", "קטגוריה" → סוג_מוצר</li>
                <li>• "כמות", "גודל" → כמות</li>
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
