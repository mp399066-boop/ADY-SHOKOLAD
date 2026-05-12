// Smoke tests for Phase 2.1 conversation memory follow-ups.
// Runs the parser against a series of (lastIntent → text → expected intent)
// triples and prints pass/fail. Uses tsx to load the TS source directly.
//
// Run: npx tsx scripts/test-assistant-context.mjs

import { parseIntent } from '../src/lib/assistant/parser.ts';

let pass = 0, fail = 0;

function check(label, ctx, text, expected) {
  const got = parseIntent(text, ctx);
  const ok = JSON.stringify(matches(got, expected)) === JSON.stringify(true);
  if (ok) {
    pass++;
    console.log(`OK   ${label}`);
  } else {
    fail++;
    console.log(`FAIL ${label}`);
    console.log(`     got:      ${JSON.stringify(got)}`);
    console.log(`     expected: ${JSON.stringify(expected)}`);
  }
}

// Shallow match — every key in expected must equal the value in got.
function matches(got, expected) {
  for (const k of Object.keys(expected)) {
    if (typeof expected[k] === 'object' && expected[k] !== null) {
      for (const k2 of Object.keys(expected[k])) {
        if (JSON.stringify(got?.[k]?.[k2]) !== JSON.stringify(expected[k][k2])) return false;
      }
    } else if (got?.[k] !== expected[k]) return false;
  }
  return true;
}

// ── 1. Refine: "רק" adds a filter ─────────────────────────────────────────
{
  const ctx = { lastIntent: { type: 'find_orders', range: { kind: 'tomorrow' }, filters: {} } };
  check('rak adds urgent filter',
    ctx, 'רק הדחופות',
    { type: 'find_orders', range: { kind: 'tomorrow' }, filters: { urgentOnly: true } });
  check('rak adds unpaid filter',
    ctx, 'רק לא שולמו',
    { type: 'find_orders', range: { kind: 'tomorrow' }, filters: { unpaidOnly: true } });
}

// ── 2. Negate: "לא ה" / "בלי ה" drops a filter ────────────────────────────
{
  const ctx = { lastIntent: { type: 'find_orders', range: { kind: 'today' }, filters: { urgentOnly: true, unpaidOnly: true } } };
  const got = parseIntent('לא הדחופות', ctx);
  check('lo ha-dchufot drops urgentOnly only',
    ctx, 'לא הדחופות',
    { type: 'find_orders', range: { kind: 'today' } });
  // Manually verify urgentOnly was dropped but unpaidOnly stayed.
  const okFilters = !got.filters?.urgentOnly && got.filters?.unpaidOnly === true;
  if (okFilters) { pass++; console.log('OK   lo ha-X preserves other filters'); }
  else { fail++; console.log('FAIL lo ha-X preserves other filters — got:', JSON.stringify(got)); }
}

// ── 3. Send-by-email follow-up ────────────────────────────────────────────
{
  const ctx = { lastIntent: { type: 'find_orders', range: { kind: 'tomorrow' }, filters: { unpaidOnly: true } } };
  check('vetishlachi bemail switches action',
    ctx, 'ותשלחי במייל',
    { type: 'send_orders_report', range: { kind: 'tomorrow' }, filters: { unpaidOnly: true } });
}
{
  const ctx = { lastIntent: { type: 'find_orders', range: { kind: 'today' }, filters: {} } };
  check('vetishlachi with explicit email captures it',
    ctx, 'תשלחי לי את זה למייל test@example.com',
    { type: 'send_orders_report', range: { kind: 'today' }, recipientEmail: 'test@example.com' });
}

// ── 4. Download follow-up ─────────────────────────────────────────────────
{
  const ctx = { lastIntent: { type: 'find_orders', range: { kind: 'week' }, filters: { urgentOnly: true } } };
  check('toridi et zeh switches to download',
    ctx, 'תורידי את זה',
    { type: 'download_orders_report', range: { kind: 'week' }, filters: { urgentOnly: true } });
}

// ── 5. "אותו דבר" replays last intent ─────────────────────────────────────
{
  const ctx = { lastIntent: { type: 'count_orders', range: { kind: 'today' }, filters: {} } };
  check('oto davar replays verbatim',
    ctx, 'אותו דבר',
    { type: 'count_orders', range: { kind: 'today' } });
}

// ── 6. "אותו דבר למחר" replays with new range ─────────────────────────────
{
  const ctx = { lastIntent: { type: 'count_orders', range: { kind: 'today' }, filters: { urgentOnly: true } } };
  check('oto davar le-machar swaps range, keeps filters',
    ctx, 'אותו דבר למחר',
    { type: 'count_orders', range: { kind: 'tomorrow' }, filters: { urgentOnly: true } });
}

// ── 7. Legacy lastIntent (without context wrapper) still works ────────────
{
  const lastIntent = { type: 'find_orders', range: { kind: 'tomorrow' }, filters: {} };
  check('legacy bare lastIntent shape',
    lastIntent, 'רק הדחופות',
    { type: 'find_orders', range: { kind: 'tomorrow' }, filters: { urgentOnly: true } });
}

// ── 8. No context — fresh question parses normally ────────────────────────
{
  check('fresh question with no context parses to base intent',
    null, 'דוח הזמנות למחר',
    { type: 'request_report_action', range: { kind: 'tomorrow' } });
}

// ── 9. Unrelated text doesn't trigger a follow-up ─────────────────────────
{
  const ctx = { lastIntent: { type: 'find_orders', range: { kind: 'today' }, filters: {} } };
  check('unrelated text falls through to fresh parse',
    ctx, 'איזה פטיפורים יש?',
    { type: 'list_petit_four_types' });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
