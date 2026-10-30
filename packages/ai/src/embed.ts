import type { ModelConfig } from "@stage-ready/config";
import { AiError } from "./types";

export interface Embedder {
  readonly modelId: string;
  readonly dimensions: number;
  embed(text: string): Promise<number[]>;
}

/**
 * Embeddings for Rehearsal Memory (pgvector). Uses the OpenAI-style `POST {META_API_BASE_URL}/embeddings`;
 * confirm the endpoint in the Meta Model API docs. Returns null when EMBED_MODEL is not set, and memory
 * is then retrieved by recency instead of relevance.
 */
export function createEmbedder(config: ModelConfig): Embedder | null {
  if (config.MODEL_MOCK || !config.META_API_KEY || !config.META_API_BASE_URL || !config.EMBED_MODEL) return null;
  const dimensions = config.EMBED_DIM ?? 1024;
  const base = config.META_API_BASE_URL.replace(/\/+$/, "");
  const key = config.META_API_KEY;
  const model = config.EMBED_MODEL;
  return {
    modelId: model,
    dimensions,
    async embed(text) {
      const response = await fetch(`${base}/embeddings`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, input: text.slice(0, 8_000) }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new AiError("http_error", `Embedding request returned ${response.status}.`);
      const body = (await response.json()) as { data?: { embedding?: number[] }[] };
      const vector = body.data?.[0]?.embedding;
      if (!vector || vector.length !== dimensions) throw new AiError("parse_failed", `Expected a ${dimensions}-dimension embedding (EMBED_DIM), got ${vector?.length ?? "none"}.`);
      return vector;
    },
  };
}
