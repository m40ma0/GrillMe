import "server-only";
import { createAi, type Ai } from "@stage-ready/ai";
import pino from "pino";
import { env } from "./env";

const logger = pino({ name: "web", level: "info" });
let live: Ai | null = null;
let mock: Ai | null = null;

/** Demo Mode projects always run on the mocked adapters. */
export function aiFor(project: { demoMode: boolean }): Ai {
  if (project.demoMode) return (mock ??= createAi(env(), logger, { forceMock: true }));
  return (live ??= createAi(env(), logger));
}

export { logger };
