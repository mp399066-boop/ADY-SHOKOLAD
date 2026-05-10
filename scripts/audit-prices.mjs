// Read-only diagnostic. Does not write to DB. Run: node scripts/audit-prices.mjs
import fs from 'fs';
const products = JSON.parse(fs.readFileSync('C:/Users/user1/AppData/Local/Temp/products.json', 'utf-8'));
const prices = JSON.parse(fs.readFileSync('C:/Users/user1/AppData/Local/Temp/prices.json', 'utf-8'));

console.log('=== PRODUCTS ===');
console.log('total:', products.length, ' active:', products.filter(p => p.פעיל).length);

// duplicate product names (active only)
const byName = new Map();
for (const p of products.filter(x => x.פעיל)) {
  const k = String(p['שם_מוצר']).trim();
  if (!byName.has(k)) byName.set(k, []);
  byName.get(k).push(p);
}
const dups = [...byName.entries()].filter(([_, v]) => v.length > 1);
console.log('\n=== DUPLICATE ACTIVE PRODUCT NAMES ===');
console.log('count:', dups.length);
for (const [name, list] of dups) {
  console.log(`\n  "${name}"  ×${list.length}`);
  for (const p of list) {
    console.log(`    id=${p.id.slice(0,8)}  base=${p['מחיר']}  סוג=${p['סוג_מוצר']}`);
  }
}

console.log('\n=== PRICE LIST ===');
console.log('total rows:', prices.length, ' active:', prices.filter(p => p.פעיל).length);

// price-types coverage per product (active rows only)
const byProduct = new Map();
for (const r of prices.filter(x => x.פעיל)) {
  const pid = r['מוצר_id'] || `__snapshot__${r.product_name_snapshot}`;
  if (!byProduct.has(pid)) byProduct.set(pid, []);
  byProduct.get(pid).push(r);
}

// products that have business_fixed but no business_quantity
const productsByName = name => products.filter(p => String(p['שם_מוצר']).trim() === name);
const missing = [];
for (const [pid, rows] of byProduct) {
  const types = new Set(rows.map(r => r.price_type));
  const name = rows[0].product_name_snapshot || products.find(p => p.id === pid)?.['שם_מוצר'] || '?';
  if (types.has('business_fixed') && !types.has('business_quantity')) {
    missing.push({ pid, name, sku: rows[0].sku, types: [...types] });
  }
}
console.log('\n=== PRODUCTS WITH business_fixed BUT NO business_quantity ===');
console.log('count:', missing.length);
for (const m of missing) {
  console.log(`  ${m.pid.slice(0,8)}  sku=${m.sku || '-'}  "${m.name}"   types=${m.types.join(',')}`);
}

console.log('\n=== TARTLET PITSUHIM DEEP DIVE ===');
const tartProducts = products.filter(p => String(p['שם_מוצר']).includes('טארטלט פיצוחים'));
for (const p of tartProducts) {
  console.log(`\nproduct ${p.id.slice(0,8)}  base=${p['מחיר']}  פעיל=${p['פעיל']}  סוג=${p['סוג_מוצר']}`);
  const rows = prices.filter(r => r['מוצר_id'] === p.id);
  for (const r of rows.sort((a,b) => a.price_type.localeCompare(b.price_type))) {
    console.log(`  ${r.price_type.padEnd(20)}  מחיר=${r['מחיר']}  min_qty=${r.min_quantity}  vat=${r.includes_vat}  פעיל=${r['פעיל']}  sku=${r.sku}`);
  }
}

console.log('\n=== MIN_QUANTITY DISTRIBUTION FOR business_quantity ===');
const bqRows = prices.filter(r => r.price_type === 'business_quantity' && r.פעיל);
const bqByMin = {};
for (const r of bqRows) {
  const k = String(r.min_quantity);
  bqByMin[k] = (bqByMin[k] || 0) + 1;
}
for (const [k, v] of Object.entries(bqByMin).sort()) {
  console.log(`  min_qty=${k}: ${v} rows`);
}
const bq1 = bqRows.filter(r => r.min_quantity === 1);
console.log(`\n  rows with min_qty=1 (suspect — Excel sometimes puts "1" instead of empty for non-quantity tiers):`);
for (const r of bq1) {
  console.log(`    sku=${r.sku || '-'}   "${r.product_name_snapshot}"   מחיר=${r['מחיר']}`);
}
