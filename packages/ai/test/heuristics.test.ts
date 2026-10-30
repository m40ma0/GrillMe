import { demoEventPageText, enforceEventSpecQuotes, EventSpecExtraction } from "@stage-ready/shared";
import { describe, expect, it } from "vitest";
import { findDeadline, findVideoLimit, heuristicEventSpec, heuristicWinners } from "../src";

describe("heuristic event extraction", () => {
  it("extracts the demo event page with a quote for every field", () => {
    const raw = EventSpecExtraction.parse(heuristicEventSpec(demoEventPageText));
    const { value, dropped } = enforceEventSpecQuotes(raw, demoEventPageText);
    expect(dropped).toEqual([]);
    expect(value.name).toBe("Global AI Builder Showcase (fictional)");
    expect(value.criteria.map((c) => [c.name, c.weight])).toEqual([
      ["Real-world impact", 0.3],
      ["Technical execution", 0.3],
      ["User experience", 0.2],
      ["Originality", 0.2],
    ]);
    expect(value.weightsInferred).toBe(false);
    expect(value.requirements).toEqual({ videoMaxSec: 180, repoPublic: true, deadlineIso: "2026-11-05T02:00:00.000Z" });
    expect(value.tracks.map((t) => t.name)).toEqual(["Applied AI"]);
    expect(value.requiredTech).toEqual(["generative AI"]);
    expect(value.peopleNamed).toEqual(["Avery Example", "Jordan Placeholder"]);
    for (const path of ["name", "tracks.0", "criteria.0", "criteria.3.weight", "requiredTech.0", "requirements.videoMaxSec", "requirements.repoPublic", "requirements.deadlineIso"]) {
      expect(demoEventPageText).toContain(value.sourceQuotes[path]);
    }
  });

  it("leaves unknowns null and infers equal weights when none are published", () => {
    const text = "Tiny Jam\nJudging criteria\nCreativity: How original it is.\nPolish: How finished it feels.\nShow us what you built.";
    const { value } = enforceEventSpecQuotes(heuristicEventSpec(text), text);
    expect(value.criteria.map((c) => c.weight)).toEqual([0.5, 0.5]);
    expect(value.weightsInferred).toBe(true);
    expect(value.requirements).toEqual({ videoMaxSec: null, repoPublic: null, deadlineIso: null });
  });

  it("converts deadlines in named zones and refuses zoneless ones", () => {
    expect(findDeadline("Submissions due Nov 4, 2026, 9:00 PM ET")?.iso).toBe("2026-11-05T02:00:00.000Z");
    expect(findDeadline("Submissions due November 4, 2026 at 9 PM")).toBeNull();
  });

  it("reads video limits in minutes or seconds", () => {
    expect(findVideoLimit("Your demo video must not exceed 3 minutes.")?.seconds).toBe(180);
    expect(findVideoLimit("Upload a pitch video, 90 seconds max.")?.seconds).toBe(90);
  });

  it("finds winners by placement and leaves unquoted fields unknown", () => {
    const winners = heuristicWinners("1st place: Mossline\nMossline turned noisy soil readings into an irrigation plan at 0:42.\n\nThanks to all teams.");
    expect(winners).toHaveLength(1);
    expect(winners[0]).toMatchObject({ title: "Mossline", placement: "1st place", inputType: "noisy soil readings", outputType: "an irrigation plan", strongestMomentSec: 42, domain: "unknown" });
  });
});

describe("coach notes diff", async () => {
  const { diffWeakSpots, heuristicPlan } = await import("../src");
  it("finds resolved, open and new weak spots by key, and always plans three items", () => {
    const prev = [
      { key: "a", text: "A", severity: "high" as const },
      { key: "b", text: "B", severity: "medium" as const },
    ];
    const now = [
      { key: "b", text: "B again", severity: "medium" as const },
      { key: "c", text: "C", severity: "high" as const },
    ];
    const diff = diffWeakSpots(prev, now);
    expect(diff.resolved.map((i) => i.key)).toEqual(["a"]);
    expect(diff.open.map((i) => i.key)).toEqual(["b"]);
    expect(diff.newIssues.map((i) => i.key)).toEqual(["c"]);
    expect(heuristicPlan(diff, ["Originality"])).toEqual(["C", "B again", "Drill a question on Originality."]);
    expect(heuristicPlan(diffWeakSpots([], []), [])).toHaveLength(3);
  });
});
