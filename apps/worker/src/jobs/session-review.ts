import { createEmbedder, diffWeakSpots, prompts } from "@stage-ready/ai";
import { claims, coachNotes, criteria, eventSpecs, evidence, judgeTurns, latencySamples, projects, repoFindings, repos, sessions } from "@stage-ready/db";
import { DEFAULT_STEP_BUDGET_MS, formatSeconds, latencySummary, toCoachItems, type CoachItem, type JobPayload, type SessionSummary } from "@stage-ready/shared";
import { and, asc, cosineDistance, desc, eq, isNotNull, ne } from "drizzle-orm";
import { UserFacingError, type JobContext } from "../lib/context";

type Payload = Extract<JobPayload, { name: "session-review" }>;

const keyOf = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 80);

/** Weak spots with stable keys: contradicted and unshown claims, unsupported numbers, thin criteria, slow steps, vague answers, canned responses. */
export function weakSpots(input: {
  claims: { text: string; type: string; status: string; suggestedRewrite: string | null }[];
  coverage: Record<string, Record<string, number>>;
  criteria: string[];
  latency: { stepKey: string; durationMs: number }[];
  followUps: number;
  flags: { kind: string; detail: string }[];
}): CoachItem[] {
  const items: CoachItem[] = [];
  for (const c of input.claims) {
    const claim = c.text.replace(/[.!?]+$/, "");
    if (c.status === "contradicted")
      items.push({ key: `claim:${keyOf(c.text)}`, text: `Fix the contradicted claim "${claim}"${c.suggestedRewrite ? `: ${c.suggestedRewrite}` : "."}`.slice(0, 240), severity: "high" });
    else if (c.status === "not_shown") items.push({ key: `claim:${keyOf(c.text)}`, text: `Show "${claim}" in the demo, or cut the line.`.slice(0, 240), severity: "medium" });
    else if (c.status === "unverified" && /\d/.test(c.text)) items.push({ key: `claim:${keyOf(c.text)}`, text: `Back "${claim}" with evidence.`.slice(0, 240), severity: "medium" });
  }
  for (const name of input.criteria) {
    const total = Object.values(input.coverage[name] ?? {}).reduce((a, b) => a + b, 0);
    if (total < 0.25) items.push({ key: `criterion:${keyOf(name)}`, text: `Cover ${name}: the judges heard almost nothing about it.`, severity: "medium" });
  }
  const steps = [...new Set(input.latency.map((l) => l.stepKey))];
  for (const stepKey of steps) {
    const { p95 } = latencySummary(input.latency.filter((l) => l.stepKey === stepKey).map((l) => l.durationMs));
    if (p95 !== null && p95 > DEFAULT_STEP_BUDGET_MS)
      items.push({ key: `slow:${stepKey}`, text: `Speed up step ${stepKey}: ${formatSeconds(p95)} at p95 against a ${formatSeconds(DEFAULT_STEP_BUDGET_MS)} budget.`, severity: "high" });
  }
  if (input.followUps > 0)
    items.push({ key: "qa:vague", text: `Answer with one number or example: ${input.followUps} answer${input.followUps === 1 ? " was" : "s were"} too vague.`, severity: "medium" });
  for (const f of input.flags.filter((x) => x.kind === "canned_response")) items.push({ key: `canned:${keyOf(f.detail)}`, text: f.detail.slice(0, 240), severity: "high" });
  return [...new Map(items.map((i) => [i.key, i])).values()];
}

