import "server-only";
import { logger } from "./ai";
import { redis } from "./queue";

/** The two Redis commands a fixed-window counter needs (ioredis satisfies this). */
export interface CounterStore {
  incr(key: string): Promise<number>;
  pexpire(key: string, ms: number): Promise<number>;
}

/**
 * Fixed-window counter in `store`: true while `key` has made at most `limit` requests in the current
 * `windowMs` window. Shared by every process on the same Redis, so limits survive restarts.
 */
export async function countRequest(store: CounterStore, key: string, limit: number, windowMs: number, now = Date.now()): Promise<boolean> {
  const window = Math.floor(now / windowMs);
  const redisKey = `ratelimit:${key}:${window}`;
  const count = await store.incr(redisKey);
  if (count === 1) await store.pexpire(redisKey, windowMs);
  return count <= limit;
}

const local = new Map<string, number>();
/** In-process fallback while Redis is unreachable, so a Redis blip does not lock everyone out. */
const localStore: CounterStore = {
  incr: async (key) => {
    const n = (local.get(key) ?? 0) + 1;
    local.set(key, n);
    if (local.size > 10_000) local.clear();
    return n;
  },
  pexpire: async () => 1,
};

/** `limit` requests per `windowMs` per key, counted in Redis. */
export async function rateLimit(key: string, limit = 20, windowMs = 60_000): Promise<boolean> {
  try {
    // The shared ioredis client queues commands while disconnected; do not let a request wait on it.
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("rate limit store timed out")), 1_000).unref());
    return await Promise.race([countRequest(redis(), key, limit, windowMs), timeout]);
  } catch (err) {
    logger.warn({ err }, "rate limit store unavailable; counting in process");
    return countRequest(localStore, key, limit, windowMs);
  }
}

/** Guest demos per client IP per hour (GUEST_LIMIT_PER_HOUR, default 30): one office network can host a judging panel. */
export const guestLimitPerHour = () => {
  const n = Number(process.env.GUEST_LIMIT_PER_HOUR);
  return Number.isInteger(n) && n > 0 ? n : 30;
};
