import "server-only";
import { createDb, type Db } from "@stage-ready/db";
import { env } from "./env";

const globalForDb = globalThis as unknown as { stageReadyDb?: Db };

export function db(): Db {
  globalForDb.stageReadyDb ??= createDb(env().DATABASE_URL);
  return globalForDb.stageReadyDb;
}
