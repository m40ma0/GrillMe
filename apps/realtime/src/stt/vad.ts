// Energy VAD over PCM16 16 kHz mono, in 20 ms frames, with an adaptive noise floor.

export const SAMPLE_RATE = 16_000;
const FRAME_SAMPLES = 320; // 20 ms

export interface VadEvent {
  type: "speech_start" | "speech_end";
  atMs: number;
}

export class Vad {
  private noiseDb = -60;
  private speaking = false;
  private speechRun = 0;
  private silenceMs = 0;
  private speechStartMs = 0;
  private carry = new Int16Array(0);
  /** Start of continuous speech, or null while silent. */
  get speechSince(): number | null {
    return this.speaking ? this.speechStartMs : null;
  }

  constructor(private readonly opts: { endSilenceMs?: number; marginDb?: number; minDb?: number } = {}) {}

  /** Feeds PCM16 samples whose first sample is at `startMs`. */
  push(pcm: Int16Array, startMs: number): VadEvent[] {
    const samples = new Int16Array(this.carry.length + pcm.length);
    samples.set(this.carry);
    samples.set(pcm, this.carry.length);
    const events: VadEvent[] = [];
    const base = startMs - (this.carry.length / SAMPLE_RATE) * 1000;
    let offset = 0;
    for (; offset + FRAME_SAMPLES <= samples.length; offset += FRAME_SAMPLES) {
      let sum = 0;
      for (let i = offset; i < offset + FRAME_SAMPLES; i++) {
        const v = (samples[i] ?? 0) / 32768;
        sum += v * v;
      }
      const db = 10 * Math.log10(sum / FRAME_SAMPLES + 1e-10);
      const atMs = base + (offset / SAMPLE_RATE) * 1000;
      const isSpeech = db > Math.max(this.opts.minDb ?? -45, this.noiseDb + (this.opts.marginDb ?? 12));
      if (!isSpeech) this.noiseDb = this.noiseDb * 0.98 + db * 0.02;
      if (isSpeech) {
        this.speechRun++;
        this.silenceMs = 0;
        if (!this.speaking && this.speechRun >= 3) {
          this.speaking = true;
          this.speechStartMs = atMs - 40;
          events.push({ type: "speech_start", atMs: this.speechStartMs });
        }
      } else {
        this.speechRun = 0;
        if (this.speaking) {
          this.silenceMs += 20;
          if (this.silenceMs >= (this.opts.endSilenceMs ?? 600)) {
            this.speaking = false;
            events.push({ type: "speech_end", atMs: atMs - this.silenceMs + 20 });
          }
        }
      }
    }
    this.carry = samples.slice(offset);
    return events;
  }
}

export function pcmFromBytes(bytes: Uint8Array): Int16Array {
  const copy = new Uint8Array(bytes.byteLength - (bytes.byteLength % 2));
  copy.set(bytes.subarray(0, copy.byteLength));
  return new Int16Array(copy.buffer);
}
