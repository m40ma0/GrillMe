import type { ZodType, ZodTypeDef } from "zod";

/** Which configured model a prompt runs on. IDs come from env (MODEL_SPARK, MODEL_WONDER, ...). */
export type ModelRole = "spark" | "wonder";

/** Reasoning effort on the Responses API; "max" is documented for Muse Spark 1.3 and Muse Wonder. */
export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "max";

/**
 * A versioned prompt (packages/ai/prompts/<name>.v<n>.ts). Untrusted content
 * (event pages, winner pages, repo files) only ever appears in `user`, fenced
 * as quoted data, never in `system`.
 */
export interface Prompt<T> {
  id: string;
  version: number;
  model: ModelRole;
  system: string;
  user: string;
  schema: ZodType<T, ZodTypeDef, unknown>;
  /** Overrides the model's reasoning effort for this prompt (claim extraction runs at minimal, for speed). */
  effort?: ReasoningEffort;
  /** JPEG frames sent with the user message (vision prompts). */
  images?: Uint8Array[];
  /** Deterministic output used by the mocked adapter in Demo Mode and when no API key is set. */
  mock: () => T;
}

export interface Usage {
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface GenerateResult<T> {
  value: T;
  modelId: string;
  latencyMs: number;
  usage: Usage;
  attempts: number;
  /** null when MODEL_PRICES has no entry for the model. */
  costUsd: number | null;
  /** Set when Demo Mode answered with the mock instead: the daily allowance was used up, or the real call failed. */
  fallback?: "budget" | "error";
}

export interface LLM {
  readonly kind: "meta" | "mock";
  generateObject<T>(prompt: Prompt<T>, options?: { signal?: AbortSignal }): Promise<GenerateResult<T>>;
}

export interface Vision {
  describeFrame(input: { jpeg: Uint8Array; question: string }, options?: { signal?: AbortSignal }): Promise<string>;
}

export interface ImageGen {
  readonly modelId: string;
  /** One image from a text prompt; the bytes as returned (PNG or JPEG). */
  generate(input: { prompt: string }, options?: { signal?: AbortSignal }): Promise<Uint8Array>;
}

export interface STT {
  transcribe(input: { pcm16: Uint8Array; sampleRate: 16000 }): Promise<{ text: string; words: { text: string; startMs: number; endMs: number }[] }>;
}

export interface TTS {
  /** Preset voice IDs only. Voice cloning is not supported by design. */
  speak(input: { text: string; voicePreset: string }): Promise<Uint8Array>;
}

export type AiErrorCode = "not_configured" | "model_missing" | "http_error" | "timeout" | "parse_failed" | "unavailable";

export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "AiError";
  }
}

/** The Meta Model API key, from META_API_KEY or MODEL_API_KEY (the name the Meta provider config uses). */
export const metaApiKey = (config: { META_API_KEY?: string | undefined; MODEL_API_KEY?: string | undefined }) => config.META_API_KEY ?? config.MODEL_API_KEY;
