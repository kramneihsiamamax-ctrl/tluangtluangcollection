import type { AppSettings, ExportQuality, Ratio, WatermarkSize, WatermarkVariant } from "./types";

export const RATIOS: Ratio[] = ["9:16", "3:4", "1:1", "4:3", "16:9"];

export const RATIO_VALUE: Record<Ratio, number> = {
  "9:16": 9 / 16,
  "3:4": 3 / 4,
  "1:1": 1,
  "4:3": 4 / 3,
  "16:9": 16 / 9,
};

export const EXPORT_SIZES: Record<Ratio, Record<ExportQuality, [number, number]>> = {
  "9:16": { standard: [1080, 1920], high: [2160, 3840] },
  "3:4": { standard: [1080, 1440], high: [2160, 2880] },
  "1:1": { standard: [1080, 1080], high: [2160, 2160] },
  "4:3": { standard: [1440, 1080], high: [2880, 2160] },
  "16:9": { standard: [1920, 1080], high: [3840, 2160] },
};

/** Watermark width as a fraction of frame width. */
export const WATERMARK_SIZE: Record<WatermarkSize, number> = { S: 0.18, M: 0.26, L: 0.34 };
/** Watermark margin as a fraction of frame width. */
export const WATERMARK_MARGIN = 0.03;

export const WATERMARK_SRC: Record<WatermarkVariant, string> = {
  dark: "/brand/watermark-dark.png",
  light: "/brand/watermark-light.png",
  color: "/brand/watermark-color.png",
};

/** Default product size: longer side ≈ 70% of the frame's shorter side. */
export const DEFAULT_SCALE = 0.7;
export const MIN_SCALE = 0.1;
export const MAX_SCALE = 1.6;

/** Preview bitmaps are capped at this long side; export uses full resolution. */
export const PREVIEW_MAX = 1440;

export const DEFAULT_SETTINGS: AppSettings = {
  watermark: {
    enabled: true,
    position: 8,
    opacity: 0.6,
    size: "M",
    variant: "dark",
    applyAll: true,
    jpegQuality: 0.95,
  },
  defaultTemplateId: null,
};

export const LS = {
  visited: "tc.visited",
  settings: "tc.settings",
  templates: "tc.templates",
  ratio: "tc.ratio",
} as const;
