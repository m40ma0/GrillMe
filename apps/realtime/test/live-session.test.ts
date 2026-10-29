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
