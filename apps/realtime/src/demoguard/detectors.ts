import jpeg from "jpeg-js";

// Frame detectors that need no model. With SAM 3.1 loaded, the error dialog and spinner come from
// its regions instead; these remain for blank screens and as the fallback when vision is unavailable.

const GW = 64;
const GH = 36;

export interface FrameStats {
  /** Share of grid cells that are strongly red (error banners, dialogs, toasts). */
  red: number;
  /** Bounding box of the red cells as a share of the frame, 0 when none. */
  redBox: number;
  /** Standard deviation of luminance across the grid; near 0 is a blank screen. */
  lumaStd: number;
  meanLuma: number;
}

export function frameStats(data: Uint8Array): FrameStats | null {
  let img: { width: number; height: number; data: Uint8Array };
  try {
    img = jpeg.decode(data, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 64 });
  } catch {
    return null;
  }
  const r = new Float64Array(GW * GH);
  const g = new Float64Array(GW * GH);
  const b = new Float64Array(GW * GH);
  const n = new Uint32Array(GW * GH);
  // Sample every other pixel; plenty for a 64x36 grid.
  for (let y = 0; y < img.height; y += 2) {
    const gy = Math.min(GH - 1, Math.floor((y * GH) / img.height));
    for (let x = 0; x < img.width; x += 2) {
      const gx = Math.min(GW - 1, Math.floor((x * GW) / img.width));
      const i = (y * img.width + x) * 4;
      const c = gy * GW + gx;
      r[c] = (r[c] ?? 0) + (img.data[i] ?? 0);
      g[c] = (g[c] ?? 0) + (img.data[i + 1] ?? 0);
      b[c] = (b[c] ?? 0) + (img.data[i + 2] ?? 0);
      n[c] = (n[c] ?? 0) + 1;
    }
  }
  let redCells = 0;
  let minX = GW;
  let minY = GH;
  let maxX = -1;
  let maxY = -1;
  let sum = 0;
  let sumSq = 0;
  for (let c = 0; c < GW * GH; c++) {
    const k = n[c] || 1;
    const R = (r[c] ?? 0) / k;
    const G = (g[c] ?? 0) / k;
    const B = (b[c] ?? 0) / k;
    const luma = 0.299 * R + 0.587 * G + 0.114 * B;
    sum += luma;
    sumSq += luma * luma;
    if (R > 140 && R > 1.7 * G && R > 1.7 * B) {
      redCells++;
      const x = c % GW;
      const y = Math.floor(c / GW);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  const cells = GW * GH;
  const mean = sum / cells;
  return {
    red: redCells / cells,
    redBox: maxX < 0 ? 0 : ((maxX - minX + 1) * (maxY - minY + 1)) / cells,
    lumaStd: Math.sqrt(Math.max(0, sumSq / cells - mean * mean)),
    meanLuma: mean,
  };
}

export const BLANK_STD = 4;
/** A red region that grew by this share of the frame over the baseline looks like an error banner or dialog. */
export const RED_RISE = 0.012;
/** A mostly red screen (a red theme or slide) is not a dialog. */
export const RED_MAX = 0.6;

/** Keeps a rolling baseline of how red the healthy app is, so a red logo or theme does not count. */
export class RedBaseline {
  private samples: { atMs: number; red: number }[] = [];

  constructor(private readonly windowMs = 5_000) {}

  /** True when this frame's red share rose sharply above the recent healthy baseline. */
  isError(atMs: number, stats: FrameStats): boolean {
    // The first frame sets the baseline; nothing is an error before there is one.
    const base = this.samples.length ? Math.min(...this.samples.map((s) => s.red)) : stats.red;
    const error = stats.red - base >= RED_RISE && stats.red <= RED_MAX;
    if (!error) {
      this.samples.push({ atMs, red: stats.red });
      this.samples = this.samples.filter((s) => atMs - s.atMs <= this.windowMs);
    }
    return error;
  }
}
