import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// MARKETING DEMO RECORDING
//
// Records a short, readable walkthrough of the CRM using ONLY fake demo data
// (demo mode = ?demo=1, served entirely client-side — no real data, no DB
// writes). ?recording=1 keeps demo mode on but hides the on-screen demo badge.
// The resulting .webm is finalized to demo-video/crm-demo.webm by
// scripts/finalize-demo-video.mjs.
//
// Prereqs (see scripts/DEMO_README.md):
//   1. npm run dev          (app on http://localhost:3000)
//   2. npm run demo:login   (one-time Google login → tests/.auth/state.json)
//
// Run:  npm run demo:video   (record + finalize/convert)
// ─────────────────────────────────────────────────────────────────────────────

const BEAT = 1400; // readable pacing for a screen recording
async function beat(page: Page, ms = BEAT) { await page.waitForTimeout(ms); }

// Keep ?demo=1&recording=1 on every navigation so demo mode + hidden badge
// survive reloads.
async function go(page: Page, path: string) {
  const sep = path.includes('?') ? '&' : '?';
  await page.goto(`${path}${sep}demo=1&recording=1`, { waitUntil: 'networkidle' });
}

test('Adi Chocolate CRM — marketing demo flow (fake data)', async ({ page }) => {
  // ── 1. Dashboard in demo mode ────────────────────────────────────────────
  await go(page, '/dashboard');

  // Fail fast with a clear message if the session is missing/expired.
  if (page.url().includes('/login')) {
    throw new Error(
      'Not authenticated — run "npm run demo:login" first to save tests/.auth/state.json.',
    );
  }

  await expect(page.getByText('דשבורד')).toBeVisible();
  await beat(page, 2400);

  // ── 2. Customers page (fake customers) ───────────────────────────────────
  await go(page, '/customers');
  await expect(page.getByText('רבקה כהן')).toBeVisible();
  await beat(page, 1800);

  // ── 3 & 4. Open the fake customer profile (רבקה כהן) ──────────────────────
  await page.getByText('רבקה כהן').first().click();
  await expect(page.getByRole('heading', { name: 'רבקה כהן' })).toBeVisible();
  await beat(page, 2400);

  // ── 5 & 6. Open the demo order; show products + total ─────────────────────
  await page.getByText('DEMO-1001').first().click();
  await page.waitForURL('**/orders/demo-order-1**');
  await expect(page.getByText('מארז פטיפורים 16 יחידות').first()).toBeVisible();
  await beat(page, 2600);

  // ── 7. Change order status to "בהכנה" ─────────────────────────────────────
  const statusCard = page.locator('div', { has: page.getByText('סטטוס הזמנה', { exact: true }) }).last();
  const prep = statusCard.getByText('בהכנה', { exact: true }).first();
  if (await prep.count()) {
    await prep.click();
  } else {
    // Fallback: any "בהכנה" control on the page.
    await page.getByText('בהכנה', { exact: true }).first().click();
  }
  await beat(page, 2400);

  // ── 8. Inventory / demo stock effect (read-only, fake stock) ─────────────
  await go(page, '/inventory');
  await beat(page, 2200);

  // ── 9. Deliveries / order summary (fake data only) ───────────────────────
  await go(page, '/deliveries');
  await beat(page, 2000);

  // ── 10. End on a clean dashboard ─────────────────────────────────────────
  await go(page, '/dashboard');
  await beat(page, 2800);
});
