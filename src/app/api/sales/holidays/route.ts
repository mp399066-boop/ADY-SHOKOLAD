export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireManagementUser, unauthorizedResponse } from '@/lib/auth/requireAuthorizedUser';
import { dbErrorResponse } from '@/lib/api-error';
import { fetchAllPages } from '@/lib/supabase/fetch-all';
import { isCountableOrder, toFinanceOrder, round2, todayJerusalem, type FinanceOrderSource } from '@/lib/finance';
import { holidayDef, holidaySeason, holidayWindow, upcomingHolidays, addDays } from '@/lib/hebrew-holidays';

// GET /api/sales/holidays?holiday=<key>&days=<7..60>
// Read-only. For one holiday:
//   • forecast — what was delivered in the N days up to the holiday LAST year,
//     next to what is already booked for the same days THIS year;
//   • winBack  — customers who ordered for it last year and have not ordered
//     this season yet, with whether they were already contacted.

const ORDER_SELECT = `
  id, מספר_הזמנה, תאריך_הזמנה, תאריך_אספקה, סטטוס_הזמנה, סטטוס_תשלום, סוג_הזמנה, אופן_תשלום,
  סך_הכל_לתשלום, דמי_משלוח, לקוח_id,
  לקוחות(שם_פרטי, שם_משפחה, סוג_לקוח, פטור_ממעמ, טלפון),
  מוצרים_בהזמנה(סוג_שורה, מוצר_id, גודל_מארז, כמות, שם_פריט_מותאם,
    מוצרים_למכירה(שם_מוצר),
    בחירת_פטיפורים_בהזמנה(פטיפור_id, כמות, סוגי_פטיפורים(שם_פטיפור)))
`;

interface Line {
  סוג_שורה: string;
  מוצר_id: string | null;
  גודל_מארז: number | string | null;
  כמות: number | string | null;
  שם_פריט_מותאם: string | null;
  מוצרים_למכירה: { שם_מוצר: string | null } | null;
  בחירת_פטיפורים_בהזמנה: { פטיפור_id: string; כמות: number | string | null; סוגי_פטיפורים: { שם_פטיפור: string | null } | null }[] | null;
}
type OrderRow = FinanceOrderSource & {
  לקוחות: (FinanceOrderSource['לקוחות'] & { טלפון: string | null }) | null;
  מוצרים_בהזמנה: Line[] | null;
};

interface ItemAcc { key: string; label: string; group: 'product' | 'package' | 'petit_four' | 'custom'; last: number; current: number }

function addItems(map: Map<string, ItemAcc>, order: OrderRow, side: 'last' | 'current') {
  const bump = (key: string, label: string, group: ItemAcc['group'], qty: number) => {
    if (!(qty > 0)) return;
    const a = map.get(key) ?? { key, label, group, last: 0, current: 0 };
    a[side] += qty;
    map.set(key, a);
  };
  for (const l of order.מוצרים_בהזמנה ?? []) {
    const qty = Number(l.כמות) || 0;
    if (l.סוג_שורה === 'מוצר' && l.מוצר_id) {
      bump(`p:${l.מוצר_id}`, l.מוצרים_למכירה?.שם_מוצר || 'מוצר', 'product', qty);
    } else if (l.סוג_שורה === 'מארז') {
      const size = Number(l.גודל_מארז) || 0;
      bump(`pkg:${size}`, size ? `מארז ${size} יח׳` : 'מארז', 'package', qty);
      for (const s of l.בחירת_פטיפורים_בהזמנה ?? []) {
        bump(`pf:${s.פטיפור_id}`, s.סוגי_פטיפורים?.שם_פטיפור || 'פטיפור', 'petit_four', (Number(s.כמות) || 0) * qty);
      }
    } else if (l.סוג_שורה === 'מוצר_ידני' && l.שם_פריט_מותאם?.trim()) {
      const name = l.שם_פריט_מותאם.trim();
      bump(`c:${name}`, name, 'custom', qty);
    }
  }
}

function itemsSummary(order: OrderRow): string[] {
  const out: string[] = [];
  for (const l of order.מוצרים_בהזמנה ?? []) {
    const qty = Number(l.כמות) || 0;
    const name = l.סוג_שורה === 'מוצר' ? l.מוצרים_למכירה?.שם_מוצר
      : l.סוג_שורה === 'מארז' ? `מארז ${Number(l.גודל_מארז) || ''} יח׳`
      : l.סוג_שורה === 'מוצר_ידני' ? l.שם_פריט_מותאם : null;
    if (name && qty > 0) out.push(qty > 1 ? `${name} ×${qty}` : name);
  }
  return out;
}

