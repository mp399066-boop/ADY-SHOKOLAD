export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

// GET /api/search?q=...
//
// Read-only global search. Now covers (ordered as they appear in the UI):
//   - לקוחות           (שם / טלפון / אימייל)
//   - הזמנות            (מספר_הזמנה)
//   - חשבוניות          (מספר_חשבונית + linked order's מספר_הזמנה)
//   - מוצרים_למכירה     (שם_מוצר)
//   - מארזים            (שם_מארז + numeric size match)
//   - סוגי_פטיפורים     (שם_פטיפור)  ← previously missing — owner-reported gap
//   - מלאי_חומרי_גלם    (שם_חומר_גלם)
//   - משלוחים           (כתובת / עיר on the delivery row itself)
//
// Auth required. Sanitizes input. Limits 5 per type.

interface SearchResult {
  type:
    | 'customer'
    | 'order'
    | 'invoice'
    | 'product'
    | 'package'
    | 'petitFour'
    | 'inventory'
    | 'delivery';
  id: string;
  title: string;
  subtitle: string;
  href: string;
  badge?: string;
  meta?: Record<string, string | number | undefined>;
}

function sanitize(q: string): string {
  return q
    .trim()
    .slice(0, 80)
    .replace(/[^֐-׿a-zA-Z0-9@._\s+\-]/g, '');
}

