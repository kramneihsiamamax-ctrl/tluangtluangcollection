# TluangTluang Collection — Product Photo Studio (PWA)

You are building a mobile-first web app (installable PWA) for **TluangTluang Collection**, a readymade-garment shop (wholesale & retail) in Dawrpui, Aizawl. Shop staff use it on their phones to turn raw product photos into clean, branded images for Instagram.

**This is NOT an e-commerce site.** It is a photo editor.

All UI text must be in **English**.

---

## 1. Core flow

1. **Welcome screen.** Shows the logo, a short tagline, three feature rows and a **Get Started** button. There is no login or authentication. After the first visit, open straight to Home (remember this in localStorage).
2. **Upload.** The user picks a product photo from the camera or gallery. Multi-select is allowed: each photo becomes its own job.
3. **Automatic background removal.** This runs on the device (see §4).
4. **Automatic composition.**
   - The last-used template (or the default) becomes the background.
   - The product cutout is placed centred, with a sensible default size (about 70% of the shorter side).
   - The watermark is applied.
5. **Editor.**
   - Drag the product to move it.
   - Pinch, or use the slider, to resize it.
   - A **Centre** button resets the position.
   - Tap a template thumbnail to swap the background instantly.
   - Ratio pills: **9:16, 3:4, 1:1, 4:3, 16:9**.
   - Toggle the watermark on/off.
6. **Export.** Render at full quality, then save to the phone's gallery or share (see §5).
7. **Templates screen.** Grid of all templates. The owner can **upload new background templates**, which are stored permanently. Filter chips: All, Uploaded.
8. **Brand screen.** Watermark settings:
   - Enabled by default.
   - Position: 9-point grid, default bottom-right.
   - Opacity: default 60%.
   - Size: S / M / L.
   - Variant: dark / light / colour.
   - "Apply to every photo" switch.

   Settings persist in Supabase (`settings` table) and in a localStorage cache.

## 2. Tech stack (decided)

- **Next.js (latest stable, App Router) + TypeScript + Tailwind CSS.**
- **PWA:** use `@serwist/next`.
  - Add a manifest with name "TluangTluang Collection" and short_name "TluangTluang".
  - Theme `#111111`, background `#FFFFFF`, display `standalone`, portrait.
  - Icons are generated from `public/brand/watermark-dark.png` on white: 192, 512 and a maskable icon. Add an apple-touch-icon too.
  - Cache the app shell, the background-removal model/WASM files and template thumbnails, so the app works offline after the first load.
- **Supabase** (`@supabase/supabase-js`) for storage and the database.
- **Background removal:** `@imgly/background-removal`.
  - Runs in the browser with WASM/ONNX, so there are no per-image costs.
  - Run it in a **Web Worker** so the UI never freezes.
  - Preload the model when the app starts (after first paint).
  - Show progress.
  - Note: this library is AGPL-3.0. The repo is public, so keep it that way and add a LICENSE note in the README.
- **Gestures:** `@use-gesture/react` for drag and pinch.
- Font: system stack (`-apple-system, "SF Pro Text", Inter, system-ui, sans-serif`). Load Inter through `next/font`.

## 3. Performance requirements (very important)

The app must feel native: smooth, 60fps+, with no click delay.

- Set `touch-action: manipulation` globally.
- Viewport meta: `width=device-width, initial-scale=1, viewport-fit=cover`. Respect safe-area insets.
- Make buttons respond instantly: use an `:active` scale/opacity state, with no hover-dependent UI.
- **Editor preview:** move and scale the product only with CSS `transform: translate3d(...) scale(...)` on a single element, with `will-change: transform`.
  - Gesture updates go through refs + `requestAnimationFrame`. **No React state updates per pointermove.** Commit to state on gesture end.
  - The preview uses downscaled bitmaps (max ~1440px long side). The export uses full-resolution originals.
- **Template grid:** use **thumbnails only** (`thumbs/` in storage, ~400px JPEG), lazy-loaded with `loading="lazy"` and fixed aspect boxes (no layout shift). Load the full-resolution template only when it is selected or exported, and cache it.
- Use `createImageBitmap(file, { imageOrientation: 'from-image' })` so EXIF rotation is correct and decoding is off the main thread.
- Use page transitions with transform/opacity only. Avoid heavy libraries and keep the JS bundle lean.
- Target Lighthouse PWA/Performance ≥ 90 on mobile.

## 4. Image rules

- **Every stored or exported image is JPEG.**
  - Convert any upload (PNG, WEBP, HEIC, etc.) to JPEG before storing it.
  - Templates: convert with `sharp` in the seed script. In the app, convert with canvas `toBlob('image/jpeg', 0.95)`.
  - HEIC fallback: `heic2any` only if the browser can't decode it.
