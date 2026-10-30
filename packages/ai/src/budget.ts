import type { Logger } from "pino";
import type { GenerateResult, LLM, Prompt } from "./types";

/** The few Redis commands the spend counter needs (ioredis satisfies this). */
export interface SpendStore {
  get(key: string): Promise<string | null>;
  incrbyfloat(key: string, increment: number): Promise<string>;
  expire(key: string, seconds: number): Promise<number>;
}

export interface DemoLimits {
  /** Stop real calls once today's tracked spend reaches this (needs MODEL_PRICES for the model). */
  budgetUsd: number;
  /** Stop real calls after this many today, whether or not prices are known. */
  maxCalls: number;
}

const TWO_DAYS = 2 * 24 * 60 * 60;

/**
 * Demo Mode on real models, within a daily allowance shared by every service through Redis. Past the
 * allowance, or if a real call fails, the prompt's deterministic mock answers instead, and the result
 * says so (`fallback`), so the demo never breaks in front of a judge and never runs up an open bill.
 */
export class BudgetedLLM implements LLM {
  readonly kind = "meta" as const;

  constructor(
    private readonly live: LLM,
    private readonly mock: LLM,
    private readonly store: SpendStore,
    private readonly limits: DemoLimits,
    private readonly logger: Logger,
    private readonly today = () => new Date().toISOString().slice(0, 10),
  ) {}

  /** Today's tracked real calls and spend. */
  async spent(): Promise<{ calls: number; usd: number }> {
    const day = this.today();
    const [calls, usd] = await Promise.all([this.store.get(`demo-ai:calls:${day}`), this.store.get(`demo-ai:usd:${day}`)]);
    return { calls: Number(calls ?? 0), usd: Number(usd ?? 0) };
  }

  async generateObject<T>(prompt: Prompt<T>, options: { signal?: AbortSignal } = {}): Promise<GenerateResult<T>> {
    const day = this.today();
    let spent: { calls: number; usd: number };
    try {
      spent = await this.spent();
    } catch (error) {
      this.logger.warn({ err: error }, "demo budget store unavailable; using the mock");
      return { ...(await this.mock.generateObject(prompt, options)), fallback: "budget" };
    }
    if (spent.calls >= this.limits.maxCalls || spent.usd >= this.limits.budgetUsd) {
      return { ...(await this.mock.generateObject(prompt, options)), fallback: "budget" };
    }
    await this.count(`demo-ai:calls:${day}`, 1);
    try {
      const result = await this.live.generateObject(prompt, options);
      if (result.costUsd) await this.count(`demo-ai:usd:${day}`, result.costUsd);
      return result;
    } catch (error) {
      if (options.signal?.aborted) throw error;
      this.logger.warn({ err: error, prompt: prompt.id }, "real model call failed in Demo Mode; using the mock");
      return { ...(await this.mock.generateObject(prompt, options)), fallback: "error" };
    }
  }

  private async count(key: string, amount: number) {
    try {
      await this.store.incrbyfloat(key, amount);
      await this.store.expire(key, TWO_DAYS);
    } catch (error) {
      this.logger.warn({ err: error }, "could not record demo spend");
    }
  }
}
