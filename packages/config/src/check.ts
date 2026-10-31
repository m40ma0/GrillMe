// pnpm env:check <file> [--strict]: validates a dotenv file against every service's schema in production
// mode and prints field names only, never values. Production-only rules (placeholder secrets, ws:// URLs,
// localhost origins) are warnings unless --strict, so the checked-in .env.example passes while a real
// deploy file can be held to the full standard.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv as parseDotenv } from "node:util";
import type { z } from "zod";
import { DbEnv, RealtimeEnv, WebEnv, WorkerEnv, cleanEnv } from "./env";

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const file = args.find((a) => !a.startsWith("--"));
if (!file) {
  console.error("Usage: pnpm env:check <file> [--strict]");
  process.exit(2);
}

// pnpm runs this in packages/config; resolve the path from where the command was typed.
const raw = parseDotenv(readFileSync(resolve(process.env.INIT_CWD ?? process.cwd(), file), "utf8"));
const { env: cleaned, changed } = cleanEnv(raw);
// The single-container deploy derives the public URLs from PUBLIC_HOST (deploy/container/start.sh); do the same.
const host = cleaned.PUBLIC_HOST;
const env: Record<string, string | undefined> = {
  ...(host ? { AUTH_URL: `https://${host}`, WEB_ORIGIN: `https://${host}`, REALTIME_URL: `wss://${host}` } : {}),
  REDIS_URL: "redis://127.0.0.1:6379",
  ...Object.fromEntries(Object.entries(cleaned).filter(([, v]) => v !== undefined)),
  NODE_ENV: "production",
};

const schemas: [string, z.ZodTypeAny][] = [
  ["web", WebEnv],
  ["worker", WorkerEnv],
  ["realtime", RealtimeEnv],
  ["db", DbEnv],
];
let errors = 0;
let warnings = 0;
if (changed.length) console.log(`cleaned (stray quotes, comments, spaces or \\r): ${changed.join(", ")}`);
for (const [service, schema] of schemas) {
  const result = schema.safeParse(env);
  const issues = result.success ? [] : result.error.issues;
  for (const issue of issues) {
    const field = issue.path.join(".") || "(env)";
    // Custom issues are the production policy checks; type and presence errors would break any deploy.
    const isPolicy = issue.code === "custom";
    if (isPolicy && !strict) {
      warnings++;
      console.log(`warn  ${service}: ${field} must change before production`);
    } else {
      errors++;
      console.log(`error ${service}: ${field} (${issue.code === "invalid_type" ? "missing or wrong type" : issue.code.replace(/_/g, " ")})`);
    }
  }
  if (!issues.length) console.log(`ok    ${service}`);
}
console.log(`${file}: ${errors} error(s), ${warnings} warning(s)`);
process.exit(errors ? 1 : 0);
