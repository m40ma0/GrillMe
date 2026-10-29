import { describe, expect, it } from "vitest";
import {
  DEFAULT_TAKE_WEIGHTS,
  DEMO_STRONGEST_MOMENT,
  autoSectionPlan,
  buildAutoEdl,
  chapters,
  deliveryScore,
  demoTakeScripts,
  demoTakes,
  firstTwentySeconds,
  pickDrillQuestion,
  scoreDrillAnswer,
  scoreTake,
  spreadWords,
  timeFitScore,
  timelineCaptions,
  timelineMs,
  toSrt,
  type CandidateTake,
  type SectionKey,
} from "../src";

describe("take score", () => {
  it("applies 0.30/0.30/0.20/0.20 minus 0.15 per contradicted claim, floored at 0", () => {
    const words = spreadWords(Array(40).fill("word").join(" "), 16_000, 0);
    const s = scoreTake({ words, durationMs: 16_000, budgetSec: 15, coverage: 0.5, contradicted: 1, incidents: 0 });
    const expected = 0.3 * s.delivery + 0.3 * 0.5 + 0.2 * 1 + 0.2 * s.timeFit - 0.15;
    expect(s.total).toBeCloseTo(expected, 3);
    expect(scoreTake({ words: [], durationMs: 1, budgetSec: 15, coverage: 0, contradicted: 9, incidents: 3 }).total).toBe(0);
    expect(s.breakdown.weights).toEqual(DEFAULT_TAKE_WEIGHTS);
  });
  it("rewards 140–170 wpm and penalises fillers and long pauses", () => {
    expect(deliveryScore(spreadWords(Array(150).fill("word").join(" "), 60_000, 0), 60_000).score).toBe(1);
    expect(deliveryScore(spreadWords(Array(80).fill("word").join(" "), 60_000, 0), 60_000).score).toBeLessThan(0.1);
    const filler = deliveryScore(spreadWords(Array(150).fill("um").join(" "), 60_000, 0), 60_000);
    expect(filler.fillerPer100).toBe(100);
    expect(filler.score).toBe(0);
  });
  it("fits time to the section budget", () => {
    expect(timeFitScore(14_000, 15)).toBe(1);
    expect(timeFitScore(30_000, 15)).toBe(0);
    expect(timeFitScore(5_000, 15)).toBeLessThan(1);
  });
});

describe("auto EDL", () => {
  const sections = autoSectionPlan(180).map((s, order) => ({ key: s.key, order }));
  const fixture: CandidateTake[] = (Object.keys(demoTakes) as SectionKey[]).flatMap((key) =>
    demoTakes[key].map((durationMs, i) => ({ id: `${key}-${i + 1}`, sectionKey: key, durationMs, valid: true, score: i === 0 ? 0.8 : 0.5 })),
  );
  it("from 12 fixture takes, fits within 180 s and picks the highest-scoring valid take per section", () => {
    expect(fixture).toHaveLength(12);
    const edl = buildAutoEdl(sections, fixture, 180);
    expect(edl.fits).toBe(true);
    expect(edl.totalMs).toBeLessThanOrEqual(180_000);
    expect(edl.items.map((i) => i.takeId)).toEqual(["hook-1", "problem-1", "demo-1", "how-1", "impact-1", "close-1"]);
    expect(edl.swaps).toEqual([]);
  });
  it("skips invalid takes", () => {
    const edl = buildAutoEdl(
      sections,
      fixture.map((t) => (t.id === "demo-1" ? { ...t, valid: false } : t)),
      300,
    );
    expect(edl.items.find((i) => i.sectionKey === "demo")?.takeId).toBe("demo-2");
  });
  it("swaps in tighter takes when the best cut is too long", () => {
    const long = fixture.map((t) => ({ ...t, score: t.id.endsWith("-2") ? 0.9 : 0.85 }));
    const edl = buildAutoEdl(sections, long, 180);
    expect(edl.fits).toBe(true);
    expect(edl.swaps.length).toBeGreaterThan(0);
    expect(timelineMs(edl.items)).toBe(edl.totalMs);
  });
  it("reports when nothing can make it fit", () => {
    expect(buildAutoEdl(sections, fixture, 60).fits).toBe(false);
  });
});

describe("first 20 seconds", () => {
  it("warns when the Hook take lacks the strongest demo moment", () => {
    expect(firstTwentySeconds(demoTakeScripts.hook[0], DEMO_STRONGEST_MOMENT).ok).toBe(true);
    expect(firstTwentySeconds(demoTakeScripts.hook[1], DEMO_STRONGEST_MOMENT).ok).toBe(false);
  });
});

describe("captions and chapters", () => {
  it("maps take words onto the output timeline and matches the transcript", () => {
    const items = [
      { takeId: "a", sectionKey: "hook", inMs: 0, outMs: 10_000, transition: "crossfade" as const },
      { takeId: "b", sectionKey: "problem", inMs: 1_000, outMs: 6_000, transition: "crossfade" as const },
    ];
    const words = { a: spreadWords("one two three four five six seven eight nine ten", 10_000), b: spreadWords("alpha beta gamma delta", 6_000) };
    const caps = timelineCaptions(items, words);
    expect(caps.map((c) => c.text).join(" ")).toBe("one two three four five six seven eight nine ten beta gamma delta");
    expect(caps[0]?.startMs).toBe(2_000 - 200 + 300);
    expect(toSrt(caps)).toMatch(/^1\n00:00:02,100 --> /);
    expect(chapters(items, { hook: "Hook", problem: "Problem" }).map((c) => [c.atMs, c.title])).toEqual([
      [0, "Intro"],
      [1_800, "Hook"],
      [11_600, "Problem"],
    ]);
  });
});

describe("drill", () => {
  it("scores length, directness and evidence", () => {
    const card = { script: "We measured 92% on 200 labelled reports. That is the number we stand behind.", evidenceRefs: ["eval/results.json"] };
    const good = scoreDrillAnswer("We measured 92% accuracy on 200 labelled reports from two pilot teams last month.", 9_000, card);
    const bad = scoreDrillAnswer("So, that's a good question, I think it is pretty accurate overall.", 25_000, card);
    expect(good.total).toBeGreaterThan(0.8);
    expect(bad.total).toBeLessThan(0.5);
  });
  it("brings weak and unasked questions back more often", () => {
    const qs = [
      { id: "strong", askedCount: 5, lastScore: 0.95, likelihood: 0.5, damage: 0.5 },
      { id: "weak", askedCount: 5, lastScore: 0.1, likelihood: 0.5, damage: 0.5 },
    ];
    let weak = 0;
    let seed = 1;
    const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 1000; i++) if (pickDrillQuestion(qs, rng)?.id === "weak") weak++;
    expect(weak).toBeGreaterThan(600);
  });
});

describe("transitions", () => {
  it("a cut overlaps 40 ms instead of 200 ms, and chapters and captions follow it", () => {
    const items = [
      { takeId: "a", sectionKey: "hook", inMs: 0, outMs: 10_000, transition: "crossfade" as const },
      { takeId: "b", sectionKey: "demo", inMs: 0, outMs: 10_000, transition: "cut" as const },
    ];
    // 2000 + (10000 - 200) + (10000 - 40) + 2000 - 200
    expect(timelineMs(items)).toBe(23_560);
    expect(chapters(items, {}).map((c) => c.atMs)).toEqual([0, 1_800, 11_760]);
    const caps = timelineCaptions(items, { b: [{ text: "hi", startMs: 1_000, endMs: 1_500 }] });
    expect(caps[0]?.startMs).toBe(12_760);
  });
});
