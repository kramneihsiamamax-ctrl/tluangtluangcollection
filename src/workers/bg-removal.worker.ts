/// <reference lib="webworker" />
/**
 * Background-removal worker. Everything heavy runs here so the UI never freezes:
 *   decode (EXIF-aware) → normalised JPEG original → ONNX segmentation → alpha-trimmed cutout.
 * The cutout is returned as transferable ImageBitmaps (full + ≤1440px preview); a PNG copy
 * (for IndexedDB only — never uploaded) follows in a separate message.
 */
import { preload, removeBackground, type Config } from "@imgly/background-removal";

declare const self: DedicatedWorkerGlobalScope;

export type WorkerIn =
  | { type: "preload" }
  | { type: "process"; id: string; file: Blob; maxSide: number; previewMax: number };

export type WorkerOut =
  | { type: "preload-progress"; loaded: number; total: number }
  | { type: "preloaded" }
  | { type: "preload-error"; message: string }
  | { type: "decode-failed"; id: string }
  | { type: "original"; id: string; blob: Blob; width: number; height: number }
  | { type: "progress"; id: string; stage: "download" | "decode" | "inference" | "mask" | "trim"; value: number }
  | {
      type: "done";
      id: string;
      full: ImageBitmap;
      preview: ImageBitmap;
      crop: { x: number; y: number; w: number; h: number };
      empty: boolean;
    }
  | { type: "png"; id: string; blob: Blob }
  | { type: "error"; id: string; message: string };

const post = (msg: WorkerOut, transfer: Transferable[] = []) => self.postMessage(msg, transfer);

let device: "gpu" | "cpu" = "cpu";
try {
  // WebGPU is much faster where available; we fall back to CPU (WASM) on any failure.
  device = "gpu" in self.navigator && (self.navigator as Navigator & { gpu?: unknown }).gpu ? "gpu" : "cpu";
} catch {
  device = "cpu";
}

const fileSizes = new Map<string, [number, number]>();
let progressSink: ((loaded: number, total: number) => void) | null = null;

function baseConfig(): Config {
  return {
    device,
    model: "isnet_fp16",
    output: { format: "image/x-rgba8", quality: 1 },
    progress: (key: string, current: number, total: number) => {
      if (key.startsWith("fetch:")) {
        fileSizes.set(key, [current, total]);
        let l = 0;
        let t = 0;
        fileSizes.forEach(([a, b]) => {
          l += a;
          t += b;
        });
        progressSink?.(l, t);
      }
    },
  };
}

let ready: Promise<void> | null = null;

function ensureModel(): Promise<void> {
  if (!ready) {
    ready = preload(baseConfig()).catch(async (err) => {
      if (device === "gpu") {
        device = "cpu";
        return preload(baseConfig());
      }
      throw err;
    });
    ready.catch(() => {
      ready = null;
    });
  }
  return ready;
}

async function handlePreload() {
  progressSink = (loaded, total) => post({ type: "preload-progress", loaded, total });
  try {
    await ensureModel();
    post({ type: "preloaded" });
  } catch (e) {
    post({ type: "preload-error", message: (e as Error).message });
  } finally {
    progressSink = null;
  }
}

async function handleProcess(id: string, file: Blob, maxSide: number, previewMax: number) {
  // 1) Decode with EXIF orientation (off the main thread).
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    post({ type: "decode-failed", id });
    return;
  }

  // 2) Normalise: cap the long side (no upscaling), draw once, read RGBA + encode the JPEG original.
  const long = Math.max(bmp.width, bmp.height);
  const k = long > maxSide ? maxSide / long : 1;
  const W = Math.round(bmp.width * k);
  const H = Math.round(bmp.height * k);
  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(bmp, 0, 0, W, H);
  bmp.close();
  const rgba = ctx.getImageData(0, 0, W, H);
  const jpeg = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.95 });
  post({ type: "original", id, blob: jpeg, width: W, height: H });

  // 3) Segment. Download progress (first run only) and coarse compute stages.
  progressSink = (l, t) => post({ type: "progress", id, stage: "download", value: t ? l / t : 0 });
  try {
    await ensureModel();
  } finally {
    progressSink = null;
  }
  post({ type: "progress", id, stage: "decode", value: 0.1 });

  const input = new Blob([rgba.data], { type: `image/x-rgba8;width=${W};height=${H}` });
  const cfg = baseConfig();
  cfg.progress = (key: string) => {
    if (key === "compute:inference") post({ type: "progress", id, stage: "inference", value: 0.25 });
    if (key === "compute:mask") post({ type: "progress", id, stage: "mask", value: 0.8 });
  };
  let out: Blob;
  try {
    out = await removeBackground(input, cfg);
  } catch (err) {
    if (device !== "gpu") throw err;
    // WebGPU failed at inference time — retry once on CPU.
    device = "cpu";
    ready = null;
    await ensureModel();
    out = await removeBackground(input, { ...cfg, device: "cpu" });
  }
  const data = new Uint8ClampedArray(await out.arrayBuffer());
  post({ type: "progress", id, stage: "trim", value: 0.9 });

  // 4) Trim transparent margins so "centred" means the product is centred.
  let minX = W;
  let minY = H;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < H; y++) {
    const row = y * W * 4;
    for (let x = 0; x < W; x++) {
      if (data[row + x * 4 + 3] > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const empty = maxX < 0;
  const crop = empty
    ? { x: 0, y: 0, w: W, h: H }
    : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };

  const cutData = new ImageData(data, W, H);
  const full = await createImageBitmap(cutData, crop.x, crop.y, crop.w, crop.h, { premultiplyAlpha: "default" });
  const pk = Math.min(1, previewMax / Math.max(crop.w, crop.h));
  const preview = await createImageBitmap(full, {
    resizeWidth: Math.max(1, Math.round(crop.w * pk)),
    resizeHeight: Math.max(1, Math.round(crop.h * pk)),
    resizeQuality: "high",
  });
  post({ type: "done", id, full, preview, crop, empty }, [full, preview]);

  // 5) PNG copy of the trimmed cutout for IndexedDB (lets the editor survive a reload).
  try {
    const c2 = new OffscreenCanvas(crop.w, crop.h);
    c2.getContext("2d")!.putImageData(cutData, -crop.x, -crop.y);
    const png = await c2.convertToBlob({ type: "image/png" });
    post({ type: "png", id, blob: png });
  } catch {
    /* non-fatal */
  }
}

// Jobs run one at a time.
let queue: Promise<void> = Promise.resolve();

self.onmessage = (e: MessageEvent<WorkerIn>) => {
  const msg = e.data;
  if (msg.type === "preload") {
    queue = queue.then(handlePreload);
    return;
  }
  if (msg.type === "process") {
    queue = queue.then(() =>
      handleProcess(msg.id, msg.file, msg.maxSide, msg.previewMax).catch((err: unknown) =>
        post({ type: "error", id: msg.id, message: (err as Error)?.message ?? String(err) }),
      ),
    );
  }
};
