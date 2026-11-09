export type Ratio = "9:16" | "3:4" | "1:1" | "4:3" | "16:9";
export type ExportQuality = "standard" | "high";
export type WatermarkSize = "S" | "M" | "L";
export type WatermarkVariant = "dark" | "light" | "color";
export type JpegQuality = 0.92 | 0.95 | 1;

export interface WatermarkSettings {
  enabled: boolean;
  /** 0..8, row-major 3×3 grid (0 = top-left, 8 = bottom-right). */
  position: number;
  /** 0..1 */
  opacity: number;
  size: WatermarkSize;
  variant: WatermarkVariant;
  /** New photos start with the watermark on. */
  applyAll: boolean;
  jpegQuality: JpegQuality;
}

export interface AppSettings {
  watermark: WatermarkSettings;
  defaultTemplateId: string | null;
}

export interface Template {
  id: string;
  name: string | null;
  full_path: string;
  thumb_path: string;
  width: number | null;
  height: number | null;
  source: "seed" | "upload";
  sort_order: number;
  created_at: string;
}

/** Product placement, stored as fractions of the frame so preview and export match exactly. */
export interface Composition {
  templateId: string | null;
  ratio: Ratio;
  /** Product centre, fraction of frame width. */
  x: number;
  /** Product centre, fraction of frame height. */
  y: number;
  /** Product's longer side as a fraction of the frame's shorter side. */
  s: number;
  watermark: boolean;
}

export interface Creation {
  id: string;
  kind: "original" | "export";
  storage_path: string;
  ratio: string | null;
  template_id: string | null;
  created_at: string;
}
