import { drizzle } from "drizzle-orm/pg-proxy";
import { describe, expect, it } from "vitest";
import { cleanup } from "../src/cleanup";
import type { Db } from "../src/index";
import * as schema from "../src/schema";

describe("db:cleanup", () => {
  it("deletes only expired guests and test projects", async () => {
    const statements: { sql: string; params: unknown[] }[] = [];
    const db = drizzle(
      async (sql, params) => {
        statements.push({ sql, params });
        return { rows: [] };
      },
      { schema, casing: "snake_case" },
    );
    const fake = Object.assign(db, { transaction: (fn: (tx: typeof db) => Promise<unknown>) => fn(db) }) as unknown as Db;
    const now = Date.UTC(2026, 9, 31);
    await cleanup(fake, { now });
    expect(statements).toHaveLength(2);
    expect(statements[0]!.sql).toMatch(/^delete from "users" where \("users"\."is_guest" = \$1 and "users"\."created_at" < \$2\)/);
    expect(statements[0]!.params).toEqual([true, new Date(now - 48 * 3_600_000).toISOString()]);
    expect(statements[1]!.sql).toMatch(/^delete from "projects" where "projects"\."name" = \$1/);
    expect(statements[1]!.params).toEqual(["Review test (delete me)"]);
  });
});
