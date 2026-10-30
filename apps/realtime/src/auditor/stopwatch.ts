import type { UiRegion } from "@stage-ready/shared";

// Latency stopwatch: an action starts on a click or Enter (companion input hooks) or a frame change,
// and completes when the spinner or progress bar is gone and the result region appears (SAM 3.1),
// or, without vision, at the last large screen change once the screen has been stable.

export interface StopwatchOptions {
  stableMs: number;
  /** dHash Hamming distance (0–64) that counts as a change. */
  minChange: number;
  /** Distance that counts as the result appearing. */
  bigChange: number;
  minDurationMs: number;
  maxDurationMs: number;
}

// Calibrated on 9x8 dHash: a result panel covering a third of the screen moves 6–10 bits; cursors and spinners move 0–2.
export const DEFAULT_STOPWATCH: StopwatchOptions = { stableMs: 800, minChange: 3, bigChange: 6, minDurationMs: 300, maxDurationMs: 30_000 };

export type StopwatchEvent =
  { type: "started"; startMs: number } | { type: "completed"; startMs: number; endMs: number; durationMs: number; detector: "sam" | "phash" } | { type: "abandoned"; startMs: number };

type State =
  | { kind: "idle" }
  | { kind: "running"; startMs: number; byInput: boolean; announced: boolean; lastChangeMs: number; lastBigMs: number | null; busy: boolean; resultMs: number | null; samSeen: boolean };

const BUSY = new Set(["spinner", "progress_bar"]);
const WAITING_MS = 1_500;

export class Stopwatch {
  private state: State = { kind: "idle" };

  constructor(private readonly opts: StopwatchOptions = DEFAULT_STOPWATCH) {}

  get running(): { startMs: number } | null {
    return this.state.kind === "running" && this.state.announced ? { startMs: this.state.startMs } : null;
  }

  private start(atMs: number, byInput: boolean): StopwatchEvent[] {
    this.state = { kind: "running", startMs: atMs, byInput, announced: byInput, lastChangeMs: atMs, lastBigMs: null, busy: false, resultMs: null, samSeen: false };
    return byInput ? [{ type: "started", startMs: atMs }] : [];
  }

  /** Click or key from the companion's input hooks: the start of an action. */
  input(atMs: number): StopwatchEvent[] {
    const s = this.state;
    // A new input before anything visible happened restarts the action (typing, then the real click).
    if (s.kind === "running" && (s.lastBigMs !== null || s.resultMs !== null)) return [...this.finish(atMs, true), ...this.start(atMs, true)];
    return this.start(atMs, true);
  }

  /** A sampled frame with its distance from the previous frame and, when the vision service answered, UI regions. */
  frame(atMs: number, distance: number, regions: UiRegion[] | null): StopwatchEvent[] {
    const s = this.state;
    if (s.kind === "idle") {
      if (distance < this.opts.minChange && !regions?.some((r) => BUSY.has(r.label))) return [];
      const events = this.start(atMs, false);
      if (regions) return [...events, ...this.frame(atMs, 0, regions)];
      return events;
    }
    const events: StopwatchEvent[] = [];
    // Without a visible result yet, a change after a quiet gap is a new action (typing, then Enter).
    if (!s.byInput && !s.announced && s.lastBigMs === null && distance >= this.opts.minChange && distance < this.opts.bigChange && atMs - s.lastChangeMs >= this.opts.stableMs) s.startMs = atMs;
    if (distance >= this.opts.minChange) s.lastChangeMs = atMs;
    if (distance >= this.opts.bigChange && atMs > s.startMs) s.lastBigMs = atMs;
    if (regions) {
      s.samSeen = true;
      s.busy = regions.some((r) => BUSY.has(r.label));
      if (s.busy && !s.announced) {
        s.announced = true;
        events.push({ type: "started", startMs: s.startMs });
      }
      if (!s.busy && regions.some((r) => r.label === "result_region") && s.resultMs === null && atMs > s.startMs) s.resultMs = atMs;
    }
    if ((s.lastBigMs !== null || s.busy) && !s.announced) {
      s.announced = true;
      events.push({ type: "started", startMs: s.startMs });
    }
    return [...events, ...this.tick(atMs)];
  }

  /** Called on a timer; completes or abandons the action once the screen settles. */
  tick(nowMs: number): StopwatchEvent[] {
    const s = this.state;
    if (s.kind !== "running") return [];
    if (nowMs - s.startMs > this.opts.maxDurationMs) {
      this.state = { kind: "idle" };
      return s.announced ? [{ type: "abandoned", startMs: s.startMs }] : [];
    }
    if (s.busy || nowMs - s.lastChangeMs < this.opts.stableMs) return [];
    if (s.resultMs !== null || s.lastBigMs !== null) return this.finish(nowMs, false);
    // A small change followed by a quiet screen looks like waiting on a result (a spinner too small to
    // move the hash). Show it as running; it completes at the next large change or is dropped at the limit.
    if (!s.announced && nowMs - s.startMs >= WAITING_MS) {
      s.announced = true;
      return [{ type: "started", startMs: s.startMs }];
    }
    return [];
  }

  private finish(_nowMs: number, restart: boolean): StopwatchEvent[] {
    const s = this.state;
    if (s.kind !== "running") return [];
    this.state = { kind: "idle" };
    const endMs = s.resultMs ?? s.lastBigMs;
    if (endMs === null) return restart || !s.announced ? [] : [{ type: "abandoned", startMs: s.startMs }];
    const durationMs = endMs - s.startMs;
    if (durationMs < this.opts.minDurationMs) return s.announced ? [{ type: "abandoned", startMs: s.startMs }] : [];
    const detector = s.resultMs !== null ? "sam" : "phash";
    return [...(s.announced ? [] : [{ type: "started" as const, startMs: s.startMs }]), { type: "completed", startMs: s.startMs, endMs, durationMs, detector }];
  }
}
