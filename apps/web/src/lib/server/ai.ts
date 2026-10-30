import "server-only";
import { createAi, createDemoAi, type Ai } from "@stage-ready/ai";
import pino from "pino";
import { env } from "./env";
import { redis } from "./queue";

const logger = pino({ name: "web", level: "info" });
let live: Ai | null = null;
let demo: Ai | null = null;

/** Demo Mode projects run on the real models within the daily demo allowance, else on the mocks. */
export function aiFor(project: { demoMode: boolean }): Ai {
  live ??= createAi(env(), logger);
  if (project.demoMode) return (demo ??= createDemoAi({ ...env(), NODE_ENV: process.env.NODE_ENV }, live, createAi(env(), logger, { forceMock: true }), redis(), logger));
  return live;
}

export { logger };
