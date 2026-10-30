import { statfs } from "node:fs/promises";
import type { CompanionConfig, PreflightCheck } from "@stage-ready/shared";

const check = (id: string, label: string, status: PreflightCheck["status"], detail: string, critical: boolean): PreflightCheck => ({ id, label, status, detail, critical, source: "companion" });

/** Pre-flight on the presenter machine: env vars, endpoints within their latency budget, the test-account login, disk space. */
export async function runPreflight(config: CompanionConfig, env: NodeJS.ProcessEnv = process.env, fetcher: typeof fetch = fetch): Promise<PreflightCheck[]> {
  const out: PreflightCheck[] = [];
  const missing = config.requiredEnv.filter((k) => !env[k]);
  out.push(
    config.requiredEnv.length === 0
      ? check("companion:env", "Required env vars", "warn", "None listed in stage-ready.demoguard.json.", false)
      : check("companion:env", "Required env vars", missing.length ? "fail" : "pass", missing.length ? `Missing: ${missing.join(", ")}` : `All ${config.requiredEnv.length} set.`, true),
  );
  for (const [i, e] of config.endpoints.entries()) {
    const started = performance.now();
    try {
      const res = await fetcher(e.url, { method: "GET", signal: AbortSignal.timeout(Math.max(e.budgetMs * 3, 5_000)) });
      const ms = Math.round(performance.now() - started);
      const ok = res.status < 500;
      out.push(check(`companion:endpoint:${i}`, `Reach ${e.url}`, !ok ? "fail" : ms > e.budgetMs ? "warn" : "pass", `${res.status} in ${ms} ms (budget ${e.budgetMs} ms).`, true));
    } catch (error) {
      out.push(check(`companion:endpoint:${i}`, `Reach ${e.url}`, "fail", `Unreachable: ${(error as Error).message}`, true));
    }
  }
  if (config.login) {
    const l = config.login;
    try {
      const res = await fetcher(l.url, { method: l.method, headers: l.headers, ...(l.body !== undefined ? { body: l.body } : {}), signal: AbortSignal.timeout(10_000) });
      out.push(check("companion:login", "Test-account login", res.status === l.expectStatus ? "pass" : "fail", `Got ${res.status}, expected ${l.expectStatus}.`, true));
    } catch (error) {
      out.push(check("companion:login", "Test-account login", "fail", `Login request failed: ${(error as Error).message}`, true));
    }
  } else out.push(check("companion:login", "Test-account login", "warn", "No login configured in stage-ready.demoguard.json.", false));
  try {
    const fs = await statfs(process.cwd());
    const freeGb = (fs.bavail * fs.bsize) / 1024 ** 3;
    out.push(check("companion:disk", "Free disk space", freeGb >= config.minFreeDiskGb ? "pass" : "fail", `${freeGb.toFixed(1)} GB free (needs ${config.minFreeDiskGb} GB).`, true));
  } catch (error) {
    out.push(check("companion:disk", "Free disk space", "unknown", (error as Error).message, true));
  }
  out.push(check("companion:obs", "OBS connection and scenes", "warn", "Not checked: OBS scene switching is not part of this build.", false));
  if (config.target) out.push(check("companion:proxy", "Network proxy", "pass", `Forwarding http://127.0.0.1:${config.proxyPort} to ${config.target}.`, false));
  else out.push(check("companion:proxy", "Network proxy", "warn", "No target in stage-ready.demoguard.json, so 5xx and timeouts are not watched.", false));
  return out;
}
