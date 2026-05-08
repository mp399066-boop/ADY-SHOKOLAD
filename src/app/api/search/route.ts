export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';

// GET /api/search?q=...
// Read-only global search across customers, orders, products, packages.
// Auth required. Sanitizes input. Limits 5 per type.

interface SearchResult {
  type: 'customer' | 'order' | 'product' | 'package';
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

  // Parallel queries — customers across 4 fields, then orders/products/packages
  const [custName, custSurname, custPhone, custEmail, ordersRes, productsRes, packagesRes] = await Promise.all([
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

  return NextResponse.json({ results });
}
