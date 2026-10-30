import { ModelEnv, loadRootEnv, parseEnv } from "@stage-ready/config";
import pino from "pino";
import { MetaImageAdapter } from "./image";
import { MetaModelAdapter } from "./meta";
import { personaStylesV1 } from "./prompts/personas.v1";
import { slideVerifyV1 } from "./prompts/slideVerify.v1";
import { metaApiKey } from "./types";

// `pnpm ai:check`: one live call per configured Meta model, run on your own machine with your key.
// It prints what worked and the .env settings to use. The key is never printed.

// A 1x1 PNG: enough to confirm the API accepts image input in the format the app sends.
const PIXEL = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));

type Row = { check: string; ok: boolean | null; detail: string };
const rows: Row[] = [];
const record = (check: string, ok: boolean | null, detail: string) => {
  rows.push({ check, ok, detail });
  console.info(`${ok === null ? "SKIP" : ok ? "PASS" : "FAIL"}  ${check}: ${detail}`);
};
const errorText = (e: unknown) => {
  const err = e as Error & { detail?: unknown };
  return `${err.message}${err.detail ? ` (${String(err.detail).slice(0, 200)})` : ""}`;
};

loadRootEnv();
const env = parseEnv("ai:check", ModelEnv);
const key = metaApiKey(env);
const logger = pino({ level: "silent" });
if (!key || !env.META_API_BASE_URL || !env.MODEL_SPARK) {
  console.error("Set META_API_KEY (or MODEL_API_KEY), META_API_BASE_URL and MODEL_SPARK in .env first.");
  process.exit(1);
}
const spark = env.MODEL_SPARK;
const wonder = env.MODEL_WONDER ?? spark;
const adapter = (overrides: Partial<ConstructorParameters<typeof MetaModelAdapter>[0]> = {}) =>
  new MetaModelAdapter(
    {
      baseUrl: env.META_API_BASE_URL as string,
      apiKey: key,
      models: { spark, wonder },
      responseFormat: env.META_RESPONSE_FORMAT,
      api: env.META_API_STYLE,
      reasoning: { effort: env.META_REASONING_EFFORT, summary: env.META_REASONING_SUMMARY, encrypted: env.META_REASONING_ENCRYPTED },
      timeoutMs: 180_000,
      ...overrides,
    },
    logger,
  );
const persona = () => personaStylesV1({ eventName: "Check event", difficulty: 3, criteriaByRole: { technical: ["Technical execution"], impact: ["Impact"], product: ["User experience"] } });

console.info(`Meta Model API check against ${env.META_API_BASE_URL} (${env.META_API_STYLE}, JSON mode ${env.META_RESPONSE_FORMAT})\n`);

try {
  const listed = await adapter().verifyModels();
  record("Model listing", true, listed.checked ? `${spark}${wonder !== spark ? ` and ${wonder}` : ""} are enabled for your key` : "no listing endpoint; skipped");
} catch (e) {
  record("Model listing", false, errorText(e));
}

for (const [role, id] of [
  ["spark", spark],
  ["wonder", wonder],
] as const) {
  if (role === "wonder" && wonder === spark) {
    record("Muse Wonder", null, "MODEL_WONDER is empty, so Wonder prompts run on MODEL_SPARK");
    continue;
  }
  try {
    const r = await adapter().generateObject({ ...persona(), model: role });
    record(
      `${role === "spark" ? "Muse Spark" : "Muse Wonder"} (${id}), structured JSON`,
      true,
      `${r.latencyMs} ms, ${r.attempts} attempt(s), ${r.usage.inputTokens ?? "?"} in / ${r.usage.outputTokens ?? "?"} out tokens`,
    );
  } catch (e) {
    record(`${role === "spark" ? "Muse Spark" : "Muse Wonder"} (${id}), structured JSON`, false, errorText(e));
  }
}

try {
  const r = await adapter().generateObject(slideVerifyV1({ png: PIXEL, renderedText: [] }));
  record("Image input (slide verification)", true, `accepted; ${r.latencyMs} ms`);
} catch (e) {
  record("Image input (slide verification)", false, errorText(e));
}

if (env.MODEL_IMAGE) {
  try {
    const started = performance.now();
    const bytes = await new MetaImageAdapter({ baseUrl: env.META_API_BASE_URL as string, apiKey: key, model: env.MODEL_IMAGE }, logger).generate({
      prompt: "A calm abstract gradient background, no text.",
    });
    record(`Muse Image (${env.MODEL_IMAGE})`, true, `${bytes.length} bytes in ${Math.round(performance.now() - started)} ms`);
  } catch (e) {
    record(`Muse Image (${env.MODEL_IMAGE})`, false, errorText(e));
  }
} else record("Muse Image", null, "MODEL_IMAGE is empty, so title cards stay plain");

if (env.META_RESPONSE_FORMAT !== "json_schema") {
  try {
    await adapter({ responseFormat: "json_schema" }).generateObject(persona());
    record("JSON schema mode (optional)", true, "supported: set META_RESPONSE_FORMAT=json_schema for stricter output");
  } catch (e) {
    record("JSON schema mode (optional)", false, `keep META_RESPONSE_FORMAT=${env.META_RESPONSE_FORMAT}. ${errorText(e)}`);
  }
}

const failed = rows.filter((r) => r.ok === false && !r.check.includes("optional"));
console.info(
  `\n${failed.length === 0 ? "All required checks passed. Restart pnpm dev to use the Meta Model API." : `${failed.length} required check(s) failed. Send me the FAIL lines above (they contain no key).`}`,
);
process.exit(failed.length === 0 ? 0 : 1);
