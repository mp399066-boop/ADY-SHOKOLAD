import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// MARKETING DEMO RECORDING
//
// Records a short, readable walkthrough of the CRM using ONLY fake demo data
// (demo mode = ?demo=1, served entirely client-side — no real data, no DB
// writes). The resulting .webm video is written under tests/demo-output/.
//
// Prereqs (see scripts/DEMO_README.md):
//   1. npm run dev                 (app on http://localhost:3000)
//   2. A saved auth session at tests/.auth/state.json (login is Google OAuth).
//
// Run:
//   npx playwright test --config=playwright.config.ts
// ─────────────────────────────────────────────────────────────────────────────

// Readable pacing for a screen recording.
const BEAT = 1400;
async function beat(page: Page, ms = BEAT) { await page.waitForTimeout(ms); }

// Always keep ?demo=1 on navigations so demo mode stays on even after a reload.
async function go(page: Page, path: string) {
  const sep = path.includes('?') ? '&' : '?';
  await page.goto(`${path}${sep}demo=1`, { waitUntil: 'networkidle' });
}

test('Adi Chocolate CRM — marketing demo flow (fake data)', async ({ page }) => {
  // ── 1. Dashboard with demo numbers ──────────────────────────────────────
  await go(page, '/dashboard');
  await expect(page.getByText('מצב הדגמה — נתוני דמו בלבד')).toBeVisible();
  await beat(page, 2200);

  // ── 2. Customers list (fake customers) ──────────────────────────────────
  await go(page, '/customers');
  await expect(page.getByText('רבקה כהן')).toBeVisible();
  await beat(page, 1800);

  // ── 3. Open the fake customer profile (רבקה כהן) ─────────────────────────
  await page.getByText('רבקה כהן').first().click();
  await expect(page.getByRole('heading', { name: 'רבקה כהן' })).toBeVisible();
  await beat(page, 2200);

  // ── 4. Open the fake order from the customer profile ─────────────────────
  await page.getByText('DEMO-1001').first().click();
  await page.waitForURL('**/orders/demo-order-1**');
  // 5–6. Demo products + order total + status are all visible on this screen.
  await expect(page.getByText('מארז פטיפורים 16 יחידות').first()).toBeVisible();
  await beat(page, 2400);

  // ── 7. Change order status to "בהכנה" ────────────────────────────────────
  const statusCard = page.locator('div', { has: page.getByText('סטטוס הזמנה', { exact: true }) }).last();
  await statusCard.getByText('בהכנה', { exact: true }).first().click();
  await beat(page, 2200);

  // ── 8. Inventory / raw-materials impact (read-only, fake stock) ──────────
  await go(page, '/inventory');
  await beat(page, 2000);

  // ── 9. Deliveries area (fake data only) ──────────────────────────────────
  await go(page, '/deliveries');
  await beat(page, 1800);

  // ── 10. End on a clean dashboard ─────────────────────────────────────────
  await go(page, '/dashboard');
  await beat(page, 2600);
});
