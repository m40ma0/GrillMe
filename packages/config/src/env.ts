import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";

const empty = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalString = z.preprocess(empty, z.string().optional());
const optionalUrl = z.preprocess(empty, z.string().url().optional());
const bool = z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() === "true" : v), z.boolean());

/** Loads the repo-root .env once (Node's built-in loader). Existing env vars win. */
export function loadRootEnv(start = process.cwd()): string | null {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, ".env");
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      if (existsSync(candidate)) {
        process.loadEnvFile(candidate);
        return candidate;
      }
      return null;
    }
    dir = dirname(dir);
  }
  return null;
}

export const ModelEnv = z.object({
  /** Optional per-model prices, JSON: {"<model id>": {"inputPerMTok": 0.5, "outputPerMTok": 1.5}}. Without them cost shows as unknown. */
  MODEL_PRICES: z.preprocess(empty, z.string().optional()),
  META_API_BASE_URL: optionalUrl,
  META_API_KEY: optionalString,
  /** Same key under the name the Meta provider config uses; META_API_KEY wins when both are set. */
  MODEL_API_KEY: optionalString,
  /** "responses" (POST /responses, the Meta Model API's interface) or "chat_completions" (POST /chat/completions). */
  META_API_STYLE: z.preprocess(empty, z.enum(["responses", "chat_completions"]).default("responses")),
  /** Reasoning settings for the Responses API. */
  META_REASONING_EFFORT: z.preprocess(empty, z.enum(["none", "minimal", "low", "medium", "high"]).default("high")),
  META_REASONING_SUMMARY: z.preprocess(empty, z.enum(["auto", "concise", "detailed", "none"]).default("auto")),
  /** Ask for encrypted reasoning so a retry can continue from it without server-side storage. */
  META_REASONING_ENCRYPTED: z.preprocess(empty, bool.default(true)),
  MODEL_SPARK: optionalString,
  MODEL_WONDER: optionalString,
  MODEL_IMAGE: optionalString,
  /** SAM 3.1 hosted on the Meta Model API, for UI tracking without a local checkpoint. */
  MODEL_SAM: optionalString,
  MODEL_STT: optionalString,
  MODEL_TTS: optionalString,
  EMBED_MODEL: optionalString,
  EMBED_DIM: z.preprocess(empty, z.coerce.number().int().positive().optional()),
  /** How the adapter asks for JSON. Confirm what the API supports in its docs. */
  META_RESPONSE_FORMAT: z.preprocess(empty, z.enum(["json_schema", "json_object", "none"]).default("json_object")),
  /** Force mocked model adapters (Demo Mode) even when keys are present. */
  MODEL_MOCK: z.preprocess(empty, bool.default(false)),
});

const BaseEnv = z
  .object({
    NODE_ENV: z.preprocess(empty, z.enum(["development", "test", "production"]).default("development")),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    S3_ENDPOINT: z.string().url(),
    S3_BUCKET: z.string().min(1),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    S3_REGION: z.preprocess(empty, z.string().default("us-east-1")),
    AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 characters."),
    LOG_LEVEL: z.preprocess(empty, z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info")),
    /** Take score weights as JSON, e.g. {"delivery":0.3,"coverage":0.3,"demoSuccess":0.2,"timeFit":0.2,"contradictedPenalty":0.15}. */
    TAKE_SCORE_WEIGHTS: z.preprocess(empty, z.string().optional()),
  })
  .merge(ModelEnv);

export const WebEnv = BaseEnv.extend({
  AUTH_GITHUB_ID: optionalString,
  AUTH_GITHUB_SECRET: optionalString,
  DEV_AUTH_BYPASS: z.preprocess(empty, bool.default(false)),
  REALTIME_URL: z.string().url(),
  REALTIME_JWT_SECRET: z.string().min(16),
  /** Drill answers are transcribed by the vision service. */
  VISION_SERVICE_URL: optionalUrl,
  VISION_SERVICE_TOKEN: optionalString,
}).superRefine((env, ctx) => {
  if (!env.DEV_AUTH_BYPASS && (!env.AUTH_GITHUB_ID || !env.AUTH_GITHUB_SECRET)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["AUTH_GITHUB_ID"], message: "Set AUTH_GITHUB_ID and AUTH_GITHUB_SECRET, or DEV_AUTH_BYPASS=true for local use." });
  }
  if (env.DEV_AUTH_BYPASS && env.NODE_ENV === "production") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["DEV_AUTH_BYPASS"], message: "DEV_AUTH_BYPASS must be false in production." });
  }
});
export type WebEnv = z.infer<typeof WebEnv>;

export const WorkerEnv = BaseEnv.extend({
  VISION_SERVICE_URL: z.preprocess(empty, z.string().url().optional()),
  VISION_SERVICE_TOKEN: z.preprocess(empty, z.string().optional()),
  WORKER_HEALTH_PORT: z.preprocess(empty, z.coerce.number().int().default(4100)),
  GITHUB_API_URL: z.preprocess(empty, z.string().url().default("https://api.github.com")),
  /** x264 preset for Director renders. */
  FFMPEG_PRESET: z.preprocess(empty, z.enum(["ultrafast", "superfast", "veryfast", "faster", "fast", "medium"]).default("veryfast")),
});
export type WorkerEnv = z.infer<typeof WorkerEnv>;

export const RealtimeEnv = z
  .object({
    NODE_ENV: BaseEnv.shape.NODE_ENV,
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    REALTIME_PORT: z.preprocess(empty, z.coerce.number().int().default(4000)),
    REALTIME_JWT_SECRET: z.string().min(16),
    /** Browser origins allowed to open the WebSocket. */
    WEB_ORIGIN: z.preprocess(empty, z.string().url().default("http://localhost:3000")),
    VISION_SERVICE_URL: optionalUrl,
    VISION_SERVICE_TOKEN: optionalString,
    LOG_LEVEL: BaseEnv.shape.LOG_LEVEL,
  })
  .merge(ModelEnv);
export type RealtimeEnv = z.infer<typeof RealtimeEnv>;

export const DbEnv = z.object({ DATABASE_URL: z.string().url() });

export class ConfigError extends Error {
  constructor(service: string, issues: z.ZodIssue[]) {
    super(`${service} configuration is invalid:\n${issues.map((i) => `  - ${i.path.join(".") || "(env)"}: ${i.message}`).join("\n")}\nCopy .env.example to .env and fill in the missing values.`);
    this.name = "ConfigError";
  }
}

export function parseEnv<S extends z.ZodTypeAny>(service: string, schema: S, source: NodeJS.ProcessEnv = process.env): z.infer<S> {
  const result = schema.safeParse(source);
  if (!result.success) throw new ConfigError(service, result.error.issues);
  return result.data;
}

export type ModelConfig = z.infer<typeof ModelEnv>;
