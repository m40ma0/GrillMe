import type { Ai } from "@stage-ready/ai";
import type { WorkerEnv } from "@stage-ready/config";
import type { Db } from "@stage-ready/db";
import type { JobProgress } from "@stage-ready/shared";
import type { Logger } from "pino";
import type { Storage } from "./s3";

export interface JobContext {
  env: WorkerEnv;
  db: Db;
  logger: Logger;
  storage: Storage;
  /** Picks the model adapter for a project; Demo Mode projects always use the mocked one. */
  aiFor(projectId: string): Promise<Ai>;
  progress(update: JobProgress): Promise<void>;
}

/** Errors whose message is safe and useful to show the user verbatim. */
export class UserFacingError extends Error {}
