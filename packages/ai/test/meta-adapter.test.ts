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

// Responses API (POST {base}/responses), the Meta Model API's primary interface.
const reply = (text: string, extra: Record<string, unknown> = {}) =>
  Response.json({
    status: "completed",
    output: [
      { type: "reasoning", id: "rs_1", summary: [{ type: "summary_text", text: "Thinking." }], encrypted_content: "enc-abc" },
      { type: "message", role: "assistant", content: [{ type: "output_text", text }] },
    ],
    usage: { input_tokens: 500, output_tokens: 80, output_tokens_details: { reasoning_tokens: 40 } },
    ...extra,
  });
const validStyles = JSON.stringify({
  styles: [
    { role: "technical", questionStyle: "Asks how the pipeline is evaluated and for the numbers behind it." },
    { role: "impact", questionStyle: "Asks who benefits and what measured outcome changed." },
    { role: "product", questionStyle: "Asks what happens when the product is wrong." },
  ],
});
const responsesAdapter = () =>
  new MetaModelAdapter(
    {
      baseUrl: "https://api.meta.ai/v1",
      apiKey: "test-key",
      models: { spark: "muse-spark-1.3", wonder: "muse-wonder-1.0" },
      responseFormat: "json_object",
      api: "responses",
      reasoning: { effort: "high", summary: "auto", encrypted: true },
    },
    logger,
  );

describe("MetaModelAdapter on the Responses API", () => {
  it("posts to /responses with reasoning, encrypted reasoning, no storage and the JSON format", async () => {
    const fetchMock = vi.fn(async () => reply(validStyles));
    vi.stubGlobal("fetch", fetchMock);
    const result = await responsesAdapter().generateObject(prompt());
    expect(result.value.styles).toHaveLength(3);
    expect(result.usage).toEqual({ inputTokens: 500, outputTokens: 80 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.meta.ai/v1/responses");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer test-key");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: "muse-spark-1.3",
      store: false,
      reasoning: { effort: "high", summary: "auto" },
      include: ["reasoning.encrypted_content"],
      text: { format: { type: "json_object" } },
    });
    expect(body).not.toHaveProperty("temperature");
  });

  it("reads output_text when the API provides it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply("ignored", { output_text: validStyles, output: [] })),
    );
    expect((await responsesAdapter().generateObject(prompt())).value.styles).toHaveLength(3);
  });

  it("on a validation failure, replays the encrypted reasoning and the reply, then asks for a correction", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply('{"styles": []}')).mockResolvedValueOnce(reply(validStyles));
    vi.stubGlobal("fetch", fetchMock);
    const result = await responsesAdapter().generateObject(prompt());
    expect(result.attempts).toBe(2);
    const retry = JSON.parse(String((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body)) as { input: Record<string, unknown>[] };
    expect(retry.input[2]).toMatchObject({ type: "reasoning", encrypted_content: "enc-abc" });
    expect(retry.input[3]).toMatchObject({ type: "message", role: "assistant" });
    expect(retry.input.at(-1)).toMatchObject({ role: "user" });
    expect(String(retry.input.at(-1)?.content)).toMatch(/failed validation/);
  });

  it("sends images as input_image data URLs, PNG or JPEG by their bytes", async () => {
    const fetchMock = vi.fn(async () => reply(JSON.stringify({ numbers: ["9.2 s"] })));
    vi.stubGlobal("fetch", fetchMock);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    await responsesAdapter().generateObject(prompts.slideVerifyV1({ png, renderedText: [] }));
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)) as { input: { content: { type: string; image_url?: string }[] }[] };
    const image = body.input[1]?.content.find((c) => c.type === "input_image");
    expect(image?.image_url?.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("surfaces HTTP errors as typed errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bad key", { status: 401 })),
    );
    await expect(responsesAdapter().generateObject(prompt())).rejects.toMatchObject({ code: "http_error" });
  });
});

describe("createAi with Meta's settings", () => {
  it("reads the key from MODEL_API_KEY, uses the Responses API, and runs Wonder prompts on Spark until MODEL_WONDER is set", async () => {
    const fetchMock = vi.fn(async () => reply(validStyles));
    vi.stubGlobal("fetch", fetchMock);
    const ai = createAi({ MODEL_API_KEY: "k2", META_API_BASE_URL: "https://api.meta.ai/v1", MODEL_SPARK: "muse-spark-1.3", META_RESPONSE_FORMAT: "json_object", MODEL_MOCK: false }, logger);
    expect(ai.mode).toBe("meta");
    await ai.llm.generateObject({ ...prompt(), model: "wonder" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.meta.ai/v1/responses");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer k2");
    expect((JSON.parse(String(init.body)) as { model: string }).model).toBe("muse-spark-1.3");
  });
});
