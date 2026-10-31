import { drizzle } from "drizzle-orm/pg-proxy";
import { describe, expect, it } from "vitest";
import * as schema from "../src/schema";
import { buildDemoRows, seedDemoProject } from "../src/seed";
import type { Db } from "../src/index";

/** A drizzle instance that records every statement instead of sending it (pg-proxy has no transactions, so run inline). */
function countingDb() {
  const statements: string[] = [];
  const db = drizzle(
    async (sql) => {
      statements.push(sql);
      return { rows: [] };
    },
    { schema, casing: "snake_case" },
  );
  const fake = Object.assign(db, { transaction: (fn: (tx: typeof db) => Promise<unknown>) => fn(db) });
  return { db: fake as unknown as Db, statements };
}

describe("seedDemoProject", () => {
  it("writes the whole Demo Mode project in at most 25 statements", async () => {
    const { db, statements } = countingDb();
    const projectId = await seedDemoProject(db, "00000000-0000-7000-8000-000000000001");
    expect(projectId).toMatch(/^[0-9a-f-]{36}$/);
    expect(statements.length).toBeLessThanOrEqual(25);
    expect(statements[0]).toMatch(/^delete from "projects"/);
  });

  it("links every child row to rows built in the same pass", () => {
    const r = buildDemoRows("owner");
    const sectionIds = new Set(r.sections.map((s) => s.id));
    expect(r.takes).toHaveLength(12);
    expect(r.takes.every((t) => sectionIds.has(t.sectionPlanId))).toBe(true);
    expect(r.takeScores.map((s) => s.takeId)).toEqual(r.takes.map((t) => t.id));
    expect(r.evidence.map((e) => e.claimId)).toEqual(r.claims.map((c) => c.id));
    expect(r.answerCards.map((a) => a.questionId)).toEqual(r.questions.map((q) => q.id));
    expect(r.questions.length).toBeGreaterThan(0);
  });
});
