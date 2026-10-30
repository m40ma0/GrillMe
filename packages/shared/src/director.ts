import { z } from "zod";
import { Coverage } from "./coverage";
import type { SectionKey } from "./project";

// Best-Take Director: take scores, the assembled edit decision list and its captions. All pure.

export const TakeScoreWeights = z.object({
  delivery: z.number().min(0).max(1),
  coverage: z.number().min(0).max(1),
  demoSuccess: z.number().min(0).max(1),
  timeFit: z.number().min(0).max(1),
  contradictedPenalty: z.number().min(0).max(1),
});
export type TakeScoreWeights = z.infer<typeof TakeScoreWeights>;

/** total = 0.30 delivery + 0.30 coverage + 0.20 demo success + 0.20 time fit − 0.15 per Contradicted claim, floored at 0. */
export const DEFAULT_TAKE_WEIGHTS: TakeScoreWeights = { delivery: 0.3, coverage: 0.3, demoSuccess: 0.2, timeFit: 0.2, contradictedPenalty: 0.15 };

export interface TimedWord {
  text: string;
  startMs: number;
  endMs: number;
}

const FILLERS = /^(um+|uh+|erm|ah+|like|basically|actually|literally|so|you know|kind of|sort of)$/i;
export const TARGET_WPM: [number, number] = [140, 170];
export const LONG_PAUSE_MS = 1_500;

export function deliveryScore(words: TimedWord[], durationMs: number) {
  const n = words.length;
  const minutes = Math.max(1, durationMs) / 60_000;
  const wpm = n / minutes;
  const [lo, hi] = TARGET_WPM;
  const pace = wpm >= lo && wpm <= hi ? 1 : Math.max(0, 1 - (wpm < lo ? lo - wpm : wpm - hi) / 60);
  const fillers = words.filter((w) => FILLERS.test(w.text.replace(/[^\w ]/g, ""))).length;
  const fillerPer100 = n ? (fillers / n) * 100 : 0;
  let longPauses = 0;
  for (let i = 1; i < words.length; i++) if ((words[i]?.startMs ?? 0) - (words[i - 1]?.endMs ?? 0) > LONG_PAUSE_MS) longPauses++;
  const score = n === 0 ? 0 : Math.max(0, Math.min(1, pace - 0.04 * fillerPer100 - 0.1 * longPauses));
  return { score, wpm: Math.round(wpm), fillerPer100: Math.round(fillerPer100 * 10) / 10, longPauses };
}

/** 1 within budget; loses score for going over, and a little for using under half of it. */
export function timeFitScore(durationMs: number, budgetSec: number): number {
  const budget = budgetSec * 1000;
  if (budget <= 0) return 0;
  if (durationMs > budget) return Math.max(0, 1 - (durationMs - budget) / budget);
  if (durationMs < budget * 0.5) return Math.max(0, 0.5 + durationMs / budget);
  return 1;
}

export function coverageScore(text: string, criteria: { id: string; name: string; description: string }[]): number {
  if (criteria.length === 0) return 0;
  const c = new Coverage(criteria);
  c.add(text, "take");
  return criteria.reduce((sum, x) => sum + c.total(x.id), 0) / criteria.length;
}

export interface TakeScoreInput {
  words: TimedWord[];
  durationMs: number;
  budgetSec: number;
  coverage: number;
  contradicted: number;
  /** DemoGuard incidents during the take (M5); 0 until then. */
  incidents: number;
}

