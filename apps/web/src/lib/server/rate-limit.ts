import "server-only";

const buckets = new Map<string, { tokens: number; at: number }>();

/** Token bucket per key: `limit` requests per `windowMs`. In-process, which suits a single web node. */
export function rateLimit(key: string, limit = 20, windowMs = 60_000): boolean {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { tokens: limit, at: now };
  bucket.tokens = Math.min(limit, bucket.tokens + ((now - bucket.at) / windowMs) * limit);
  bucket.at = now;
  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    return false;
  }
  bucket.tokens -= 1;
  buckets.set(key, bucket);
  return true;
}
