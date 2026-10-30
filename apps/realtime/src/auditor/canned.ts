import jpeg from "jpeg-js";

// Canned-response detector: if different inputs produce identical outputs, the result may be hard-coded.
// "Input" is the screen just before an action; "output" is the screen when its result appears.

const W = 17;
const H = 16;

/** 256-bit difference hash (hex) of a JPEG on a 17x16 grayscale grid. */
export function fineHash(data: Uint8Array): string | null {
  let img: { width: number; height: number; data: Uint8Array };
  try {
    img = jpeg.decode(data, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 64 });
  } catch {
    return null;
  }
  const gray = new Float64Array(W * H);
  const counts = new Uint32Array(W * H);
  for (let y = 0; y < img.height; y++) {
    const gy = Math.min(H - 1, Math.floor((y * H) / img.height));
    for (let x = 0; x < img.width; x++) {
      const gx = Math.min(W - 1, Math.floor((x * W) / img.width));
      const i = (y * img.width + x) * 4;
      gray[gy * W + gx] = (gray[gy * W + gx] ?? 0) + 0.299 * (img.data[i] ?? 0) + 0.587 * (img.data[i + 1] ?? 0) + 0.114 * (img.data[i + 2] ?? 0);
      counts[gy * W + gx] = (counts[gy * W + gx] ?? 0) + 1;
    }
  }
  let bits = "";
  for (let y = 0; y < H; y++) for (let x = 0; x < W - 1; x++) bits += (gray[y * W + x] ?? 0) / (counts[y * W + x] || 1) > (gray[y * W + x + 1] ?? 0) / (counts[y * W + x + 1] || 1) ? "1" : "0";
  return BigInt(`0b${bits}`).toString(16).padStart(64, "0");
}

export function hexHamming(a: string, b: string): number {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let n = 0;
  while (x) {
    x &= x - 1n;
    n++;
  }
  return n;
}

export interface StepSample {
  sessionId: string;
  stepKey: string;
  startMs: number;
  inputHash: string | null;
  outputHash: string | null;
}

export interface CannedFlag {
  stepKey: string;
  detail: string;
  refs: string[];
}

/** Pairs of the same step whose inputs differ (≥ 12 of 256 bits) but whose outputs match (≤ 3 bits). */
export function detectCanned(samples: StepSample[], opts = { inputDiff: 12, outputSame: 3 }): CannedFlag[] {
  const flags: CannedFlag[] = [];
  const byStep = new Map<string, StepSample[]>();
  for (const s of samples) if (s.inputHash && s.outputHash) byStep.set(s.stepKey, [...(byStep.get(s.stepKey) ?? []), s]);
  for (const [stepKey, list] of byStep) {
    let found: [StepSample, StepSample] | null = null;
    for (let i = 0; i < list.length && !found; i++) {
      for (let j = i + 1; j < list.length && !found; j++) {
        const a = list[i]!;
        const b = list[j]!;
        if (hexHamming(a.inputHash!, b.inputHash!) >= opts.inputDiff && hexHamming(a.outputHash!, b.outputHash!) <= opts.outputSame) found = [a, b];
      }
    }
    if (found) {
      const [a, b] = found;
      const where = (s: StepSample) => `${s.sessionId === b.sessionId && s === b ? "this session" : `session ${s.sessionId.slice(0, 8)}`} @ ${Math.round(s.startMs / 1000)} s`;
      flags.push({ stepKey, detail: `Step ${stepKey} showed the same result for two different inputs. The response may be canned or hard-coded.`, refs: [where(a), where(b)] });
    }
  }
  return flags;
}
