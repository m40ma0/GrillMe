import { describe, expect, it } from "vitest";
import { countRequest, type CounterStore } from "../src/lib/server/rate-limit";

/** One in-memory "Redis" that two simulated web processes share. */
function sharedStore(): CounterStore {
  const counts = new Map<string, number>();
  return {
    incr: async (key) => {
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return n;
    },
    pexpire: async () => 1,
  };
}

describe("rate limit", () => {
  it("shares one counter across processes and refuses the 31st guest demo in an hour", async () => {
    const store = sharedStore();
    const now = Date.UTC(2026, 9, 31, 12, 5);
    const results: boolean[] = [];
    for (let i = 0; i < 31; i++) results.push(await countRequest(store, "guest:1.2.3.4", 30, 3_600_000, now + i));
    expect(results.slice(0, 30).every(Boolean)).toBe(true);
    expect(results[30]).toBe(false);
  });

  it("starts a fresh window after the hour", async () => {
    const store = sharedStore();
    const now = Date.UTC(2026, 9, 31, 12, 5);
    for (let i = 0; i < 30; i++) await countRequest(store, "k", 30, 3_600_000, now);
    expect(await countRequest(store, "k", 30, 3_600_000, now + 3_600_000)).toBe(true);
  });
});
