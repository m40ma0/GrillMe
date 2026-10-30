import jpegjs from "jpeg-js";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { createAi } from "@stage-ready/ai";
import type { ServerMessage } from "@stage-ready/shared";
import { fineHash } from "../src/auditor/canned";
import type { SessionContext } from "../src/session/context";
import { LiveSession } from "../src/session/live-session";

const jpeg = (box: [number, number, number, number] | null) => {
  const width = 160,
    height = 90,
    data = Buffer.alloc(width * height * 4, 255);
  if (box) for (let y = box[1]; y < box[3]; y++) for (let x = box[0]; x < box[2]; x++) data.fill(0, (y * width + x) * 4, (y * width + x) * 4 + 3);
  return new Uint8Array(jpegjs.encode({ data, width, height }, 90).data);
};
const logger = pino({ level: "silent" });

function session(ctx: Partial<SessionContext>) {
  const base: SessionContext = {
    sessionId: "01a18700-0000-7000-8000-000000000001",
    projectId: "01a18700-0000-7000-8000-000000000002",
    projectName: "Test",
    demoMode: true,
    eventName: "Test event",
    mode: "full_pitch",
    difficulty: 3,
    drillSection: null,
    personas: [],
    criteria: [],
    sections: [{ key: "demo", title: "Demo", budgetSec: 120 }],
    repo: null,
    docs: { readme: null, submission: null },
    priorSteps: [],
    ended: false,
  };
  const s = new LiveSession(
    { ...base, ...ctx },
    {
      db: {} as never,
      ai: createAi({ META_RESPONSE_FORMAT: "json_object", MODEL_MOCK: true }, logger),
      logger,
      tracker: { available: false, probe: async () => false, track: async () => null } as never,
      visionUrl: undefined,
      visionToken: undefined,
      speechModelConfigured: false,
    },
  );
  const sent: ServerMessage[] = [];
  s.attach((m) => sent.push(m));
  return { s, sent };
}

describe("LiveSession canned-response detector", () => {
  it("flags identical outputs for two different inputs across rehearsals", async () => {
    const inputA = jpeg([10, 10, 60, 40]);
    const inputB = jpeg([100, 60, 150, 85]);
    const output = jpeg([0, 0, 160, 45]);
    const { s, sent } = session({ priorSteps: [{ sessionId: "earlier", stepKey: "demo:1", startMs: 4_000, inputHash: fineHash(inputA), outputHash: fineHash(output) }] });
    await s.start({ type: "session.start", sessionId: "01a18700-0000-7000-8000-000000000001", mode: "full_pitch", personaIds: [] });
    // This rehearsal: a different input, the action, then the same result screen.
    s.frame(0, 0x00ffn, inputB);
    s.frame(1_000, 0x00f0n, inputB);
    s.frame(5_000, 0xff00_0f0fn, output);
    s.frame(6_000, 0xff00_0f0fn, output);
    const flag = sent.find((m) => m.type === "audit.flag");
    expect(sent.some((m) => m.type === "latency.sample")).toBe(true);
    expect(flag).toMatchObject({ type: "audit.flag", kind: "canned_response" });
    expect(s.summary().flags?.[0]?.kind).toBe("canned_response");
  });

  it("does not flag the same input producing the same output", async () => {
    const input = jpeg([10, 10, 60, 40]);
    const output = jpeg([0, 0, 160, 45]);
    const { s, sent } = session({ priorSteps: [{ sessionId: "earlier", stepKey: "demo:1", startMs: 4_000, inputHash: fineHash(input), outputHash: fineHash(output) }] });
    await s.start({ type: "session.start", sessionId: "01a18700-0000-7000-8000-000000000001", mode: "full_pitch", personaIds: [] });
    s.frame(0, 0x00ffn, input);
    s.frame(1_000, 0x00f0n, input);
    s.frame(5_000, 0xff00_0f0fn, output);
    s.frame(6_000, 0xff00_0f0fn, output);
    expect(sent.some((m) => m.type === "latency.sample")).toBe(true);
    expect(sent.some((m) => m.type === "audit.flag")).toBe(false);
  });
});

// ---------- F1 Judge Panel and F2 timing ----------

const personas = [
  {
    id: "01a18700-0000-7000-8000-0000000000a1",
    role: "technical" as const,
    questionStyle: "Asks how each number was measured.",
    criteriaWeights: { "Technical execution": 100 },
    voicePreset: "preset-a",
  },
  { id: "01a18700-0000-7000-8000-0000000000a2", role: "impact" as const, questionStyle: "Asks who benefits.", criteriaWeights: { "Real-world impact": 100 }, voicePreset: "preset-b" },
];

