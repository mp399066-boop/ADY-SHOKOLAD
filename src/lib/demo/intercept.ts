// ─────────────────────────────────────────────────────────────────────────────
// DEMO MODE — client-side fetch interceptor.
//
// When demo mode is active (?demo=1, persisted per-tab in sessionStorage), this
// patches window.fetch so EVERY /api/* request is answered locally from the fake
// demo dataset:
//
//   • GET  → fake data from the demo store.
//   • POST/PATCH/PUT/DELETE → a synthetic success that NEVER touches the network,
//                             so it is impossible to write demo data to the DB.
//   • Any /api/* path we didn't explicitly mock → empty {data:[]} (default-deny),
//                             so no real customer/business data can ever leak.
//
// Non-/api requests (assets, direct Supabase reads such as the business logo)
// pass straight through untouched. This file is only loaded in the browser via
// the DemoBadge client component; it has no effect on the server.
// ─────────────────────────────────────────────────────────────────────────────

import {
  getDemoStore, DEMO_PRIMARY_ORDER_ID, DEMO_PRIMARY_ORDER_ITEMS,
} from './data';

const FLAG_KEY = 'adi_demo';

export function isDemoActive(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const param = new URL(window.location.href).searchParams.get('demo');
    if (param === '1') sessionStorage.setItem(FLAG_KEY, '1');
    if (param === '0') sessionStorage.removeItem(FLAG_KEY);
    return sessionStorage.getItem(FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

export function exitDemo(): void {
  try { sessionStorage.removeItem(FLAG_KEY); } catch { /* ignore */ }
}

// ─── Response helpers ────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function pathOf(input: RequestInfo | URL): string {
  try {
    const raw = typeof input === 'string' ? input
      : input instanceof URL ? input.href
      : input.url;
    return new URL(raw, window.location.origin).pathname;
  } catch {
    return String(input);
  }
}

function searchOf(input: RequestInfo | URL): URLSearchParams {
  try {
    const raw = typeof input === 'string' ? input
      : input instanceof URL ? input.href
      : input.url;
    return new URL(raw, window.location.origin).searchParams;
  } catch {
    return new URLSearchParams();
  }
}

// ─── Rich object builders ────────────────────────────────────────────────────

function fullCustomer(id: string) {
  const s = getDemoStore();
  const c = s.customers.find(x => x.id === id);
  if (!c) return null;
  const orders = s.orders.filter(o => o.לקוח_id === id);
  const invoices = id === 'demo-cust-1' ? [{
    id: 'demo-inv-1', הזמנה_id: DEMO_PRIMARY_ORDER_ID, לקוח_id: id,
    מספר_חשבונית: 'DEMO-2001', קישור_חשבונית: null, סכום: 581, סטטוס: 'הופקה',
    סוג_מסמך: 'invoice_receipt', מקור: 'demo', הערה: null, נוצר_על_ידי: null,
    תאריך_יצירה: new Date().toISOString(),
  }] : [];
  const communication = id === 'demo-cust-1' ? [{
    id: 'demo-comm-1', לקוח_id: id, סוג: 'וואטסאפ' as const,
    תוכן: 'ההזמנה שלך התקבלה ונמצאת בהכנה 🍫 (הודעת הדגמה)',
    תאריך: new Date().toISOString(), תאריך_יצירה: new Date().toISOString(),
    כיוון: 'יוצא',
  }] : [];
  return {
    ...c,
    הזמנות: orders,
    חשבוניות: invoices,
    קבצים: [],
    תיעוד_תקשורת: communication,
  };
}

function fullOrder(id: string) {
  const s = getDemoStore();
  const o = s.orders.find(x => x.id === id);
  if (!o) return null;
  const customer = s.customers.find(c => c.id === o.לקוח_id) || null;
  const items = id === DEMO_PRIMARY_ORDER_ID
    ? s.primaryOrderItems
    : [];
  return {
    ...o,
    לקוחות: customer,
    מוצרים_בהזמנה: items,
    משלוח: o.סוג_אספקה === 'משלוח' ? {
      סטטוס_משלוח: 'ממתין', שם_שליח: '', עיר: o.עיר || 'תל אביב',
      courier_id: null, שליחים: null,
    } : null,
    תשלומים: [],
    חשבוניות: id === DEMO_PRIMARY_ORDER_ID ? [{
      id: 'demo-inv-1', מספר_חשבונית: 'DEMO-2001', סכום: 581, סטטוס: 'הופקה',
      קישור_חשבונית: null, סוג_מסמך: 'invoice_receipt',
      תאריך_יצירה: new Date().toISOString(),
    }] : [],
  };
}

function todayDeliveries() {
  const s = getDemoStore();
  return s.orders
    .filter(o => o.סוג_אספקה === 'משלוח' && o.תאריך_אספקה)
    .slice(0, 3)
    .map((o, i) => ({
      id: `demo-deliv-${i + 1}`, הזמנה_id: o.id,
      סטטוס_משלוח: i === 0 ? 'נמסר' : 'ממתין',
      שם_שליח: null, טלפון_שליח: null,
      כתובת: o.כתובת_מקבל_ההזמנה || 'רחוב הדגמה 1', עיר: o.עיר || 'תל אביב',
      הוראות_משלוח: null, תאריך_משלוח: o.תאריך_אספקה, שעת_משלוח: o.שעת_אספקה,
      הערות: null, courier_id: null, delivery_token: null, delivered_at: null,
      whatsapp_sent_at: null, email_sent_at: null,
      הזמנות: {
        id: o.id, מספר_הזמנה: o.מספר_הזמנה, שם_מקבל: o.שם_מקבל,
        טלפון_מקבל: o.טלפון_מקבל,
        לקוחות: o.לקוחות ? { שם_פרטי: o.לקוחות.שם_פרטי, שם_משפחה: o.לקוחות.שם_משפחה } : null,
      },
      שליחים: null,
    }));
}

// ─── Mutations (writes) — applied to the in-memory store only ─────────────────

async function applyWrite(path: string, init?: RequestInit) {
  const s = getDemoStore();
  let body: Record<string, unknown> = {};
  try { body = init?.body ? JSON.parse(String(init.body)) : {}; } catch { /* ignore */ }

  // PATCH /api/orders/:id  → status / payment / field updates
  const orderMatch = path.match(/^\/api\/orders\/([^/]+)$/);
  if (orderMatch) {
    const o = s.orders.find(x => x.id === orderMatch[1]);
    if (o) Object.assign(o, body);
    return json({ ok: true, data: o ?? body });
  }

  // Everything else: synthetic success echoing the body with a fake id.
  return json({ ok: true, data: { id: `demo-new-${Date.now()}`, ...body } });
}

// ─── Router ──────────────────────────────────────────────────────────────────

async function route(input: RequestInfo | URL, init?: RequestInit): Promise<Response | null> {
  const path = pathOf(input);
  if (!path.startsWith('/api/')) return null; // not ours — pass through

  const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const s = getDemoStore();

  // Writes never hit the network.
  if (method !== 'GET' && method !== 'HEAD') {
    return applyWrite(path, init);
  }

  const search = searchOf(input);

  // ── GET routes ──
  if (path === '/api/dashboard') return json({ data: s.stats });

  if (path === '/api/customers') {
    const q = (search.get('search') || '').trim();
    const type = search.get('type') || '';
    let list = s.customers;
    if (q) list = list.filter(c => `${c.שם_פרטי} ${c.שם_משפחה} ${c.טלפון} ${c.אימייל}`.includes(q));
    if (type) list = list.filter(c => c.סוג_לקוח === type || c.סוג_לקוח.startsWith(type));
    if (search.get('sort') === 'name') {
      list = [...list].sort((a, b) => `${a.שם_פרטי}${a.שם_משפחה}`.localeCompare(`${b.שם_פרטי}${b.שם_משפחה}`, 'he'));
    }
    return json({ data: list, count: list.length });
  }

  const custCredit = path.match(/^\/api\/customers\/([^/]+)\/credit$/);
  if (custCredit) return json({ balance: 0, transactions: [] });

  const custOne = path.match(/^\/api\/customers\/([^/]+)$/);
  if (custOne) {
    const data = fullCustomer(custOne[1]);
    return json({ data }, data ? 200 : 404);
  }

  const orderOne = path.match(/^\/api\/orders\/([^/]+)$/);
  if (orderOne) {
    const data = fullOrder(orderOne[1]);
    return json({ data }, data ? 200 : 404);
  }

  if (path === '/api/orders') {
    const filter = search.get('filter');
    let list = s.orders;
    if (filter === 'today') {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
      list = list.filter(o => o.תאריך_אספקה === today);
    }
    return json({ data: list, count: list.length });
  }

  if (path === '/api/inventory') return json({ data: s.rawMaterials });
  if (path === '/api/products') return json({ data: s.products });
  if (path === '/api/petit-four-types') return json({ data: [] });
  if (path === '/api/couriers') return json({ data: s.couriers });
  if (path === '/api/recipes') return json({ data: [] });
  if (path === '/api/deliveries') return json({ data: todayDeliveries() });

  // Default-deny: any other /api path returns empty so no real data leaks.
  return json({ data: [], count: 0 });
}

// ─── Installation ────────────────────────────────────────────────────────────

let installed = false;

export function installDemoInterceptor(): void {
  if (typeof window === 'undefined' || installed) return;
  if (!isDemoActive()) return;
  installed = true;

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // Re-check each call so ?demo=0 / exit takes effect without a reload.
    if (sessionStorage.getItem(FLAG_KEY) === '1') {
      try {
        const handled = await route(input, init);
        if (handled) return handled;
      } catch (err) {
        console.warn('[demo] interceptor error, passing through:', err);
      }
    }
    return realFetch(input, init);
  };
  console.info('%c● מצב הדגמה פעיל — נתוני דמו בלבד, ללא גישה לנתונים אמיתיים',
    'color:#8B5E34;font-weight:600');
}
