// READ-ONLY safety inspection of draft orders.
// No DELETE, no UPDATE, no INSERT.
import { createClient } from '@supabase/supabase-js';

// Credentials come from .env.local — never hardcode the service-role key.
// Run: node --env-file=.env.local scripts/inspect-drafts.mjs

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — run with: node --env-file=.env.local scripts/inspect-drafts.mjs');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const { data: drafts, error } = await sb
  .from('הזמנות')
  .select('id, מספר_הזמנה, סטטוס_הזמנה, סטטוס_תשלום, מקור_ההזמנה, תאריך_יצירה, תאריך_עדכון, סך_הכל_לתשלום, סוג_הזמנה, לקוח_id, לקוחות(שם_פרטי, שם_משפחה, טלפון)')
  .eq('סטטוס_הזמנה', 'טיוטה')
  .order('תאריך_יצירה', { ascending: false });

if (error) {
  console.error('ERROR fetching drafts:', error.message);
  process.exit(1);
}

console.log(`\n=== TOTAL DRAFT ORDERS: ${drafts.length} ===\n`);

if (drafts.length === 0) process.exit(0);

const ids = drafts.map(d => d.id);

const [{ data: payments }, { data: invoices }, { data: deliveries }, { data: items }] = await Promise.all([
  sb.from('תשלומים').select('id, הזמנה_id, אמצעי_תשלום, סטטוס_תשלום, סכום, הערות, תאריך_תשלום').in('הזמנה_id', ids),
  sb.from('חשבוניות').select('id, הזמנה_id, מספר_חשבונית, סטטוס, תאריך_יצירה').in('הזמנה_id', ids),
  sb.from('משלוחים').select('id, הזמנה_id, סטטוס_משלוח, תאריך_משלוח').in('הזמנה_id', ids),
  sb.from('מוצרים_בהזמנה').select('הזמנה_id, id').in('הזמנה_id', ids),
]);

const byOrder = (rows, key='הזמנה_id') => {
  const m = new Map();
  for (const r of rows || []) {
    if (!m.has(r[key])) m.set(r[key], []);
    m.get(r[key]).push(r);
  }
  return m;
};

const pByO = byOrder(payments);
const iByO = byOrder(invoices);
const dByO = byOrder(deliveries);
const itByO = byOrder(items);

let safeCount = 0;
let unsafeCount = 0;
const safeList = [];
const unsafeList = [];

for (const d of drafts) {
  const cust = d.לקוחות;
  const custName = cust ? [cust.שם_פרטי, cust.שם_משפחה].filter(Boolean).join(' ') : '(no customer)';
  const phone = cust?.טלפון || '';
  const created = (d.תאריך_יצירה || '').replace('T', ' ').slice(0, 16);
  const updated = (d.תאריך_עדכון || '').replace('T', ' ').slice(0, 16);
  const pays = pByO.get(d.id) || [];
  const invs = iByO.get(d.id) || [];
  const delivs = dByO.get(d.id) || [];
  const its = itByO.get(d.id) || [];

  const source = d.מקור_ההזמנה || '';
  const isWcSource = /^WooCommerce:/i.test(source);
  // payment link / WC references in payment notes/method
  const hasWcOrLinkInPayments = pays.some(p =>
    /wc_order_id|payplus|payment_link|WooCommerce/i.test(`${p.אמצעי_תשלום || ''} ${p.הערות || ''}`)
  );

  const hasPayments = pays.length > 0;
  const hasInvoices = invs.length > 0;
  const hasDeliveries = delivs.length > 0;
  const hasExternalRef = isWcSource || hasWcOrLinkInPayments;

  const safe = !hasPayments && !hasInvoices && !hasDeliveries && !hasExternalRef;
  if (safe) safeCount++; else unsafeCount++;

  const line = {
    num: d.מספר_הזמנה,
    id: d.id,
    customer: `${custName}${phone ? ' / ' + phone : ''}`,
    created,
    updated,
    total: d.סך_הכל_לתשלום,
    pay_status: d.סטטוס_תשלום,
    type: d.סוג_הזמנה,
    source: source || '(empty)',
    items: its.length,
    payments: pays.length,
    invoices: invs.length,
    deliveries: delivs.length,
    wc_or_link_ref: hasExternalRef,
    payment_notes: pays.map(p => `${p.אמצעי_תשלום}/${p.סטטוס_תשלום}: ${p.הערות || ''}`),
    invoice_nums: invs.map(i => `${i.מספר_חשבונית || '(no#)'} ${i.סטטוס}`),
    delivery_status: delivs.map(x => x.סטטוס_משלוח),
  };

  (safe ? safeList : unsafeList).push(line);
}

const fmt = (row) => {
  console.log(`  #${row.num} | ${row.customer}`);
  console.log(`    id: ${row.id}`);
  console.log(`    created: ${row.created} | updated: ${row.updated}`);
  console.log(`    type: ${row.type} | total: ₪${row.total} | pay_status: ${row.pay_status}`);
  console.log(`    source: ${row.source}`);
  console.log(`    items: ${row.items} | payments: ${row.payments} | invoices: ${row.invoices} | deliveries: ${row.deliveries} | wc/link ref: ${row.wc_or_link_ref}`);
  if (row.payments) console.log(`    payment rows: ${JSON.stringify(row.payment_notes)}`);
  if (row.invoices) console.log(`    invoice rows: ${JSON.stringify(row.invoice_nums)}`);
  if (row.deliveries) console.log(`    delivery rows: ${JSON.stringify(row.delivery_status)}`);
};

console.log(`\n────────  ${unsafeList.length} DRAFTS WITH ATTACHED RECORDS / EXTERNAL REFS (NOT safe to auto-delete)  ────────`);
unsafeList.forEach(fmt);

console.log(`\n────────  ${safeList.length} DRAFTS WITH NO PAYMENTS / INVOICES / DELIVERIES / EXTERNAL REFS (appear safe)  ────────`);
safeList.forEach(fmt);

console.log(`\n=== SUMMARY ===`);
console.log(`  Total drafts:                          ${drafts.length}`);
console.log(`  Drafts WITH payments:                  ${drafts.filter(d => (pByO.get(d.id)||[]).length).length}`);
console.log(`  Drafts WITH invoices:                  ${drafts.filter(d => (iByO.get(d.id)||[]).length).length}`);
console.log(`  Drafts WITH delivery records:          ${drafts.filter(d => (dByO.get(d.id)||[]).length).length}`);
console.log(`  Drafts originating from WooCommerce:   ${drafts.filter(d => /^WooCommerce:/i.test(d.מקור_ההזמנה||'')).length}`);
console.log(`  Drafts safe to delete (no refs):       ${safeCount}`);
console.log(`  Drafts NOT safe (manual review):       ${unsafeCount}`);
