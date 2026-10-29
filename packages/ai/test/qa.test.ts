import { DEFAULT_TAKE_WEIGHTS, QuestionBank, demoEventSpec, demoPersonas, demoRepo, demoSession, demoTakeScripts, demoTakes, snapshotNumbers, spreadWords, wordCount } from "@stage-ready/shared";
import { describe, expect, it } from "vitest";
import { buildSlideSnapshot, capWords, heuristicQuestionBank, type QaContext } from "../src/qa";
import { contradictedClaims, scoreTranscribedTake } from "../src/takes";
import { prompts } from "../src";

const ctx: QaContext = {
  projectName: "Signal Garden",
  criteria: demoEventSpec.criteria.map((c) => ({ name: c.name, description: c.description, weight: c.weight })),
  claims: demoSession.claims.map((c, i) => ({ text: demoSession.transcript[i] ?? "", type: c.type, status: c.status, evidence: c.evidence.summary })),
  findings: demoRepo.findings.map((f) => ({ kind: f.kind, summary: f.summary, ref: f.line ? `${f.filePath}:${f.line}` : f.filePath })),
  personas: demoPersonas.map((p) => ({ role: p.role, questionStyle: p.questionStyle })),
  weakSpots: [],
  latency: [{ stepKey: "generate_summary", n: 3, p50: 9_200, p95: 9_800 }],
};

describe("question bank", () => {
  it("ranks at least 20 questions, each with a script of 55 words or fewer", () => {
    const bank = heuristicQuestionBank(ctx);
    expect(bank.length).toBeGreaterThanOrEqual(20);
    expect(QuestionBank.parse({ questions: bank }).questions).toHaveLength(bank.length);
    for (const q of bank) expect(wordCount(q.card.script)).toBeLessThanOrEqual(55);
    const ranks = bank.map((q) => q.likelihood * q.damage);
    expect(ranks).toEqual([...ranks].sort((a, b) => b - a));
    // The contradicted latency claim comes first and cites the measurement.
    expect(bank[0]?.card.evidenceRefs).toEqual(["latency:generate_summary"]);
    expect(bank[0]?.card.script).toContain("9.2 s");
  });

  it("flags evidence gaps with a suggested artefact", () => {
    const gaps = heuristicQuestionBank(ctx).filter((q) => q.card.evidenceRefs.length === 0);
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps.some((q) => q.suggestedArtifact?.includes("eval"))).toBe(true);
  });

  it("the prompt's mock is the deterministic bank", () => {
    expect(prompts.questionBankV1(ctx).mock()).toEqual({ questions: heuristicQuestionBank(ctx) });
  });

  it("caps scripts at a sentence boundary", () => {
    const long = `${"word ".repeat(30).trim()}. ${"more ".repeat(30).trim()}.`;
    expect(wordCount(capWords(long))).toBe(30);
  });
});

describe("slide snapshot", () => {
  it("takes its numbers from stored latency", () => {
    const s = buildSlideSnapshot("How long does it take?", { evidenceRefs: ["latency:generate_summary"] }, { projectName: "x", latency: ctx.latency, claimCounts: {}, coverage: [], findings: [] });
    expect(s.chart.series).toEqual([{ label: "generate summary", value: 9.2 }]);
    expect(snapshotNumbers(s)).toEqual(expect.arrayContaining(["9.2 s", "9.8", "3"]));
  });
});

describe("take scoring", () => {
  const facts = { latency: [{ stepKey: "generate_summary", startMs: 0, durationMs: 9_200 }], repo: null, docs: { readme: null, submission: null } };
  it("penalises a take whose claims the measurements contradict", () => {
    expect(contradictedClaims("Now there is a plan, it is instant.", facts)).toHaveLength(1);
    const [good, weak] = demoTakeScripts.demo;
    const score = (text: string, ms: number) =>
      scoreTranscribedTake(
        { text, words: spreadWords(text, ms), durationMs: ms, budgetSec: 63 },
        { criteria: [], latency: facts.latency, repo: null, docs: facts.docs, weights: DEFAULT_TAKE_WEIGHTS },
      );
    const a = score(good, demoTakes.demo[0]);
    const b = score(weak, demoTakes.demo[1]);
    expect(b.contradictedClaims.length).toBeGreaterThan(0);
    expect(b.claimPenalty).toBeGreaterThan(0);
    expect(a.total).toBeGreaterThan(b.total);
  });
});
