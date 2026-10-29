import type { ZodType, ZodTypeDef } from "zod";

/** Which configured model a prompt runs on. IDs come from env (MODEL_SPARK, MODEL_WONDER, ...). */
export type ModelRole = "spark" | "wonder";

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
}

export interface LLM {
  readonly kind: "meta" | "mock";
  generateObject<T>(prompt: Prompt<T>, options?: { signal?: AbortSignal }): Promise<GenerateResult<T>>;
}

export interface Vision {
  describeFrame(input: { jpeg: Uint8Array; question: string }, options?: { signal?: AbortSignal }): Promise<string>;
}

export interface ImageGen {
  generate(input: { prompt: string; width: number; height: number }): Promise<Uint8Array>;
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
