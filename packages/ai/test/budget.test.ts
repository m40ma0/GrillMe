import pino from "pino";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { BudgetedLLM, createDemoAi, type Ai, type GenerateResult, type LLM, type Prompt, type SpendStore } from "../src";

const logger = pino({ level: "silent" });
const prompt: Prompt<{ ok: boolean }> = { id: "t", version: 1, model: "spark", system: "", user: "", schema: z.object({ ok: z.boolean() }), mock: () => ({ ok: false }) };
const result = (modelId: string, costUsd: number | null): GenerateResult<{ ok: boolean }> => ({
  value: { ok: modelId !== "mock" },
  modelId,
  latencyMs: 5,
  usage: { inputTokens: 1, outputTokens: 1 },
  attempts: 1,
  costUsd,
});

class MemoryStore implements SpendStore {
  values = new Map<string, number>();
  get = async (key: string) => (this.values.has(key) ? String(this.values.get(key)) : null);
  incrbyfloat = async (key: string, n: number) => {
    this.values.set(key, (this.values.get(key) ?? 0) + n);
    return String(this.values.get(key));
  };
  expire = async () => 1;
}
const liveLlm = (cost: number | null, fail = false): LLM & { calls: number } => {
  const llm = {
    kind: "meta" as const,
    calls: 0,
    generateObject: async <T>() => {
      llm.calls += 1;
      if (fail) throw new Error("HTTP 500");
      return result("muse-spark-1.3", cost) as unknown as GenerateResult<T>;
    },
  };
  return llm;
};
const mockLlm: LLM = { kind: "mock", generateObject: async <T>() => result("mock", 0) as unknown as GenerateResult<T> };

describe("Demo Mode on real models within a daily allowance", () => {
  it("calls the real model and records calls and spend", async () => {
    const store = new MemoryStore();
    const llm = new BudgetedLLM(liveLlm(0.01), mockLlm, store, { budgetUsd: 5, maxCalls: 100 }, logger, () => "2026-11-01");
    const r = await llm.generateObject(prompt);
    expect(r.modelId).toBe("muse-spark-1.3");
    expect(r.fallback).toBeUndefined();
    expect(await llm.spent()).toEqual({ calls: 1, usd: 0.01 });
  });

  it("falls back to the mock, and says so, once the dollar budget is spent", async () => {
    const store = new MemoryStore();
    const live = liveLlm(3);
    const llm = new BudgetedLLM(live, mockLlm, store, { budgetUsd: 5, maxCalls: 100 }, logger, () => "2026-11-01");
    await llm.generateObject(prompt);
    await llm.generateObject(prompt);
    const third = await llm.generateObject(prompt);
    expect(live.calls).toBe(2);
    expect(third).toMatchObject({ modelId: "mock", fallback: "budget" });
  });

  it("caps calls even when prices are unknown, and resets the next day", async () => {
    const store = new MemoryStore();
    let day = "2026-11-01";
    const live = liveLlm(null);
    const llm = new BudgetedLLM(live, mockLlm, store, { budgetUsd: 5, maxCalls: 2 }, logger, () => day);
    for (let i = 0; i < 3; i += 1) await llm.generateObject(prompt);
    expect(live.calls).toBe(2);
    day = "2026-11-02";
    expect((await llm.generateObject(prompt)).modelId).toBe("muse-spark-1.3");
  });

  it("answers with the mock when the real call fails, so the demo keeps going", async () => {
    const llm = new BudgetedLLM(liveLlm(0, true), mockLlm, new MemoryStore(), { budgetUsd: 5, maxCalls: 100 }, logger);
    expect(await llm.generateObject(prompt)).toMatchObject({ modelId: "mock", fallback: "error" });
  });

  it("answers with the mock when the spend store is down", async () => {
    const broken: SpendStore = { get: async () => Promise.reject(new Error("redis down")), incrbyfloat: async () => "0", expire: async () => 0 };
    const live = liveLlm(0);
    const llm = new BudgetedLLM(live, mockLlm, broken, { budgetUsd: 5, maxCalls: 100 }, logger);
    expect(await llm.generateObject(prompt)).toMatchObject({ modelId: "mock", fallback: "budget" });
    expect(live.calls).toBe(0);
  });
});

describe("createDemoAi", () => {
  const live: Ai = { llm: liveLlm(0), image: null, mode: "meta", reason: null };
  const mock: Ai = { llm: mockLlm, image: null, mode: "mock", reason: "Demo Mode project" };
  it("is on by default in production only, and off without a key", () => {
    expect(createDemoAi({ NODE_ENV: "production" }, live, mock, new MemoryStore(), logger).llm).toBeInstanceOf(BudgetedLLM);
    expect(createDemoAi({ NODE_ENV: "development" }, live, mock, new MemoryStore(), logger)).toBe(mock);
    expect(createDemoAi({ DEMO_LIVE_MODELS: true }, live, mock, new MemoryStore(), logger).llm).toBeInstanceOf(BudgetedLLM);
    expect(createDemoAi({ NODE_ENV: "production", DEMO_LIVE_MODELS: false }, live, mock, new MemoryStore(), logger)).toBe(mock);
    expect(createDemoAi({ NODE_ENV: "production" }, { ...mock, reason: "no key" }, mock, new MemoryStore(), logger).mode).toBe("mock");
  });
});

describe("non-LLM calls in the demo allowance (hosted SAM)", () => {
  it("takes calls from the same daily count and refuses past the cap", async () => {
    const store = new MemoryStore();
    const llm = new BudgetedLLM(liveLlm(0), mockLlm, store, { budgetUsd: 5, maxCalls: 7 }, logger, () => "2026-11-01");
    expect(await llm.allow(3)).toBe(true);
    expect(await llm.allow(3)).toBe(true);
    expect(await llm.allow(3)).toBe(false);
    expect((await llm.spent()).calls).toBe(6);
  });
});
