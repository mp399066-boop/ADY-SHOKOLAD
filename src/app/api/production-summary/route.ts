import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

export const dynamic = 'force-dynamic';

// ── Types ──────────────────────────────────────────────────────────────────

interface OrderRef {
  מספר_הזמנה: string;
  id: string;
  לקוח: string;
  כמות: number;
}

interface ProductItem {
  מוצר_id: string;
  שם_מוצר: string;
  כמות_כוללת: number;
  הזמנות: OrderRef[];
}

interface PackageItem {
  גודל_מארז: number;
  כמות_כוללת: number;
  פטיפורים_כוללים: number;
  הזמנות: OrderRef[];
}

interface PetitFourItem {
  פטיפור_id: string;
  שם_פטיפור: string;
  כמות_כוללת: number;
  הזמנות: OrderRef[];
}

interface CustomItem {
  שם_פריט_מותאם: string;
  סוג_שורה: string;
  כמות_כוללת: number;
  הזמנות: OrderRef[];
}

const DEFAULT_ACTIVE_STATUSES = ['חדשה', 'בהכנה', 'מוכנה למשלוח', 'נשלחה'];

export async function GET(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();

  const supabase = createAdminClient();
  const { searchParams } = new URL(req.url);

  const dateFrom = searchParams.get('date_from');
  const dateTo   = searchParams.get('date_to');
  const statusParam = searchParams.get('status');

  const statusList = statusParam
    ? statusParam.split(',').map(s => s.trim()).filter(Boolean)
    : DEFAULT_ACTIVE_STATUSES;

  let query = supabase
    .from('הזמנות')
    .select(`
      id,
      מספר_הזמנה,
      תאריך_אספקה,
      סטטוס_הזמנה,
      לקוחות(שם_פרטי, שם_משפחה),
      מוצרים_בהזמנה(
        id,
        סוג_שורה,
        מוצר_id,
        כמות,
        גודל_מארז,
        שם_פריט_מותאם,
        מוצרים_למכירה(שם_מוצר),
        בחירת_פטיפורים_בהזמנה(
          כמות,
          פטיפור_id,
          סוגי_פטיפורים(שם_פטיפור)
        )
      )
    `)
    .in('סטטוס_הזמנה', statusList);

  if (dateFrom) query = query.gte('תאריך_אספקה', dateFrom);
  if (dateTo)   query = query.lte('תאריך_אספקה', dateTo);

  const { data: orders, error } = await query.order('תאריך_אספקה', { ascending: true });

  if (error) {
    console.error('[production-summary] query error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // ── Aggregation ─────────────────────────────────────────────────────────

  const productMap   = new Map<string, ProductItem>();
  const packageMap   = new Map<number, PackageItem>();
  const petitFourMap = new Map<string, PetitFourItem>();
  const customMap    = new Map<string, CustomItem>();

  for (const order of (orders as any[]) ?? []) {
    const cust = order.לקוחות as { שם_פרטי?: string; שם_משפחה?: string } | null;
    const custName = `${cust?.שם_פרטי ?? ''} ${cust?.שם_משפחה ?? ''}`.trim();

    for (const item of (order.מוצרים_בהזמנה as any[]) ?? []) {
      const qty = Number(item.כמות) || 0;
      if (qty <= 0) continue;

      const orderRef: OrderRef = {
        מספר_הזמנה: order.מספר_הזמנה,
        id: order.id,
        לקוח: custName,
        כמות: qty,
      };

      if (item.סוג_שורה === 'מוצר' && item.מוצר_id) {
        const name = (item.מוצרים_למכירה as { שם_מוצר?: string } | null)?.שם_מוצר || item.מוצר_id;
        const existing = productMap.get(item.מוצר_id);
        if (existing) {
          existing.כמות_כוללת += qty;
          existing.הזמנות.push(orderRef);
        } else {
          productMap.set(item.מוצר_id, {
            מוצר_id: item.מוצר_id,
            שם_מוצר: name,
            כמות_כוללת: qty,
            הזמנות: [orderRef],
          });
        }

      } else if (item.סוג_שורה === 'מארז') {
        const size = Number(item.גודל_מארז) || 0;
        const existing = packageMap.get(size);
        if (existing) {
          existing.כמות_כוללת += qty;
          existing.פטיפורים_כוללים += qty * size;
          existing.הזמנות.push(orderRef);
        } else {
          packageMap.set(size, {
            גודל_מארז: size,
            כמות_כוללת: qty,
            פטיפורים_כוללים: qty * size,
            הזמנות: [orderRef],
          });
        }

        // Aggregate petit-four type selections inside this package row
        for (const pf of (item.בחירת_פטיפורים_בהזמנה as any[]) ?? []) {
          const pfQty = Number(pf.כמות) || 0;
          if (pfQty <= 0) continue;
          const pfId   = pf.פטיפור_id as string;
          const pfName = (pf.סוגי_פטיפורים as { שם_פטיפור?: string } | null)?.שם_פטיפור || pfId;
          const existingPf = petitFourMap.get(pfId);
          if (existingPf) {
            existingPf.כמות_כוללת += pfQty;
            const existing = existingPf.הזמנות.find(o => o.id === order.id);
            if (existing) {
              existing.כמות += pfQty;
            } else {
              existingPf.הזמנות.push({ ...orderRef, כמות: pfQty });
            }
          } else {
            petitFourMap.set(pfId, {
              פטיפור_id: pfId,
              שם_פטיפור: pfName,
              כמות_כוללת: pfQty,
              הזמנות: [{ ...orderRef, כמות: pfQty }],
            });
          }
        }

      } else if (item.סוג_שורה === 'מוצר_ידני' || item.סוג_שורה === 'תוספת_תשלום') {
        const name = (item.שם_פריט_מותאם as string | null)?.trim() || '';
        if (!name) continue;
        const key = `${item.סוג_שורה}::${name}`;
        const existing = customMap.get(key);
        if (existing) {
          existing.כמות_כוללת += qty;
          existing.הזמנות.push(orderRef);
        } else {
          customMap.set(key, {
            שם_פריט_מותאם: name,
            סוג_שורה: item.סוג_שורה,
            כמות_כוללת: qty,
            הזמנות: [orderRef],
          });
        }
      }
    }
  }

  return NextResponse.json({
    orders_count: orders?.length ?? 0,
    filters: { date_from: dateFrom, date_to: dateTo, status: statusList },
    products:     Array.from(productMap.values()).sort((a, b) => b.כמות_כוללת - a.כמות_כוללת),
    packages:     Array.from(packageMap.values()).sort((a, b) => a.גודל_מארז - b.גודל_מארז),
    petit_fours:  Array.from(petitFourMap.values()).sort((a, b) => b.כמות_כוללת - a.כמות_כוללת),
    custom_items: Array.from(customMap.values()).sort((a, b) => b.כמות_כוללת - a.כמות_כוללת),
  });
}
