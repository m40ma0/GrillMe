import "server-only";
import { createDb, type Db } from "@stage-ready/db";
import { env } from "./env";

const globalForDb = globalThis as unknown as { stageReadyDb?: Db };

/** One pool per process (10 connections, kept open between requests: postgres-js never idles them out). */
export function db(): Db {
  globalForDb.stageReadyDb ??= createDb(env().DATABASE_URL, { max: 10 });
  return globalForDb.stageReadyDb;
}
