import { readFileSync } from "node:fs";
import pino from "pino";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiError, MetaModelAdapter, createAi, prompts } from "../src";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8");
const logger = pino({ level: "silent" });
const adapter = () =>
  new MetaModelAdapter({ baseUrl: "https://models.example.test/v1/", apiKey: "test-key", models: { spark: "spark-id", wonder: "wonder-id" }, responseFormat: "json_object" }, logger);
const prompt = () => prompts.personaStylesV1({ eventName: "Test event", difficulty: 3, criteriaByRole: { technical: ["Tech"], impact: ["Impact"], product: ["UX"] } });

afterEach(() => vi.unstubAllGlobals());

describe("MetaModelAdapter against recorded replies", () => {
  it("returns a validated object and logs usage", async () => {
    const fetchMock = vi.fn(async () => new Response(fixture("chat-valid"), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await adapter().generateObject(prompt());
    expect(result.value.styles).toHaveLength(3);
    expect(result.attempts).toBe(1);
    expect(result.modelId).toBe("spark-id");
    expect(result.usage).toEqual({ inputTokens: 470, outputTokens: 64 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://models.example.test/v1/chat/completions");
    const body = JSON.parse(String(init.body)) as { model: string; response_format: unknown };
    expect(body.model).toBe("spark-id");
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("retries once with the validation error appended, then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(fixture("chat-invalid")))
      .mockResolvedValueOnce(new Response(fixture("chat-valid")));
    vi.stubGlobal("fetch", fetchMock);
    const result = await adapter().generateObject(prompt());
    expect(result.attempts).toBe(2);
    expect(result.usage).toEqual({ inputTokens: 880, outputTokens: 86 });
    const retryBody = JSON.parse(String((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body)) as { messages: { role: string; content: string }[] };
    const last = retryBody.messages.at(-1);
    expect(last?.role).toBe("user");
    expect(last?.content).toMatch(/failed validation/);
    expect(last?.content).toMatch(/styles/);
  });

  it("surfaces a typed error after the second invalid reply", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(fixture("chat-invalid"))),
    );
    await expect(adapter().generateObject(prompt())).rejects.toMatchObject({ name: "AiError", code: "parse_failed" });
  });

  it("reports missing configured model IDs from the model listing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ data: [{ id: "spark-id" }] })),
    );
    await expect(adapter().verifyModels()).rejects.toMatchObject({ code: "model_missing" });
  });
});

describe("createAi", () => {
  it("uses the mock adapter without a key", () => {
    const ai = createAi({ META_RESPONSE_FORMAT: "json_object", MODEL_MOCK: false }, logger);
    expect(ai.mode).toBe("mock");
  });
  it("refuses a key without model IDs instead of guessing", () => {
    expect(() => createAi({ META_API_KEY: "k", META_RESPONSE_FORMAT: "json_object", MODEL_MOCK: false }, logger)).toThrow(AiError);
  });
});
