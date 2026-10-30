import { desc, eq } from "drizzle-orm";
import type { Db } from "./index";
import { latencySamples, projects, repoFindings, repos } from "./schema";

const ref = (f: { filePath: string; line: number | null }) => (f.line ? `${f.filePath}:${f.line}` : f.filePath);

/** What the auditor checks spoken claims against: the analysed repo, the README and the submission text. */
export async function loadAuditFacts(db: Pick<Db, "select">, projectId: string) {
  const [[repo], [project]] = await Promise.all([
    db.select().from(repos).where(eq(repos.projectId, projectId)),
    db.select({ submissionText: projects.submissionText }).from(projects).where(eq(projects.id, projectId)),
  ]);
  let facts = null;
  if (repo?.commitSha) {
    const findings = await db.select().from(repoFindings).where(eq(repoFindings.repoId, repo.id));
    facts = {
      dependencies: repo.dependencies.map((d) => d.name),
      capabilities: findings.filter((f) => f.kind === "capability").map((f) => ({ summary: f.summary, ref: ref(f) })),
      evalFiles: findings.filter((f) => /(^|\/)(evals?|benchmarks?)(\/|[._-])|eval[._-]?results|accuracy[._-]/i.test(f.filePath)).map((f) => f.filePath),
      todos: findings.filter((f) => f.kind === "todo").map((f) => ({ summary: f.summary, ref: ref(f) })),
      mocks: findings.filter((f) => f.kind === "mock_response").map((f) => ({ summary: f.summary, ref: ref(f) })),
    };
  }
  return { repo: facts, docs: { readme: repo?.readme ?? null, submission: project?.submissionText || null } };
}

/** Recent measured step latencies across the project's rehearsals. */
export async function loadRecentLatency(db: Pick<Db, "select">, projectId: string, limit = 500) {
  return db
    .select({ stepKey: latencySamples.stepKey, startMs: latencySamples.startMs, durationMs: latencySamples.durationMs })
    .from(latencySamples)
    .where(eq(latencySamples.projectId, projectId))
    .orderBy(desc(latencySamples.createdAt))
    .limit(limit);
}
