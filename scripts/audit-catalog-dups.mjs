// Read-only audit: focuses ONLY on duplicate ROWS in מוצרים_למכירה.
// Multiple price rows per product are EXPECTED (one per tier) — not a bug.
// Run: node scripts/audit-catalog-dups.mjs
import fs from 'fs';
const TMP = 'C:/Users/user1/AppData/Local/Temp/';
const products = JSON.parse(fs.readFileSync(TMP + 'products.json', 'utf-8'));
const prices = JSON.parse(fs.readFileSync(TMP + 'prices.json', 'utf-8'));

// FK references — order items
let orderItems = [];
try { orderItems = JSON.parse(fs.readFileSync(TMP + 'order-items.json', 'utf-8')); } catch {}

const norm = s => String(s ?? '').trim();

// Index price rows + order-item FK refs per product_id
const pricesByPid = new Map();
const skusByPid = new Map();
for (const r of prices) {
  const pid = r['מוצר_id'];
  if (!pid) continue;
  if (!pricesByPid.has(pid)) pricesByPid.set(pid, []);
  pricesByPid.get(pid).push(r);
  if (r.sku) {
    if (!skusByPid.has(pid)) skusByPid.set(pid, new Set());
    skusByPid.get(pid).add(String(r.sku).trim());
  }
}
const orderRefsByPid = new Map();
for (const oi of orderItems) {
  const pid = oi['מוצר_id'];
  if (!pid) continue;
  orderRefsByPid.set(pid, (orderRefsByPid.get(pid) || 0) + 1);
}

// 1. Duplicate active product NAMES in catalog
console.log('═══════════════════════════════════════════════════════════════');
console.log(' 1. DUPLICATE ACTIVE PRODUCTS  (same שם_מוצר, more than one row)');
console.log('═══════════════════════════════════════════════════════════════');
const byName = new Map();
for (const p of products.filter(x => x['פעיל'])) {
  const k = norm(p['שם_מוצר']);
  if (!byName.has(k)) byName.set(k, []);
  byName.get(k).push(p);
}
const dupNames = [...byName.entries()].filter(([_, v]) => v.length > 1);
console.log(`Found: ${dupNames.length} duplicated names\n`);
for (const [name, list] of dupNames) {
  console.log(`▸ "${name}"  (${list.length} active rows)`);
  for (const p of list) {
    const skus = [...(skusByPid.get(p.id) || new Set())].join(',') || '—';
    const priceCount = (pricesByPid.get(p.id) || []).length;
    const refs = orderRefsByPid.get(p.id) || 0;
    const created = (p['תאריך_יצירה'] || '').slice(0, 10);
    console.log(`    id=${p.id.slice(0,8)}  base=${p['מחיר']}  סוג=${p['סוג_מוצר']}`
              + `  created=${created}  price-rows=${priceCount}`
              + `  order-refs=${refs}  sku(s)=${skus}`);
  }
  console.log();
}
if (dupNames.length === 0) console.log('  (none)\n');

// 2. Duplicate SKUs across DIFFERENT product_ids
console.log('═══════════════════════════════════════════════════════════════');
console.log(' 2. SAME SKU pointing to DIFFERENT product_ids');
console.log('═══════════════════════════════════════════════════════════════');
const pidsBySku = new Map();
for (const r of prices) {
  if (!r.sku || !r['מוצר_id']) continue;
  const k = String(r.sku).trim();
  if (!pidsBySku.has(k)) pidsBySku.set(k, new Set());
  pidsBySku.get(k).add(r['מוצר_id']);
}
const skuDups = [...pidsBySku.entries()].filter(([_, v]) => v.size > 1);
console.log(`Found: ${skuDups.length} SKUs that map to multiple product_ids\n`);
for (const [sku, pids] of skuDups) {
  console.log(`▸ SKU=${sku}`);
  for (const pid of pids) {
    const p = products.find(x => x.id === pid);
    console.log(`    id=${pid.slice(0,8)}  name="${p?.['שם_מוצר']}"  פעיל=${p?.['פעיל']}  base=${p?.['מחיר']}`);
  }
}
if (skuDups.length === 0) console.log('  (none)\n');

// 3. Spotlight on the three products the user named
console.log('═══════════════════════════════════════════════════════════════');
console.log(' 3. SPOTLIGHT — user-named products');
console.log('═══════════════════════════════════════════════════════════════');
const spotlights = ['טארטלט פיצוחים', 'מיני מג\' דובאי', 'מיני מגנום דובאי - פרווה'];
for (const target of spotlights) {
  console.log(`\n▸ "${target}"`);
  const matches = products.filter(p => norm(p['שם_מוצר']) === target);
  if (matches.length === 0) {
    console.log('   no exact match in catalog');
    continue;
  }
  for (const p of matches) {
    const rows = pricesByPid.get(p.id) || [];
    const skus = [...(skusByPid.get(p.id) || new Set())].join(',') || '—';
    const refs = orderRefsByPid.get(p.id) || 0;
    console.log(`   id=${p.id.slice(0,8)}  base=${p['מחיר']}  פעיל=${p['פעיל']}  sku(s)=${skus}`
              + `  order-refs=${refs}`);
    for (const r of rows.sort((a,b) => a.price_type.localeCompare(b.price_type))) {
      console.log(`       ${r.price_type.padEnd(20)} מחיר=${String(r['מחיר']).padEnd(8)} min_qty=${String(r.min_quantity ?? '-').padEnd(4)} vat=${r.includes_vat}`);
    }
  }
}

// 4. Recommendations
console.log('\n═══════════════════════════════════════════════════════════════');
console.log(' 4. RECOMMENDATION (no DB action — just analysis)');
console.log('═══════════════════════════════════════════════════════════════');
for (const [name, list] of dupNames) {
  if (list.length < 2) continue;
  // Recommend the row with MOST order references; tie-break: most price rows; tie-break: earliest created
  const ranked = [...list].sort((a, b) => {
    const refA = orderRefsByPid.get(a.id) || 0;
    const refB = orderRefsByPid.get(b.id) || 0;
    if (refA !== refB) return refB - refA;
    const prA = (pricesByPid.get(a.id) || []).length;
    const prB = (pricesByPid.get(b.id) || []).length;
    if (prA !== prB) return prB - prA;
    return new Date(a['תאריך_יצירה']) - new Date(b['תאריך_יצירה']);
  });
  const keep = ranked[0];
  const others = ranked.slice(1);
  console.log(`▸ "${name}"`);
  console.log(`   KEEP:  ${keep.id.slice(0,8)} (refs=${orderRefsByPid.get(keep.id)||0}, prices=${(pricesByPid.get(keep.id)||[]).length})`);
  for (const o of others) {
    const refs = orderRefsByPid.get(o.id) || 0;
    const tag = refs === 0 ? 'safe to deactivate' : `⚠ has ${refs} order refs — needs migration first`;
    console.log(`   DUP:   ${o.id.slice(0,8)} → ${tag}`);
  }
}