export interface TakeScore {
  total: number;
  delivery: number;
  coverage: number;
  claimPenalty: number;
  demoSuccess: number;
  timeFit: number;
  breakdown: { wpm: number; fillerPer100: number; longPauses: number; contradicted: number; incidents: number; weights: TakeScoreWeights };
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function scoreTake(input: TakeScoreInput, weights: TakeScoreWeights = DEFAULT_TAKE_WEIGHTS): TakeScore {
  const d = deliveryScore(input.words, input.durationMs);
  const demoSuccess = input.incidents === 0 ? 1 : Math.max(0, 1 - 0.5 * input.incidents);
  const timeFit = timeFitScore(input.durationMs, input.budgetSec);
  const claimPenalty = weights.contradictedPenalty * input.contradicted;
  const total = Math.max(0, weights.delivery * d.score + weights.coverage * input.coverage + weights.demoSuccess * demoSuccess + weights.timeFit * timeFit - claimPenalty);
  return {
    total: r3(total),
    delivery: r3(d.score),
    coverage: r3(input.coverage),
    claimPenalty: r3(claimPenalty),
    demoSuccess: r3(demoSuccess),
    timeFit: r3(timeFit),
    breakdown: { wpm: d.wpm, fillerPer100: d.fillerPer100, longPauses: d.longPauses, contradicted: input.contradicted, incidents: input.incidents, weights },
  };
}

// ---------- EDL ----------

export const EdlItem = z.object({ takeId: z.string(), sectionKey: z.string(), inMs: z.number().int().min(0), outMs: z.number().int().positive(), transition: z.enum(["crossfade", "cut"]) });
export type EdlItem = z.infer<typeof EdlItem>;

export const CROSSFADE_MS = 200;
/** A "cut" is a 40 ms dissolve, so audio never clicks at the join. */
export const CUT_MS = 40;
/** Overlap with the previous part when this clip comes in. */
export const overlapMs = (item: { transition?: EdlItem["transition"] }, crossfadeMs = CROSSFADE_MS) => (item.transition === "cut" ? CUT_MS : crossfadeMs);
export const CARD_MS = { intro: 2_000, outro: 2_000 };

export interface CandidateTake {
  id: string;
  sectionKey: SectionKey;
  durationMs: number;
  score: number | null;
  /** A take without a transcript or with a failed recording cannot be used. */
  valid: boolean;
}

/** Output length: intro + clips + outro, minus the overlap at each join (the outro always crossfades). */
export function timelineMs(items: (Pick<EdlItem, "inMs" | "outMs"> & { transition?: EdlItem["transition"] })[], cards = CARD_MS, crossfadeMs = CROSSFADE_MS): number {
  if (items.length === 0) return 0;
  const clips = items.reduce((sum, i) => sum + (i.outMs - i.inMs) - overlapMs(i, crossfadeMs), 0);
  return cards.intro + clips + cards.outro - crossfadeMs;
}

export interface AutoEdl {
  items: EdlItem[];
  totalMs: number;
  limitMs: number;
  fits: boolean;
  /** Sections where the length fitter swapped in a tighter, lower-scoring take. */
  swaps: { sectionKey: string; from: string; to: string; savedMs: number; scoreLost: number }[];
  missing: string[];
}

/** Best valid take per section, then the length fitter swaps in tighter takes (least score lost per second saved) until the cut fits. */
export function buildAutoEdl(sections: { key: SectionKey; order: number }[], takes: CandidateTake[], limitSec: number): AutoEdl {
  const ordered = [...sections].sort((a, b) => a.order - b.order);
  const bySection = new Map(ordered.map((s) => [s.key, takes.filter((t) => t.sectionKey === s.key && t.valid && t.score !== null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))]));
  const chosen = new Map<SectionKey, CandidateTake>();
  const missing: string[] = [];
  for (const s of ordered) {
    const best = bySection.get(s.key)?.[0];
    if (best) chosen.set(s.key, best);
    else missing.push(s.key);
  }
  const limitMs = limitSec * 1000;
  const items = () =>
    ordered.flatMap((s) => (chosen.has(s.key) ? [{ takeId: chosen.get(s.key)!.id, sectionKey: s.key, inMs: 0, outMs: chosen.get(s.key)!.durationMs, transition: "crossfade" as const }] : []));
  const swaps: AutoEdl["swaps"] = [];
  let total = timelineMs(items());
  while (total > limitMs) {
    let best: { key: SectionKey; take: CandidateTake; cost: number; saved: number } | null = null;
    for (const [key, current] of chosen) {
      for (const alt of bySection.get(key) ?? []) {
        const saved = current.durationMs - alt.durationMs;
        if (saved <= 0) continue;
        const cost = Math.max(0, (current.score ?? 0) - (alt.score ?? 0)) / (saved / 1000);
        if (!best || cost < best.cost) best = { key, take: alt, cost, saved };
      }
    }
    if (!best) break;
    const from = chosen.get(best.key)!;
    swaps.push({ sectionKey: best.key, from: from.id, to: best.take.id, savedMs: best.saved, scoreLost: r3((from.score ?? 0) - (best.take.score ?? 0)) });
    chosen.set(best.key, best.take);
    total = timelineMs(items());
  }
  return { items: items(), totalMs: total, limitMs, fits: total <= limitMs, swaps, missing };
}

// ---------- First 20 seconds ----------

const STOP = new Set(["about", "their", "there", "which", "these", "those", "would", "could", "with", "from", "into", "that", "this", "what", "your", "every"]);
const words5 = (text: string) => new Set((text.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !STOP.has(w)).map((w) => w.replace(/(ing|ed|es|s)$/, "")));

/** Warns when the Hook take does not contain the strongest demo moment. */
export function firstTwentySeconds(hookText: string, momentText: string): { ok: boolean; matched: string[]; missing: string[] } {
  const want = [...words5(momentText)];
  const have = words5(hookText);
  const matched = want.filter((w) => have.has(w));
  return { ok: want.length > 0 && matched.length / want.length >= 0.5, matched, missing: want.filter((w) => !have.has(w)) };
}

// ---------- Captions ----------

export interface Caption {
  startMs: number;
  endMs: number;
  text: string;
}

