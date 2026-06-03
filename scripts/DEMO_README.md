# Demo Mode + Marketing Video Recording

A **100% fake** demo of the CRM for marketing videos / screen recordings.
No real customer, order, or business data is used, and **no data is ever
written to the production database** in demo mode.

---

## How it works (safety model)

Every screen in the app reads and writes through `/api/*`. When demo mode is on,
a client-side `fetch` interceptor (`src/lib/demo/intercept.ts`) answers **all**
`/api/*` calls locally from a fake dataset (`src/lib/demo/data.ts`):

- **Reads** → fake demo data.
- **Writes** (POST / PATCH / PUT / DELETE) → a synthetic success that **never
  reaches the network**, so demo actions can't touch the DB.
- **Any endpoint not explicitly mocked** → empty `{data:[]}` (default-deny), so
  no real data can leak into the demo.

The interceptor is installed at module-load (before any page fetches), and the
real `fetch` is restored for everything that isn't an `/api/*` call. Nothing in
auth, Supabase policies, WooCommerce, SendGrid, or Morning/Green Invoice is
touched.

---

## Using demo mode manually (no Playwright needed)

1. Log in to the app as usual.
2. Add `?demo=1` to any dashboard URL, e.g.:
   ```
   http://localhost:3000/dashboard?demo=1
   ```
3. A **"מצב הדגמה — נתוני דמו בלבד"** badge appears bottom-left. Demo mode now
   stays on for the whole browser tab (persisted in `sessionStorage`).
4. Walk the flow: Dashboard → לקוחות → רבקה כהן → הזמנה DEMO-1001 → שינוי סטטוס
   ל"בהכנה" → מלאי → משלוחים.
5. To exit: click **יציאה** on the badge, or open any page with `?demo=0`, or
   close the tab.

### Suggested demo entities (already in the dataset)
- Customer: **רבקה כהן** · 050-0000000 · demo@example.com · סוג: חוזר
- Order: **DEMO-1001** — מארז פטיפורים 16, עוגת שוקולד אישית, קינוחי כוסות (×2)
- Products, inventory, deliveries, dashboard numbers — all fake.

---

## Recording the video with Playwright

Login is **Google OAuth only**, so the recorder reuses a saved authenticated
session instead of automating login.

### One-time setup

```bash
# 1. Install Playwright (dev only)
npm i -D @playwright/test
npx playwright install chromium

# 2. Start the app
npm run dev      # http://localhost:3000

# 3. Save an authenticated session (opens a browser; log in with Google,
#    land on the dashboard, then close the window):
npx playwright codegen http://localhost:3000/login --save-storage=tests/.auth/state.json
```

`tests/.auth/state.json` holds your login cookies. It is git-ignored — never
commit it.

### Record

```bash
npx playwright test --config=playwright.config.ts
```

- Desktop viewport **1440×900**, with readable pauses between actions.
- The flow drives demo mode (`?demo=1`) end-to-end, so the recording shows only
  fake data.

### Where the video is saved

Playwright writes the `.webm` recording under:

```
tests/demo-output/<test-name>/video.webm
```

(Exact subfolder is printed in the test output.) Re-encode to MP4 if needed:

```bash
ffmpeg -i tests/demo-output/**/video.webm demo.mp4
```

---

## Files added

| File | Purpose |
| --- | --- |
| `src/lib/demo/data.ts` | Fake dataset (customers, products, orders, inventory, stats). |
| `src/lib/demo/intercept.ts` | Client-side `fetch` interceptor + demo on/off helpers. |
| `src/components/demo/DemoBadge.tsx` | Installs the interceptor + shows the demo badge. |
| `src/app/(dashboard)/layout.tsx` | Mounts `<DemoBadge/>` (one line). |
| `playwright.config.ts` | Recording config (viewport, video, auth state). |
| `tests/demo-video.spec.ts` | The recorded walkthrough. |
