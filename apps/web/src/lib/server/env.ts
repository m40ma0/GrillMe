import "server-only";
import { WebEnv, loadRootEnv, parseEnv } from "@stage-ready/config";

let cached: WebEnv | null = null;

/** Validated server env. Throws a ConfigError naming every missing value. */
export function env(): WebEnv {
  if (cached) return cached;
  loadRootEnv();
  cached = parseEnv("web", WebEnv);
  return cached;
}
