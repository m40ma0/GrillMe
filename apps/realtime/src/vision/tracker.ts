import { SAM_PHRASES, samSegment, toRegions } from "@stage-ready/ai";
import type { UiRegion } from "@stage-ready/shared";

/** Asks the vision service (SAM 3.1) for spinner, error dialog, progress bar and result regions in one frame. */
export class VisionTracker {
  private inflight = false;
  available: boolean | null = null;

  constructor(
    private readonly baseUrl: string | undefined,
    private readonly token: string | undefined,
  ) {}

  async probe(): Promise<boolean> {
    if (!this.baseUrl) return (this.available = false);
    try {
      const response = await fetch(`${this.baseUrl.replace(/\/+$/, "")}/api/health`, { signal: AbortSignal.timeout(2_000) });
      const body = (await response.json()) as { tracker?: string };
      this.available = response.ok && body.tracker === "sam";
    } catch {
      this.available = false;
    }
    return this.available;
  }

  /** Returns regions, or null when busy, unavailable or over the 800 ms budget (the stopwatch then uses hashes). */
  async track(jpeg: Uint8Array): Promise<UiRegion[] | null> {
    if (!this.available || this.inflight || !this.baseUrl) return null;
    this.inflight = true;
    try {
      const response = await fetch(`${this.baseUrl.replace(/\/+$/, "")}/track?prompts=spinner,error_dialog,progress_bar,result_region`, {
        method: "POST",
        headers: { "content-type": "image/jpeg", ...(this.token ? { authorization: `Bearer ${this.token}` } : {}) },
        body: Buffer.from(jpeg),
        signal: AbortSignal.timeout(800),
      });
      if (!response.ok) return null;
      const body = (await response.json()) as { regions: UiRegion[] };
      return body.regions;
    } catch {
      return null;
    } finally {
      this.inflight = false;
    }
  }
}

/** What the stopwatch and DemoGuard need from a UI tracker. */
export type Tracker = Pick<VisionTracker, "available" | "probe" | "track">;

/**
 * SAM 3.1 hosted on the Meta Model API. One concept per request, so each frame sends the three
 * phrases in parallel; only one frame is in flight at a time, which throttles cost and load.
 */
export class HostedSamTracker implements Tracker {
  private inflight = false;
  available: boolean | null = null;

  constructor(private readonly config: { baseUrl: string; apiKey: string; model: string; timeoutMs?: number }) {}

  async probe(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl.replace(/\/+$/, "")}/models/${encodeURIComponent(this.config.model)}`, {
        headers: { authorization: `Bearer ${this.config.apiKey}` },
        signal: AbortSignal.timeout(5_000),
      });
      this.available = response.ok;
    } catch {
      this.available = false;
    }
    return this.available;
  }

  async track(jpeg: Uint8Array): Promise<UiRegion[] | null> {
    if (!this.available || this.inflight) return null;
    this.inflight = true;
    const signal = AbortSignal.timeout(this.config.timeoutMs ?? 1_500);
    try {
      const results = await Promise.allSettled(
        Object.entries(SAM_PHRASES).map(async ([label, phrase]) => toRegions(label as UiRegion["label"], await samSegment(this.config, phrase as string, jpeg, signal))),
      );
      if (results.every((r) => r.status === "rejected")) return null;
      return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    } finally {
      this.inflight = false;
    }
  }
}

/**
 * Hosted SAM inside the Demo Mode allowance: each frame costs three calls (one per phrase) from the daily
 * demo budget, and past it the tracker reports nothing (the red-region heuristic and hashes still run).
 */
export class BudgetedTracker implements Tracker {
  constructor(
    private readonly inner: Tracker,
    private readonly budget: { allow(calls: number): Promise<boolean> },
    private readonly callsPerFrame = 3,
  ) {}
  get available() {
    return this.inner.available;
  }
  probe() {
    return this.inner.probe();
  }
  async track(jpeg: Uint8Array) {
    if (!(await this.budget.allow(this.callsPerFrame))) return null;
    return this.inner.track(jpeg);
  }
}
