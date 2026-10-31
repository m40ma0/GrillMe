import { SpanStatusCode, trace } from "@opentelemetry/api";
import type { GenerateResult, Prompt } from "./types";

const tracer = trace.getTracer("@stage-ready/ai");

export type ModelPrices = Record<string, { inputPerMTok: number; outputPerMTok: number }>;

/**
 * Meta's published Standard-mode token prices, USD per 1M tokens, from https://dev.meta.ai/docs/pricing-rate-limits
 * (checked 2026-10-31). Cached input ($0.15 Spark, $0.20 Wonder) is billed as full input here, so costs err high.
 * MODEL_PRICES overrides or extends these per model. Muse Image, SAM 3.1 and Muse Voice Transcribe are priced per
 * image, frame or hour, not per token, so they are not counted in session cost.
 */
export const DEFAULT_MODEL_PRICES: ModelPrices = {
  "muse-spark-1.3": { inputPerMTok: 1.25, outputPerMTok: 4.25 },
  "muse-spark-1.2": { inputPerMTok: 1.25, outputPerMTok: 4.25 },
  "muse-spark-1.1": { inputPerMTok: 1.25, outputPerMTok: 4.25 },
  "muse-wonder-1.0": { inputPerMTok: 4.0, outputPerMTok: 20.0 },
};

export function parsePrices(json: string | undefined): ModelPrices {
  if (!json) return { ...DEFAULT_MODEL_PRICES };
  try {
    return { ...DEFAULT_MODEL_PRICES, ...(JSON.parse(json) as ModelPrices) };
  } catch {
    throw new Error('MODEL_PRICES must be JSON like {"model-id": {"inputPerMTok": 0.5, "outputPerMTok": 1.5}}.');
  }
}

export function costUsd(prices: ModelPrices, modelId: string, inputTokens: number | null, outputTokens: number | null): number | null {
  if (modelId === "mock") return 0;
  const price = prices[modelId];
  if (!price || inputTokens === null || outputTokens === null) return null;
  return (inputTokens * price.inputPerMTok + outputTokens * price.outputPerMTok) / 1_000_000;
}

/** Traces every model call with prompt version, model ID, latency, tokens and cost. */
export async function traced<T>(prompt: Prompt<T>, run: () => Promise<GenerateResult<T>>): Promise<GenerateResult<T>> {
  return tracer.startActiveSpan(`model ${prompt.id}.v${prompt.version}`, async (span) => {
    span.setAttributes({ "model.prompt": prompt.id, "model.prompt_version": prompt.version, "model.role": prompt.model });
    try {
      const result = await run();
      span.setAttributes({
        "model.id": result.modelId,
        "model.latency_ms": result.latencyMs,
        "model.attempts": result.attempts,
        ...(result.usage.inputTokens !== null ? { "model.input_tokens": result.usage.inputTokens } : {}),
        ...(result.usage.outputTokens !== null ? { "model.output_tokens": result.usage.outputTokens } : {}),
        ...(result.costUsd !== null ? { "model.cost_usd": result.costUsd } : {}),
      });
      return result;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      throw error;
    } finally {
      span.end();
    }
  });
}
