# TluangTluang Collection — Product Photo Studio

A mobile-first, installable PWA for **TluangTluang Collection** (readymade garments, Dawrpui, Aizawl).
Staff pick a product photo → the background is removed **on the phone** → the product is placed on a
branded template with the shop's watermark → they export a full-quality JPEG and save/share it to Instagram.

Next.js 16 (App Router, TypeScript, Tailwind v4) · Serwist PWA · Supabase (storage + database) ·
`@imgly/background-removal` (WASM/ONNX in a Web Worker) · `@use-gesture/react`.

---

## 1. Setup

```bash
npm install
cp .env.example .env.local   # then fill in the keys (see below)
npm run dev                  # http://localhost:3000
```

`npm run dev` / `npm run build` first bundle the background-removal worker into
`public/workers/bg-removal.js` (`scripts/build-worker.mjs`).

| Command | What it does |
|---|---|
| `npm run dev` | Dev server (service worker disabled in dev) |
| `npm run build` | Production build + service worker (`next build && serwist build`) |
| `npm start` | Serve the production build |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run seed` | Upload the 50 seed templates (see §4) |
| `npm run icons` | Regenerate PWA icons from `public/brand/watermark-dark.png` |

## 2. Environment variables

`.env.local` (never committed — `.gitignore` has `.env*.local`):

| Variable | Where it's used |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://nkoykaolxioiddveaovf.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable key (`sb_publishable_…`) — browser |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret key (`sb_secret_…`) — **scripts only**, never in client code |
| `TEMPLATES_DIR` *(optional)* | Folder for the seed script |

> **No login.** Anyone with the app URL can upload templates and photos and change the watermark
> settings. This is fine for an internal shop tool — just don't post the URL publicly.

## 3. Supabase setup

Everything is in `supabase/migrations/`:

| File | Contents |
|---|---|
| `…0001_schema.sql` | `templates`, `creations`, `settings` tables + RLS (anon: select all; insert templates/creations; update settings; delete only uploaded templates) |
| `…0002_storage.sql` | Public buckets `templates` and `creations`, `allowed_mime_types = ['image/jpeg']`, storage policies (anon can't delete from `creations`) |
| `…0003_cleanup_cron.sql` | `pg_cron` + `pg_net` hourly job that calls the `cleanup-creations` Edge Function |

**Option A — SQL editor (no CLI login needed).**
Open `https://supabase.com/dashboard/project/nkoykaolxioiddveaovf/sql/new` and run the three files in order.
Before file 3, create the two Vault secrets (use your real secret key; never commit it):

```sql
select vault.create_secret('https://nkoykaolxioiddveaovf.supabase.co', 'project_url');
select vault.create_secret('sb_secret_…', 'service_role_key');
```

If the editor shows *"Potential issue detected — destructive operation"* (because of `drop policy if exists`),
click **Run this query**. If text is selected, only the selection runs.

**Option B — CLI** (logged in to the account that owns the project):

```bash
npx supabase login
npx supabase link --project-ref nkoykaolxioiddveaovf
npx supabase db push
```

### Edge Function `cleanup-creations` (24-hour auto-delete)

Deletes `creations` objects older than 24 h through the Storage API (batches of 100), then their rows.

- **CLI:** `npx supabase functions deploy cleanup-creations --no-verify-jwt`
  then `npx supabase secrets set CLEANUP_SECRET_KEY=sb_secret_…`
- **Dashboard:** Edge Functions → *Deploy a new function* → *Via editor* → name `cleanup-creations` →
  paste `supabase/functions/cleanup-creations/index.ts` → Deploy. Then in the function's **Details**,
  turn **Verify JWT** *off*, and under Edge Functions → **Secrets** add `CLEANUP_SECRET_KEY` = your `sb_secret_…` key.

JWT verification is off because the new `sb_secret_…` keys aren't JWTs; the function checks the key itself.

### Verify the cron job

```sql
select jobid, jobname, schedule, active from cron.job;                      -- cleanup-creations-hourly
select status, return_message, start_time
from cron.job_run_details order by start_time desc limit 10;                 -- should say "succeeded"
select id, status_code, content from net._http_response order by created desc limit 5;  -- 200 + JSON
```

Run it once by hand: `select net.http_post(...)` (copy the body of the job from `cron.job.command`).

## 4. Seed the 50 templates

```bash
npm run seed            # = npx tsx scripts/seed-templates.ts
```