/** Maps each clip's words onto the output timeline (after the intro, through crossfades) as caption lines of up to 8 words. */
export function timelineCaptions(items: EdlItem[], wordsByTake: Record<string, TimedWord[]>, cards = CARD_MS, crossfadeMs = CROSSFADE_MS): Caption[] {
  const out: Caption[] = [];
  let offset = cards.intro;
  for (const item of items) {
    offset -= overlapMs(item, crossfadeMs);
    const words = (wordsByTake[item.takeId] ?? []).filter((w) => w.startMs >= item.inMs && w.endMs <= item.outMs);
    for (let i = 0; i < words.length; i += 8) {
      const chunk = words.slice(i, i + 8);
      const first = chunk[0];
      const last = chunk.at(-1);
      if (!first || !last) continue;
      out.push({ startMs: offset + first.startMs - item.inMs, endMs: offset + last.endMs - item.inMs, text: chunk.map((w) => w.text).join(" ") });
    }
    offset += item.outMs - item.inMs;
  }
  return out;
}

const srtTime = (ms: number) => {
  const t = Math.max(0, Math.round(ms));
  const h = Math.floor(t / 3_600_000);
  const m = Math.floor((t % 3_600_000) / 60_000);
  const s = Math.floor((t % 60_000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(t % 1000).padStart(3, "0")}`;
};

export function toSrt(captions: Caption[]): string {
  return captions.map((c, i) => `${i + 1}\n${srtTime(c.startMs)} --> ${srtTime(c.endMs)}\n${c.text}\n`).join("\n");
}

/** Chapter list ("0:00 Hook") from the EDL. */
export function chapters(items: EdlItem[], titles: Record<string, string>, cards = CARD_MS, crossfadeMs = CROSSFADE_MS): { atMs: number; title: string }[] {
  const out = [{ atMs: 0, title: "Intro" }];
  let offset = cards.intro;
  for (const item of items) {
    offset -= overlapMs(item, crossfadeMs);
    out.push({ atMs: offset, title: titles[item.sectionKey] ?? item.sectionKey });
    offset += item.outMs - item.inMs;
  }
  return out;
}

// ---------- Drill ----------

/** Spaced repetition: unasked and weak questions come back more often. */
export function drillWeight(q: { askedCount: number; lastScore: number | null; likelihood: number; damage: number }): number {
  const weakness = q.lastScore === null ? 1 : 1 - Math.max(0, Math.min(1, q.lastScore));
  return (0.2 + q.likelihood * q.damage) * (0.3 + weakness) * (q.askedCount === 0 ? 2 : 1);
}

export function pickDrillQuestion<T extends { id: string; askedCount: number; lastScore: number | null; likelihood: number; damage: number }>(
  questions: T[],
  random = Math.random,
  avoidId?: string,
): T | null {
  const pool = questions.filter((q) => q.id !== avoidId);
  const list = pool.length ? pool : questions;
  const total = list.reduce((sum, q) => sum + drillWeight(q), 0);
  let r = random() * total;
  for (const q of list) {
    r -= drillWeight(q);
    if (r <= 0) return q;
  }
  return list.at(-1) ?? null;
}

const HEDGE_START = /^(so|well|um+|uh+|i think|i guess|basically|that's a (good|great) question|good question|great question)\b/i;

/** Scores a spoken drill answer: length (≤ 55 words, ≤ 20 s), directness (answer first), evidence cited (a number or the card's evidence). */
export function scoreDrillAnswer(answer: string, durationMs: number, card: { script: string; evidenceRefs: string[] }) {
  const words = answer.trim().split(/\s+/).filter(Boolean);
  const n = words.length;
  const length = n === 0 ? 0 : n <= 55 && durationMs <= 20_500 ? (n >= 12 ? 1 : 0.6) : Math.max(0, 1 - (Math.max(0, n - 55) / 55 + Math.max(0, durationMs - 20_000) / 20_000));
  const firstSentence = answer.split(/(?<=[.!?])\s+/)[0] ?? "";
  const cardTerms = words5(card.script.split(/(?<=[.!?])\s+/)[0] ?? "");
  const direct = !HEDGE_START.test(firstSentence.trim()) ? 0.6 + 0.4 * Math.min(1, [...words5(firstSentence)].filter((w) => cardTerms.has(w)).length / Math.max(1, Math.min(4, cardTerms.size))) : 0.2;
  const refs = card.evidenceRefs.flatMap((r) => [...words5(r)]);
  const evidence = /\d/.test(answer) || refs.some((r) => words5(answer).has(r)) ? 1 : 0;
  const total = Math.round(((length + direct + evidence) / 3) * 100) / 100;
  return { total, length: r3(length), directness: r3(direct), evidence, words: n };
}

/** Weights from TAKE_SCORE_WEIGHTS (JSON), falling back to the defaults for anything missing or invalid. */
export function takeWeightsFrom(json: string | undefined): TakeScoreWeights {
  if (!json) return DEFAULT_TAKE_WEIGHTS;
  try {
    return TakeScoreWeights.parse({ ...DEFAULT_TAKE_WEIGHTS, ...(JSON.parse(json) as object) });
  } catch {
    throw new Error("TAKE_SCORE_WEIGHTS must be JSON with numbers 0–1 for delivery, coverage, demoSuccess, timeFit and contradictedPenalty.");
  }
}