export async function GET(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();

  const url = new URL(req.url);
  const raw = url.searchParams.get('q') || '';
  const q = sanitize(raw);
  if (q.length < 2 || q.length > 80) {
    return NextResponse.json({ results: [] });
  }

  const supabase = createAdminClient();
  const isNumeric = /^\d+$/.test(q);
  const numericVal = isNumeric ? Number(q) : null;
  const like = `%${q}%`;

  // Parallel queries. Each table is hit with a focused .ilike and .limit(5)
  // so the response stays small. Petit-four / inventory / delivery / invoice
  // queries were added in this revision — they're all read-only and respect
  // the same management-user gate as the rest of the route.
  const [
    custName, custSurname, custPhone, custEmail,
    ordersRes,
    productsRes,
    packagesRes,
    petitFoursRes,
    inventoryRes,
    deliveryAddrRes, deliveryCityRes,
    invoiceNumRes, invoiceByOrderNumRes,
  ] = await Promise.all([
    supabase.from('לקוחות').select('id, שם_פרטי, שם_משפחה, טלפון, אימייל').ilike('שם_פרטי', like).limit(5),
    supabase.from('לקוחות').select('id, שם_פרטי, שם_משפחה, טלפון, אימייל').ilike('שם_משפחה', like).limit(5),
    supabase.from('לקוחות').select('id, שם_פרטי, שם_משפחה, טלפון, אימייל').ilike('טלפון', like).limit(5),
    supabase.from('לקוחות').select('id, שם_פרטי, שם_משפחה, טלפון, אימייל').ilike('אימייל', like).limit(5),
    supabase.from('הזמנות')
      .select('id, מספר_הזמנה, תאריך_אספקה, סטטוס_הזמנה, סטטוס_תשלום, לקוחות(שם_פרטי, שם_משפחה)')
      .ilike('מספר_הזמנה', like)
      .neq('סטטוס_הזמנה', 'בוטלה')
      .limit(5),
    supabase.from('מוצרים_למכירה')
      .select('id, שם_מוצר, מחיר, כמות_במלאי, פעיל')
      .ilike('שם_מוצר', like)
      .eq('פעיל', true)
      .limit(5),
    supabase.from('מארזים')
      .select('id, שם_מארז, גודל_מארז, פעיל')
      .ilike('שם_מארז', like)
      .eq('פעיל', true)
      .limit(5),
    supabase.from('סוגי_פטיפורים')
      .select('id, שם_פטיפור, פעיל')
      .ilike('שם_פטיפור', like)
      .eq('פעיל', true)
      .limit(5),
    supabase.from('מלאי_חומרי_גלם')
      .select('id, שם_חומר_גלם, כמות_במלאי, סטטוס_מלאי')
      .ilike('שם_חומר_גלם', like)
      .limit(5),
    // Deliveries: search the row's own address fields. Customer-name and
    // phone hits already surface via the customer + order queries above
    // (they link to the order, which has the delivery on its detail page).
    supabase.from('משלוחים')
      .select('id, הזמנה_id, סטטוס_משלוח, כתובת, עיר, הזמנות(מספר_הזמנה, שם_מקבל, לקוחות(שם_פרטי, שם_משפחה))')
      .ilike('כתובת', like)
      .limit(5),
    supabase.from('משלוחים')
      .select('id, הזמנה_id, סטטוס_משלוח, כתובת, עיר, הזמנות(מספר_הזמנה, שם_מקבל, לקוחות(שם_פרטי, שם_משפחה))')
      .ilike('עיר', like)
      .limit(5),
    // Invoices: by document number, plus a linked-order pass for "find the
    // invoice for order #1234" — the inner-join filter forces a match on
    // the order's מספר_הזמנה.
    supabase.from('חשבוניות')
      .select('id, מספר_חשבונית, סוג_מסמך, סכום, תאריך_יצירה, הזמנות(מספר_הזמנה), לקוחות(שם_פרטי, שם_משפחה)')
      .ilike('מספר_חשבונית', like)
      .limit(5),
    supabase.from('חשבוניות')
      .select('id, מספר_חשבונית, סוג_מסמך, סכום, תאריך_יצירה, הזמנות!inner(מספר_הזמנה), לקוחות(שם_פרטי, שם_משפחה)')
      .ilike('הזמנות.מספר_הזמנה', like)
      .limit(5),
  ]);

  // Dedupe customers by id, max 5
  const seenCust = new Set<string>();
  const customers: Record<string, unknown>[] = [];
  for (const res of [custName, custSurname, custPhone, custEmail]) {
    for (const c of ((res.data || []) as Record<string, unknown>[])) {
      const id = String(c['id']);
      if (seenCust.has(id) || customers.length >= 5) continue;
      seenCust.add(id);
      customers.push(c);
    }
  }

  // If query is fully numeric, also try matching package size exactly
  let packages = ((packagesRes.data || []) as Record<string, unknown>[]).slice();
  if (isNumeric && numericVal != null && packages.length < 5) {
    const { data: byNum } = await supabase
      .from('מארזים')
      .select('id, שם_מארז, גודל_מארז, פעיל')
      .eq('גודל_מארז', numericVal)
      .eq('פעיל', true)
      .limit(5);
    const seenPkg = new Set(packages.map(p => String(p['id'])));
    for (const p of ((byNum || []) as Record<string, unknown>[])) {
      if (seenPkg.has(String(p['id'])) || packages.length >= 5) continue;
      packages.push(p);
    }
  }

  const results: SearchResult[] = [];

  // Customers
  for (const c of customers) {
    const name = `${c['שם_פרטי'] || ''} ${c['שם_משפחה'] || ''}`.trim() || 'ללא שם';
    const phone = (c['טלפון'] as string | null) || '';
    const email = (c['אימייל'] as string | null) || '';
    const sub = [phone, email].filter(Boolean).join(' · ') || '—';
    results.push({
      type: 'customer',
      id: String(c['id']),
      title: name,
      subtitle: sub,
      href: `/customers/${c['id']}`,
      badge: 'לקוח',
    });
  }

  // Orders
  for (const o of ((ordersRes.data || []) as Record<string, unknown>[])) {
    const cust = o['לקוחות'] as { שם_פרטי?: string | null; שם_משפחה?: string | null } | null;
    const custName = cust ? `${cust['שם_פרטי'] || ''} ${cust['שם_משפחה'] || ''}`.trim() : '';
    const date = (o['תאריך_אספקה'] as string | null) || '';
    const status = (o['סטטוס_הזמנה'] as string | null) || '';
    const subParts = [custName, date, status].filter(Boolean);
    results.push({
      type: 'order',
      id: String(o['id']),
      title: `#${o['מספר_הזמנה']}`,
      subtitle: subParts.join(' · ') || '—',
      href: `/orders/${o['id']}`,
      badge: 'הזמנה',
      meta: { status, date },
    });
  }

  // Products (no /products/[id] route — link to /products)
  for (const p of ((productsRes.data || []) as Record<string, unknown>[])) {
    const price = Number(p['מחיר']) || 0;
    const stock = Number(p['כמות_במלאי']) || 0;
    results.push({
      type: 'product',
      id: String(p['id']),
      title: String(p['שם_מוצר']),
      subtitle: `₪${price.toFixed(2)} · ${stock} יח׳ במלאי`,
      href: '/products',
      badge: 'מוצר',
      meta: { stock },
    });
  }

  // Packages (no dedicated route — fallback to /products)
  for (const k of packages) {
    results.push({
      type: 'package',
      id: String(k['id']),
      title: String(k['שם_מארז']),
      subtitle: `${k['גודל_מארז']} יח׳`,
      href: '/products',
      badge: 'מארז',
    });
  }

  // Petit-four types — owner-reported gap. Routes to /products since
  // petit-fours are managed alongside the product / package catalogue.
  for (const pf of ((petitFoursRes.data || []) as Record<string, unknown>[])) {
    results.push({
      type: 'petitFour',
      id: String(pf['id']),
      title: String(pf['שם_פטיפור']),
      subtitle: 'סוג פטיפור',
      href: '/products',
      badge: 'פטיפור',
    });
  }

  // Raw materials inventory.
  for (const inv of ((inventoryRes.data || []) as Record<string, unknown>[])) {
    const stock = Number(inv['כמות_במלאי']) || 0;
    const status = (inv['סטטוס_מלאי'] as string) || '';
    results.push({
      type: 'inventory',
      id: String(inv['id']),
      title: String(inv['שם_חומר_גלם']),
      subtitle: [`${stock} יח׳ במלאי`, status].filter(Boolean).join(' · '),
      href: '/inventory',
      badge: 'מלאי',
      meta: { stock, status },
    });
  }

  // Deliveries — dedupe across the כתובת + עיר queries by id, max 5.
  const seenDel = new Set<string>();
  type DeliveryRow = {
    id: unknown;
    הזמנה_id: unknown;
    סטטוס_משלוח?: string;
    כתובת?: string | null;
    עיר?: string | null;
    הזמנות?: { מספר_הזמנה?: string; שם_מקבל?: string | null; לקוחות?: { שם_פרטי?: string; שם_משפחה?: string } | null } | null;
  };
  const deliveries: DeliveryRow[] = [];
  for (const res of [deliveryAddrRes, deliveryCityRes]) {
    for (const d of ((res.data || []) as DeliveryRow[])) {
      const id = String(d.id);
      if (seenDel.has(id) || deliveries.length >= 5) continue;
      seenDel.add(id);
      deliveries.push(d);
    }
  }
  for (const d of deliveries) {
    const order = d.הזמנות || null;
    const cust = order?.לקוחות || null;
    const recipient = order?.שם_מקבל
      || (cust ? `${cust.שם_פרטי || ''} ${cust.שם_משפחה || ''}`.trim() : '')
      || 'לקוח';
    const addr = [d.כתובת, d.עיר].filter(Boolean).join(', ');
    results.push({
      type: 'delivery',
      id: String(d.id),
      title: recipient,
      subtitle: [addr, order?.מספר_הזמנה && `#${order.מספר_הזמנה}`, d.סטטוס_משלוח].filter(Boolean).join(' · ') || '—',
      href: '/deliveries',
      badge: 'משלוח',
      meta: { status: d.סטטוס_משלוח || '' },
    });
  }

  // Invoices — dedupe across the two passes by id, max 5.
  const seenInv = new Set<string>();
  type InvoiceRow = {
    id: unknown;
    מספר_חשבונית?: string;
    סוג_מסמך?: string | null;
    סכום?: number | null;
    הזמנות?: { מספר_הזמנה?: string } | null;
    לקוחות?: { שם_פרטי?: string; שם_משפחה?: string } | null;
  };
  const invoices: InvoiceRow[] = [];
  for (const res of [invoiceNumRes, invoiceByOrderNumRes]) {
    for (const inv of ((res.data || []) as InvoiceRow[])) {
      const id = String(inv.id);
      if (seenInv.has(id) || invoices.length >= 5) continue;
      seenInv.add(id);
      invoices.push(inv);
    }
  }
  for (const inv of invoices) {
    const cust = inv.לקוחות || null;
    const custName = cust ? `${cust.שם_פרטי || ''} ${cust.שם_משפחה || ''}`.trim() : '';
    const orderNum = inv.הזמנות?.מספר_הזמנה ? `#${inv.הזמנות.מספר_הזמנה}` : '';
    const docType = (inv.סוג_מסמך as string) || 'מסמך';
    const amount = typeof inv.סכום === 'number' ? `₪${inv.סכום.toFixed(2)}` : '';
    results.push({
      type: 'invoice',
      id: String(inv.id),
      title: inv.מספר_חשבונית ? String(inv.מספר_חשבונית) : '—',
      subtitle: [docType, custName, orderNum, amount].filter(Boolean).join(' · ') || '—',
      href: '/invoices',
      badge: 'מסמך',
    });
  }

  return NextResponse.json({ results });
}
