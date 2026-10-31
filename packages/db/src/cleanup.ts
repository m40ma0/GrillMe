import { DbEnv, loadRootEnv, parseEnv } from "@stage-ready/config";
import { and, count, eq, lt } from "drizzle-orm";
import { createDb, type Db } from "./index";
import { projects, users } from "./schema";

/** Guest users, and their projects (cascade), are deleted this long after creation. */
export const GUEST_RETENTION_MS = 48 * 60 * 60 * 1000;
/** Projects left behind by review and test runs. */
export const TEST_PROJECT_NAME = "Review test (delete me)";

const expiredGuests = (now: number) => and(eq(users.isGuest, true), lt(users.createdAt, new Date(now - GUEST_RETENTION_MS)));

/** Deletes guests past the retention window. Called on every new guest, and by `pnpm db:cleanup`. */
export async function deleteExpiredGuests(db: Pick<Db, "delete">, now = Date.now()): Promise<number> {
  const rows = await db.delete(users).where(expiredGuests(now)).returning({ id: users.id });
  return rows.length;
}

/** Expired guests plus test projects; real users' projects are untouched. `dryRun` only counts. */
export async function cleanup(db: Db, options: { dryRun?: boolean; now?: number } = {}): Promise<{ guests: number; testProjects: number }> {
  const now = options.now ?? Date.now();
  if (options.dryRun) {
    const [[guests], [tests]] = await Promise.all([
      db.select({ n: count() }).from(users).where(expiredGuests(now)),
      db.select({ n: count() }).from(projects).where(eq(projects.name, TEST_PROJECT_NAME)),
    ]);
    return { guests: guests?.n ?? 0, testProjects: tests?.n ?? 0 };
  }
  return db.transaction(async (tx) => {
    const guests = await deleteExpiredGuests(tx, now);
    const tests = await tx.delete(projects).where(eq(projects.name, TEST_PROJECT_NAME)).returning({ id: projects.id });
    return { guests, testProjects: tests.length };
  });
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  loadRootEnv();
  const env = parseEnv("db", DbEnv);
  const db = createDb(env.DATABASE_URL, { max: 1 });
  const dryRun = process.argv.includes("--dry-run");
  try {
    const result = await cleanup(db, { dryRun });
    console.info(
      `${dryRun ? "Would delete" : "Deleted"} ${result.guests} expired guest${result.guests === 1 ? "" : "s"} (with their projects) and ${result.testProjects} "${TEST_PROJECT_NAME}" project${result.testProjects === 1 ? "" : "s"}.`,
    );
  } finally {
    await db.close();
  }
}
