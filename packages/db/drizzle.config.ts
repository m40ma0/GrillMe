import { defineConfig } from "drizzle-kit";
import { DbEnv, loadRootEnv, parseEnv } from "@stage-ready/config";

loadRootEnv();
const env = parseEnv("db", DbEnv);

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  casing: "snake_case",
  dbCredentials: { url: env.DATABASE_URL },
});
