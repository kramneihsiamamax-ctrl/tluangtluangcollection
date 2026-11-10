/**
 * Post-processing for the AI cutout (runs in the bg-removal worker).
 *
 * `px` is the RGBA output of the model: original colours with the predicted alpha.
 * It is modified in place.
 *
 *  1. Plain-backdrop cleanup — when the photo's border is one uniform colour (a wall,
 *     a sheet, a backdrop), pixels of that colour that are connected to the border or
 *     to clearly-removed areas are cleared, edges get an alpha ramp from the colour
 *     distance, and backdrop colour is unmixed from semi-transparent edge pixels.
 *     Skipped automatically when the product's own colour is too close to the backdrop.
 *  2. Speck removal — tiny islands far from the product are removed (always).
 */

export interface RefineStats {
  plain: boolean;
  bg?: [number, number, number];
  cleared: number;
  specks: number;
  skipped?: "not-plain" | "low-contrast" | "too-much";
}

// Luma/chroma split so soft shadows on the backdrop (darker, same hue) still count as backdrop.
function dist(r: number, g: number, b: number, bY: number, bCb: number, bCr: number): number {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const dCb = b - y - bCb;
  const dCr = r - y - bCr;
  const dY = y - bY;
  return Math.sqrt(dCb * dCb + dCr * dCr) * 1.4 + Math.abs(dY) * (dY < 0 ? 0.4 : 1);
}

function median(a: number[]): number {
  const s = a.slice().sort((x, y) => x - y);
  return s[s.length >> 1];
}

