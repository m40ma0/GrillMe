import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * as schema from "./schema";
export * from "./schema";

export function createDb(databaseUrl: string, options: { max?: number } = {}) {
  const client = postgres(databaseUrl, { max: options.max ?? 10 });
  const db = drizzle(client, { schema, casing: "snake_case" });
  return Object.assign(db, { close: () => client.end() });
}

export type Db = ReturnType<typeof createDb>;
