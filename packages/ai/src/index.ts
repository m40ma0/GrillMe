import type { ModelConfig } from "@stage-ready/config";
import type { Logger } from "pino";
import { MetaModelAdapter } from "./meta";
import { MockModelAdapter } from "./mock";
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
      reasoning: { effort: config.META_REASONING_EFFORT ?? "high", summary: config.META_REASONING_SUMMARY ?? "auto", encrypted: config.META_REASONING_ENCRYPTED ?? true },
      prices: parsePrices(config.MODEL_PRICES),
    },
    logger,
  );
  const image = config.MODEL_IMAGE ? new MetaImageAdapter({ baseUrl: config.META_API_BASE_URL as string, apiKey, model: config.MODEL_IMAGE }, logger) : null;
  return { llm, image, mode: "meta", reason: null };
}
