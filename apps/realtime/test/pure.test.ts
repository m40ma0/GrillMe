import { describe, expect, it } from "vitest";
import { verifyDeterministic } from "../src/auditor/rules";
import { Stopwatch } from "../src/auditor/stopwatch";
import { Coverage } from "../src/auditor/coverage";
import { candidates, type PolicyInput } from "../src/judges/policy";
import { asksToFinish, isVagueAnswer, splitSentences } from "../src/session/sentences";
import { SAMPLE_RATE, Vad } from "../src/stt/vad";

const tone = (ms: number, amp: number) => Int16Array.from({ length: (SAMPLE_RATE * ms) / 1000 }, (_, i) => Math.round(amp * Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE)));

describe("Vad", () => {
  it("finds an utterance between silences", () => {
    const vad = new Vad();
    const events = [...vad.push(tone(500, 10), 0), ...vad.push(tone(1000, 8000), 500), ...vad.push(tone(800, 10), 1500)];
    expect(events.map((e) => e.type)).toEqual(["speech_start", "speech_end"]);
    expect(events[0]?.atMs).toBeGreaterThanOrEqual(480);
    expect(events[0]?.atMs).toBeLessThan(600);
    expect(events[1]?.atMs).toBeGreaterThanOrEqual(1480);
    expect(events[1]?.atMs).toBeLessThan(1600);
  });
});

describe("sentences", () => {
  it("splits a segment and keeps word timing", () => {
    const words = "We built it. It is instant.".split(" ").map((text, i) => ({ text, startMs: i * 300, endMs: i * 300 + 250 }));
    const out = splitSentences({ id: "s", startMs: 0, endMs: 1750, speaker: "presenter", text: "We built it. It is instant.", words });
    expect(out.map((s) => [s.text, s.startMs, s.endMs])).toEqual([
      ["We built it.", 0, 850],
      ["It is instant.", 900, 1750],
    ]);
  });
  it("detects yield requests and vague answers", () => {
    expect(asksToFinish("Sorry, let me finish this part")).toBe(true);
    expect(asksToFinish("We finish in time")).toBe(false);
    expect(isVagueAnswer("It kind of depends.")).toBe(true);
    expect(isVagueAnswer("We measured 92% on 200 labelled reports in our pilot last month with two teams.")).toBe(false);
  });
});

describe("Stopwatch", () => {
  it("times click → spinner → result with screen hashes only (9.2 s)", () => {
    const sw = new Stopwatch();
    const events = [...sw.frame(5_000, 4, null)];
    for (let t = 5_500; t < 14_200; t += 500) events.push(...sw.frame(t, 0, null), ...sw.tick(t + 250));
    events.push(...sw.frame(14_200, 30, null), ...sw.tick(14_600), ...sw.tick(15_100));
    expect(events).toEqual([
      { type: "started", startMs: 5_000 },
      { type: "completed", startMs: 5_000, endMs: 14_200, durationMs: 9_200, detector: "phash" },
    ]);
  });
  it("uses SAM regions when the vision service answers", () => {
    const sw = new Stopwatch();
    const spinner = [{ label: "spinner" as const, box: [0, 0, 1, 1] as [number, number, number, number], score: 0.9 }];
    const result = [{ label: "result_region" as const, box: [0, 0, 1, 1] as [number, number, number, number], score: 0.9 }];
    const events = [...sw.input(1_000), ...sw.frame(1_200, 5, spinner), ...sw.frame(3_000, 0, spinner), ...sw.frame(3_400, 20, result), ...sw.tick(4_300)];
    expect(events.at(-1)).toEqual({ type: "completed", startMs: 1_000, endMs: 3_400, durationMs: 2_400, detector: "sam" });
  });
  it("drops a small change that never leads to a result", () => {
    const sw = new Stopwatch();
    expect([...sw.frame(1_000, 4, null), ...sw.tick(2_000)]).toEqual([]);
    expect(sw.tick(3_000)).toEqual([{ type: "started", startMs: 1_000 }]);
    expect(sw.tick(31_500)).toEqual([{ type: "abandoned", startMs: 1_000 }]);
  });
  it("restarts on the last small change after a quiet gap (typing, then Enter)", () => {
    const sw = new Stopwatch();
    const events = [
      ...sw.frame(1_000, 4, null),
      ...sw.tick(1_300),
      ...sw.frame(1_400, 4, null),
      ...sw.frame(1_600, 4, null),
      ...sw.frame(3_000, 4, null),
      ...sw.frame(5_000, 25, null),
      ...sw.tick(6_000),
    ];
    expect(events.at(-1)).toMatchObject({ type: "completed", startMs: 3_000, durationMs: 2_000 });
  });
  it("abandons an action with no result after 30 s", () => {
    const sw = new Stopwatch();
    sw.input(0);
    expect(sw.tick(30_001)).toEqual([{ type: "abandoned", startMs: 0 }]);
  });
});