- **Exception, transparent cutouts.** The transparent cutout exists only in memory and IndexedDB during editing, because JPEG has no alpha. It is never uploaded as PNG. What gets stored is the original product photo (JPEG) and the final composite (JPEG).
- **No quality loss on export:**
  - Render the final image on a canvas (OffscreenCanvas when available) at the target resolution, using the **full-resolution** template and the **full-resolution** cutout.
  - Set `imageSmoothingQuality = 'high'`. Never resample twice.
  - Export sizes, with "Standard" as the default:

    | Ratio | Standard | High |
    |---|---|---|
    | 9:16 | 1080×1920 | 2160×3840 |
    | 3:4 | 1080×1440 | 2160×2880 |
    | 1:1 | 1080×1080 | 2160×2160 |
    | 4:3 | 1440×1080 | 2880×2160 |
    | 16:9 | 1920×1080 | 3840×2160 |

  - JPEG quality 0.95 by default (setting: 0.92 / 0.95 / 1.0).
  - Template placement uses "cover" (centre crop) for the chosen ratio.
  - Product position and scale are stored as **fractions of the frame**, so preview and export match exactly.
- **Watermark:** use `public/brand/watermark-dark.png`, `watermark-light.png` or `watermark-color.png` (transparent PNGs, in-app asset only). Draw it at export with the chosen opacity, size (S = 18%, M = 26%, L = 34% of frame width) and position, with a margin of 3% of the frame width.

## 5. Saving to the phone

- **Primary:** Web Share API level 2, `navigator.share({ files: [jpegFile] })`. On iOS this offers "Save Image" to Photos; on Android it offers Gallery and Instagram.
- **Fallback:** download through an `<a download>` link with an object URL.
- Filename: `tluangtluang-YYYYMMDD-HHmmss.jpg`.
- **Batch export:** when several photos were processed, offer "Save all".

## 6. Supabase

- Project URL: `https://nkoykaolxioiddveaovf.supabase.co`.
- Keys go in `.env.local`, which is **never committed**:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` (scripts only, never in client code)
- Ask the user for the anon key and the service role key if they are missing. Commit a `.env.example`.
- Write SQL as migrations in `supabase/migrations/`. Use the Supabase CLI (`npx supabase`) to link and push, or give the user the SQL to paste into the SQL editor if CLI login isn't possible.

**Storage buckets** (both public read, JPEG only, `allowed_mime_types = ['image/jpeg']`):

- `templates`: permanent. Full images go under `full/<uuid>.jpg` and thumbnails under `thumbs/<uuid>.jpg`.
- `creations`: product originals and exported composites, under `<yyyy-mm-dd>/<uuid>.jpg`. **These are auto-deleted after 24 hours.**

**Tables:**

```sql
templates(
  id uuid pk default gen_random_uuid(),
  name text,
  full_path text not null,
  thumb_path text not null,
  width int,
  height int,
  source text check (source in ('seed','upload')) default 'upload',
  sort_order int default 0,
  created_at timestamptz default now()
)

creations(
  id uuid pk default gen_random_uuid(),
  kind text check (kind in ('original','export')),
  storage_path text not null,
  ratio text,
  template_id uuid references templates(id) on delete set null,
  created_at timestamptz default now()
)

settings(
  id int pk default 1 check (id = 1),
  watermark jsonb not null default '{}',
  default_template_id uuid,
  updated_at timestamptz default now()
)
```

**RLS:** there is no login, so the `anon` role gets:

- `select` on all three tables.
- `insert` on `templates` and `creations`.
- `update` on `settings`.
- `delete` on `templates` only where `source = 'upload'`.
- Storage policies to match: anon may read and insert in both buckets. Anon may delete only in `templates/` for uploaded ones. Anon may **not** delete from `creations`; cleanup does that.

Tell the user plainly that anyone holding the app URL can upload. This is acceptable for an internal tool.

**24-hour auto-delete:**

- Edge Function `cleanup-creations` (Deno, service role):
  - Selects `creations` older than 24 hours.
  - Removes their objects with `supabase.storage.from('creations').remove(paths)` in batches of 100. Use the Storage API, never SQL deletes on `storage.objects`.
  - Then deletes the rows.
- Schedule it **hourly** with `pg_cron` + `pg_net`, calling the function URL with the service key stored in Vault.
- Add a README section on how to verify the job (`cron.job_run_details`).

## 7. Seeding the 50 templates

- Script: `scripts/seed-templates.ts` (run with `npx tsx`).
- It reads every image from `TEMPLATES_DIR`. The default is the Windows path below; note the Korean folder name and the space, and quote it.

  ```
  C:\Users\Onema\OneDrive\문서\tluangtluang collection
  ```

- For each file:
  - `sharp(file).rotate()`, then convert to JPEG at quality 92 (mozjpeg), keeping the original resolution and stripping metadata. Also make a 400px-wide thumbnail at quality 80.
  - Upload both, then insert a row (`source = 'seed'`, `sort_order` from the filename number).
- It must be idempotent: skip files that are already seeded, matching by name.
- **OneDrive warning:** the files may be "online-only" placeholders. If a read fails, tell the user to right-click the folder → **Always keep on this device**, then re-run.

## 8. Design (monochrome, clean iOS style)

- **Palette:**
  - Black `#111111`.
  - White `#FFFFFF`.
  - Greys `#F5F5F5` (app background), `#F2F2F2`, `#E6E6E6` (borders), `#DADADA`, `#BDBDBD`, `#737373` (inactive icons), `#595959` / `#666666` (secondary text). Text contrast must be ≥ 4.5:1.
