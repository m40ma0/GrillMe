import { describe, expect, it } from "vitest";
import {
  AnswerCard,
  Claim,
  CriteriaUpdate,
  autoSectionPlan,
  computeCompliance,
  demoEventPageText,
  demoEventSpec,
  enforceEventSpecQuotes,
  enforceWinnerQuotes,
  equalWeights,
  normalizeWeights,
  type ComplianceInput,
} from "../src";
import { BinaryKind, decodeBinary, encodeBinary } from "../src/ws-binary";

const base: ComplianceInput = {
  videoMaxSec: 180,
  plannedVideoSec: 170,
  requiredTech: [],
  repoSignals: null,
  repoVisibility: null,
  repoPublicRequired: null,
  deadlineIso: null,
  timezone: "Asia/Singapore",
  now: new Date("2026-10-30T00:00:00Z"),
};
const status = (input: Partial<ComplianceInput>, id: string) => computeCompliance({ ...base, ...input }).find((i) => i.id === id)?.status;

describe("core schemas", () => {
  it("validates claims and answer card word caps", () => {
    expect(Claim.safeParse({ text: "It is instant", type: "performance", quantity: null, featureName: null, segmentStartMs: 1200 }).success).toBe(true);
    expect(Claim.safeParse({ text: "x", type: "impact", quantity: null, featureName: null, segmentStartMs: 0 }).success).toBe(false);
    expect(AnswerCard.safeParse({ script: Array(56).fill("word").join(" "), bridgeLine: "b", evidenceRefs: [] }).success).toBe(false);
    expect(AnswerCard.safeParse({ script: Array(55).fill("word").join(" "), bridgeLine: "b", evidenceRefs: [] }).success).toBe(true);
  });
});

describe("criteria weights", () => {
  const c = (weight: number) => ({ name: "C", description: "", weight });
  it("cannot be saved unless they sum to 100%", () => {
    expect(CriteriaUpdate.safeParse([c(0.5), c(0.4)]).success).toBe(false);
    expect(CriteriaUpdate.safeParse([c(0.5), c(0.6)]).success).toBe(false);
    expect(CriteriaUpdate.safeParse([c(0.5), c(0.5)]).success).toBe(true);
    expect(CriteriaUpdate.safeParse(equalWeights(3).map(c)).success).toBe(true);
  });
  it("normalises to integer percentages that sum to 100", () => {
    expect(equalWeights(3)).toEqual([0.34, 0.33, 0.33]);
    expect(normalizeWeights([30, 30, 20, 20])).toEqual([0.3, 0.3, 0.2, 0.2]);
    expect(normalizeWeights([1, 1, 1]).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });
});

describe("source quotes", () => {
  it("keeps the demo fixture intact", () => {
    expect(enforceEventSpecQuotes(demoEventSpec, demoEventPageText).dropped).toEqual([]);
  });
  it("nulls fields whose quotes are not in the source", () => {
    const fabricated = { ...demoEventSpec, sourceQuotes: { ...demoEventSpec.sourceQuotes, "requirements.videoMaxSec": "videos may run 5 minutes", "criteria.3.weight": "Originality (25%)" } };
    const { value, dropped } = enforceEventSpecQuotes(fabricated, demoEventPageText);
    expect(value.requirements.videoMaxSec).toBeNull();
    expect(value.weightsInferred).toBe(true);
    expect(value.criteria.map((x) => x.weight)).toEqual([0.25, 0.25, 0.25, 0.25]);
    expect(dropped).toContain("requirements.videoMaxSec");
  });
  it("marks unquoted winner fields unknown", () => {
    const { value } = enforceWinnerQuotes(
      {
        title: "A",
        placement: "1st",
        inputType: "x",
        outputType: "y",
        demoStructure: ["s"],
        strongestMomentSec: 30,
        domain: "d",
        track: null,
        tech: ["t"],
        sourceQuotes: { title: "A wins", placement: "1st" },
      },
      "A wins 1st prize",
    );
    expect(value).toMatchObject({ title: "A", placement: "1st", inputType: "unknown", demoStructure: [], strongestMomentSec: null, tech: [] });
  });
});

describe("compliance", () => {
  it("marks a video over the limit as failed", () => {
    expect(status({ plannedVideoSec: 195 }, "video_limit")).toBe("fail");
    expect(status({ plannedVideoSec: 180 }, "video_limit")).toBe("pass");
    expect(status({ videoMaxSec: null }, "video_limit")).toBe("unknown");
  });
  it("checks required tech, repo visibility and deadline", () => {
    expect(status({ requiredTech: ["Llama"], repoSignals: ["llama-api-client"] }, "required_tech")).toBe("pass");
    expect(status({ requiredTech: ["Llama"], repoSignals: ["openai"] }, "required_tech")).toBe("fail");
    expect(status({ repoVisibility: "private", repoPublicRequired: true }, "repo_public")).toBe("fail");
    expect(status({ deadlineIso: "2026-11-05T02:00:00Z" }, "deadline")).toBe("pass");
    expect(status({ deadlineIso: "2026-10-01T02:00:00Z" }, "deadline")).toBe("fail");
  });
});

describe("section plan", () => {
  it.each([180, 120, 61, 300])("sums to the %i s limit", (limit) => {
    const plan = autoSectionPlan(limit);
    expect(plan.map((s) => s.key)).toEqual(["hook", "problem", "demo", "how", "impact", "close"]);
    expect(plan.reduce((sum, s) => sum + s.budgetSec, 0)).toBe(limit);
  });
});

describe("ws-binary", () => {
  it("round-trips a frame", () => {
    const payload = new Uint8Array([1, 2, 3]);
    const decoded = decodeBinary(encodeBinary(BinaryKind.frame, 123_456, payload));
    expect(decoded).toEqual({ kind: BinaryKind.frame, timestampMs: 123_456, payload });
  });
});

describe("fictional personas", () => {
  it("carry no name field, are always marked fictional, and real names from the event page are caught", async () => {
    const { Persona, mentionsPerson, demoPersonas } = await import("../src");
    for (const p of demoPersonas) {
      expect(Persona.parse(p).isFictional).toBe(true);
      expect(Object.keys(p)).not.toContain("name");
    }
    expect(Persona.safeParse({ ...demoPersonas[0], isFictional: false }).success).toBe(false);
    expect(mentionsPerson("Asks like Dr. Ada Lovelace would.", ["Ada Lovelace"])).toBe(true);
    expect(mentionsPerson("Asks what Lovelace thinks.", ["Ada Lovelace"])).toBe(true);
    expect(mentionsPerson("Asks how each number was measured.", ["Ada Lovelace"])).toBe(false);
  });
});
