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
