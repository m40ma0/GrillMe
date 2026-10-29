import type { Logger } from "pino";
import { zodToJsonSchema } from "zod-to-json-schema";
import { parseReply } from "./json";
import { costUsd, traced, type ModelPrices } from "./telemetry";
import { AiError, type GenerateResult, type LLM, type ModelRole, type Prompt, type Usage, type Vision } from "./types";

// Meta Model API adapter. It speaks the chat-completions protocol
// (POST {META_API_BASE_URL}/chat/completions, bearer auth). Base URL, key and
// model IDs come from env only; confirm them in the official docs.

export interface MetaConfig {
  baseUrl: string;
  apiKey: string;
  models: Record<ModelRole, string>;
  responseFormat: "json_schema" | "json_object" | "none";
  prices?: ModelPrices;
  timeoutMs?: number;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[];
}

interface ChatResponse {
  choices?: { message?: { content?: string | { type: string; text?: string }[] | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; input_tokens?: number; output_tokens?: number };
}

const contentText = (content: string | { type: string; text?: string }[] | null | undefined) => (typeof content === "string" ? content : (content ?? []).map((part) => part.text ?? "").join(""));

export class MetaModelAdapter implements LLM, Vision {
  readonly kind = "meta" as const;

  constructor(
    private readonly config: MetaConfig,
    private readonly logger: Logger,
  ) {}

  private url(path: string) {
    return `${this.config.baseUrl.replace(/\/+$/, "")}${path}`;
  }

  private async chat(model: string, messages: ChatMessage[], format: Record<string, unknown> | undefined, signal?: AbortSignal) {
    const timeout = AbortSignal.timeout(this.config.timeoutMs ?? 120_000);
    const body = JSON.stringify({ model, messages, temperature: 0.2, ...(format ? { response_format: format } : {}) });
    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await fetch(this.url("/chat/completions"), {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${this.config.apiKey}` },
          body,
          signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        });
      } catch (error) {
        if (timeout.aborted) throw new AiError("timeout", `Model ${model} did not answer in time.`);
        throw new AiError("unavailable", `Could not reach the Meta Model API: ${(error as Error).message}`);
      }
      if ((response.status === 429 || response.status >= 500) && attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        continue;
      }
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500);
        throw new AiError("http_error", `Meta Model API returned ${response.status} for model ${model}.`, detail);
      }
      const json = (await response.json()) as ChatResponse;
      const usage: Usage = {
        inputTokens: json.usage?.prompt_tokens ?? json.usage?.input_tokens ?? null,
        outputTokens: json.usage?.completion_tokens ?? json.usage?.output_tokens ?? null,
      };
      return { text: contentText(json.choices?.[0]?.message?.content), usage };
    }
  }

  private responseFormat(prompt: Prompt<unknown>) {
    switch (this.config.responseFormat) {
      case "json_schema":
        return { type: "json_schema", json_schema: { name: prompt.id.replace(/[^\w-]/g, "_").slice(0, 64), schema: zodToJsonSchema(prompt.schema, { target: "openAi" }) } };
      case "json_object":
        return { type: "json_object" };
      default:
        return undefined;
    }
  }

  async generateObject<T>(prompt: Prompt<T>, options: { signal?: AbortSignal } = {}): Promise<GenerateResult<T>> {
    return traced(prompt, () => this.run(prompt, options));
  }

  private async run<T>(prompt: Prompt<T>, options: { signal?: AbortSignal }): Promise<GenerateResult<T>> {
    const modelId = this.config.models[prompt.model];
    const schemaHint = JSON.stringify(zodToJsonSchema(prompt.schema, { target: "openAi" }));
    const messages: ChatMessage[] = [
      { role: "system", content: `${prompt.system}\n\nReply with a single JSON value that matches this JSON Schema, and nothing else:\n${schemaHint}` },
      { role: "user", content: prompt.user },
    ];
    const started = performance.now();
    const usage: Usage = { inputTokens: 0, outputTokens: 0 };
    for (let attempt = 1; attempt <= 2; attempt++) {
      const reply = await this.chat(modelId, messages, this.responseFormat(prompt as Prompt<unknown>), options.signal);
      usage.inputTokens = reply.usage.inputTokens === null ? null : (usage.inputTokens ?? 0) + reply.usage.inputTokens;
      usage.outputTokens = reply.usage.outputTokens === null ? null : (usage.outputTokens ?? 0) + reply.usage.outputTokens;
      const parsed = parseReply(reply.text, prompt.schema);
      const latencyMs = Math.round(performance.now() - started);
      const cost = costUsd(this.config.prices ?? {}, modelId, usage.inputTokens, usage.outputTokens);
      const log = { prompt: prompt.id, promptVersion: prompt.version, modelId, latencyMs, attempt, ...usage, costUsd: cost };
      if (parsed.ok) {
        this.logger.info(log, "model call");
        return { value: parsed.value, modelId, latencyMs, usage, attempts: attempt, costUsd: cost };
      }
      this.logger.warn({ ...log, validation: parsed.error }, "model output failed validation");
      if (attempt === 2) throw new AiError("parse_failed", `${prompt.id} v${prompt.version} returned output that does not match its schema.`, parsed.error);
      messages.push({ role: "assistant", content: reply.text }, { role: "user", content: `Your reply failed validation:\n${parsed.error}\nReturn corrected JSON only.` });
    }
    throw new AiError("parse_failed", "Unreachable.");
  }

  async describeFrame(input: { jpeg: Uint8Array; question: string }, options: { signal?: AbortSignal } = {}): Promise<string> {
    const url = `data:image/jpeg;base64,${Buffer.from(input.jpeg).toString("base64")}`;
    const reply = await this.chat(
      this.config.models.spark,
      [
        {
          role: "user",
          content: [
            { type: "text", text: input.question },
            { type: "image_url", image_url: { url } },
          ],
        },
      ],
      undefined,
      options.signal,
    );
    return reply.text;
  }

  /**
   * Startup check: list the API's models (if the endpoint exists) and fail
   * with a clear message when a configured ID is missing.
   */
  async verifyModels(): Promise<{ checked: boolean; missing: string[] }> {
    let response: Response;
    try {
      response = await fetch(this.url("/models"), { headers: { authorization: `Bearer ${this.config.apiKey}` }, signal: AbortSignal.timeout(10_000) });
    } catch (error) {
      throw new AiError("unavailable", `Could not reach ${this.url("/models")}: ${(error as Error).message}`);
    }
    if (response.status === 404 || response.status === 405) return { checked: false, missing: [] };
    if (!response.ok) throw new AiError("http_error", `Model listing returned ${response.status}. Check META_API_BASE_URL and META_API_KEY.`);
    const body = (await response.json()) as { data?: { id?: string }[]; models?: { id?: string; name?: string }[] };
    const ids = new Set([...(body.data ?? []), ...(body.models ?? [])].flatMap((m) => [m.id, (m as { name?: string }).name]).filter((v): v is string => Boolean(v)));
    const missing = Object.values(this.config.models).filter((id) => !ids.has(id));
    if (missing.length > 0) throw new AiError("model_missing", `Configured model IDs not offered by the API: ${missing.join(", ")}. Available: ${[...ids].slice(0, 20).join(", ")}.`);
    return { checked: true, missing };
  }
}
