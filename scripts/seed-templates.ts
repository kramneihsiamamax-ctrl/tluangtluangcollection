/**
 * Seed the background templates into Supabase.
 *
 *   npx tsx scripts/seed-templates.ts          (or: npm run seed)
 *
 * - Reads every image in TEMPLATES_DIR (default: the OneDrive folder below, then ./template).
 * - sharp(file).rotate() → JPEG q92 (mozjpeg), original resolution, metadata stripped.
 * - 400px-wide thumbnail, JPEG q80.
 * - Uploads full/<uuid>.jpg + thumbs/<uuid>.jpg to the `templates` bucket and inserts a row
 *   (source = 'seed', sort_order = number in the filename).
 * - Idempotent: files whose name is already in `templates` are skipped.
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

config({ path: ".env.local" });
config();

const DEFAULT_DIRS = [
  "C:\\Users\\Onema\\OneDrive\\문서\\tluangtluang collection",
  path.resolve("template"),
];
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".avif", ".tif", ".tiff", ".gif"]);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (put them in .env.local).");
  process.exit(1);
}
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

function resolveDir(): string {
  const fromEnv = process.env.TEMPLATES_DIR;
  const candidates = fromEnv ? [fromEnv] : DEFAULT_DIRS;
  for (const dir of candidates) {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return dir;
  }
  console.error(`Templates folder not found. Tried:\n  ${candidates.join("\n  ")}\nSet TEMPLATES_DIR="…" and re-run.`);
  process.exit(1);
}

/** "12.png" → 12, "Template 07.jpg" → 7, otherwise 0. */
function numberFrom(file: string): number {
  const m = path.parse(file).name.match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

function nameFor(file: string): string {
  const n = numberFrom(file);
  return n ? `Template ${n}` : path.parse(file).name;
}

function oneDriveHint(file: string, err: unknown) {
  console.error(`\n✖ Could not read "${file}": ${(err as Error).message}`);
  console.error(
    "  If this folder is in OneDrive, the files may be online-only placeholders.\n" +
      "  Right-click the folder in File Explorer → \"Always keep on this device\", wait for the sync, then re-run.\n",
  );
}

async function main() {
  const dir = resolveDir();
  const files = fs
    .readdirSync(dir)
    .filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()))
    .sort((a, b) => numberFrom(a) - numberFrom(b) || a.localeCompare(b));
  console.log(`Templates folder: ${dir}\nFound ${files.length} image(s).`);

  const { data: existing, error: listErr } = await supabase.from("templates").select("name");
  if (listErr) {
    console.error(`Could not read the templates table: ${listErr.message}\nRun the SQL migrations first (see README).`);
    process.exit(1);
  }
  const seeded = new Set((existing ?? []).map((r) => r.name));

  let added = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    const name = nameFor(file);
    if (seeded.has(name)) {
      skipped++;
      continue;
    }
    const abs = path.join(dir, file);

    let input: Buffer;
    try {
      input = await fs.promises.readFile(abs);
    } catch (err) {
      oneDriveHint(abs, err);
      failed++;
      continue;
    }

    try {
      // .rotate() applies EXIF orientation; sharp strips metadata by default.
      const full = await sharp(input)
        .rotate()
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 92, mozjpeg: true })
        .toBuffer({ resolveWithObject: true });
      const thumb = await sharp(input)
        .rotate()
        .flatten({ background: "#ffffff" })
        .resize({ width: 400, withoutEnlargement: true })
        .jpeg({ quality: 80, mozjpeg: true })
        .toBuffer();

      const id = randomUUID();
      const fullPath = `full/${id}.jpg`;
      const thumbPath = `thumbs/${id}.jpg`;
      const opts = { contentType: "image/jpeg", cacheControl: "31536000", upsert: false };

      const up1 = await supabase.storage.from("templates").upload(fullPath, full.data, opts);
      if (up1.error) throw new Error(`upload full: ${up1.error.message}`);
      const up2 = await supabase.storage.from("templates").upload(thumbPath, thumb, opts);
      if (up2.error) throw new Error(`upload thumb: ${up2.error.message}`);

      const { error: insErr } = await supabase.from("templates").insert({
        id,
        name,
        full_path: fullPath,
        thumb_path: thumbPath,
        width: full.info.width,
        height: full.info.height,
        source: "seed",
        sort_order: numberFrom(file),
      });
      if (insErr) {
        await supabase.storage.from("templates").remove([fullPath, thumbPath]);
        throw new Error(`insert row: ${insErr.message}`);
      }

      added++;
      console.log(
        `✓ ${file.padEnd(10)} → ${name} (${full.info.width}×${full.info.height}, ${(full.data.length / 1024).toFixed(0)} KB)`,
      );
    } catch (err) {
      const msg = (err as Error).message;
      if (/EIO|EBUSY|ENOENT|cloud|placeholder/i.test(msg)) oneDriveHint(abs, err);
      else console.error(`✖ ${file}: ${msg}`);
      failed++;
    }
  }

  console.log(`\nDone. Added ${added}, skipped ${skipped} (already seeded), failed ${failed}.`);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
