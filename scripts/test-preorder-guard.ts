// Focused check for the "בהזמנה מראש" exemption in the order stock guard
// (migration 056). Runs checkOrderStockAvailability against a stubbed Supabase
// client, so it exercises the real decision logic with no database.
//
//   npx tsx scripts/check-preorder-guard.ts
//
// Cases:
//   1. stock-tracked item, not enough stock      → blocked
//   2. made-to-order item (בהזמנה מראש), 0 stock → allowed
//   3. mixed order                                → blocked only on the tracked item
//   4. database without migration 056 applied     → pre-056 behaviour (blocked)

import { checkOrderStockAvailability } from '../src/lib/inventory-deduct';

type Row = { id: string; name: string; stock: number; preorder: boolean };

const UNDEFINED_COLUMN = {
  code: '42703',
  message: 'column מוצרים_למכירה.בהזמנה_מראש does not exist',
};

/** Minimal stand-in for the Supabase query builder the guard uses. */
function makeSupabase(rows: Row[], opts: { hasPreorderColumn: boolean }) {
  return {
    from(table: string) {
      const builder: Record<string, unknown> = {};
      let selectedPreorder = false;

      const result = () => {
        if (table === 'system_services') return { data: { is_enabled: true }, error: null };
        if (table === 'תנועות_מלאי') return { data: [], error: null };
        if (selectedPreorder && !opts.hasPreorderColumn) return { data: null, error: UNDEFINED_COLUMN };
        return {
          data: rows.map(r => ({
            id: r.id,
            שם_מוצר: r.name,
            כמות_במלאי: r.stock,
            ...(selectedPreorder ? { בהזמנה_מראש: r.preorder } : {}),
          })),
          error: null,
        };
      };

      const chain = (...names: string[]) => {
        for (const n of names) builder[n] = (...args: unknown[]) => {
          if (n === 'select' && typeof args[0] === 'string' && args[0].includes('בהזמנה_מראש')) {
            selectedPreorder = true;
          }
          return builder;
        };
      };
      chain('select', 'eq', 'in', 'order');
      builder.maybeSingle = async () => result();
      builder.single = async () => result();
      // The guard awaits the builder directly for list queries.
      builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve);
      return builder;
    },
  };
}

const rows: Row[] = [
  { id: 'p-stock',    name: 'עוגת שוקולד (ממלאי)',   stock: 2, preorder: false },
  { id: 'p-preorder', name: 'עוגת חתונה (בהזמנה מראש)', stock: 0, preorder: true  },
];

async function run(
  label: string,
  items: Array<{ id: string; qty: number }>,
  opts: { hasPreorderColumn: boolean },
  expectBlocked: string[],
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = makeSupabase(rows, opts) as any;
  const res = await checkOrderStockAvailability(supabase, {
    orderType: 'רגיל',
    orderId: null,
    items: items.map(i => ({ kind: 'מוצר' as const, id: i.id, qty: i.qty })),
  });
  const blocked = res.ok ? [] : res.shortages.map(s => s.id).sort();
  const expected = [...expectBlocked].sort();
  const pass = JSON.stringify(blocked) === JSON.stringify(expected);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`);
  console.log(`        blocked=[${blocked.join(', ')}]  expected=[${expected.join(', ')}]`);
  return pass;
}

async function main() {
  const results: boolean[] = [];
  results.push(await run('1. stock-tracked, 5 requested of 2 on hand → blocked',
    [{ id: 'p-stock', qty: 5 }], { hasPreorderColumn: true }, ['p-stock']));
  results.push(await run('2. made-to-order, 5 requested of 0 on hand → allowed',
    [{ id: 'p-preorder', qty: 5 }], { hasPreorderColumn: true }, []));
  results.push(await run('3. mixed order → only the stock-tracked item blocks',
    [{ id: 'p-stock', qty: 5 }, { id: 'p-preorder', qty: 5 }], { hasPreorderColumn: true }, ['p-stock']));
  results.push(await run('4. migration 056 not applied → pre-056 behaviour (both blocked)',
    [{ id: 'p-stock', qty: 5 }, { id: 'p-preorder', qty: 5 }], { hasPreorderColumn: false }, ['p-stock', 'p-preorder']));

  const failed = results.filter(r => !r).length;
  console.log(failed === 0 ? '\nAll checks passed.' : `\n${failed} check(s) failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
