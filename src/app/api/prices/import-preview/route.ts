export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth/requireAuthorizedUser';

export type PriceType = 'retail' | 'business_quantity' | 'business_fixed' | 'retail_quantity';

export interface PreviewRow {
  rowNumber: number;
  sku: string;
  productName: string;
  productId: string | null;
  productFound: boolean;
  isNewProduct: boolean;
  priceType: PriceType;
  price: number;
  minQuantity: number | null;
  includesVat: boolean;
  isActive: boolean;
  isNew: boolean;
}

export interface PreviewError {
  rowNumber: number;
  sku: string;
  productName: string;
  errors: string[];
}

// Normalize a price-type cell value for lenient comparison:
// • Unicode dash variants → ASCII hyphen
// • Special whitespace → regular space
// • Collapse repeated spaces, normalize space-around-dash
// • Strip leading "לקוח " prefix
function normalizePriceTypeValue(raw: unknown): string {
  let s = String(raw ?? '');
  // Unicode dashes → hyphen
  s = s.replace(/[­‐-―−﹘﹣－]/g, '-');
  // Special spaces → regular space
  s = s.replace(/[   - 　]/g, ' ');
  // Collapse runs of spaces
  s = s.replace(/\s+/g, ' ');
  // Normalise padding around hyphens (so "עסקי-קבוע" and "עסקי - קבוע" both become "עסקי - קבוע")
  s = s.replace(/\s*-\s*/g, ' - ');
  // Strip leading "לקוח " prefix
  s = s.replace(/^לקוח\s+/i, '');
  return s.trim();
}

function mapPriceType(raw: unknown, minQtyRaw?: unknown): PriceType | null {
  const s = normalizePriceTypeValue(raw).toLowerCase();

  // Helper: does this row have a usable min_quantity value?
  const minQtyNum = Number(minQtyRaw);
  const hasMinQty = minQtyRaw !== '' && minQtyRaw != null && !isNaN(minQtyNum) && minQtyNum > 0;

  // VAT-hint detection:
  // "(לפני מע״מ)" / "לפני מעמ" → business tier (no VAT)
  // "(כולל מע״מ)" / "כולל מעמ" → private/retail tier (includes VAT)
  if (s.includes('לפני מע')) {
    return hasMinQty ? 'business_quantity' : 'business_fixed';
  }
  if (s.includes('כולל מע')) {
    return hasMinQty ? 'retail_quantity' : 'retail';
  }

  // Exact English / code fallbacks
  if (s === 'retail') return 'retail';
  if (s === 'retail_quantity') return 'retail_quantity';
  if (s === 'business_fixed') return 'business_fixed';
  if (s === 'business_quantity') return 'business_quantity';

  // "פרטי" or "רגיל" alone → retail
  if (s === 'פרטי' || s === 'רגיל') return 'retail';

  // "פרטי" + ("אירוע" or "כמות"), NOT "עסקי" → retail_quantity
  if (s.includes('פרטי') && (s.includes('אירוע') || s.includes('כמות')) && !s.includes('עסקי')) {
    return 'retail_quantity';
  }

  // "עסקי" + "קבוע" → business_fixed
  if (s.includes('עסקי') && s.includes('קבוע')) return 'business_fixed';

  // "עסקי" + ("כמות" or "אירוע") → business_quantity
  if (s.includes('עסקי') && (s.includes('כמות') || s.includes('אירוע'))) return 'business_quantity';

  return null;
}

function parseBool(v: unknown, defaultVal = true): boolean {
  if (v === null || v === undefined || v === '') return defaultVal;
  const s = String(v).trim().toLowerCase();
  return ['כן', 'yes', 'true', '1'].includes(s);
}

