import { coverageScore, scoreTake, type TakeScore, type TakeScoreWeights, type TimedWord } from "@stage-ready/shared";
import { heuristicClaims } from "./claims";
import { verifyDeterministic, type Docs, type LatencyRecord, type RepoFacts } from "./rules";

/** The claims in a take that measurements, the repo or the written sources contradict. */
export function contradictedClaims(text: string, facts: { latency: LatencyRecord[]; repo: RepoFacts | null; docs: Docs }): { text: string; reason: string }[] {
  const out: { text: string; reason: string }[] = [];
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    for (const claim of heuristicClaims(sentence, 0)) {
      const result = verifyDeterministic(claim, facts.latency, facts.repo, facts.docs);
      if (result?.verdict.status === "contradicted") out.push({ text: claim.text, reason: result.verdict.evidence[0]?.summary ?? "Contradicted by the evidence." });
    }
  }
  return out;
}

export interface TakeScoreContext {
  criteria: { id: string; name: string; description: string }[];
  latency: LatencyRecord[];
  repo: RepoFacts | null;
  docs: Docs;
  weights: TakeScoreWeights;
}

/** Scores a transcribed take; the breakdown lists the contradicted claims behind the penalty. */
export function scoreTranscribedTake(
  take: { text: string; words: TimedWord[]; durationMs: number; budgetSec: number; incidents?: number },
  ctx: TakeScoreContext,
): TakeScore & { contradictedClaims: { text: string; reason: string }[] } {
  const contradicted = contradictedClaims(take.text, ctx);
  const score = scoreTake(
    { words: take.words, durationMs: take.durationMs, budgetSec: take.budgetSec, coverage: coverageScore(take.text, ctx.criteria), contradicted: contradicted.length, incidents: take.incidents ?? 0 },
    ctx.weights,
  );
  return { ...score, contradictedClaims: contradicted };
}
