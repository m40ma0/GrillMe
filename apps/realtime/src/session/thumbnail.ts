import jpeg from "jpeg-js";

/**
 * A small JPEG data URL of a frame (240 px wide by default), stored as a step's expected-state keyframe so
 * the step map can show what the result looked like in the golden run. Null when the frame cannot be read.
 */
export function thumbnailDataUrl(frame: Uint8Array, width = 240): string | null {
  try {
    const src = jpeg.decode(frame, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 64 });
    const scale = Math.min(1, width / src.width);
    const w = Math.max(1, Math.round(src.width * scale));
    const h = Math.max(1, Math.round(src.height * scale));
    const out = new Uint8Array(w * h * 4);
    // Box-average each output pixel over its source block: sharp enough for a 240 px preview.
    const step = 1 / scale;
    for (let y = 0; y < h; y++) {
      const y0 = Math.floor(y * step);
      const y1 = Math.min(src.height, Math.max(y0 + 1, Math.floor((y + 1) * step)));
      for (let x = 0; x < w; x++) {
        const x0 = Math.floor(x * step);
        const x1 = Math.min(src.width, Math.max(x0 + 1, Math.floor((x + 1) * step)));
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let sy = y0; sy < y1; sy++) {
          for (let sx = x0; sx < x1; sx++) {
            const i = (sy * src.width + sx) * 4;
            r += src.data[i] ?? 0;
            g += src.data[i + 1] ?? 0;
            b += src.data[i + 2] ?? 0;
            n++;
          }
        }
        const o = (y * w + x) * 4;
        out[o] = r / n;
        out[o + 1] = g / n;
        out[o + 2] = b / n;
        out[o + 3] = 255;
      }
    }
    const encoded = jpeg.encode({ data: out, width: w, height: h }, 70);
    return `data:image/jpeg;base64,${Buffer.from(encoded.data).toString("base64")}`;
  } catch {
    return null;
  }
}