/** A live session driven directly: no STT, the test feeds partials and finals. */
function live(ctx: Partial<SessionContext> = {}) {
  const { s, sent } = session({ demoMode: false, personas, ...ctx });
  const any = s as unknown as Record<string, unknown> & {
    state: string;
    lastWallMs: number;
    lastClientMs: number;
    latency: { stepKey: string; startMs: number; endMs: number; durationMs: number; detector: string; inputHash: null; outputHash: null }[];
    onPartial(seg: unknown): void;
    onFinal(seg: unknown): Promise<void>;
    speak(c: unknown, text: string): void;
    contradictWhileRunning(now: number): void;
    stopwatch: { input(atMs: number): unknown };
    turns: { model?: { modelId: string } }[];
    ledger: { model?: { modelId: string } }[];
  };
  any.state = "live";
  any.lastWallMs = Date.now();
  any.lastClientMs = 0;
  return { s, sent, any };
}

let seq = 0;
const seg = (text: string, startMs: number, endMs: number) => ({ id: `seg-${++seq}`, startMs, endMs, speaker: "presenter", text, words: [] });

describe("Judge Panel", () => {
  it("“let me finish” makes the speaking judge yield at once and queue the question", () => {
    const { sent, any } = live();
    any.speak({ personaId: "01a18700-0000-7000-8000-0000000000a1", detail: "", kind: "interrupt", trigger: "claim" }, "How did you measure that?");
    const t = performance.now();
    any.onPartial(seg("hold on, let me finish", 5_000, 5_600));
    const yielded = sent.find((m) => m.type === "judge.yield");
    expect(performance.now() - t).toBeLessThan(1_000);
    expect(yielded).toEqual({ type: "judge.yield", personaId: "01a18700-0000-7000-8000-0000000000a1", queuedQuestion: "How did you measure that?" });
  });

  it("never cuts in on a partial: judges decide only when a sentence ends", async () => {
    const { sent, any } = live();
    any.latency.push({ stepKey: "generate_summary", startMs: 1_000, endMs: 10_200, durationMs: 9_200, detector: "phash", inputHash: null, outputHash: null });
    for (let i = 0; i < 5; i++) any.onPartial(seg("The summary is", 12_000, 12_400 + i * 200));
    await new Promise((r) => setTimeout(r, 50));
    expect(sent.some((m) => m.type === "judge.speak")).toBe(false);
    await any.onFinal(seg("The summary is instant.", 12_000, 13_500));
    await new Promise((r) => setTimeout(r, 50));
    const speak = sent.find((m) => m.type === "judge.speak");
    expect(speak).toMatchObject({ type: "judge.speak", kind: "interrupt" });
    // The interruption comes after the sentence's final transcript, never before it.
    expect(sent.findIndex((m) => m.type === "judge.speak")).toBeGreaterThan(sent.findIndex((m) => m.type === "transcript.final"));
  });

  it("tags every judge line and claim chip with the model that produced it", async () => {
    const { sent, any } = live();
    any.latency.push({ stepKey: "generate_summary", startMs: 1_000, endMs: 10_200, durationMs: 9_200, detector: "phash", inputHash: null, outputHash: null });
    await any.onFinal(seg("The summary is instant.", 12_000, 13_500));
    await new Promise((r) => setTimeout(r, 50));
    const speak = sent.find((m) => m.type === "judge.speak");
    const chip = sent.find((m) => m.type === "ledger.update");
    expect(speak?.type === "judge.speak" && speak.model).toMatchObject({ modelId: "mock" });
    expect(chip?.type === "ledger.update" && chip.claim.model).toMatchObject({ modelId: "mock" });
    expect(any.turns[0]?.model).toMatchObject({ modelId: "mock" });
    expect(any.ledger[0]?.model).toMatchObject({ modelId: "mock" });
  });
});

describe("Claim Auditor timing", () => {
  it("“it's instant” after a measured 9.2 s step is Contradicted with the measured time within 2 s of the sentence ending", async () => {
    const { sent, any } = live();
    any.latency.push({ stepKey: "generate_summary", startMs: 1_000, endMs: 10_200, durationMs: 9_200, detector: "phash", inputHash: null, outputHash: null });
    const t = performance.now();
    await any.onFinal(seg("The summary is instant.", 11_000, 12_500));
    const update = sent.find((m) => m.type === "ledger.update");
    expect(performance.now() - t).toBeLessThan(2_000);
    expect(update?.type === "ledger.update" && update.claim.status).toBe("contradicted");
    expect(update?.type === "ledger.update" && update.verdict.evidence[0]?.summary).toContain("9.2 s");
  });

  it("said before the step, the chip turns Contradicted once the running step outlasts the promise, then carries the final time", async () => {
    const { sent, any } = live();
    await any.onFinal(seg("The summary is instant.", 7_000, 8_000));
    expect(sent.filter((m) => m.type === "ledger.update").at(-1)).toMatchObject({ claim: { status: "unverified" } });
    any.stopwatch.input(10_000);
    any.contradictWhileRunning(10_800);
    expect(sent.filter((m) => m.type === "ledger.update").at(-1)).toMatchObject({ claim: { status: "unverified" } });
    any.contradictWhileRunning(11_200);
    const early = sent.filter((m) => m.type === "ledger.update").at(-1);
    expect(early).toMatchObject({ claim: { status: "contradicted" } });
    expect(early?.type === "ledger.update" && early.verdict.evidence[0]?.summary).toContain("Still waiting after 1.2 s");
  });
});