// Normalize a header string for comparison.
// Uses charCodeAt() throughout — zero reliance on Unicode character literals
// in regex or string values, so the result is encoding-safe.
function nh(s: string): string {
  const src = String(s);
  const out: string[] = [];
  for (let i = 0; i < src.length; i++) {
    const c = src.charCodeAt(i);
    // Skip invisible / control characters:
    //   0xFEFF = BOM, 0x200B-0x200D = zero-width, 0x00AD = soft-hyphen
    if (c === 0xFEFF || c === 0x200B || c === 0x200C || c === 0x200D || c === 0x00AD) continue;
    // Normalize whitespace variants to ASCII space (0x20):
    //   0x00A0 = NBSP, 0x1680, 0x2000-0x200A, 0x202F, 0x205F, 0x3000
    if (c === 0x00A0 || c === 0x1680 || (c >= 0x2000 && c <= 0x200A) || c === 0x202F || c === 0x205F || c === 0x3000) {
      out.push(' ');
      continue;
    }
    // Normalize quote variants to ASCII double-quote (0x22):
    //   0x05F4 = Hebrew gershayim, 0x201C/0x201D = smart quotes, 0x2033 = double prime
    if (c === 0x05F4 || c === 0x201C || c === 0x201D || c === 0x2033) {
      out.push('"');
      continue;
    }
    out.push(src[i]);
  }
  return out.join('').trim().toLowerCase();
}

interface RawParsedRow {
  sku: unknown;
  productName: unknown;
  priceType: unknown;
  price: unknown;
  minQty: unknown;
  includesVat: unknown;
  isActive: unknown;
}

