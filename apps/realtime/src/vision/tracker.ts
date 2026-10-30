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
