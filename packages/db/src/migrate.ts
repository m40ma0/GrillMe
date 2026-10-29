import { migrate } from "drizzle-orm/postgres-js/migrator";
import { DbEnv, loadRootEnv, parseEnv } from "@stage-ready/config";
import { createDb } from "./index";

loadRootEnv();
const env = parseEnv("db", DbEnv);
const db = createDb(env.DATABASE_URL, { max: 1 });
try {
  // pgvector must exist before the first table that uses vector().
  await db.execute("CREATE EXTENSION IF NOT EXISTS vector");
  await migrate(db, { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
  console.info("Migrations applied.");
} finally {
  await db.close();
}
