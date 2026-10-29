import { sql } from "drizzle-orm";
import type { SectionPlanItem } from "@stage-ready/shared";
import type { Db } from "./index";
import { sectionPlans } from "./schema";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Writes a section plan in place, keyed by section, so takes recorded against a section survive edits. */
export async function upsertSectionPlan(tx: Db | Tx, projectId: string, plan: SectionPlanItem[]): Promise<void> {
  if (plan.length === 0) return;
  await tx
    .insert(sectionPlans)
    .values(plan.map((s, order) => ({ projectId, order, key: s.key, title: s.title, budgetSec: s.budgetSec })))
    .onConflictDoUpdate({ target: [sectionPlans.projectId, sectionPlans.key], set: { order: sql`excluded."order"`, title: sql`excluded.title`, budgetSec: sql`excluded.budget_sec` } });
}