- No other colours in the UI chrome. Only photos add colour.
- **Shapes:**
  - Large radii: cards 20–28px, buttons 14–18px, pills 12px.
  - 1px `#E6E6E6` borders.
  - Very soft shadows only around the editor frame.
- Primary buttons are solid black with white text, 56px tall. Secondary buttons are white with a 1px border.
- Thin stroke line icons (lucide-react), 1.8–2px stroke. No emoji.
- Decorative thin grey curved lines on the Welcome and Home hero cards (subtle line-art, like a monochrome "learn up"-style UI).
- **Bottom tab bar:** a floating white rounded bar with Home, Templates, a centre black "+" (new photo), Brand and Gallery. The Gallery tab shows the last 24 hours of exports.
- Touch targets ≥ 44px.
- **Logo:** `public/brand/watermark-dark.png` (the TC monogram with the hanger and the "TLUANGTLUANG COLLECTION" wordmark). The full original artwork, including contact details, is `public/brand/logo-full.jpg`. Use it only on an About sheet.

**Screens, in order:**

1. **Welcome**
   - Logo in a black rounded tile, the "TluangTluang Collection" title, and the tagline "Studio-quality product photos in seconds."
   - Three feature rows: "Automatic background removal", "50+ ready templates", "Your logo on every photo".
   - **Get Started** button, with "No login needed" under it.
2. **Home**
   - Greeting and logo.
   - A big black "Create new photo" card.
   - Two stat cards: templates count, watermark on/off.
   - A "Recent" grid of the last 24 hours of exports.
   - Tab bar.
3. **Processing**
   - The original photo with a progress overlay ("Removing background…").
   - A progress bar.
   - Steps: Upload ✓ → Remove background → Place on template.
   - Auto-advance to the Editor.
4. **Editor**
   - Top bar: back, "Edit", and a black **Export** button.
   - The frame at the chosen ratio.
   - Ratio pills.
   - A bottom sheet with the template strip (an upload tile first), a Size slider, **Centre**, and a **Watermark** toggle.
   - Show centre snap guides while dragging, and snap to centre within 8px.
5. **Export**
   - Dark top area with the preview.
   - A white sheet with:
     - The size label.
     - Format (JPG only, shown as info).
     - Quality: Standard/High.
     - Watermark switch.
     - **Share** and **Save** buttons.
     - "Create another".
6. **Templates**
   - Title with an "Upload" button.
   - Search, and filter chips.
   - A 3-column thumbnail grid with an "Add" tile first.
   - Long-press an uploaded template to delete it.
7. **Brand**
   - Logo card.
   - Live watermark preview on a template.
   - A 9-point position grid, Opacity and Size sliders, and the colour variant.
   - "Apply to every photo" switch.

## 9. Project, git and delivery

- Build the project at **`D:\tluangtluangcollection`**.
- Repo: `https://github.com/kramneihsiamamax-ctrl/tluangtluangcollection.git`.
  - Run `git init` if needed, set the `origin` remote, use branch `main`.
  - Commit in logical steps and push.
- `.gitignore` must include `.env*.local`, `node_modules` and `.next`.
- README covers:
  - Setup.
  - Env vars.
  - Supabase setup (migrations, buckets, function deploy, cron).
  - The seed command.
  - How to deploy to **Vercel** (recommended free hosting for Next.js) with the env vars.
  - How to "Add to Home Screen" on iPhone and Android.
- Before finishing:
  - `npm run build` passes with no type errors.
  - Lint is clean.
  - Manually test the full flow in a mobile viewport.
  - Confirm that an exported JPEG has the exact expected pixel dimensions.
