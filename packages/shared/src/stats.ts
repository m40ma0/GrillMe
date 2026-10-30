/** Nearest-rank percentile (p in 0–100). Empty input gives null. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))] ?? null;
}

export function latencySummary(values: number[]) {
  return { n: values.length, p50: percentile(values, 50), p95: percentile(values, 95) };
}

export function formatSeconds(ms: number): string {
  const s = ms / 1000;
  return `${s < 10 ? s.toFixed(1) : Math.round(s)} s`;
}
