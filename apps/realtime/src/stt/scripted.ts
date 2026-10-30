import type { Segment } from "@stage-ready/shared";
import { Vad } from "./vad";
import type { SttHandlers, SttStream } from "./types";

/**
 * Demo Mode only. Detects utterances with the VAD and, for each one, plays the next scripted line as the
 * transcript: partials while the presenter speaks, a final when they pause. It never runs for real projects.
 */
export class ScriptedStt implements SttStream {
  readonly name = "scripted (Demo Mode)";
  private readonly vad = new Vad();
  private index = 0;
  private utteranceStart: number | null = null;
  private lastPartialAt = 0;
  private seq = 0;

  constructor(
    private readonly script: readonly string[],
    private readonly handlers: SttHandlers,
  ) {}

  private line(): string | null {
    return this.script[this.index] ?? null;
  }

  private segment(text: string, startMs: number, endMs: number, final: boolean): Segment {
    const words = text.split(/\s+/);
    const span = Math.max(1, endMs - startMs);
    return {
      id: `scripted-${this.seq}${final ? "" : "-partial"}`,
      startMs: Math.round(startMs),
      endMs: Math.round(endMs),
      speaker: "presenter",
      text,
      words: words.map((w, i) => ({ text: w, startMs: Math.round(startMs + (span * i) / words.length), endMs: Math.round(startMs + (span * (i + 1)) / words.length) })),
    };
  }

  push(pcm: Int16Array, startMs: number): void {
    const endOfChunk = startMs + pcm.length / 16;
    for (const event of this.vad.push(pcm, startMs)) {
      if (event.type === "speech_start") {
        this.utteranceStart = event.atMs;
      } else if (this.utteranceStart !== null) {
        const text = this.line();
        if (text) this.handlers.final(this.segment(text, this.utteranceStart, event.atMs, true));
        this.index++;
        this.seq++;
        this.utteranceStart = null;
      }
    }
    const text = this.line();
    if (this.utteranceStart !== null && text && endOfChunk - this.lastPartialAt >= 300) {
      this.lastPartialAt = endOfChunk;
      const words = text.split(/\s+/);
      const shown = Math.max(1, Math.min(words.length, Math.ceil((endOfChunk - this.utteranceStart) / 350)));
      this.handlers.partial(this.segment(words.slice(0, shown).join(" "), this.utteranceStart, endOfChunk, false));
    }
  }

  async close(): Promise<void> {}
}
