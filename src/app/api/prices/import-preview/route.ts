export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth/requireAuthorizedUser';

export type PriceType = 'retail' | 'business_quantity' | 'business_fixed';

export interface PreviewRow {
  rowNumber: number;
  sku: string;
  productName: string;
  productId: string | null;
  productFound: boolean;
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

function mapPriceType(raw: unknown): PriceType | null {
  const s = String(raw ?? '').trim();
  if (['פרטי', 'רגיל', 'retail'].includes(s)) return 'retail';
  if (['עסקי - קבוע', 'עסקי-קבוע', 'business_fixed'].includes(s)) return 'business_fixed';
  if (['עסקי - כמות', 'עסקי-כמות', 'business_quantity'].includes(s)) return 'business_quantity';
  return null;
}

function parseBool(v: unknown, defaultVal = true): boolean {
  if (v === null || v === undefined || v === '') return defaultVal;
  const s = String(v).trim().toLowerCase();
  return ['כן', 'yes', 'true', '1'].includes(s);
}

// Normalize header for comparison: trim + collapse all quote variants to ASCII "
// Uses explicit Unicode escapes to avoid source-encoding ambiguity.
function nh(s: string): string {
  return String(s).trim()
    .replace(/״/g, '"')         // Hebrew gershayim ״ (U+05F4)
    .replace(/“|”/g, '"')  // Smart quotes “ ”
    .replace(/″/g, '"')         // Double prime ″ (U+2033)
    .toLowerCase();
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

    // header:1 → raw arrays; bypasses all key-encoding ambiguity
    const allRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
    if (allRows.length < 2) return NextResponse.json({ error: 'הקובץ אינו מכיל שורות נתונים' }, { status: 400 });

    const headerRow = (allRows[0] as string[]).map(h => String(h ?? ''));
    const dataRows = allRows.slice(1) as unknown[][];

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
    supabase.from('מוצרים_למכירה').select('id, שם_מוצר').eq('פעיל', true),
    supabase.from('מחירון').select('מוצר_id, price_type, min_quantity'),
  ]);

  const productMap = new Map<string, string>();
  for (const p of products || []) {
    productMap.set(String(p['שם_מוצר']).toLowerCase().trim(), p.id as string);
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

    const priceType = mapPriceType(priceTypeRaw);
    if (!priceType) rowErrors.push(`סוג מחירון לא תקין: "${priceTypeRaw}" (אפשרויות: פרטי / עסקי - קבוע / עסקי - כמות)`);

    const price = Number(priceRaw);
    if (priceRaw === '' || priceRaw === null) {
      rowErrors.push('מחיר חסר');
    } else if (isNaN(price) || price < 0) {
      rowErrors.push(`מחיר לא תקין: "${priceRaw}"`);
    }

    const minQuantity = (minQtyRaw !== '' && minQtyRaw !== null && minQtyRaw !== undefined)
      ? Number(minQtyRaw) : null;

    if (priceType === 'business_quantity' && (minQuantity === null || isNaN(minQuantity as number) || (minQuantity as number) <= 0)) {
      rowErrors.push('כמות מינימום חסרה עבור מחירון עסקי-כמות');
    }

    const productId = productName ? (productMap.get(productName.toLowerCase()) ?? null) : null;

    if (productName && !productId) {
      rowErrors.push(`מוצר לא נמצא: "${productName}"`);
    }

    if (rowErrors.length > 0) {
      errors.push({ rowNumber, sku, productName, errors: rowErrors });
      return;
    }

    const minQty = priceType === 'business_quantity' ? (minQuantity as number) : null;
    const dedupeKey = `${productId}|${priceType}|${minQty ?? ''}`;

    if (seenInFile.has(dedupeKey)) {
      errors.push({ rowNumber, sku, productName, errors: [`כפילות בקובץ: ${productName} + ${priceTypeRaw}${minQty ? ` (כמות ${minQty})` : ''}`] });
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
      priceType: priceType!,
      price,
      minQuantity: minQty,
      includesVat: parseBool(includesVatRaw, true),
      isActive: parseBool(isActiveRaw, true),
      isNew,
    });
  });

  return NextResponse.json({ validRows, errors });
}
