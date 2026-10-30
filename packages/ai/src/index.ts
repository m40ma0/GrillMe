import type { ModelConfig } from "@stage-ready/config";
import type { Logger } from "pino";
import { MetaModelAdapter, type ReasoningEffort } from "./meta";
import { MockModelAdapter } from "./mock";
import { BudgetedLLM, type SpendStore } from "./budget";
import { parsePrices } from "./telemetry";
import { MetaImageAdapter } from "./image";
import { AiError, metaApiKey, type ImageGen, type LLM } from "./types";

export * from "./types";
export * from "./json";
export { MetaModelAdapter } from "./meta";
export { MockModelAdapter } from "./mock";
export { MetaImageAdapter } from "./image";
export * as prompts from "./prompts";
export type { RepoChunk } from "./prompts";
export * from "./heuristics";
export * from "./claims";
export * from "./coach";
export * from "./embed";
export * from "./rules";
export * from "./takes";
export * from "./qa";
export * from "./sam";
export * from "./telemetry";
export { BudgetedLLM, type DemoLimits, type SpendStore } from "./budget";

export interface Ai {
  llm: LLM;
  /** Muse Image, when MODEL_IMAGE is set and the API is configured; null in mock mode. */
  image: ImageGen | null;
  mode: "meta" | "mock";
  /** Why the mock adapter is in use, if it is. */
  reason: string | null;
}

/**
 * Picks the adapter. With no API key (or MODEL_MOCK=true) the product runs on mocked adapters, as
 * Demo Mode requires. With a key, the base URL and MODEL_SPARK must be set; nothing falls back to a
 * guessed model ID. Until a Muse Wonder ID is configured, long-context work runs on MODEL_SPARK.
 */
export function createAi(config: Partial<ModelConfig> & Pick<ModelConfig, "META_RESPONSE_FORMAT" | "MODEL_MOCK">, logger: Logger, options: { forceMock?: boolean } = {}): Ai {
  if (options.forceMock || config.MODEL_MOCK) return { llm: new MockModelAdapter(logger), image: null, mode: "mock", reason: options.forceMock ? "Demo Mode project" : "MODEL_MOCK=true" };
  const apiKey = metaApiKey(config);
  if (!apiKey) return { llm: new MockModelAdapter(logger), image: null, mode: "mock", reason: "META_API_KEY (or MODEL_API_KEY) is not set" };
  const missing = (["META_API_BASE_URL", "MODEL_SPARK"] as const).filter((key) => !config[key]);
  if (missing.length > 0)
    throw new AiError("not_configured", `The Meta API key is set but ${missing.join(" and ")} ${missing.length === 1 ? "is" : "are"} empty. Copy the values from the Meta Model API docs into .env.`);
  const spark = config.MODEL_SPARK as string;
  if (!config.MODEL_WONDER) logger.info({ model: spark }, "MODEL_WONDER is empty; Muse Wonder prompts run on MODEL_SPARK");
  const llm = new MetaModelAdapter(
    {
      baseUrl: config.META_API_BASE_URL as string,
      apiKey,
      models: { spark, wonder: config.MODEL_WONDER ?? spark },
      responseFormat: config.META_RESPONSE_FORMAT,
      api: config.META_API_STYLE ?? "responses",
      reasoning: { effort: reasoningEffort(config), summary: config.META_REASONING_SUMMARY ?? "auto", encrypted: config.META_REASONING_ENCRYPTED ?? true },
      prices: parsePrices(config.MODEL_PRICES),
    },
    logger,
  );
  const image = config.MODEL_IMAGE ? new MetaImageAdapter({ baseUrl: config.META_API_BASE_URL as string, apiKey, model: config.MODEL_IMAGE }, logger) : null;
  return { llm, image, mode: "meta", reason: null };
}

/**
 * The adapter for Demo Mode projects: the real models within the daily allowance (DEMO_LIVE_MODELS,
 * DEMO_DAILY_BUDGET_USD, DEMO_DAILY_CALL_LIMIT), else the mocks. Generated title-card art stays off in
 * Demo Mode, so renders of the fixture takes are reproducible.
 */
export function createDemoAi(
  config: Partial<Pick<ModelConfig, "DEMO_LIVE_MODELS" | "DEMO_DAILY_BUDGET_USD" | "DEMO_DAILY_CALL_LIMIT">> & { NODE_ENV?: string },
  live: Ai,
  mock: Ai,
  store: SpendStore,
  logger: Logger,
): Ai {
  const enabled = config.DEMO_LIVE_MODELS ?? config.NODE_ENV === "production";
  if (!enabled) return mock;
  if (live.mode !== "meta") return { ...mock, reason: live.reason };
  const llm = new BudgetedLLM(live.llm, mock.llm, store, { budgetUsd: config.DEMO_DAILY_BUDGET_USD ?? 5, maxCalls: config.DEMO_DAILY_CALL_LIMIT ?? 1500 }, logger);
  return { llm, image: null, mode: "meta", reason: null };
}

/** Spark low and Wonder high unless .env says otherwise; META_REASONING_EFFORT is the older setting for Wonder. */
export function reasoningEffort(
  config: Partial<Pick<ModelConfig, "META_REASONING_EFFORT_SPARK" | "META_REASONING_EFFORT_WONDER" | "META_REASONING_EFFORT">>,
): Record<"spark" | "wonder", ReasoningEffort> {
  return { spark: config.META_REASONING_EFFORT_SPARK ?? "low", wonder: config.META_REASONING_EFFORT_WONDER ?? config.META_REASONING_EFFORT ?? "high" };
}
