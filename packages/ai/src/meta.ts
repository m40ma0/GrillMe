import type { Logger } from "pino";
import { zodToJsonSchema } from "zod-to-json-schema";
import { parseReply } from "./json";
import { costUsd, traced, type ModelPrices } from "./telemetry";
import { AiError, type GenerateResult, type LLM, type ModelRole, type Prompt, type Usage, type Vision } from "./types";

// Meta Model API adapter, bearer auth. It speaks the Responses API (POST {META_API_BASE_URL}/responses),
// which the Meta Model API uses, with reasoning; or the older chat-completions protocol
// (POST {META_API_BASE_URL}/chat/completions). Base URL, key and model IDs come from env only.

export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high";

export interface ReasoningConfig {
  /** Per model role: Spark serves live, latency-sensitive calls; Wonder does background reasoning. */
  effort: Record<ModelRole, ReasoningEffort>;
  summary: "auto" | "concise" | "detailed" | "none";
  /** Return encrypted reasoning items so the validation retry continues from them without server-side storage. */
  encrypted: boolean;
}

export interface MetaConfig {
  baseUrl: string;
  apiKey: string;
  models: Record<ModelRole, string>;
  responseFormat: "json_schema" | "json_object" | "none";
  api?: "responses" | "chat_completions";
  reasoning?: ReasoningConfig;
  prices?: ModelPrices;
  timeoutMs?: number;
}

type InputContent = { type: "input_text"; text: string } | { type: "input_image"; image_url: string };
/** Responses API input: messages, plus output items passed back verbatim (reasoning, assistant messages). */
type InputItem = { role: "system" | "user" | "assistant"; content: string | InputContent[] } | Record<string, unknown>;

interface ResponsesReply {
  status?: string;
  output_text?: string;
  output?: { type: string; content?: { type: string; text?: string }[] }[];
  usage?: { input_tokens?: number; output_tokens?: number; output_tokens_details?: { reasoning_tokens?: number } };
  incomplete_details?: { reason?: string } | null;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[];
}

interface ChatResponse {
  choices?: { message?: { content?: string | { type: string; text?: string }[] | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; input_tokens?: number; output_tokens?: number };
}

/** PNG (slides) or JPEG (camera and screen frames), by magic bytes. */
const dataUrl = (image: Uint8Array) => `data:${image[0] === 0x89 && image[1] === 0x50 ? "image/png" : "image/jpeg"};base64,${Buffer.from(image).toString("base64")}`;

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