Reads `TEMPLATES_DIR` (default `C:\Users\Onema\OneDrive\문서\tluangtluang collection`, falling back to
`./template`). Each file → `sharp().rotate()` → JPEG q92 mozjpeg at full resolution (metadata stripped)
+ 400px-wide thumbnail q80 → uploaded to `templates/full/<uuid>.jpg` and `templates/thumbs/<uuid>.jpg`
→ row with `source='seed'`, `sort_order` from the filename number. Re-running skips names already seeded — but a seed template you
deleted in the app counts as missing, so re-running the seed would add it back.

**OneDrive:** if a file can't be read it's probably an online-only placeholder. Right-click the folder →
**Always keep on this device**, wait for the sync, and re-run.

## 5. Deploy to Cloudflare Workers (current hosting)

Live: **https://tluangtluangcollection.k-ramneihsiamamax.workers.dev**

Hosted on the **k.ramneihsiamamax@gmail.com** Cloudflare account (`account_id` is pinned in
`wrangler.jsonc`) via [OpenNext](https://opennext.js.org/cloudflare). The `NEXT_PUBLIC_*` values are
read from `.env.local` at build time, so build on a machine that has it.

```bash
# one-time: log in to the k.ramneihsiamamax account (kept separate from any other wrangler login)
set XDG_CONFIG_HOME=D:\TluangTluangCollection\.cf-home      # PowerShell: $env:XDG_CONFIG_HOME="..."
npx wrangler login        # sign in as k.ramneihsiamamax in the browser that opens → Allow
npx wrangler whoami       # must show k.ramneihsiamamax@gmail.com

# every deploy (same XDG_CONFIG_HOME set)
npm run deploy            # = opennextjs-cloudflare build && opennextjs-cloudflare deploy
```

## 5b. Alternative: Vercel (free)

1. Push this repo to GitHub (already done: `kramneihsiamamax-ctrl/tluangtluangcollection`).
2. Go to <https://vercel.com/new> → **Import** the repo. Framework preset: **Next.js** (auto). Leave
   the build command as `npm run build`.
3. **Environment Variables** — add for *Production* and *Preview*:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://nkoykaolxioiddveaovf.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your `sb_publishable_…` key
   *(Don't add the secret key to Vercel — the app doesn't need it.)*
4. **Deploy.** You get `https://<project>.vercel.app` (HTTPS is required for the PWA and sharing).
5. Changing env vars later needs a **Redeploy** (`NEXT_PUBLIC_*` are baked in at build time).

## 6. Install on a phone ("Add to Home Screen")

**iPhone (Safari only):** open the URL in Safari → **Share** button → **Add to Home Screen** → **Add**.
Open it from the home-screen icon. Saving: tap **Save** → **Save Image** to put it in Photos.

**Android (Chrome):** open the URL → tap **Install app** in the banner, or **⋮ → Add to Home screen /
Install app**. Saving: **Save** puts the JPEG in Downloads (shows in Gallery); **Share** offers
Instagram, WhatsApp, Gallery, etc.

The first photo downloads the background-removal model (~40–80 MB, once). It's cached by the service
worker, so later photos — and the app itself — work offline (uploading/gallery need internet).

## 7. How it works (performance notes)

- **Background removal** runs in `src/workers/bg-removal.worker.ts`: EXIF-aware decode, JPEG original,
  raw RGBA in/out (no PNG round-trip), alpha-trim, and transferable full + ≤1440px preview bitmaps.
  WebGPU when available, WASM otherwise. The model is preloaded after first paint.
- **Editor:** one `<canvas>` moved with `transform: translate3d() scale()` + `will-change`; gestures write
  to refs and a single `requestAnimationFrame`; React state is only updated on gesture end. Position and
  size are fractions of the frame, so preview and export match exactly.
- **Export:** full-resolution template (cover crop) + full-resolution cutout, each resampled once with
  `imageSmoothingQuality = 'high'`, at exactly 1080×1920 / 1080×1440 / 1080×1080 / 1440×1080 /
  1920×1080 (or 2× for **High**). JPEG 0.92 / 0.95 / 1.0.
- **Storage:** only JPEGs are stored (original + final). The transparent cutout lives only in memory and
  IndexedDB. `creations/` is wiped after 24 h.

## License

This repository is **public** and uses [`@imgly/background-removal`](https://github.com/imgly/background-removal-js),
which is licensed under **AGPL-3.0**. Because of that, this app's source must stay publicly available under
AGPL-3.0-compatible terms — keep the repo public. Brand assets in `public/brand/` belong to
TluangTluang Collection.
