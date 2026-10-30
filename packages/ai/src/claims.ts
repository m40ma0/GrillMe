import type { Claim, ClaimType } from "@stage-ready/shared";

// Deterministic claim extraction behind the mocked adapter: factual, checkable statements only.

const OPINION_OR_PLAN = /\b(we (think|believe|hope|feel|plan|want|will|would|might|could)|in the future|next (step|year|month)|roadmap|i think|imagine|let me|let's|thank you|welcome)\b/i;

const RULES: { type: ClaimType; re: RegExp }[] = [
  { type: "accuracy", re: /\b(\d+(?:\.\d+)?)\s*%\s*(accura|precis|recall|f1|correct)|\baccura(te|cy)\b|\bprecision\b|\berror rate\b/i },
  {
    type: "performance",
    re: /\b(instant(ly)?|real[- ]time|immediate(ly)?|in (milli)?seconds|lightning|blazing|fast(er|est)?|quick(ly)?|latency|under \d+(\.\d+)?\s*(ms|milliseconds?|s|sec(ond)?s?))\b/i,
  },
  { type: "security_privacy", re: /\b(encrypt\w*|secure(ly)?|security|privacy|private|gdpr|hipaa|soc ?2|end[- ]to[- ]end|never (store|leaves?)|on[- ]device)\b/i },
  { type: "scale", re: /\b(\d[\d,.]*\s*(k|m|million|thousand|billion)?\s*(users|requests|reports|documents|records|calls|teams|customers)|scales?|scalable|any size)\b/i },
  { type: "comparison", re: /\b(better|faster|cheaper|more accurate|unlike|compared (to|with)|than (any|other|existing)|outperforms?|beats?)\b/i },
  { type: "market", re: /\b(customers?|market|revenue|users love|adoption|paying|pilot|save[sd]? (hours|time|money)|\$\d)/i },
  { type: "feature", re: /\b(supports?|lets? you|allows?|can|automatically|groups?|turns?|converts?|generates?|works? offline|offline mode|integrates?|exports?|detects?|compares?)\b/i },
];

const QUANTITY = /(\d+(?:\.\d+)?)\s*(%|ms|milliseconds?|s\b|sec(?:ond)?s?|minutes?|x|times|users|k\b)/i;

/** Splits a final sentence into checkable claims. Returns [] for opinions, plans and small talk. */
export function heuristicClaims(sentence: string, segmentStartMs: number): Claim[] {
  const text = sentence.trim();
  if (text.length < 8 || OPINION_OR_PLAN.test(text) || text.endsWith("?")) return [];
  const rule = RULES.find((r) => r.re.test(text));
  if (!rule) return [];
  const q = QUANTITY.exec(text);
  const feature = rule.type === "feature" ? (/\b(?:supports?|offers?|has)\s+([\w -]{3,40}?)(?:[.,;]|$)/i.exec(text)?.[1] ?? /\b(offline mode|[\w]+ view|[\w]+ mode)\b/i.exec(text)?.[1] ?? null) : null;
  return [{ text, type: rule.type, quantity: q ? { value: Number(q[1]), unit: (q[2] ?? "").toLowerCase() } : null, featureName: feature?.trim() ?? null, segmentStartMs }];
}

/** The qualitative speed words and the latency they promise, in ms. */
export function promisedLatencyMs(text: string): number | null {
  const explicit = /\bunder\s+(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|sec(?:ond)?s?)\b/i.exec(text) ?? /\bin\s+(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|sec(?:ond)?s?)\b/i.exec(text);
  if (explicit) return Number(explicit[1]) * (/^m/i.test(explicit[2] ?? "") ? 1 : 1000);
  if (/\b(instant(ly)?|immediate(ly)?|real[- ]time|lightning|in milliseconds)\b/i.test(text)) return 1_000;
  if (/\b(fast|quick(ly)?|blazing|in seconds)\b/i.test(text)) return 3_000;
  return null;
}
