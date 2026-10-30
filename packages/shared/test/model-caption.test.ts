import { describe, expect, it } from "vitest";
import { modelCaption, modelLabel } from "../src";

describe("model attribution captions", () => {
  it("names Meta models and the mock", () => {
    expect(modelLabel("muse-spark-1.3")).toBe("Muse Spark 1.3");
    expect(modelLabel("muse-wonder-1.0")).toBe("Muse Wonder 1.0");
    expect(modelLabel("mock")).toBe("Mocked");
  });
  it("adds latency in seconds, and says why Demo Mode fell back", () => {
    expect(modelCaption({ modelId: "muse-spark-1.3", latencyMs: 1940 })).toBe("Muse Spark 1.3 · 1.9 s");
    expect(modelCaption({ modelId: "muse-wonder-1.0", latencyMs: null })).toBe("Muse Wonder 1.0");
    expect(modelCaption({ modelId: "mock", latencyMs: 0 })).toBe("Mocked");
    expect(modelCaption({ modelId: "mock", latencyMs: 0, fallback: "budget" })).toMatch(/allowance/);
    expect(modelCaption({ modelId: "mock", latencyMs: 0, fallback: "error" })).toMatch(/failed/);
  });
});

describe("session model use", async () => {
  const { modelUseLabel } = await import("../src");
  it("says mocked instead of $0, hides an unknown cost, and shows a known one", () => {
    expect(modelUseLabel({ modelCostUsd: 0, modelCalls: 12, mockedCalls: 12 })).toBe("12 model calls, mocked");
    expect(modelUseLabel({ modelCostUsd: 0, modelCalls: 5 })).toBe("5 model calls, mocked");
    expect(modelUseLabel({ modelCostUsd: null, modelCalls: 7, mockedCalls: 0 })).toBe("7 model calls");
    expect(modelUseLabel({ modelCostUsd: 0.0123, modelCalls: 7, mockedCalls: 1 })).toBe("$0.0123 over 7 model calls (1 mocked)");
    expect(modelUseLabel({ modelCostUsd: 0, modelCalls: 0 })).toBe("no model calls");
  });
});
