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

const ModelEnv = z.object({
  META_API_BASE_URL: optionalUrl,
  META_API_KEY: optionalString,
  MODEL_SPARK: optionalString,
  MODEL_WONDER: optionalString,
  MODEL_IMAGE: optionalString,
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
  })
  .merge(ModelEnv);

export const WebEnv = BaseEnv.extend({
  AUTH_GITHUB_ID: optionalString,
  AUTH_GITHUB_SECRET: optionalString,
  DEV_AUTH_BYPASS: z.preprocess(empty, bool.default(false)),
  REALTIME_URL: z.string().url(),
  REALTIME_JWT_SECRET: z.string().min(16),
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
  WORKER_HEALTH_PORT: z.preprocess(empty, z.coerce.number().int().default(4100)),
  GITHUB_API_URL: z.preprocess(empty, z.string().url().default("https://api.github.com")),
});
export type WorkerEnv = z.infer<typeof WorkerEnv>;

export const RealtimeEnv = z.object({
  REDIS_URL: z.string().url(),
  REALTIME_PORT: z.preprocess(empty, z.coerce.number().int().default(4000)),
  REALTIME_JWT_SECRET: z.string().min(16),
  LOG_LEVEL: BaseEnv.shape.LOG_LEVEL,
});
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
