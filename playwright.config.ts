import { defineConfig, devices } from '@playwright/test';

// Dedicated config for the marketing demo recording. This does NOT affect
// `next build` / `next dev` — Playwright only reads it when you run
// `npx playwright test`.
//
// The demo runs against a locally running dev server (npm run dev) and reuses a
// saved authenticated session (tests/.auth/state.json) because login is Google
// OAuth only. See scripts/DEMO_README.md for the one-time auth setup.

export default defineConfig({
  testDir: './tests',
  testMatch: /demo-video\.spec\.ts/,
  timeout: 120_000,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.DEMO_BASE_URL || 'http://localhost:3000',
    viewport: { width: 1440, height: 900 },
    locale: 'he-IL',
    storageState: 'tests/.auth/state.json',
    video: { mode: 'on', size: { width: 1440, height: 900 } },
    actionTimeout: 20_000,
  },
  projects: [
    {
      name: 'demo-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  outputDir: 'tests/demo-output',
});