describe("deterministic claim rules", () => {
  const instant = { text: "The summary is instant.", type: "performance" as const, quantity: null, featureName: null, segmentStartMs: 3_000 };
  it("leaves a speed claim pending until a sample arrives, then contradicts it with the measurement", () => {
    expect(verifyDeterministic(instant, [], null)).toMatchObject({ pending: true, verdict: { status: "unverified" } });
    const r = verifyDeterministic(instant, [{ stepKey: "demo:1", startMs: 5_000, durationMs: 9_200 }], null);
    expect(r?.verdict.status).toBe("contradicted");
    expect(r?.verdict.evidence[0]).toMatchObject({ kind: "latency", ref: "demo:1 @ 0:05" });
    expect(r?.verdict.evidence[0]?.summary).toContain("9.2 s");
    expect(r?.verdict.suggestedRewrite).toBe("It takes about 9.2 s.");
  });
  it("verifies a speed claim the measurement supports", () => {
    expect(verifyDeterministic({ ...instant, text: "Results load in under 2 seconds." }, [{ stepKey: "demo:1", startMs: 4_000, durationMs: 1_400 }], null)?.verdict.status).toBe("verified");
  });
  it("needs a source for numbers and creates a Fix Task", () => {
    const r = verifyDeterministic({ text: "Our classifier reaches 92% accuracy.", type: "accuracy", quantity: { value: 92, unit: "%" }, featureName: null, segmentStartMs: 0 }, [], {
      dependencies: [],
      capabilities: [],
      evalFiles: [],
      todos: [],
      mocks: [],
    });
    expect(r?.verdict.status).toBe("unverified");
    expect(r?.fixTask?.suggestedArtifact).toMatch(/eval/);
  });
  it("cites dependencies when encryption has no crypto library", () => {
    const r = verifyDeterministic({ text: "We encrypt everything.", type: "security_privacy", quantity: null, featureName: null, segmentStartMs: 0 }, [], {
      dependencies: ["next", "zod"],
      capabilities: [],
      evalFiles: [],
      todos: [],
      mocks: [],
    });
    expect(r?.verdict).toMatchObject({ status: "unverified", evidence: [{ kind: "repo", ref: "package.json" }] });
    expect(
      verifyDeterministic({ text: "We encrypt everything.", type: "security_privacy", quantity: null, featureName: null, segmentStartMs: 0 }, [], {
        dependencies: ["libsodium-wrappers"],
        capabilities: [],
        evalFiles: [],
        todos: [],
        mocks: [],
      }),
    ).toBeNull();
  });
});

describe("coverage", () => {
  it("scores criteria per section from keywords", () => {
    const c = new Coverage([{ id: "c1", name: "Real-world impact", description: "Clear user need" }]);
    expect(c.add("Our users need this impact every day.", "problem")).toEqual([{ criterionId: "c1", sectionKey: "problem", score: 0.75 }]);
    expect(c.total("c1")).toBe(0.75);
  });
});

describe("judge policy", () => {
  const base: PolicyInput = {
    nowMs: 60_000,
    difficulty: 3,
    phase: "pitch",
    judgeSpeaking: false,
    lastInterruptAtMs: null,
    personas: [
      { id: "t", role: "technical", criteria: ["Tech"], lastTurnAtMs: null },
      { id: "p", role: "product", criteria: ["UX"], lastTurnAtMs: null },
    ],
    claims: [{ id: "c1", text: "It is instant.", type: "performance", status: "contradicted", atMs: 50_000, challenged: false }],
    uncovered: [],
    overTimeSection: null,
    vagueAnswer: null,
    qaTurnDue: false,
  };
  it.each([
    ["a contradicted claim goes to the technical judge", {}, [["claim", "t"]]],
    ["no one talks over a speaking judge", { judgeSpeaking: true }, []],
    ["each judge waits 45 s", { personas: [{ id: "t", role: "technical" as const, criteria: [], lastTurnAtMs: 20_000 }] }, []],
    ["after 45 s the judge may speak again", { personas: [{ id: "t", role: "technical" as const, criteria: [], lastTurnAtMs: 15_000 }] }, [["claim", "t"]]],
    ["the panel leaves a gap between interruptions", { lastInterruptAtMs: 50_000 }, []],
    ["difficulty 1 ignores unverified claims", { difficulty: 1, claims: [{ ...base.claims[0]!, status: "unverified" as const }] }, []],
    ["difficulty 3 asks about unverified claims", { claims: [{ ...base.claims[0]!, status: "unverified" as const }] }, [["claim", "t"]]],
    ["coverage gaps go to the judge who scores that criterion", { claims: [], uncovered: ["UX"] }, [["coverage_gap", "p"]]],
  ] as const)("%s", (_name, patch, expected) => {
    expect(candidates({ ...base, ...patch } as PolicyInput).map((c) => [c.trigger, c.personaId])).toEqual(expected);
  });
});

