/** Image helpers: EXIF-correct, off-main-thread decoding and JPEG encoding. */

export function isHeic(file: Blob & { name?: string }) {
  return /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name ?? "");
}

/** HEIC → JPEG, only used when the browser can't decode HEIC itself. */
export async function heicToJpeg(file: Blob): Promise<Blob> {
  const heic2any = (await import("heic2any")).default;
  const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.95 });
  return Array.isArray(out) ? out[0] : out;
}

/** Decode with EXIF orientation applied. Falls back to heic2any for HEIC on browsers that can't decode it. */
export async function decodeImage(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (err) {
    if (!isHeic(file as File)) throw err;
    const jpeg = await heicToJpeg(file);
    return createImageBitmap(jpeg, { imageOrientation: "from-image" });
  }
}

export type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;

export function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

export function ctx2d(c: AnyCanvas) {
  const ctx = c.getContext("2d", { alpha: false }) as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error("Canvas 2D is not available");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return ctx;
}

export async function canvasToJpeg(c: AnyCanvas, quality = 0.95): Promise<Blob> {
  if ("convertToBlob" in c) return c.convertToBlob({ type: "image/jpeg", quality });
  return new Promise((resolve, reject) =>
    (c as HTMLCanvasElement).toBlob((b) => (b ? resolve(b) : reject(new Error("JPEG encode failed"))), "image/jpeg", quality),
  );
}

/** Resize a bitmap so its long side ≤ max (no upscaling). Single resample. */
export async function downscale(bitmap: ImageBitmap, max: number): Promise<ImageBitmap> {
  const long = Math.max(bitmap.width, bitmap.height);
  if (long <= max) return createImageBitmap(bitmap);
  const k = max / long;
  return createImageBitmap(bitmap, {
    resizeWidth: Math.round(bitmap.width * k),
    resizeHeight: Math.round(bitmap.height * k),
    resizeQuality: "high",
  });
}

/** Draw `src` into a canvas of exactly w×h and encode as JPEG (white behind any transparency). */
export async function bitmapToJpeg(src: ImageBitmap, w: number, h: number, quality: number): Promise<Blob> {
  const c = makeCanvas(w, h);
  const ctx = ctx2d(c);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(src, 0, 0, w, h);
  return canvasToJpeg(c, quality);
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

/**
 * `accept` for photo inputs. Android Chrome opens the gallery / Photo Picker only when `accept`
 * is plain MIME types — any file extension (.heic) sends it to the Files app instead.
 * Elsewhere (desktop) the extensions let HEIC files with no MIME type through.
 */
export function imageAccept(): string {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent) ? "image/*" : "image/*,.heic,.heif";
}

/** Open a hidden photo input with the right `accept` for this device. */
export function openImageInput(el: HTMLInputElement | null) {
  if (!el) return;
  el.accept = imageAccept();
  el.value = "";
  el.click();
}
