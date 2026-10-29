import type { ModelConfig } from "@stage-ready/config";
import type { Logger } from "pino";
import { MetaModelAdapter } from "./meta";
import { MockModelAdapter } from "./mock";
import { parsePrices } from "./telemetry";
import { AiError, type LLM } from "./types";

export * from "./types";
export * from "./json";
export { MetaModelAdapter } from "./meta";
export { MockModelAdapter } from "./mock";
export * as prompts from "./prompts";
export type { RepoChunk } from "./prompts";
export * from "./heuristics";
export * from "./claims";
export * from "./telemetry";

export interface Ai {
  llm: LLM;
  mode: "meta" | "mock";
  /** Why the mock adapter is in use, if it is. */
  reason: string | null;
}

/**
 * Picks the adapter. With no META_API_KEY (or MODEL_MOCK=true) the product
 * runs on mocked adapters, as Demo Mode requires. With a key, every required
 * value must be set; nothing falls back to a guessed model ID.
 */
export function createAi(config: ModelConfig, logger: Logger, options: { forceMock?: boolean } = {}): Ai {
  if (options.forceMock || config.MODEL_MOCK) return { llm: new MockModelAdapter(logger), mode: "mock", reason: options.forceMock ? "Demo Mode project" : "MODEL_MOCK=true" };
  if (!config.META_API_KEY) return { llm: new MockModelAdapter(logger), mode: "mock", reason: "META_API_KEY is not set" };
  const missing = (["META_API_BASE_URL", "MODEL_SPARK", "MODEL_WONDER"] as const).filter((key) => !config[key]);
  if (missing.length > 0)
    throw new AiError("not_configured", `META_API_KEY is set but ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} empty. Copy the values from the Meta Model API docs into .env.`);
  const llm = new MetaModelAdapter(
    {
      baseUrl: config.META_API_BASE_URL as string,
      apiKey: config.META_API_KEY,
      models: { spark: config.MODEL_SPARK as string, wonder: config.MODEL_WONDER as string },
      responseFormat: config.META_RESPONSE_FORMAT,
      prices: parsePrices(config.MODEL_PRICES),
    },
    logger,
  );
  return { llm, mode: "meta", reason: null };
}
