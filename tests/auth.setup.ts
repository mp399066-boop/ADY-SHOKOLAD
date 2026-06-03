import { test as setup } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// ONE-TIME LOGIN — saves an authenticated Playwright session.
//
// The CRM login is Google OAuth only, which can't be automated, so this opens a
// real browser window and waits for you to sign in. As soon as you land on the
// dashboard, the session cookies are saved to tests/.auth/state.json and the
// recording (npm run demo:record) reuses them with zero further clicks.
//
// Nothing personal is recorded here — this just captures the auth cookies.
// Run once with:  npm run demo:login
// ─────────────────────────────────────────────────────────────────────────────

const STATE_PATH = 'tests/.auth/state.json';

setup('authenticate (one-time, interactive)', async ({ page }) => {
  setup.setTimeout(360_000); // up to 6 minutes for a human to log in
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });

  const base = process.env.DEMO_BASE_URL || 'http://localhost:3000';

  console.log('\n────────────────────────────────────────────────────────');
  console.log('🔐  התחברות חד-פעמית להקלטת הדגמה');
  console.log('    נפתח דפדפן. התחברי עם Google עד שתגיעי לדשבורד.');
  console.log('    ברגע שהדשבורד נטען — ה-session יישמר אוטומטית.');
  console.log('────────────────────────────────────────────────────────\n');

  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });

  // Wait until middleware lets us through to the dashboard.
  await page.waitForURL('**/dashboard**', { timeout: 350_000 });
  // Let the dashboard settle so the cookies are fully written.
  await page.waitForTimeout(1500);

  await page.context().storageState({ path: STATE_PATH });
  console.log(`\n✅  Session נשמר ל-${STATE_PATH}. אפשר להריץ:  npm run demo:video\n`);
});
