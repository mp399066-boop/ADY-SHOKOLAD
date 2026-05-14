// ============================================================================
// Recipe import — multi-sheet XLSX parser + validator.
//
// Source workbook (the operator-uploaded file):
//   Sheet "מתכונים"        (required) — recipes
//   Sheet "רכיבי מתכון"   (required) — recipe ingredients
//   Sheet "חומרי גלם"      (optional) — supplemental raw-material data
//
// Output of parseRecipeWorkbook():
//   { recipes, ingredients, rawMaterials, errors, warnings }
//
// Pure function — no DB I/O. Used by both the preview route (just returns
// the parsed object) and the confirm route (re-parses the same file before
// writing). Re-parsing on confirm avoids trusting client-supplied data.
//
// Discipline:
//   - Hebrew header normalization (trim + collapse spaces).
//   - Raw-material name normalization to dedupe "  שוקולד מריר" ≡ "שוקולד מריר ".
//   - Unit-conflict warning when the same raw material appears with
//     different units across ingredient rows.
// ============================================================================

import * as XLSX from 'xlsx';

// ── Header normalization ────────────────────────────────────────────────────

function normalizeHeader(raw: unknown): string {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .replace(/[״"׳']/g, '')
    // Strip trailing/leading "*" used in templates to mark required fields
    // ("קוד מתכון*" must match "קוד מתכון"). Also strip any embedded asterisks.
    .replace(/\*/g, '')
    .trim();
}

function normalizeName(raw: unknown): string {
  return String(raw ?? '')
    .replace(/[״"׳']/g, '')
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeKey(raw: unknown): string {
  return normalizeName(raw).toLowerCase();
}

// ── Header alias maps (one canonical key per logical field) ─────────────────

const RECIPE_HEADERS: Record<string, string[]> = {
  code:           ['קוד מתכון', 'קוד', 'מזהה מתכון', 'recipe code'],
  name:           ['שם מתכון', 'שם', 'recipe name'],
  yieldQty:       ['כמות יוצאת', 'כמות תוצר', 'תפוקה', 'yield'],
  yieldUnit:      ['יחידת תפוקה', 'יחידה תפוקה', 'יחידה', 'unit'],
  category:       ['קטגוריה', 'category'],
  prepMinutes:    ['זמן הכנה בדקות', 'זמן הכנה', 'prep time'],
  active:         ['פעיל', 'active'],
  notes:          ['הערות', 'notes'],
};

const INGREDIENT_HEADERS: Record<string, string[]> = {
  code:           ['קוד מתכון', 'קוד', 'recipe code'],
  rawName:        ['שם חומר גלם', 'חומר גלם', 'שם רכיב', 'ingredient'],
  qty:            ['כמות במתכון', 'כמות', 'qty', 'quantity'],
  unit:           ['יחידה', 'יחידת מידה', 'unit'],
  initialStock:   ['כמות התחלתית למלאי', 'כמות התחלתית', 'מלאי התחלתי'],
  minThreshold:   ['מינימום מלאי להתראה', 'מינימום מלאי', 'סף מלאי נמוך'],
  supplier:       ['ספק', 'supplier'],
  notes:          ['הערות', 'notes'],
};

const RAW_HEADERS: Record<string, string[]> = {
  name:           ['שם חומר גלם', 'חומר גלם', 'שם'],
  unit:           ['יחידה ראשית', 'יחידה', 'יחידת מידה', 'unit'],
  initialStock:   ['כמות התחלתית', 'כמות', 'מלאי'],
  minThreshold:   ['מינימום מלאי להתראה', 'מינימום מלאי', 'סף מלאי נמוך'],
  supplier:       ['ספק', 'supplier'],
  fromRecipes:    ['נוצר מתוך מתכונים', 'מתוך מתכונים'],
  notes:          ['הערות', 'notes'],
};

// Build a {field → matched header} map from a sheet's first-row headers.
function mapHeaders(headers: string[], aliases: Record<string, string[]>): Record<string, string> {
  const out: Record<string, string> = {};
  const norm = headers.map(h => ({ raw: h, norm: normalizeKey(h) }));
  for (const [field, list] of Object.entries(aliases)) {
    const lcList = list.map(s => normalizeKey(s));
    const hit = norm.find(h => lcList.includes(h.norm));
    if (hit) out[field] = hit.raw;
  }
  return out;
}

// ── Public types ────────────────────────────────────────────────────────────

export type RecipeStatus       = 'new' | 'update' | 'error';
export type IngredientStatus   = 'ok' | 'error';
export type RawMaterialStatus  = 'new' | 'existing' | 'updated' | 'warning';

export interface ParsedRecipe {
  rowNumber: number;
  code: string;            // קוד מתכון (= מזהה_לובהבל)
  name: string;            // שם מתכון
  yieldQty: number;        // כמות יוצאת
  yieldUnit: string;       // יחידת תפוקה
  category: string | null;
  prepMinutes: number | null;
  active: boolean | null;
  notes: string | null;
  status: RecipeStatus;
  errors: string[];
}

export interface ParsedIngredient {
  rowNumber: number;
  recipeCode: string;
  rawName: string;          // raw text from sheet (display)
  rawNameKey: string;       // normalized — used for raw-material dedup
  qty: number;
  unit: string;
  initialStock: number | null;
  minThreshold: number | null;
  supplier: string | null;
  notes: string | null;
  status: IngredientStatus;
  errors: string[];
}

export interface ParsedRawMaterial {
  name: string;             // display
  nameKey: string;          // normalized lookup key
  unit: string;
  initialStock: number;
  minThreshold: number | null;
  supplier: string | null;
  notes: string;
  fromRecipes: boolean;     // true when synthesized from ingredient rows
  status: RawMaterialStatus;
  warnings: string[];
}

export interface ParseError {
  sheet: string;
  rowNumber: number | null;
  field: string | null;
  message: string;
}

export interface ParseWarning {
  sheet: string;
  rowNumber: number | null;
  message: string;
}

export interface ParseResult {
  recipes: ParsedRecipe[];
  ingredients: ParsedIngredient[];
  rawMaterials: ParsedRawMaterial[];
  errors: ParseError[];
  warnings: ParseWarning[];
  // Diagnostic: every sheet the workbook actually contained, in order. Lets
  // the UI prove to the operator we DID open a multi-sheet workbook (and
  // didn't silently fall back to first-sheet behaviour).
  sheetsFound: string[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function readNumber(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function readBool(v: unknown): boolean | null {
  if (v == null || v === '') return null;
  const s = String(v).trim().toLowerCase();
  if (['true', '1', 'כן', 'פעיל', 'yes', 'y'].includes(s)) return true;
  if (['false', '0', 'לא', 'לא פעיל', 'no', 'n'].includes(s)) return false;
  return null;
}

function readText(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

// Find a sheet by name, normalizing whitespace + quotes so "רכיבי  מתכון"
// and "רכיבי מתכון" both match.
function findSheet(wb: XLSX.WorkBook, displayName: string): { name: string; sheet: XLSX.WorkSheet } | null {
  const wantKey = normalizeKey(displayName);
  for (const name of wb.SheetNames) {
    if (normalizeKey(name) === wantKey) return { name, sheet: wb.Sheets[name] };
  }
  return null;
}

// Convert sheet → header[], rows[] (objects keyed by raw header text). Strips
// fully-empty rows. Numeric-cell values stay typed (numbers, not strings).
function sheetToObjects(sheet: XLSX.WorkSheet): { headers: string[]; rows: Record<string, unknown>[] } {
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, blankrows: false });
  if (aoa.length === 0) return { headers: [], rows: [] };
  const headers = aoa[0].map(h => normalizeHeader(h));
  const rows = aoa.slice(1)
    .map(r => {
      const obj: Record<string, unknown> = {};
      headers.forEach((h, i) => { obj[h] = r[i] ?? null; });
      return obj;
    })
    .filter(r => Object.values(r).some(v => v !== null && v !== ''));
  return { headers, rows };
}

// ── Main parser ─────────────────────────────────────────────────────────────

export function parseRecipeWorkbook(buf: ArrayBuffer): ParseResult {
  const result: ParseResult = {
    recipes: [], ingredients: [], rawMaterials: [],
    errors: [], warnings: [],
    sheetsFound: [],
  };

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: 'array' });
  } catch (err) {
    result.errors.push({ sheet: '', rowNumber: null, field: null, message: `קובץ Excel לא ניתן לקריאה: ${err instanceof Error ? err.message : String(err)}` });
    return result;
  }

  result.sheetsFound = wb.SheetNames.slice();

  // ── Sheet 1: מתכונים ────────────────────────────────────────────────────
  // Always look up by NAME — never wb.SheetNames[0]. The first sheet might
  // be "הוראות" (instructions) or "רשימות" (reference values).
  const recipesSheet = findSheet(wb, 'מתכונים');
  if (!recipesSheet) {
    result.errors.push({ sheet: 'מתכונים', rowNumber: null, field: null, message: 'חסר גיליון מתכונים בקובץ.' });
  } else {
    const { headers, rows } = sheetToObjects(recipesSheet.sheet);
    const map = mapHeaders(headers, RECIPE_HEADERS);
    const requiredFields: Array<[string, string]> = [
      ['code', 'קוד מתכון'],
      ['name', 'שם מתכון'],
      ['yieldQty', 'כמות יוצאת'],
      ['yieldUnit', 'יחידת תפוקה'],
    ];
    for (const [field, label] of requiredFields) {
      if (!map[field]) result.errors.push({ sheet: 'מתכונים', rowNumber: null, field: label, message: `חסרה עמודת חובה "${label}" בגיליון מתכונים.` });
    }
    if (result.errors.some(e => e.sheet === 'מתכונים')) {
      // Don't try to parse rows if columns are missing.
    } else {
      rows.forEach((r, idx) => {
        const rowNumber = idx + 2; // +1 for header, +1 because user-facing rows are 1-indexed
        const errors: string[] = [];
        const code      = readText(r[map.code]);
        const name      = readText(r[map.name]);
        const yieldQty  = readNumber(r[map.yieldQty]);
        const yieldUnit = readText(r[map.yieldUnit]);
        if (!code)                                  errors.push('קוד מתכון חסר');
        if (!name)                                  errors.push('שם מתכון חסר');
        if (yieldQty == null)                       errors.push('כמות יוצאת חסרה');
        else if (yieldQty <= 0)                     errors.push('כמות יוצאת חייבת להיות מספר חיובי');
        if (!yieldUnit)                             errors.push('יחידת תפוקה חסרה');

        const recipe: ParsedRecipe = {
          rowNumber,
          code:        code      ?? '',
          name:        name      ?? '',
          yieldQty:    yieldQty  ?? 0,
          yieldUnit:   yieldUnit ?? '',
          category:    map.category    ? readText(r[map.category])   : null,
          prepMinutes: map.prepMinutes ? readNumber(r[map.prepMinutes]) : null,
          active:      map.active      ? readBool(r[map.active])     : null,
          notes:       map.notes       ? readText(r[map.notes])      : null,
          status:      'new',
          errors,
        };
        if (errors.length > 0) {
          recipe.status = 'error';
          for (const msg of errors) {
            result.errors.push({ sheet: 'מתכונים', rowNumber, field: null, message: msg });
          }
        }
        result.recipes.push(recipe);
      });
    }
  }

  const recipeCodesInFile = new Set(result.recipes.filter(r => r.status !== 'error').map(r => r.code));

  // ── Sheet 2: רכיבי מתכון ────────────────────────────────────────────────
  const ingredientsSheet = findSheet(wb, 'רכיבי מתכון');
  if (!ingredientsSheet) {
    result.errors.push({ sheet: 'רכיבי מתכון', rowNumber: null, field: null, message: 'קובץ מתכונים חייב לכלול גם גיליון רכיבי מתכון.' });
  } else {
    const { headers, rows } = sheetToObjects(ingredientsSheet.sheet);
    const map = mapHeaders(headers, INGREDIENT_HEADERS);
    const required: Array<[string, string]> = [
      ['code',    'קוד מתכון'],
      ['rawName', 'שם חומר גלם'],
      ['qty',     'כמות במתכון'],
      ['unit',    'יחידה'],
    ];
    for (const [field, label] of required) {
      if (!map[field]) result.errors.push({ sheet: 'רכיבי מתכון', rowNumber: null, field: label, message: `חסרה עמודת חובה "${label}" בגיליון רכיבי מתכון.` });
    }
    if (!result.errors.some(e => e.sheet === 'רכיבי מתכון' && e.rowNumber == null)) {
      rows.forEach((r, idx) => {
        const rowNumber = idx + 2;
        const errors: string[] = [];
        const recipeCode = readText(r[map.code]);
        const rawName    = readText(r[map.rawName]);
        const qty        = readNumber(r[map.qty]);
        const unit       = readText(r[map.unit]);
        if (!recipeCode)                            errors.push('קוד מתכון חסר');
        if (!rawName)                               errors.push('שם חומר גלם חסר');
        if (qty == null)                            errors.push('כמות חסרה');
        else if (qty <= 0)                          errors.push('כמות חייבת להיות מספר חיובי');
        if (!unit)                                  errors.push('יחידה חסרה');
        // Reference check: the recipe code must exist in the file's recipes
        // sheet (DB lookups happen later on confirm; here we only catch
        // file-internal references that won't resolve).
        if (recipeCode && !recipeCodesInFile.has(recipeCode)) {
          errors.push(`קוד מתכון "${recipeCode}" לא נמצא בגיליון מתכונים`);
        }
        const ing: ParsedIngredient = {
          rowNumber,
          recipeCode:   recipeCode ?? '',
          rawName:      rawName    ?? '',
          rawNameKey:   rawName ? normalizeKey(rawName) : '',
          qty:          qty ?? 0,
          unit:         unit ?? '',
          initialStock: map.initialStock ? readNumber(r[map.initialStock]) : null,
          minThreshold: map.minThreshold ? readNumber(r[map.minThreshold]) : null,
          supplier:     map.supplier     ? readText(r[map.supplier])      : null,
          notes:        map.notes        ? readText(r[map.notes])         : null,
          status:       errors.length > 0 ? 'error' : 'ok',
          errors,
        };
        for (const msg of errors) {
          result.errors.push({ sheet: 'רכיבי מתכון', rowNumber, field: null, message: msg });
        }
        result.ingredients.push(ing);
      });
    }
  }

  // ── Sheet 3 (optional): חומרי גלם → enrichment ──────────────────────────
  const rawSupplemental = new Map<string, {
    name: string; unit: string | null;
    initialStock: number | null; minThreshold: number | null;
    supplier: string | null; notes: string | null;
  }>();
  const rawSheet = findSheet(wb, 'חומרי גלם');
  if (rawSheet) {
    const { headers, rows } = sheetToObjects(rawSheet.sheet);
    const map = mapHeaders(headers, RAW_HEADERS);
    if (!map.name) {
      result.warnings.push({ sheet: 'חומרי גלם', rowNumber: null, message: 'בגיליון "חומרי גלם" חסרה עמודת "שם חומר גלם" — מתעלמים מהגיליון.' });
    } else {
      rows.forEach((r, idx) => {
        const rowNumber = idx + 2;
        const name = readText(r[map.name]);
        if (!name) return; // skip empty
        const key = normalizeKey(name);
        if (rawSupplemental.has(key)) {
          result.warnings.push({ sheet: 'חומרי גלם', rowNumber, message: `"${name}" מופיע פעמיים בגיליון — נשמרת השורה הראשונה.` });
          return;
        }
        rawSupplemental.set(key, {
          name,
          unit:         map.unit         ? readText(r[map.unit])         : null,
          initialStock: map.initialStock ? readNumber(r[map.initialStock]) : null,
          minThreshold: map.minThreshold ? readNumber(r[map.minThreshold]) : null,
          supplier:     map.supplier     ? readText(r[map.supplier])     : null,
          notes:        map.notes        ? readText(r[map.notes])        : null,
        });
      });
    }
  }

  // ── Synthesize raw materials from ingredient rows + enrich from sheet 3 ─
  type Bucket = { name: string; key: string; units: Set<string>; initialStock: number | null; minThreshold: number | null; supplier: string | null; notes: string[] };
  const byKey = new Map<string, Bucket>();
  for (const ing of result.ingredients) {
    if (ing.status === 'error' || !ing.rawNameKey) continue;
    let b = byKey.get(ing.rawNameKey);
    if (!b) {
      b = { name: ing.rawName, key: ing.rawNameKey, units: new Set(), initialStock: null, minThreshold: null, supplier: null, notes: [] };
      byKey.set(ing.rawNameKey, b);
    }
    if (ing.unit) b.units.add(normalizeKey(ing.unit));
    if (ing.initialStock != null && b.initialStock == null) b.initialStock = ing.initialStock;
    if (ing.minThreshold != null && b.minThreshold == null) b.minThreshold = ing.minThreshold;
    if (ing.supplier && !b.supplier) b.supplier = ing.supplier;
    if (ing.notes) b.notes.push(ing.notes);
  }

  for (const b of Array.from(byKey.values())) {
    const sup = rawSupplemental.get(b.key);
    const unit =
      // Prefer the explicit "חומרי גלם" sheet value when present.
      (sup?.unit && readText(sup.unit))
      || (b.units.size > 0 ? Array.from(b.units)[0] : '')
      || '';
    const warnings: string[] = [];
    if (b.units.size > 1) {
      warnings.push(`חומר הגלם מופיע עם יחידות שונות (${Array.from(b.units).join(', ')}). מומלץ לאחד יחידות לפני הייבוא.`);
      result.warnings.push({ sheet: 'רכיבי מתכון', rowNumber: null, message: `"${b.name}" מופיע עם יחידות שונות (${Array.from(b.units).join(', ')}).` });
    }
    const initialStock = sup?.initialStock ?? b.initialStock ?? 0;
    const minThreshold = sup?.minThreshold ?? b.minThreshold ?? null;
    const supplier     = sup?.supplier     ?? b.supplier     ?? null;
    const notesParts: string[] = ['נוצר אוטומטית מייבוא מתכונים'];
    if (sup?.notes) notesParts.push(sup.notes);
    else if (b.notes.length > 0) notesParts.push(b.notes[0]);
    result.rawMaterials.push({
      name: b.name,
      nameKey: b.key,
      unit,
      initialStock,
      minThreshold,
      supplier,
      notes: notesParts.join(' · '),
      fromRecipes: true,
      status: 'new', // refined to 'existing' / 'updated' on the confirm route after DB lookup
      warnings,
    });
  }

  // Carry-over for raw-material-only rows that don't appear in any recipe
  // (uncommon — operator just listed extra inventory). Surface them so the
  // preview shows the operator that those rows are recognised.
  for (const [key, sup] of Array.from(rawSupplemental.entries())) {
    if (byKey.has(key)) continue;
    if (!sup.unit) continue; // skip incomplete enrichment-only rows
    result.rawMaterials.push({
      name: sup.name,
      nameKey: key,
      unit: sup.unit,
      initialStock: sup.initialStock ?? 0,
      minThreshold: sup.minThreshold ?? null,
      supplier: sup.supplier,
      notes: sup.notes || 'נוצר מגיליון "חומרי גלם" בייבוא',
      fromRecipes: false,
      status: 'new',
      warnings: [],
    });
  }

  return result;
}

// ── Template generator (used by /api/recipes/import-template) ───────────────

export function buildRecipeImportTemplate(): ArrayBuffer {
  const wb = XLSX.utils.book_new();

  // 1) הוראות
  const instructions = [
    ['ייבוא מתכונים — הוראות'],
    [],
    ['• הקובץ כולל 5 גיליונות. גיליונות חובה: "מתכונים" ו-"רכיבי מתכון". "חומרי גלם" אופציונלי.'],
    ['• כל מתכון מזוהה לפי קוד מתכון ייחודי. אם הקוד כבר קיים — המתכון יעודכן.'],
    ['• עדכון מתכון קיים יחליף את רשימת הרכיבים שלו לפי הקובץ.'],
    ['• חומרי גלם נוצרים אוטומטית משמות הרכיבים — אין צורך להוסיף ידנית.'],
    ['• יש לוודא שכמויות גדולות מ-0.'],
    ['• ניתן להשתמש בגיליון "חומרי גלם" כדי לקבוע יחידה ראשית, מינימום מלאי וספק.'],
    ['• ניתן להשתמש בגיליון "רשימות" לערכים נפוצים (קטגוריות, יחידות).'],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(instructions), 'הוראות');

  // 2) מתכונים
  const recipesSheet = XLSX.utils.aoa_to_sheet([
    ['קוד מתכון', 'שם מתכון', 'כמות יוצאת', 'יחידת תפוקה', 'קטגוריה', 'זמן הכנה בדקות', 'פעיל', 'הערות'],
    ['REC001', 'עוגת שוקולד מריר', 1, 'יחידות', 'עוגות', 90, 'כן', 'בעברית, RTL'],
    ['REC002', 'מארז 24 פטיפורים', 1, 'מארז',    'מארזים', 60, 'כן', ''],
  ]);
  XLSX.utils.book_append_sheet(wb, recipesSheet, 'מתכונים');

  // 3) רכיבי מתכון
  const ingredientsSheet = XLSX.utils.aoa_to_sheet([
    ['קוד מתכון', 'שם חומר גלם', 'כמות במתכון', 'יחידה', 'כמות התחלתית למלאי', 'מינימום מלאי להתראה', 'ספק', 'הערות'],
    ['REC001', 'שוקולד מריר', 300, 'גרם', 5000, 1000, 'מולין', ''],
    ['REC001', 'חמאה',         200, 'גרם', 3000, 500,  'תנובה', ''],
    ['REC001', 'ביצים',        4,   'יחידה', 60, 12,   '', ''],
    ['REC002', 'שוקולד מריר',  500, 'גרם', '',    '',   '', ''],
  ]);
  XLSX.utils.book_append_sheet(wb, ingredientsSheet, 'רכיבי מתכון');

  // 4) חומרי גלם (optional — for fine-tuning unit / supplier / threshold)
  const rawSheet = XLSX.utils.aoa_to_sheet([
    ['שם חומר גלם', 'יחידה ראשית', 'כמות התחלתית', 'מינימום מלאי להתראה', 'ספק', 'נוצר מתוך מתכונים?', 'הערות'],
    ['שוקולד מריר', 'גרם', 5000, 1000, 'מולין', 'כן', 'איכות 70%'],
  ]);
  XLSX.utils.book_append_sheet(wb, rawSheet, 'חומרי גלם');

  // 5) רשימות (reference values)
  const listsSheet = XLSX.utils.aoa_to_sheet([
    ['קטגוריות מתכון', 'יחידות תפוקה', 'יחידות מידה'],
    ['עוגות',           'יחידות',        'גרם'],
    ['מארזים',          'מארז',           'ק"ג'],
    ['פטיפורים',        'ק"ג',            'ליטר'],
    ['קינוחים',         'ליטר',           'מ"ל'],
    ['מתוקים',          '',               'יחידה'],
  ]);
  XLSX.utils.book_append_sheet(wb, listsSheet, 'רשימות');

  // Generate as ArrayBuffer (Node Buffer-compatible via Uint8Array view).
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return out as ArrayBuffer;
}

// Re-export for callers that need the symbol type.
export type { XLSX };
