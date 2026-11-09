import { EXPORT_SIZES, WATERMARK_MARGIN, WATERMARK_SIZE, WATERMARK_SRC } from "./constants";
import { canvasToJpeg, ctx2d, loadImage, makeCanvas } from "./image";
import type { Composition, ExportQuality, WatermarkSettings } from "./types";

/** Product box in frame pixels. `s` = product's longer side as a fraction of the frame's shorter side. */
export function productRect(frameW: number, frameH: number, aspect: number, comp: Pick<Composition, "x" | "y" | "s">) {
  const box = comp.s * Math.min(frameW, frameH);
  const w = aspect >= 1 ? box : box * aspect;
  const h = aspect >= 1 ? box / aspect : box;
  return { x: comp.x * frameW - w / 2, y: comp.y * frameH - h / 2, w, h };
}

/** Watermark box in frame pixels (width % of frame width, margin 3% of frame width, 9-point grid). */
export function watermarkRect(frameW: number, frameH: number, wmAspect: number, wm: Pick<WatermarkSettings, "size" | "position">) {
  const w = WATERMARK_SIZE[wm.size] * frameW;
  const h = w / wmAspect;
  const m = WATERMARK_MARGIN * frameW;
  const col = wm.position % 3;
  const row = Math.floor(wm.position / 3);
  const x = col === 0 ? m : col === 1 ? (frameW - w) / 2 : frameW - w - m;
  const y = row === 0 ? m : row === 1 ? (frameH - h) / 2 : frameH - h - m;
  return { x, y, w, h };
}

/** "cover" crop of a source into a target aspect (centre crop). */
export function coverCrop(srcW: number, srcH: number, dstW: number, dstH: number) {
  const k = Math.max(dstW / srcW, dstH / srcH);
  const sw = dstW / k;
  const sh = dstH / k;
  return { sx: (srcW - sw) / 2, sy: (srcH - sh) / 2, sw, sh };
}

const wmCache = new Map<string, Promise<HTMLImageElement>>();
export function loadWatermark(variant: WatermarkSettings["variant"]) {
  let p = wmCache.get(variant);
  if (!p) {
    p = loadImage(WATERMARK_SRC[variant]);
    wmCache.set(variant, p);
  }
  return p;
}

export interface RenderInput {
  template: ImageBitmap | null;
  cutout: ImageBitmap;
  comp: Composition;
  quality: ExportQuality;
  watermark: WatermarkSettings;
  showWatermark: boolean;
  jpegQuality: number;
}

/**
 * Final render at the exact export size using full-resolution template + cutout.
 * Every source is resampled exactly once, with high-quality smoothing.
 */
export async function renderComposite(inp: RenderInput): Promise<{ blob: Blob; width: number; height: number }> {
  const [W, H] = EXPORT_SIZES[inp.comp.ratio][inp.quality];
  const canvas = makeCanvas(W, H);
  const ctx = ctx2d(canvas);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  if (inp.template) {
    const c = coverCrop(inp.template.width, inp.template.height, W, H);
    ctx.drawImage(inp.template, c.sx, c.sy, c.sw, c.sh, 0, 0, W, H);
  }

  const aspect = inp.cutout.width / inp.cutout.height;
  const r = productRect(W, H, aspect, inp.comp);
  ctx.drawImage(inp.cutout, r.x, r.y, r.w, r.h);

  if (inp.showWatermark) {
    const img = await loadWatermark(inp.watermark.variant);
    const wr = watermarkRect(W, H, img.naturalWidth / img.naturalHeight, inp.watermark);
    ctx.globalAlpha = inp.watermark.opacity;
    ctx.drawImage(img, wr.x, wr.y, wr.w, wr.h);
    ctx.globalAlpha = 1;
  }

  const blob = await canvasToJpeg(canvas, inp.jpegQuality);
  if (typeof HTMLCanvasElement !== "undefined" && canvas instanceof HTMLCanvasElement) {
    canvas.width = canvas.height = 0; // release memory on iOS
  }
  return { blob, width: W, height: H };
}
