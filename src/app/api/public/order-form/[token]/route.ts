export const dynamic = 'force-dynamic';

// PUBLIC route — no login. Accepts a request from the customer order form
// (/order-form/<token>). The token is the form's current random link token
// from system_config; the owner can change or close it at any time.
//
// It only ever INSERTS one row into בקשות_הזמנה (a request waiting for the
// owner). It never touches customers/orders and returns no CRM data. Prices
// are taken from the catalog on the server — the client sends ids and
// quantities only. Spam guards: hidden honeypot field, minimum fill time,
// and per-phone / global rate limits counted in the table itself.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { orderFormSchema } from '@/lib/order-form';
import { currentFormToken, tokensMatch, publicCatalog } from '@/lib/order-form-server';
import { loadSalesCatalog } from '@/lib/quotes-server';
import { computeQuoteTotals, type QuoteLine } from '@/lib/quotes';
import { todayJerusalem } from '@/lib/finance';
import { addDays } from '@/lib/hebrew-holidays';
import { waNumber } from '@/lib/whatsapp';
import { formatCurrency } from '@/lib/utils';
import { notifyOwner } from '@/lib/owner-notify';
import { appBaseUrl } from '@/lib/app-url';

const MIN_FILL_MS = 4_000;
const PER_PHONE_PER_HOUR = 3;
const GLOBAL_PER_10_MIN = 30;

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: NextRequest, props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const supabase = createAdminClient();
  if (!tokensMatch(token, await currentFormToken(supabase))) return fail('הטופס סגור כרגע. אפשר לפנות אלינו בטלפון.', 404);

  const parsed = orderFormSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'נתונים לא תקינים');
  const f = parsed.data;

  // Bots fill every field and submit instantly — answer "ok" and keep nothing.
  if (f.website || (f.startedAt && Date.now() - f.startedAt < MIN_FILL_MS)) {
    console.warn('[public/order-form] dropped as spam');
    return NextResponse.json({ ok: true });
  }

  const today = todayJerusalem();
  if (f.תאריך_אספקה < today || f.תאריך_אספקה > addDays(today, 365)) return fail('תאריך האספקה לא תקין');

  // Rate limits.
  const phone = waNumber(f.טלפון)!;
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const [byPhone, recent] = await Promise.all([
    supabase.from('בקשות_הזמנה').select('id', { count: 'exact', head: true }).eq('טלפון', phone).gte('תאריך_יצירה', hourAgo),
    supabase.from('בקשות_הזמנה').select('id', { count: 'exact', head: true }).gte('תאריך_יצירה', tenMinAgo),
  ]);
  if (byPhone.error || recent.error) {
    console.error('[public/order-form] rate check failed', { code: (byPhone.error || recent.error)?.code });
    return fail('אירעה שגיאה, אפשר לנסות שוב בעוד רגע', 500);
  }
  if ((byPhone.count ?? 0) >= PER_PHONE_PER_HOUR || (recent.count ?? 0) >= GLOBAL_PER_10_MIN) {
    return fail('התקבלו כבר כמה בקשות. ניצור קשר בהקדם, או שאפשר להתקשר אלינו.', 429);
  }

  // Lines priced from the catalog.
  const { data: catalog, error: catErr } = await loadSalesCatalog(supabase);
  if (catErr || !catalog) {
    console.error('[public/order-form] catalog failed', { code: catErr?.code });
    return fail('אירעה שגיאה, אפשר לנסות שוב בעוד רגע', 500);
  }
  const pub = publicCatalog(catalog);
  const products = new Map(pub.products.map(p => [p.id, p]));
  const packages = new Map(pub.packages.map(p => [p.id, p]));
  const lines: QuoteLine[] = [];
  for (const it of f.פריטים) {
    if (it.סוג === 'מוצר') {
      const p = products.get(it.id);
      if (!p) return fail('אחד המוצרים כבר לא זמין. יש לרענן את הדף ולבחור שוב.');
      lines.push({ סוג: 'מוצר', מוצר_id: p.id, גודל_מארז: null, שם: p.name, כמות: it.כמות, מחיר_ליחידה: p.price, הערה: it.הערה });
    } else {
      const p = packages.get(it.id);
      if (!p) return fail('אחד המארזים כבר לא זמין. יש לרענן את הדף ולבחור שוב.');
      lines.push({ סוג: 'מארז', מוצר_id: null, גודל_מארז: p.size, שם: p.name, כמות: it.כמות, מחיר_ליחידה: p.price, הערה: it.הערה });
    }
  }
  const { total } = computeQuoteTotals(lines, 'ללא', 0, 0);
  const isDelivery = f.סוג_אספקה === 'משלוח';

  const { data: row, error } = await supabase.from('בקשות_הזמנה').insert({
    שם_מלא: f.שם_מלא,
    טלפון: phone,
    אימייל: f.אימייל,
    פריטים: lines,
    סכום_משוער: total,
    סוג_אספקה: f.סוג_אספקה,
    תאריך_אספקה: f.תאריך_אספקה,
    שם_מקבל: isDelivery ? f.שם_מקבל : null,
    טלפון_מקבל: isDelivery && f.טלפון_מקבל ? waNumber(f.טלפון_מקבל) : null,
    כתובת: isDelivery ? f.כתובת : null,
    עיר: isDelivery ? f.עיר : null,
    ברכה: f.ברכה,
    הערות: f.הערות,
  }).select('id').single();
  if (error) {
    console.error('[public/order-form] insert failed', { code: error.code });
    return fail('הבקשה לא נשמרה, אפשר לנסות שוב בעוד רגע', 500);
  }

  console.log('[public/order-form] request received', { id: row.id, items: lines.length });
  await notifyOwner({
    kind: 'order_form_request',
    subject: 'בקשת הזמנה חדשה מהטופס',
    title: 'הגיעה בקשת הזמנה חדשה מהטופס',
    rows: [
      ['שם', f.שם_מלא],
      ['טלפון', f.טלפון],
      ['תאריך', f.תאריך_אספקה.split('-').reverse().join('/')],
      ['אספקה', f.סוג_אספקה],
      ['פריטים', lines.map(l => `${l.שם} ×${l.כמות}`).join('\n')],
      ['סכום משוער', formatCurrency(total)],
    ],
    link: { href: `${appBaseUrl()}/sales?tab=requests`, label: 'לטיפול בבקשה' },
  });
  return NextResponse.json({ ok: true });
}