export async function POST(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'קובץ חסר' }, { status: 400 });

  let parsedRows: RawParsedRow[];
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return NextResponse.json({ error: 'הקובץ ריק' }, { status: 400 });
    const sheet = workbook.Sheets[sheetName];

    // header:1 returns raw arrays — no key-encoding ambiguity
    const allRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
    if (allRows.length < 2) return NextResponse.json({ error: 'הקובץ אינו מכיל שורות נתונים' }, { status: 400 });

    const headerRow = (allRows[0] as string[]).map(h => String(h ?? ''));
    const dataRows = allRows.slice(1) as unknown[][];

    // Find column index by matching header against a list of accepted aliases,
    // all normalized through nh() for encoding-safe comparison.
    const findCI = (aliases: string[]): number => {
      const na = aliases.map(nh);
      return headerRow.findIndex(h => na.includes(nh(h)));
    };

    const CI = {
      sku:         findCI(['SKU', 'sku', 'קוד מוצר', 'קוד', 'מזהה']),
      productName: findCI(['שם מוצר', 'שם_מוצר', 'product_name', 'שם']),
      priceType:   findCI(['סוג מחירון', 'סוג_מחירון', 'price_type', 'סוג מחיר']),
      price:       findCI(['מחיר', 'price']),
      minQty:      findCI(['כמות מינימום', 'כמות_מינימום', 'min_quantity', 'כמות מינ']),
      // כולל מע"מ — the " may be ASCII (0x22), gershayim (0x05F4), or smart-quote.
      // nh() normalises all of them to 0x22, so all variants match the alias below.
      includesVat: findCI(['כולל מע"מ', 'כולל מעמ', 'includes_vat', 'מע"מ', 'מעמ']),
      isActive:    findCI(['פעיל', 'פעיל?', 'is_active', 'active']),
    };

    const gc = (row: unknown[], i: number) => i >= 0 ? (row[i] ?? '') : '';

    parsedRows = dataRows
      .filter(r => r.some(c => c !== '' && c !== null && c !== undefined))
      .map(r => ({
        sku:         gc(r, CI.sku),
        productName: gc(r, CI.productName),
        priceType:   gc(r, CI.priceType),
        price:       gc(r, CI.price),
        minQty:      gc(r, CI.minQty),
        includesVat: gc(r, CI.includesVat),
        isActive:    gc(r, CI.isActive),
      }));
  } catch {
    return NextResponse.json({ error: 'לא ניתן לקרוא את הקובץ — ודא שהוא קובץ Excel תקין' }, { status: 400 });
  }

  if (parsedRows.length === 0) return NextResponse.json({ error: 'הקובץ אינו מכיל שורות נתונים' }, { status: 400 });

  const supabase = createAdminClient();

  const [{ data: products }, { data: existingEntries }] = await Promise.all([
    supabase.from('מוצרים_למכירה').select('id, שם_מוצר'), // include inactive so we don't re-create them
    supabase.from('מחירון').select('מוצר_id, price_type, min_quantity, sku'),
  ]);

  // name → product_id (primary lookup)
  const productMap = new Map<string, string>();
  for (const p of products || []) {
    productMap.set(String(p['שם_מוצר']).toLowerCase().trim(), p.id as string);
  }

  // sku → product_id (fallback lookup via existing price list entries)
  const skuMap = new Map<string, string>();
  for (const e of existingEntries || []) {
    if (e.sku && e['מוצר_id']) {
      const key = String(e.sku).toLowerCase().trim();
      if (key && !skuMap.has(key)) skuMap.set(key, e['מוצר_id'] as string);
    }
  }

  const existingSet = new Set<string>();
  for (const e of existingEntries || []) {
    existingSet.add(`${e['מוצר_id']}|${e.price_type}|${e.min_quantity ?? ''}`);
  }

  const validRows: PreviewRow[] = [];
  const errors: PreviewError[] = [];
  const seenInFile = new Set<string>();

  parsedRows.forEach((row, idx) => {
    const rowNumber = idx + 2;
    const sku = String(row.sku ?? '').trim();
    const productName = String(row.productName ?? '').trim();
    const priceTypeRaw = row.priceType;
    const priceRaw = row.price;
    const minQtyRaw = row.minQty;
    const includesVatRaw = row.includesVat;
    const isActiveRaw = row.isActive;

    const rowErrors: string[] = [];

    if (!productName) rowErrors.push('שם מוצר חסר');

    const priceType = mapPriceType(priceTypeRaw, minQtyRaw);
    if (!priceType) rowErrors.push(`סוג מחירון לא תקין: "${priceTypeRaw}" (אפשרויות: לקוח פרטי / לקוח פרטי אירוע - כמות / עסקי קבוע / עסקי אירוע - כמות)`);

    const price = Number(priceRaw);
    if (priceRaw === '' || priceRaw === null) {
      rowErrors.push('מחיר חסר');
    } else if (isNaN(price) || price < 0) {
      rowErrors.push(`מחיר לא תקין: "${priceRaw}"`);
    }

    // Auto-default min_quantity to 20 for quantity tiers when missing/invalid
    const minQuantityRaw = (minQtyRaw !== '' && minQtyRaw !== null && minQtyRaw !== undefined)
      ? Number(minQtyRaw) : null;
    let effectiveMinQty: number | null = null;
    if (priceType === 'business_quantity' || priceType === 'retail_quantity') {
      effectiveMinQty = (minQuantityRaw !== null && !isNaN(minQuantityRaw) && minQuantityRaw > 0)
        ? minQuantityRaw : 20;
    }

    // Primary lookup: by product name; fallback: by SKU via existing price list entries
    let productId = productName ? (productMap.get(productName.toLowerCase()) ?? null) : null;
    if (!productId && sku) {
      productId = skuMap.get(sku.toLowerCase()) ?? null;
    }
    const isNewProduct = !!(productName && !productId);

    if (rowErrors.length > 0) {
      errors.push({ rowNumber, sku, productName, errors: rowErrors });
      return;
    }

    // For dedup: use name-keyed prefix for products not yet in DB
    const dedupeKey = `${productId ?? ('__new__:' + productName)}|${priceType}|${effectiveMinQty ?? ''}`;

    if (seenInFile.has(dedupeKey)) {
      errors.push({ rowNumber, sku, productName, errors: [`כפילות בקובץ: ${productName} + ${priceTypeRaw}${effectiveMinQty ? ` (כמות ${effectiveMinQty})` : ''}`] });
      return;
    }
    seenInFile.add(dedupeKey);

    const isNew = !existingSet.has(dedupeKey);

    validRows.push({
      rowNumber,
      sku,
      productName,
      productId,
      productFound: productId !== null,
      isNewProduct,
      priceType: priceType!,
      price,
      minQuantity: effectiveMinQty,
      includesVat: parseBool(includesVatRaw, true),
      isActive: parseBool(isActiveRaw, true),
      isNew,
    });
  });

  const newProductNames = new Set(validRows.filter(r => r.isNewProduct).map(r => r.productName));
  const summary = {
    newProducts: newProductNames.size,
    newPrices: validRows.filter(r => r.isNew).length,
    updatedPrices: validRows.filter(r => !r.isNew).length,
    errors: errors.length,
  };

  return NextResponse.json({ validRows, errors, summary });
}
