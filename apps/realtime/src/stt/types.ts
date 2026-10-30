import type { Segment } from "@stage-ready/shared";

export interface SttHandlers {
  partial(segment: Segment): void;
  final(segment: Segment): void;
  error(error: Error): void;
}

export interface SttStream {
  /** Shown in the session state and summary, e.g. "faster-whisper" or "scripted (Demo Mode)". */
  readonly name: string;
  /** PCM16 16 kHz mono samples; `startMs` is the session time of the first sample. */
  push(pcm: Int16Array, startMs: number): void;
  close(): Promise<void>;
}

export class SttUnavailableError extends Error {}
