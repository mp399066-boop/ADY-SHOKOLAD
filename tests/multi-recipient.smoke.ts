import { chromium } from '@playwright/test';
import fs from 'node:fs';

// Smoke test for the multi-recipient order form. Drives the real page with the
// saved session and screenshots the per-recipient layout, so the branch that
// `next build` never renders (multiRecipient defaults to off) is actually
// exercised before shipping.
//
// Run: npx tsx tests/multi-recipient.smoke.ts   (dev server must be up)

const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const AUTH = 'tests/.auth/state.json';
const OUT = process.env.SMOKE_OUT_DIR || '.';

const errors: string[] = [];

async function main() {
  if (!fs.existsSync(AUTH)) throw new Error(`no saved session at ${AUTH} — run npm run demo:login`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ storageState: AUTH, viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();

  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

  await page.goto(`${BASE}/orders/new`, { waitUntil: 'networkidle', timeout: 120_000 });

  if (page.url().includes('/login')) throw new Error('redirected to /login — saved session expired');

  // The recipients UI only exists on a delivery order.
  await page.getByRole('button', { name: 'משלוח', exact: true }).first().click().catch(() => {});
  await page.getByRole('button', { name: 'כמה נמענים' }).click();
  await page.waitForTimeout(400);

  // One blank recipient card opens with the mode; fill it and add a second.
  const nameFields = page.getByLabel('שם נמען');
  await nameFields.first().fill('דנה כהן');
  await page.getByLabel('כתובת').first().fill('הרצל 10');
  await page.getByLabel('עיר').first().fill('תל אביב');

  await page.getByRole('button', { name: '+ הוסף נמען', exact: true }).first().click();
  await page.waitForTimeout(300);
  await nameFields.nth(1).fill('יוסי לוי');
  await page.getByLabel('כתובת').nth(1).fill('ביאליק 3');
  await page.getByLabel('עיר').nth(1).fill('רמת גן');

  // Add a product line inside the first recipient's block.
  await page.getByRole('button', { name: '+ הוסף מוצר', exact: true }).first().click();
  await page.waitForTimeout(300);

  const shot = `${OUT}/multi-recipient-smoke.png`;
  await page.screenshot({ path: shot, fullPage: true });

  const recipientBlocks = await page.getByText(/^נמען \d/).count();
  const copyButtons = await page.getByRole('button', { name: 'שכפל לכולם' }).count();

  console.log('recipient blocks:', recipientBlocks);
  console.log('"שכפל לכולם" buttons:', copyButtons);
  console.log('screenshot:', shot);
  console.log(errors.length ? `PAGE ERRORS:\n${errors.join('\n')}` : 'no page errors');

  await browser.close();
  if (errors.length) process.exit(1);
  if (recipientBlocks < 2) { console.error('expected 2 recipient blocks'); process.exit(1); }
  if (copyButtons < 2) { console.error('expected a "שכפל לכולם" button per recipient'); process.exit(1); }
}

main().catch(err => { console.error(err); process.exit(1); });