describe("judge policy for feature claims", () => {
  it("leaves unverified feature claims to show-or-strike below difficulty 5", () => {
    const input: PolicyInput = {
      nowMs: 60_000,
      difficulty: 3,
      phase: "pitch",
      judgeSpeaking: false,
      lastInterruptAtMs: null,
      personas: [{ id: "p", role: "product", criteria: [], lastTurnAtMs: null }],
      claims: [{ id: "c", text: "It supports offline mode.", type: "feature", status: "unverified", atMs: 50_000, challenged: false }],
      uncovered: [],
      overTimeSection: null,
      vagueAnswer: null,
      qaTurnDue: false,
    };
    expect(candidates(input)).toEqual([]);
    expect(candidates({ ...input, difficulty: 5 })).toHaveLength(1);
  });
});

describe("repo truth and cross-source checks", () => {
  const repo = {
    dependencies: ["next"],
    capabilities: [],
    evalFiles: [],
    todos: [{ summary: "TODO: implement offline queue (claimed in the pitch).", ref: "src/offline.ts:3" }],
    mocks: [{ summary: "Returns a hard-coded confidence of 0.92 on the demo path.", ref: "src/classifier.ts:41" }],
  };
  const claim = (text: string, type: "feature" | "accuracy" | "market") => ({ text, type, quantity: null, featureName: null, segmentStartMs: 0 });
  it("contradicts a feature whose code is still a TODO, citing file:line", () => {
    expect(verifyDeterministic(claim("Signal Garden supports offline mode.", "feature"), [], repo)?.verdict).toMatchObject({
      status: "contradicted",
      evidence: [{ kind: "repo", ref: "src/offline.ts:3" }],
    });
  });
  it("contradicts a number that is hard-coded on the demo path", () => {
    const r = verifyDeterministic(claim("Our classifier reaches 92% accuracy.", "accuracy"), [], repo);
    expect(r?.verdict).toMatchObject({ status: "contradicted", evidence: [{ ref: "src/classifier.ts:41" }] });
    expect(r?.fixTask?.title).toMatch(/hard-coded/);
  });
  it("flags a spoken number that disagrees with the README", () => {
    const r = verifyDeterministic(claim("Our classifier reaches 92% accuracy.", "accuracy"), [], null, { readme: "# Demo\nThe classifier reaches 89% accuracy on our test set.", submission: null });
    expect(r?.verdict).toMatchObject({ status: "contradicted", evidence: [{ kind: "doc", ref: "README.md" }] });
  });
  it("flags a feature the submission lists as planned", () => {
    const r = verifyDeterministic(claim("It exports reports to PDF.", "feature"), [], null, { readme: null, submission: "PDF export is coming soon." });
    expect(r?.verdict.status).toBe("contradicted");
  });
  it("leaves unrelated claims alone", () => {
    expect(verifyDeterministic(claim("The dashboard groups reports by location.", "feature"), [], repo)).toBeNull();
  });
});

describe("canned-response detector", async () => {
  const { detectCanned, fineHash, hexHamming } = await import("../src/auditor/canned");
  const jpegjs = (await import("jpeg-js")).default;
  const frame = (box: [number, number, number, number] | null) => {
    const width = 160,
      height = 90,
      data = Buffer.alloc(width * height * 4, 255);
    if (box) for (let y = box[1]; y < box[3]; y++) for (let x = box[0]; x < box[2]; x++) data.fill(0, (y * width + x) * 4, (y * width + x) * 4 + 3);
    return new Uint8Array(jpegjs.encode({ data, width, height }, 90).data);
  };
  it("hashes JPEGs so different screens differ and identical ones match", () => {
    const a = fineHash(frame([10, 10, 60, 40]))!;
    expect(hexHamming(a, fineHash(frame([10, 10, 60, 40]))!)).toBe(0);
    expect(hexHamming(a, fineHash(frame([90, 50, 150, 80]))!)).toBeGreaterThan(12);
  });
  it("flags identical outputs for different inputs, and not identical inputs", () => {
    const inA = fineHash(frame([10, 10, 60, 40]))!;
    const inB = fineHash(frame([90, 50, 150, 80]))!;
    const out = fineHash(frame([0, 0, 160, 30]))!;
    expect(
      detectCanned([
        { sessionId: "s1", stepKey: "demo:1", startMs: 5000, inputHash: inA, outputHash: out },
        { sessionId: "s2", stepKey: "demo:1", startMs: 6000, inputHash: inB, outputHash: out },
      ]),
    ).toHaveLength(1);
    expect(
      detectCanned([
        { sessionId: "s1", stepKey: "demo:1", startMs: 5000, inputHash: inA, outputHash: out },
        { sessionId: "s2", stepKey: "demo:1", startMs: 6000, inputHash: inA, outputHash: out },
      ]),
    ).toHaveLength(0);
  });
});
