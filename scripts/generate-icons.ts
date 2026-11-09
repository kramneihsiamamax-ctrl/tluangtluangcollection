/**
 * Generates PWA icons from public/brand/watermark-dark.png on a white background.
 * Run: npx tsx scripts/generate-icons.ts
 */
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const src = path.join(root, "public/brand/watermark-dark.png");
const out = (f: string) => path.join(root, "public/icons", f);

async function icon(size: number, logoFraction: number, file: string) {
  const logoWidth = Math.round(size * logoFraction);
  const logo = await sharp(src).resize({ width: logoWidth, fit: "inside" }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 3, background: "#FFFFFF" } })
    .composite([{ input: logo, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toFile(out(file));
  console.log("wrote", file);
}

async function main() {
  await icon(192, 0.84, "icon-192.png");
  await icon(512, 0.84, "icon-512.png");
  // Maskable: keep the logo inside the 80% safe zone.
  await icon(512, 0.66, "maskable-512.png");
  await icon(180, 0.84, "apple-touch-icon.png");
  await icon(32, 0.94, "favicon-32.png");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
