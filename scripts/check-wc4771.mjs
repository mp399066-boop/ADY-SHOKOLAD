// Confirm exact root cause: מזהה_לובהבל column and name normalization
import { createClient } from '@supabase/supabase-js';

// Credentials come from .env.local — never hardcode the service-role key.
// Run: node --env-file=.env.local scripts/check-wc4771.mjs

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — run with: node --env-file=.env.local scripts/check-wc4771.mjs');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

// 1. Does מזהה_לובהבל column exist in מוצרים_למכירה?
console.log('\n=== Does מזהה_לובהבל exist? ===');
const { data: test1, error: err1 } = await sb.from('מוצרים_למכירה')
  .select('id, מזהה_לובהבל').limit(1);
console.log(`  data: ${JSON.stringify(test1)}`);
console.log(`  error: ${err1?.message ?? 'none'}`);

// 2. Does sku column exist?
const { data: test2, error: err2 } = await sb.from('מוצרים_למכירה')
  .select('id, sku').limit(1);
console.log(`\n=== sku column ===\n  error: ${err2?.message ?? 'none'}`);
if (test2?.[0]) console.log(`  sample: id=${test2[0].id.slice(0,8)} sku=${test2[0].sku}`);

// 3. Product "מגנום קראנץ'" - check exact bytes/chars in the name
const { data: magnum } = await sb.from('מוצרים_למכירה')
  .select('id, שם_מוצר, sku, כמות_במלאי').ilike('שם_מוצר', '%קראנץ%');
console.log('\n=== Products matching קראנץ ===');
for (const p of magnum||[]) {
  const nameBuf = [...p.שם_מוצר].map(c => c.codePointAt(0).toString(16).padStart(4,'0')).join(' ');
  console.log(`  ${p.id.slice(0,8)} | "${p.שם_מוצר}" stock:${p.כמות_במלאי} sku:${p.sku}`);
  console.log(`    codepoints: ${nameBuf}`);
}

// 4. Check WC order item notes to find the exact name that was sent
const { data: item } = await sb.from('מוצרים_בהזמנה')
  .select('הערות_לשורה').eq('הזמנה_id', '428cb8fe-793a-4c98-be8d-62dfa4640af5').single();
if (item?.הערות_לשורה) {
  const namePart = item.הערות_לשורה.replace('מוצר מהאתר: ', '').replace(/ \(SKU.*\)$/, '');
  const nameBuf = [...namePart].map(c => c.codePointAt(0).toString(16).padStart(4,'0')).join(' ');
  console.log(`\n=== WC product name from item note ===`);
  console.log(`  raw: "${item.הערות_לשורה}"`);
  console.log(`  name: "${namePart}"`);
  console.log(`  codepoints: ${nameBuf}`);
}

// 5. SKU uniqueness — does sku column have a unique constraint?
// Test by trying to insert a product with a duplicate sku (dry test — select to see if any sku is set)
const { data: skuProds } = await sb.from('מוצרים_למכירה').select('id, שם_מוצר, sku').not('sku', 'is', null).limit(5);
console.log('\n=== Products with non-null sku ===');
if (skuProds?.length === 0) console.log('  None — sku column is always null');
for (const p of skuProds||[]) console.log(`  ${p.id.slice(0,8)} sku:"${p.sku}" "${p.שם_מוצר}"`);
