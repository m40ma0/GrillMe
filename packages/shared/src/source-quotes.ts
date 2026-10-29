import type { EventSpecExtraction } from "./calibration";
import type { WinnerProfile } from "./core";

export function normalizeForMatch(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[‘’‛]/g, "'").replace(/[“”‟]/g, '"').replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
}

/** A quote counts only when it is a verbatim span (whitespace and case aside) of the source. */
export function quoteAppears(quote: string | undefined, normalizedSource: string): boolean {
  if (!quote) return false;
  const q = normalizeForMatch(quote);
  return q.length >= 2 && normalizedSource.includes(q);
}

/** Integer percentages that sum to exactly 100, returned as 0–1 weights. */
export function equalWeights(count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(100 / count);
  const extra = 100 - base * count;
  return Array.from({ length: count }, (_, i) => (base + (i < extra ? 1 : 0)) / 100);
}

/** Rescales weights to integer percentages summing to 100 (largest remainder). */
export function normalizeWeights(weights: number[]): number[] {
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (weights.length === 0 || total <= 0) return equalWeights(weights.length);
  const raw = weights.map((w) => (w / total) * 100);
  const floors = raw.map(Math.floor);
  let rest = 100 - floors.reduce((sum, f) => sum + f, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (rest <= 0) break;
    floors[i] = (floors[i] ?? 0) + 1;
    rest -= 1;
  }
  return floors.map((f) => f / 100);
}

export interface QuoteEnforcement<T> {
  value: T;
  /** Field paths whose values were removed because no verbatim quote supports them. */
  dropped: string[];
}

/**
 * Keeps only what the source text supports. Every surviving field has a
 * verbatim quote in `sourceQuotes`; unsupported scalars become null,
 * unsupported list items are removed, and unsupported weights fall back to
 * equal weights marked as inferred.
 */
export function enforceEventSpecQuotes(raw: EventSpecExtraction, source: string): QuoteEnforcement<EventSpecExtraction> {
  const src = normalizeForMatch(source);
  const q = raw.sourceQuotes;
  const quotes: Record<string, string> = {};
  const dropped: string[] = [];
  const keep = (from: string, to: string) => {
    const quote = q[from];
    if (quote && quoteAppears(quote, src)) {
      quotes[to] = quote;
      return true;
    }
    return false;
  };

  const name = keep("name", "name") ? raw.name : "";
  if (!name && raw.name) dropped.push("name");

  const tracks = raw.tracks.filter((track, i) => {
    const ok = keep(`tracks.${i}`, `tracks.${Object.keys(quotes).filter((k) => /^tracks\.\d+$/.test(k)).length}`);
    if (!ok) dropped.push(`tracks.${i} (${track.name})`);
    return ok;
  });

  const kept: { c: EventSpecExtraction["criteria"][number]; from: number }[] = [];
  raw.criteria.forEach((c, i) => {
    if (keep(`criteria.${i}`, `criteria.${kept.length}`)) kept.push({ c, from: i });
    else dropped.push(`criteria.${i} (${c.name})`);
  });
  const weightsQuoted = !raw.weightsInferred && kept.length > 0 && kept.every(({ from }) => quoteAppears(q[`criteria.${from}.weight`], src));
  const weights = weightsQuoted ? normalizeWeights(kept.map(({ c }) => c.weight)) : equalWeights(kept.length);
  if (weightsQuoted) kept.forEach(({ from }, i) => (quotes[`criteria.${i}.weight`] = q[`criteria.${from}.weight`] ?? ""));
  else if (!raw.weightsInferred && kept.length > 0) dropped.push("criteria weights (no published weights found)");
  const criteria = kept.map(({ c }, i) => ({ ...c, weight: weights[i] ?? 0 }));

  const requiredTech = raw.requiredTech.filter((tech, i) => {
    const ok = keep(`requiredTech.${i}`, `requiredTech.${Object.keys(quotes).filter((k) => k.startsWith("requiredTech.")).length}`);
    if (!ok) dropped.push(`requiredTech.${i} (${tech})`);
    return ok;
  });

  const req = raw.requirements;
  const scalar = <K extends keyof typeof req>(key: K, valid: (v: NonNullable<(typeof req)[K]>) => boolean) => {
    const v = req[key];
    if (v === null) return null;
    if (valid(v as NonNullable<(typeof req)[K]>) && keep(`requirements.${key}`, `requirements.${key}`)) return v;
    dropped.push(`requirements.${key}`);
    return null;
  };
  const requirements = {
    videoMaxSec: scalar("videoMaxSec", (v) => Number.isFinite(v) && v > 0),
    repoPublic: scalar("repoPublic", () => true),
    deadlineIso: scalar("deadlineIso", (v) => !Number.isNaN(Date.parse(v))),
  };

  return {
    value: { ...raw, name, tracks, criteria, weightsInferred: !weightsQuoted, requiredTech, requirements, sourceQuotes: quotes },
    dropped,
  };
}

/** Winner profile fields without a verbatim quote become unknown. */
export function enforceWinnerQuotes(raw: WinnerProfile, source: string): QuoteEnforcement<WinnerProfile> {
  const src = normalizeForMatch(source);
  const quotes: Record<string, string> = {};
  const dropped: string[] = [];
  const ok = (field: string) => {
    const quote = raw.sourceQuotes[field];
    if (quote && quoteAppears(quote, src)) {
      quotes[field] = quote;
      return true;
    }
    dropped.push(field);
    return false;
  };
  const text = (field: keyof WinnerProfile, value: string) => (ok(field) ? value : "unknown");
  const value: WinnerProfile = {
    title: text("title", raw.title),
    placement: text("placement", raw.placement),
    inputType: text("inputType", raw.inputType),
    outputType: text("outputType", raw.outputType),
    demoStructure: ok("demoStructure") ? raw.demoStructure : [],
    strongestMomentSec: raw.strongestMomentSec !== null && ok("strongestMomentSec") ? raw.strongestMomentSec : null,
    domain: text("domain", raw.domain),
    track: raw.track !== null && ok("track") ? raw.track : null,
    tech: ok("tech") ? raw.tech : [],
    sourceQuotes: quotes,
  };
  return { value, dropped: dropped.filter((f) => f !== "track" || raw.track !== null) };
}
