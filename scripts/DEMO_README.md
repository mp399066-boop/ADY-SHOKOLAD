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

The only non-faked data on screen is the business logo + business name in the
top bar (read directly from `business_settings`) — that's the shop's own brand,
which is what you want in a marketing video. The top bar never shows the
logged-in user's email/name/avatar.

Nothing in auth, Supabase policies, WooCommerce, SendGrid, or Morning/Green
Invoice is touched.

---

## Using demo mode manually (no Playwright needed)

1. Log in to the app as usual.
2. Add `?demo=1` to any dashboard URL, e.g. `http://localhost:3000/dashboard?demo=1`.
3. A **"מצב הדגמה — נתוני דמו בלבד"** badge appears bottom-left. Demo mode now
   stays on for the whole browser tab.
4. Add `&recording=1` to also **hide the badge** (for a clean recording):
   `http://localhost:3000/dashboard?demo=1&recording=1`.
5. To exit: click **יציאה** on the badge, open any page with `?demo=0`, or close
   the tab.

### Demo entities already in the dataset
- Customer: **רבקה כהן** · 050-0000000 · demo@example.com · סוג: חוזר
- Order: **DEMO-1001** — מארז פטיפורים 16, עוגת שוקולד אישית, קינוחי כוסות (×2)
- Products, inventory, deliveries, dashboard numbers — all fake.

---

## Producing the video automatically (Playwright)

> **The one manual step:** login is **Google OAuth only**, which can't be
> automated. You log in **once** in a browser window; the session is saved and
> every future recording is fully automatic (zero clicks).

### 0. One-time install (already done in this repo, but for a fresh clone)
```bash
npm install
npx playwright install chromium
```

### 1. Start the app
```bash
npm run dev          # http://localhost:3000
```

### 2. One-time login (opens a browser — sign in with Google, land on dashboard)
```bash
npm run demo:login
```
This saves `tests/.auth/state.json` (git-ignored — never committed). Re-run it
only if the session expires.

### 3. Record + produce the file
```bash
npm run demo:video
```
This records the walkthrough (1440×900, paced for readability, badge hidden) and
then finalizes the output.

---

## Where the video is saved

```
demo-video/crm-demo.webm     ← always produced
demo-video/crm-demo.mp4      ← also produced if ffmpeg is installed
```

(Raw per-run artifacts live under `demo-video/raw/`.)

### Convert WebM → MP4 (if you don't have an MP4 yet)
The finalize step auto-converts when `ffmpeg` is on your PATH. If it isn't:
```bash
# Windows:
winget install Gyan.FFmpeg      # then restart the terminal
# then:
npm run demo:finalize            # re-runs the copy + conversion
# or convert manually:
ffmpeg -i demo-video/crm-demo.webm -c:v libx264 -pix_fmt yuv420p -movflags +faststart -an demo-video/crm-demo.mp4
```

### Open the file
`demo-video/crm-demo.webm` plays in Chrome/Edge/VLC. `crm-demo.mp4` plays
everywhere and is what you upload to a website.

---

## Regenerate later
```bash
npm run dev            # if not already running
npm run demo:video     # re-records + re-finalizes (login is reused)
```

---

## Recorded flow
Dashboard → לקוחות → רבקה כהן (profile) → order DEMO-1001 (products + total) →
status → **בהכנה** → מלאי → משלוחים → back to a clean dashboard.

---

## Files

| File | Purpose |
| --- | --- |
| `src/lib/demo/data.ts` | Fake dataset (customers, products, orders, inventory, stats). |
| `src/lib/demo/intercept.ts` | Client-side `fetch` interceptor + demo on/off helpers. |
| `src/components/demo/DemoBadge.tsx` | Installs the interceptor + shows/hides the demo badge (`recording=1` hides it). |
| `src/app/(dashboard)/layout.tsx` | Mounts `<DemoBadge/>`. |
| `playwright.config.ts` | Recording config — `setup` (login) + `demo-chromium` (record) projects. |
| `tests/auth.setup.ts` | One-time interactive login → `tests/.auth/state.json`. |
| `tests/demo-video.spec.ts` | The recorded walkthrough. |
| `scripts/finalize-demo-video.mjs` | Copies the recording to `demo-video/` + converts to MP4 via ffmpeg. |
