'use client';

// /products/prices — מחירון מוצרים מוגמרים.
//
// Surfaces the existing PricesManageTab component (previously buried inside
// /import?tab=price) as a proper standalone page so the owner has a clear
// "go-to" surface for the finished-product price catalog. Operator can
// browse all tiers (קמעונאי / עסקי קבוע / עסקי בכמות), search by name,
// filter by tier, toggle active/inactive, and inline-edit prices.
//
// "Import from Excel" stays available via a button — clicking it routes
// to the existing /import?tab=price workflow, which is still the only way
// to bulk-create new price rows. Single-price editing happens here.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PricesManageTab from '@/components/prices/PricesManageTab';

export default function PricesCatalogPage() {
  const router = useRouter();

  return (
    <div className="max-w-6xl space-y-5" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1 text-[12px]" style={{ color: '#8A7664' }}>
            <Link href="/products" className="hover:underline" style={{ color: '#8B5E34' }}>
              מוצרים
            </Link>
            <span style={{ color: '#C9B89E' }}>›</span>
            <span>מחירון מוגמרים</span>
          </div>
          <h1 className="text-xl font-bold" style={{ color: '#3A2A1A' }}>
            מחירון מוצרים מוגמרים
          </h1>
          <p className="text-sm mt-1" style={{ color: '#8A7664' }}>
            המחירים של כל המוצרים המוגמרים, לפי סוג לקוח וכמות. אפשר לערוך מחיר ישירות בטבלה ולחפש לפי שם.
          </p>
        </div>
      </div>

      <PricesManageTab onImportClick={() => router.push('/import?tab=price')} />
    </div>
  );
}