  /** One Responses API call. Returns the output text, usage, and the output items to replay on a retry. */
  private async respond(role: ModelRole, input: InputItem[], format: Record<string, unknown> | undefined, signal?: AbortSignal) {
    const model = this.config.models[role];
    const timeout = AbortSignal.timeout(this.config.timeoutMs ?? 300_000);
    const r = this.config.reasoning;
    const effort = r?.effort[role] ?? "none";
    const body = JSON.stringify({
      model,
      input,
      store: false,
      ...(format ? { text: { format } } : {}),
      ...(r && effort !== "none" ? { reasoning: { effort, ...(r.summary !== "none" ? { summary: r.summary } : {}) }, ...(r.encrypted ? { include: ["reasoning.encrypted_content"] } : {}) } : {}),
    });
    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await fetch(this.url("/responses"), {
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
      const json = (await response.json()) as ResponsesReply;
      const output = json.output ?? [];
      const text =
        json.output_text ??
        output
          .filter((o) => o.type === "message")
          .flatMap((o) => o.content ?? [])
          .filter((c) => c.type === "output_text")
          .map((c) => c.text ?? "")
          .join("");
      const usage: Usage = { inputTokens: json.usage?.input_tokens ?? null, outputTokens: json.usage?.output_tokens ?? null };
      return { text, usage, output: output as Record<string, unknown>[], reasoningTokens: json.usage?.output_tokens_details?.reasoning_tokens ?? null, status: json.status ?? null };
    }
  }

  private responsesFormat(prompt: Prompt<unknown>) {
    switch (this.config.responseFormat) {
      case "json_schema":
        return { type: "json_schema", name: prompt.id.replace(/[^\w-]/g, "_").slice(0, 64), schema: zodToJsonSchema(prompt.schema, { target: "openAi" }), strict: false };
      case "json_object":
        return { type: "json_object" };
      default:
        return undefined;
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
    if (this.config.api === "responses") return this.runResponses(prompt, options);
    const modelId = this.config.models[prompt.model];
    const schemaHint = JSON.stringify(zodToJsonSchema(prompt.schema, { target: "openAi" }));
    const messages: ChatMessage[] = [
      { role: "system", content: `${prompt.system}\n\nReply with a single JSON value that matches this JSON Schema, and nothing else:\n${schemaHint}` },
      {
        role: "user",
        content: prompt.images?.length ? [{ type: "text", text: prompt.user }, ...prompt.images.map((image) => ({ type: "image_url" as const, image_url: { url: dataUrl(image) } }))] : prompt.user,
      },
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

  private async runResponses<T>(prompt: Prompt<T>, options: { signal?: AbortSignal }): Promise<GenerateResult<T>> {
    const modelId = this.config.models[prompt.model];
    const schemaHint = JSON.stringify(zodToJsonSchema(prompt.schema, { target: "openAi" }));
    const input: InputItem[] = [
      { role: "system", content: `${prompt.system}\n\nReply with a single JSON value that matches this JSON Schema, and nothing else:\n${schemaHint}` },
      { role: "user", content: [{ type: "input_text", text: prompt.user }, ...(prompt.images ?? []).map((image) => ({ type: "input_image" as const, image_url: dataUrl(image) }))] },
    ];
    const started = performance.now();
    const usage: Usage = { inputTokens: 0, outputTokens: 0 };
    for (let attempt = 1; attempt <= 2; attempt++) {
      const reply = await this.respond(prompt.model, input, this.responsesFormat(prompt as Prompt<unknown>), options.signal);
      usage.inputTokens = reply.usage.inputTokens === null ? null : (usage.inputTokens ?? 0) + reply.usage.inputTokens;
      usage.outputTokens = reply.usage.outputTokens === null ? null : (usage.outputTokens ?? 0) + reply.usage.outputTokens;
      const parsed = parseReply(reply.text, prompt.schema);
      const latencyMs = Math.round(performance.now() - started);
      const cost = costUsd(this.config.prices ?? {}, modelId, usage.inputTokens, usage.outputTokens);
      const log = { prompt: prompt.id, promptVersion: prompt.version, modelId, latencyMs, attempt, ...usage, reasoningTokens: reply.reasoningTokens, status: reply.status, costUsd: cost };
      if (parsed.ok) {
        this.logger.info(log, "model call");
        return { value: parsed.value, modelId, latencyMs, usage, attempts: attempt, costUsd: cost };
      }
      this.logger.warn({ ...log, validation: parsed.error }, "model output failed validation");
      if (attempt === 2) throw new AiError("parse_failed", `${prompt.id} v${prompt.version} returned output that does not match its schema.`, parsed.error);
      // Replay this turn's output items (encrypted reasoning and the reply) so the retry continues from them.
      input.push(...reply.output, { role: "user", content: `Your reply failed validation:\n${parsed.error}\nReturn corrected JSON only.` });
    }
    throw new AiError("parse_failed", "Unreachable.");
  }

  async describeFrame(input: { jpeg: Uint8Array; question: string }, options: { signal?: AbortSignal } = {}): Promise<string> {
    if (this.config.api === "responses") {
      const reply = await this.respond(
        "spark",
        [
          {
            role: "user",
            content: [
              { type: "input_text", text: input.question },
              { type: "input_image", image_url: dataUrl(input.jpeg) },
            ],
          },
        ],
        undefined,
        options.signal,
      );
      return reply.text;
    }
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