export async function GET(req: NextRequest) {
  const auth = await requireManagementUser();
  if (!auth) return unauthorizedResponse();

  const sp = new URL(req.url).searchParams;
  const today = todayJerusalem();
  const def = holidayDef(sp.get('holiday') ?? '') ?? holidayDef(upcomingHolidays(today)[0].key)!;
  const daysRaw = Number(sp.get('days') ?? 21);
  const days = Number.isInteger(daysRaw) && daysRaw >= 7 && daysRaw <= 60 ? daysRaw : 21;

  const season = holidaySeason(def, today);
  const lastWin = holidayWindow(season.previous, days);
  const thisWin = holidayWindow(season.current, days);
  const subject = `פנייה לקראת ${def.label}`;

  const supabase = createAdminClient();
  const ordersIn = (win: { from: string; to: string }) => fetchAllPages((a, b) => supabase
    .from('הזמנות')
    .select(ORDER_SELECT)
    .gte('תאריך_אספקה', win.from)
    .lte('תאריך_אספקה', win.to)
    .not('סטטוס_הזמנה', 'in', '("בוטלה","טיוטה")')
    .order('id')
    .range(a, b));

  const [lastRes, thisRes, bookedRes, contactRes] = await Promise.all([
    ordersIn(lastWin),
    ordersIn(thisWin),
    // Orders placed since this season's window opened, whatever their date —
    // a customer who already ordered for the holiday is not "to win back".
    fetchAllPages((a, b) => supabase
      .from('הזמנות')
      .select('לקוח_id')
      .gte('תאריך_הזמנה', thisWin.from)
      .not('סטטוס_הזמנה', 'in', '("בוטלה","טיוטה")')
      .order('id')
      .range(a, b)),
    fetchAllPages((a, b) => supabase
      .from('תיעוד_תקשורת')
      .select('לקוח_id, תאריך')
      .eq('נושא', subject)
      .gte('תאריך', `${addDays(thisWin.from, -60)}T00:00:00`)
      .order('id')
      .range(a, b)),
  ]);
  const err = lastRes.error || thisRes.error || bookedRes.error || contactRes.error;
  if (err) return dbErrorResponse(err, 'sales/holidays');

  const last = (lastRes.data as unknown as OrderRow[]).filter(o => isCountableOrder(o));
  const current = (thisRes.data as unknown as OrderRow[]).filter(o => isCountableOrder(o));

  const items = new Map<string, ItemAcc>();
  last.forEach(o => addItems(items, o, 'last'));
  current.forEach(o => addItems(items, o, 'current'));

  // Revenue is the owner's data (/finance is admin-only) — null for staff.
  const isAdmin = auth.role === 'admin';
  const money = (orders: OrderRow[]) => isAdmin ? round2(orders.reduce((s, o) => {
    const f = toFinanceOrder(o);
    return s + (f.barter ? 0 : f.netNoShipping);
  }, 0)) : null;
  const customers = (orders: OrderRow[]) => new Set(orders.map(o => o.לקוח_id).filter(Boolean)).size;

  // ── Win back ──
  const orderedThisSeason = new Set<string>([
    ...current.map(o => o.לקוח_id ?? ''),
    ...(bookedRes.data as { לקוח_id: string | null }[]).map(r => r.לקוח_id ?? ''),
  ]);
  const contacted = new Map<string, string>();
  for (const c of contactRes.data as { לקוח_id: string; תאריך: string }[]) {
    if ((contacted.get(c.לקוח_id) ?? '') < c.תאריך) contacted.set(c.לקוח_id, c.תאריך);
  }
  type WinBack = { customerId: string; name: string; phone: string | null; customerType: string; orders: number; total: number; lastDate: string | null; items: string[]; contactedAt: string | null };
  const winBackMap = new Map<string, WinBack>();
  for (const o of last) {
    const id = o.לקוח_id;
    if (!id || orderedThisSeason.has(id)) continue;
    const f = toFinanceOrder(o);
    const w = winBackMap.get(id) ?? {
      customerId: id, name: f.customerName, phone: o.לקוחות?.טלפון ?? null, customerType: f.customerType,
      orders: 0, total: 0, lastDate: null, items: [], contactedAt: contacted.get(id) ?? null,
    };
    w.orders++;
    w.total = round2(w.total + f.grossTotal);
    if (!w.lastDate || (o.תאריך_אספקה ?? '') > w.lastDate) w.lastDate = o.תאריך_אספקה;
    for (const s of itemsSummary(o)) if (w.items.length < 6 && !w.items.includes(s)) w.items.push(s);
    winBackMap.set(id, w);
  }

  const groupOrder = { package: 0, product: 1, petit_four: 2, custom: 3 } as const;
  return NextResponse.json({
    holiday: { key: def.key, label: def.label, current: season.current, previous: season.previous },
    holidays: upcomingHolidays(today),
    days,
    today,
    windows: { last: lastWin, current: thisWin },
    summary: {
      last: { orders: last.length, customers: customers(last), revenue: money(last) },
      current: { orders: current.length, customers: customers(current), revenue: money(current) },
    },
    items: [...items.values()]
      .map(i => ({ ...i, last: round2(i.last), current: round2(i.current), remaining: round2(Math.max(0, i.last - i.current)) }))
      .sort((a, b) => groupOrder[a.group] - groupOrder[b.group] || b.last - a.last),
    winBack: [...winBackMap.values()].sort((a, b) => b.total - a.total),
    contactSubject: subject,
  });
}
