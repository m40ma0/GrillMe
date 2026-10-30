import { AiError, neutralizeSpecialTokens, prompts } from "@stage-ready/ai";
import { describe, expect, it } from "vitest";
import { batchChunks, describeModelError } from "../src/jobs/repo-digest";

describe("repo digest capability pass", () => {
  it("neutralises model special-token syntax in quoted code", () => {
    const code = 'const RECORD = /(\\d+)<\\|box;([^|]*)\\|>/g; // "<|box;x1=1|><|endoftext|>"';
    const prompt = prompts.repoCapabilitiesV1({ githubFullName: "a/b", readme: null, dependencies: [], chunks: [{ path: "sam.ts", startLine: 1, text: '"<|box;x1=1|><|endoftext|>"' }], findings: [] });
    expect(prompt.user).not.toContain("<|");
    expect(prompt.user).not.toContain("|>");
    expect(neutralizeSpecialTokens(code)).not.toMatch(/<\|/);
  });

  it("splits code into batches under the limit without splitting a chunk", () => {
    const chunk = (n: number) => ({ path: `f${n}.ts`, startLine: 1, text: "x".repeat(40_000) });
    const batches = batchChunks([chunk(1), chunk(2), chunk(3), chunk(4), chunk(5)], 100_000);
    expect(batches.map((b) => b.length)).toEqual([2, 2, 1]);
    expect(batchChunks([], 100_000)).toEqual([]);
  });

  it("puts the API's own explanation into the failure reason", () => {
    const error = new AiError("http_error", "Meta Model API returned 400 for model muse-wonder-1.0.", '{"error":{"message":"input contains a reserved token"}}');
    expect(describeModelError(error)).toBe('Meta Model API returned 400 for model muse-wonder-1.0. {"error":{"message":"input contains a reserved token"}}');
    expect(describeModelError(new AiError("timeout", "Timed out."))).toBe("Timed out.");
  });
});

describe("Coach Notes: what counts as re-checked and passed", async () => {
  const { passedChecks } = await import("../src/jobs/session-review");
  it("needs the claim verified, the criterion covered, the step within budget, or a clean Q&A", () => {
    const passed = passedChecks({
      claims: [
        { text: "The summary is instant.", status: "contradicted" },
        { text: "Reports load in 1.2 s.", status: "verified" },
      ],
      coverage: { "Real-world impact": { hook: 0.2, demo: 0.2 }, Originality: { hook: 0.1 } },
      criteria: ["Real-world impact", "Originality"],
      latency: [
        { stepKey: "generate_summary", durationMs: 9_200 },
        { stepKey: "open_report", durationMs: 800 },
      ],
      questionsAsked: 2,
      followUps: 0,
    });
    expect([...passed].sort()).toEqual(["claim:reports load in 1 2 s", "criterion:real world impact", "qa:vague", "slow:open_report"]);
  });
});