export function refineCutout(px: Uint8ClampedArray, W: number, H: number): RefineStats {
  const N = W * H;
  const queue = new Int32Array(N);
  const mark = new Uint8Array(N);
  const stats: RefineStats = { plain: false, cleared: 0, specks: 0 };

  backdrop: {
    // ---- 1a. Sample the border band.
    const band = Math.max(2, Math.round(Math.min(W, H) * 0.02));
    const step = Math.max(1, Math.round((2 * (W + H) * band) / 6000));
    const rs: number[] = [];
    const gs: number[] = [];
    const bs: number[] = [];
    let k = 0;
    for (let y = 0; y < H; y++) {
      const edgeRow = y < band || y >= H - band;
      for (let x = 0; x < W; x++) {
        if (!edgeRow && x === band && W - band > band) x = W - band; // skip the interior
        if (k++ % step) continue;
        const i = (y * W + x) * 4;
        rs.push(px[i]);
        gs.push(px[i + 1]);
        bs.push(px[i + 2]);
      }
    }
    if (rs.length < 50) {
      stats.skipped = "not-plain";
      break backdrop;
    }
    const bg: [number, number, number] = [median(rs), median(gs), median(bs)];
    const bY = 0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2];
    const bCb = bg[2] - bY;
    const bCr = bg[0] - bY;
    const ds = rs.map((_, j) => dist(rs[j], gs[j], bs[j], bY, bCb, bCr)).sort((a, b) => a - b);
    const p80 = ds[Math.floor(ds.length * 0.8)];
    // Uniform border? (80 % of samples close to the median colour.)
    if (p80 > 30) {
      stats.skipped = "not-plain";
      break backdrop;
    }
    stats.plain = true;
    stats.bg = bg;
    const tLow = Math.min(30, Math.max(14, p80 * 1.6));
    const tHigh = tLow * 2.2;

    // ---- 1b. Per-pixel distance to the backdrop (0..255).
    const d = new Uint8Array(N);
    let fg = 0;
    let fgClose = 0;
    for (let p = 0, i = 0; p < N; p++, i += 4) {
      const v = dist(px[i], px[i + 1], px[i + 2], bY, bCb, bCr);
      d[p] = v > 255 ? 255 : v;
      if (px[i + 3] > 200) {
        fg++;
        if (v < tLow) fgClose++;
      }
    }
    // Product too close in colour to the backdrop — don't risk eating into it.
    if (!fg || fgClose / fg > 0.12) {
      stats.skipped = "low-contrast";
      break backdrop;
    }

    // ---- 1c. Flood fill backdrop-coloured pixels from the border and from confident background.
    const alpha0 = new Uint8Array(N);
    for (let p = 0; p < N; p++) alpha0[p] = px[p * 4 + 3];
    let qt = 0;
    const seed = (p: number) => {
      if (!mark[p] && d[p] < tLow) {
        mark[p] = 1;
        queue[qt++] = p;
      }
    };
    for (let x = 0; x < W; x++) {
      seed(x);
      seed((H - 1) * W + x);
    }
    for (let y = 0; y < H; y++) {
      seed(y * W);
      seed(y * W + W - 1);
    }
    for (let p = 0; p < N; p++) if (alpha0[p] < 20) seed(p);
    for (let qh = 0; qh < qt; qh++) {
      const p = queue[qh];
      const x = p % W;
      if (x > 0) seed(p - 1);
      if (x < W - 1) seed(p + 1);
      if (p >= W) seed(p - W);
      if (p < N - W) seed(p + W);
    }
    let removedFg = 0;
    for (let qh = 0; qh < qt; qh++) {
      const p = queue[qh];
      if (alpha0[p] > 200) removedFg++;
    }
    // Safety net: never remove a big part of what the model called product.
    if (removedFg / fg > 0.2) {
      stats.skipped = "too-much";
      mark.fill(0);
      break backdrop;
    }
    for (let qh = 0; qh < qt; qh++) {
      const p = queue[qh];
      if (px[p * 4 + 3]) stats.cleared++;
      px[p * 4 + 3] = 0;
    }

    // ---- 1d. Edge band (2 px next to cleared pixels): alpha ramp from colour distance.
    for (let pass = 0; pass < 2; pass++) {
      const val = pass + 2; // 2, 3 = band rings
      for (let p = 0; p < N; p++) {
        if (mark[p]) continue;
        const x = p % W;
        const n =
          (x > 0 && mark[p - 1] === val - 1) ||
          (x < W - 1 && mark[p + 1] === val - 1) ||
          (p >= W && mark[p - W] === val - 1) ||
          (p < N - W && mark[p + W] === val - 1);
        if (n) mark[p] = val;
      }
    }
    for (let p = 0; p < N; p++) {
      if (mark[p] < 2) continue;
      const t = (d[p] - tLow) / (tHigh - tLow);
      const ramp = t <= 0 ? 0 : t >= 1 ? 255 : Math.round(t * t * (3 - 2 * t) * 255);
      if (ramp < px[p * 4 + 3]) px[p * 4 + 3] = ramp;
    }

    // ---- 1e. Unmix backdrop colour from semi-transparent edge pixels (removes the halo).
    for (let p = 0, i = 0; p < N; p++, i += 4) {
      const a = px[i + 3];
      if (a === 0 || a === 255) continue;
      const af = a / 255;
      if (af < 0.15) continue;
      for (let c = 0; c < 3; c++) {
        const f = (px[i + c] - (1 - af) * bg[c]) / af;
        px[i + c] = px[i + c] * 0.3 + f * 0.7; // Uint8ClampedArray clamps
      }
    }
    mark.fill(0);
  }

  // ---- 2. Speck removal: components of alpha > 10; drop tiny ones and pure haze.
  const comps: { start: number; end: number; area: number; maxA: number }[] = [];
  let qt = 0;
  for (let s = 0; s < N; s++) {
    if (mark[s] || px[s * 4 + 3] <= 10) continue;
    const start = qt;
    mark[s] = 1;
    queue[qt++] = s;
    let maxA = 0;
    for (let qh = start; qh < qt; qh++) {
      const p = queue[qh];
      const a = px[p * 4 + 3];
      if (a > maxA) maxA = a;
      const x = p % W;
      const visit = (q: number) => {
        if (!mark[q] && px[q * 4 + 3] > 10) {
          mark[q] = 1;
          queue[qt++] = q;
        }
      };
      if (x > 0) visit(p - 1);
      if (x < W - 1) visit(p + 1);
      if (p >= W) visit(p - W);
      if (p < N - W) visit(p + W);
    }
    comps.push({ start, end: qt, area: qt - start, maxA });
  }
  const largest = comps.reduce((m, c) => Math.max(m, c.area), 0);
  const minArea = Math.max(64, largest * 0.002);
  for (const c of comps) {
    if (c.area === largest) continue;
    if (c.area < minArea || c.maxA < 128) {
      for (let qh = c.start; qh < c.end; qh++) px[queue[qh] * 4 + 3] = 0;
      stats.specks++;
    }
  }
  return stats;
}
