import type { Logger } from "pino";
import { formatZodError } from "./json";
import { traced } from "./telemetry";
import { AiError, type GenerateResult, type LLM, type Prompt } from "./types";

/** Demo Mode adapter: runs each prompt's deterministic `mock()` and validates it like a real reply. */
export class MockModelAdapter implements LLM {
  readonly kind = "mock" as const;

  constructor(private readonly logger: Logger) {}

  async generateObject<T>(prompt: Prompt<T>): Promise<GenerateResult<T>> {
    return traced(prompt, async () => this.run(prompt));
  }

  private async run<T>(prompt: Prompt<T>): Promise<GenerateResult<T>> {
    const started = performance.now();
    const result = prompt.schema.safeParse(prompt.mock());
    if (!result.success) throw new AiError("parse_failed", `Mock output for ${prompt.id} v${prompt.version} does not match its schema.`, formatZodError(result.error));
    const latencyMs = Math.round(performance.now() - started);
    this.logger.info({ prompt: prompt.id, promptVersion: prompt.version, modelId: "mock", latencyMs, inputTokens: 0, outputTokens: 0 }, "model call");
    return { value: result.data, modelId: "mock", latencyMs, usage: { inputTokens: 0, outputTokens: 0 }, attempts: 1, costUsd: 0 };
  }
}
