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

function col(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null) return row[k];
  }
  return '';
}

export async function POST(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'קובץ חסר' }, { status: 400 });

  let rawRows: Record<string, unknown>[];
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return NextResponse.json({ error: 'הקובץ ריק' }, { status: 400 });
    const sheet = workbook.Sheets[sheetName];
    rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];
  } catch {
    return NextResponse.json({ error: 'לא ניתן לקרוא את הקובץ — ודא שהוא קובץ Excel תקין' }, { status: 400 });
  }

  if (rawRows.length === 0) return NextResponse.json({ error: 'הקובץ אינו מכיל שורות נתונים' }, { status: 400 });

  const supabase = createAdminClient();

  const [{ data: products }, { data: existingEntries }] = await Promise.all([
    supabase.from('מוצרים_למכירה').select('id, שם_מוצר').eq('פעיל', true),
    supabase.from('מחירון').select('מוצר_id, price_type, min_quantity'),
  ]);

  const productMap = new Map<string, string>();
  for (const p of products || []) {
    productMap.set(String(p.שם_מוצר).toLowerCase().trim(), p.id as string);
  }

  const existingSet = new Set<string>();
  for (const e of existingEntries || []) {
    existingSet.add(`${e.מוצר_id}|${e.price_type}|${e.min_quantity ?? ''}`);
  }

  const validRows: PreviewRow[] = [];
  const errors: PreviewError[] = [];
  const seenInFile = new Set<string>();

  rawRows.forEach((row, idx) => {
    const rowNumber = idx + 2;
    const sku = String(col(row, 'SKU', 'sku', 'קוד מוצר', 'קוד', 'מזהה')).trim();
    const productName = String(col(row, 'שם מוצר', 'שם_מוצר', 'product_name', 'שם')).trim();
    const priceTypeRaw = col(row, 'סוג מחירון', 'סוג_מחירון', 'price_type', 'סוג');
    const priceRaw = col(row, 'מחיר', 'price');
    const minQtyRaw = col(row, 'כמות מינימום', 'כמות_מינימום', 'min_quantity', 'כמות מינ', 'כמות מינימלית');
    const includesVatRaw = col(row, 'כולל מע״מ', 'כולל מע"מ', 'כולל מעמ', 'includes_vat', 'מעמ', 'מע"מ');
    const isActiveRaw = col(row, 'פעיל', 'פעיל?', 'is_active', 'active');

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
