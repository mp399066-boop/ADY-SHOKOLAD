import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';

// Dedicated config for the marketing demo recording. This does NOT affect
// `next build` / `next dev` — Playwright only reads it when you run
// `playwright test`.
//
// Two projects:
//   • setup          → one-time interactive login, saves tests/.auth/state.json
//                      (login is Google OAuth only, so it must be done by a human
//                      once; runs headed). `npm run demo:login`
//   • demo-chromium  → the actual recording, reuses the saved session, drives
//                      demo mode (?demo=1&recording=1) and writes a video.
//                      `npm run demo:record`
//
// The recording runs against a locally running dev server (npm run dev).
// See scripts/DEMO_README.md.

const BASE_URL = process.env.DEMO_BASE_URL || 'http://localhost:3000';
const VIEWPORT = { width: 1440, height: 900 };
const AUTH_STATE = 'tests/.auth/state.json';
// Use the saved session only if it exists. When it doesn't, the browser still
// launches (unauthenticated) and the spec prints a clear "run npm run demo:login"
// message instead of a cryptic file-not-found error.
const SAVED_STATE = fs.existsSync(AUTH_STATE) ? AUTH_STATE : undefined;

export default defineConfig({
  testDir: './tests',
  timeout: 180_000,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    viewport: VIEWPORT,
    locale: 'he-IL',
    actionTimeout: 25_000,
  },
  // Raw per-test artifacts (incl. video) land here; scripts/finalize-demo-video.mjs
  // copies the final file to demo-video/crm-demo.webm (+ .mp4 if ffmpeg exists).
  outputDir: 'demo-video/raw',
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      // Headed + no saved state — the human logs in here.
      use: { ...devices['Desktop Chrome'], viewport: VIEWPORT, headless: false, storageState: undefined },
    },
    {
      name: 'demo-chromium',
      testMatch: /demo-video\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: VIEWPORT,
        storageState: SAVED_STATE,
        video: { mode: 'on', size: VIEWPORT },
      },
    },
  ],
});