export async function sessionReview(payload: Payload, ctx: JobContext) {
  const { db } = ctx;
  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, payload.sessionId), eq(sessions.projectId, payload.projectId)));
  if (!session) throw new UserFacingError("Session not found.");
  const [project] = await db.select().from(projects).where(eq(projects.id, payload.projectId));
  if (!project) throw new UserFacingError("Project not found.");
  const ai = await ctx.aiFor(project.id);

  await ctx.progress({ pct: 10, step: "Checking remaining claims against the repo and docs" });
  let claimRows = await db.select().from(claims).where(eq(claims.sessionId, session.id)).orderBy(asc(claims.createdAt));
  const unverified = claimRows.filter((c) => c.status === "unverified");
  const [repo] = await db.select().from(repos).where(eq(repos.projectId, project.id));
  if (ai.mode === "meta" && unverified.length > 0 && (repo || project.submissionText)) {
    const findings = repo ? await db.select().from(repoFindings).where(eq(repoFindings.repoId, repo.id)) : [];
    const { value } = await ai.llm.generateObject(
      prompts.sessionAuditV1({
        claims: unverified.map((c) => ({ claimId: c.id, text: c.text, type: c.type })),
        findings: findings.filter((f) => f.kind !== "dependency").map((f) => ({ kind: f.kind, ref: f.line ? `${f.filePath}:${f.line}` : f.filePath, summary: f.summary })),
        dependencies: repo?.dependencies.map((d) => d.name) ?? [],
        readme: repo?.readme ?? null,
        submission: project.submissionText || null,
      }),
    );
    for (const v of value.verdicts) {
      const row = unverified.find((c) => c.id === v.claimId);
      // No evidence means unverified, never verified.
      if (!row || v.evidence.length === 0 || v.status === "unverified") continue;
      await db.update(claims).set({ status: v.status, confidence: v.confidence, suggestedRewrite: v.suggestedRewrite }).where(eq(claims.id, row.id));
      await db.insert(evidence).values(v.evidence.map((e) => ({ projectId: project.id, claimId: row.id, kind: e.kind, ref: { value: e.ref }, summary: e.summary })));
    }
    claimRows = await db.select().from(claims).where(eq(claims.sessionId, session.id)).orderBy(asc(claims.createdAt));
  }

  await ctx.progress({ pct: 45, step: "Comparing this session with Rehearsal Memory" });
  const [spec] = await db.select({ id: eventSpecs.id }).from(eventSpecs).where(eq(eventSpecs.projectId, project.id));
  const criteriaRows = spec ? await db.select({ name: criteria.name }).from(criteria).where(eq(criteria.eventSpecId, spec.id)) : [];
  const latency = await db.select({ stepKey: latencySamples.stepKey, durationMs: latencySamples.durationMs }).from(latencySamples).where(eq(latencySamples.sessionId, session.id));
  const followUps = (await db.select({ kind: judgeTurns.kind }).from(judgeTurns).where(eq(judgeTurns.sessionId, session.id))).filter((t) => t.kind === "follow_up").length;
  const summary = (session.summary ?? {}) as Partial<SessionSummary>;
  const coverage = (session.rubricHeatmap ?? {}) as Record<string, Record<string, number>>;
  const current = weakSpots({ claims: claimRows, coverage, criteria: criteriaRows.map((c) => c.name), latency, followUps, flags: summary.flags ?? [] });

  const [previous] = await db
    .select()
    .from(coachNotes)
    .where(and(eq(coachNotes.projectId, project.id), ne(coachNotes.sessionId, session.id)))
    .orderBy(desc(coachNotes.createdAt))
    .limit(1);
  const diff = diffWeakSpots(previous ? [...toCoachItems(previous.open), ...toCoachItems(previous.newIssues)] : [], current);

  // Memory: the most relevant earlier notes by embedding when available, else the most recent.
  const embedder = ai.mode === "meta" ? createEmbedder(ctx.env) : null;
  let embedding: number[] | null = null;
  let memoryRows = await db.select().from(coachNotes).where(eq(coachNotes.projectId, project.id)).orderBy(desc(coachNotes.createdAt)).limit(5);
  if (embedder) {
    try {
      embedding = await embedder.embed(current.map((i) => i.text).join("\n") || "no weak spots");
      memoryRows = await db
        .select()
        .from(coachNotes)
        .where(and(eq(coachNotes.projectId, project.id), isNotNull(coachNotes.embedding)))
        .orderBy(cosineDistance(coachNotes.embedding, embedding))
        .limit(5);
    } catch (error) {
      ctx.logger.warn({ err: error }, "embedding failed; using recent notes as memory");
    }
  }
  const weakestCriteria = criteriaRows
    .map((c) => ({ name: c.name, total: Object.values(coverage[c.name] ?? {}).reduce((a, b) => a + b, 0) }))
    .sort((a, b) => a.total - b.total)
    .map((c) => c.name);

  await ctx.progress({ pct: 75, step: "Writing Coach Notes" });
  const { value: plan } = await ai.llm.generateObject(
    prompts.coachNotesV1({
      projectName: project.name,
      diff,
      memory: memoryRows.map((m) => ({ when: m.createdAt.toISOString(), items: [...toCoachItems(m.open), ...toCoachItems(m.newIssues)] })),
      weakestCriteria,
    }),
  );

  await db.delete(coachNotes).where(eq(coachNotes.sessionId, session.id));
  const [note] = await db
    .insert(coachNotes)
    .values({ projectId: project.id, sessionId: session.id, resolved: diff.resolved, open: diff.open, newIssues: diff.newIssues, nextPlan: plan.nextPlan, embedding })
    .returning({ id: coachNotes.id });
  await ctx.progress({ pct: 100, step: "Coach Notes ready" });
  return { coachNoteId: note?.id ?? null, resolved: diff.resolved.length, open: diff.open.length, newIssues: diff.newIssues.length };
}
