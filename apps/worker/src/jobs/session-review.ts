import { createEmbedder, diffWeakSpots, heuristicPlan, prompts } from "@stage-ready/ai";
import { claims, coachNotes, criteria, eventSpecs, evidence, fixTasks, incidents, judgeTurns, latencySamples, projects, repoFindings, repos, sessions, steps } from "@stage-ready/db";
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

/**
 * Weak-spot keys this session re-checked and passed: a claim said again and verified, a criterion covered,
 * a step re-measured within budget, a Q&A round without follow-ups. Only these can resolve an earlier item.
 */
export function passedChecks(input: {
  claims: { text: string; status: string }[];
  coverage: Record<string, Record<string, number>>;
  criteria: string[];
  latency: { stepKey: string; durationMs: number }[];
  questionsAsked: number;
  followUps: number;
}): Set<string> {
  const passed = new Set<string>();
  for (const c of input.claims) if (c.status === "verified") passed.add(`claim:${keyOf(c.text)}`);
  for (const name of input.criteria) {
    const total = Object.values(input.coverage[name] ?? {}).reduce((a, b) => a + b, 0);
    if (total >= 0.25) passed.add(`criterion:${keyOf(name)}`);
  }
  for (const stepKey of new Set(input.latency.map((l) => l.stepKey))) {
    const { p95 } = latencySummary(input.latency.filter((l) => l.stepKey === stepKey).map((l) => l.durationMs));
    if (p95 !== null && p95 <= DEFAULT_STEP_BUDGET_MS) passed.add(`slow:${stepKey}`);
  }
  if (input.questionsAsked > 0 && input.followUps === 0) passed.add("qa:vague");
  return passed;
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
  if (session.mode === "demoguard") return demoGuardReview(session.id, project.id, ctx);
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
  const turnKinds = await db.select({ kind: judgeTurns.kind }).from(judgeTurns).where(eq(judgeTurns.sessionId, session.id));
  const followUps = turnKinds.filter((t) => t.kind === "follow_up").length;
  const questionsAsked = turnKinds.filter((t) => t.kind === "question").length;
  const summary = (session.summary ?? {}) as Partial<SessionSummary>;
  const coverage = (session.rubricHeatmap ?? {}) as Record<string, Record<string, number>>;
  const current = weakSpots({ claims: claimRows, coverage, criteria: criteriaRows.map((c) => c.name), latency, followUps, flags: summary.flags ?? [] });

  const [previous] = await db
    .select()
    .from(coachNotes)
    .where(and(eq(coachNotes.projectId, project.id), ne(coachNotes.sessionId, session.id)))
    .orderBy(desc(coachNotes.createdAt))
    .limit(1);
  const passed = passedChecks({ claims: claimRows, coverage, criteria: criteriaRows.map((c) => c.name), latency, questionsAsked, followUps });
  const diff = diffWeakSpots(previous ? [...toCoachItems(previous.open), ...toCoachItems(previous.newIssues), ...toCoachItems(previous.notRetested)] : [], current, passed);

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
  const {
    value: plan,
    modelId,
    latencyMs,
  } = await ai.llm.generateObject(
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
    .values({
      projectId: project.id,
      sessionId: session.id,
      resolved: diff.resolved,
      open: diff.open,
      newIssues: diff.newIssues,
      notRetested: diff.notRetested,
      nextPlan: plan.nextPlan,
      embedding,
      modelId,
      modelLatencyMs: Math.round(latencyMs),
    })
    .returning({ id: coachNotes.id });
  // Auto-refresh: new rehearsal data rebuilds the question bank and its slides.
  await ctx.enqueue({ name: "questions", projectId: project.id, reason: "session" });
  await ctx.progress({ pct: 100, step: "Coach Notes ready" });
  return { coachNoteId: note?.id ?? null, resolved: diff.resolved.length, open: diff.open.length, newIssues: diff.newIssues.length };
}

/** DemoGuard runs feed Rehearsal Memory: each step that failed live becomes an open weak spot and a Fix Task. */
async function demoGuardReview(sessionId: string, projectId: string, ctx: JobContext) {
  const { db } = ctx;
  await ctx.progress({ pct: 30, step: "Reading DemoGuard incidents" });
  const rows = await db.select({ incident: incidents, stepName: steps.name }).from(incidents).leftJoin(steps, eq(steps.id, incidents.stepId)).where(eq(incidents.sessionId, sessionId));
  const failed = rows.filter((r) => r.incident.action === "switch" || r.incident.action === "panic");
  const byStep = new Map<string, { signals: Set<string>; count: number }>();
  for (const r of failed) {
    const name = r.stepName ?? "an unknown step";
    const entry = byStep.get(name) ?? { signals: new Set<string>(), count: 0 };
    r.incident.signals.forEach((s) => entry.signals.add(s));
    entry.count++;
    byStep.set(name, entry);
  }
  const items: CoachItem[] = [...byStep].map(([name, v]) => ({
    key: `incident:${keyOf(name)}`,
    text: `Make "${name}" reliable: DemoGuard switched to fallback ${v.count === 1 ? "once" : `${v.count} times`}${v.signals.size ? ` (${[...v.signals].join(", ").replace(/_/g, " ")})` : " (panic)"}.`.slice(
      0,
      240,
    ),
    severity: "high",
  }));
  if (items.length === 0) {
    await ctx.progress({ pct: 100, step: "No incidents to remember" });
    return { incidents: 0 };
  }
  await ctx.progress({ pct: 70, step: "Adding incidents to Coach Notes and Fix Tasks" });
  const [latest] = await db.select().from(coachNotes).where(eq(coachNotes.projectId, projectId)).orderBy(desc(coachNotes.createdAt)).limit(1);
  if (latest) {
    const known = new Set([...toCoachItems(latest.open), ...toCoachItems(latest.newIssues)].map((i) => i.key));
    const added = items.filter((i) => !known.has(i.key));
    if (added.length)
      await db
        .update(coachNotes)
        .set({ newIssues: [...toCoachItems(latest.newIssues), ...added] })
        .where(eq(coachNotes.id, latest.id));
  } else {
    await db.insert(coachNotes).values({ projectId, sessionId, resolved: [], open: [], newIssues: items, nextPlan: heuristicPlan({ resolved: [], open: [], newIssues: items, notRetested: [] }, []) });
  }
  const openTasks = await db
    .select({ title: fixTasks.title })
    .from(fixTasks)
    .where(and(eq(fixTasks.projectId, projectId), eq(fixTasks.origin, "incident"), eq(fixTasks.status, "open")));
  const have = new Set(openTasks.map((t) => t.title));
  for (const [name] of byStep) {
    const title = `Fix the "${name}" step before the live demo`.slice(0, 200);
    if (have.has(title)) continue;
    await db.insert(fixTasks).values({ projectId, title, detail: "DemoGuard switched to fallback during this step. See the DemoGuard post-mortem for its signals.", origin: "incident" });
  }
  await ctx.progress({ pct: 100, step: "Incidents remembered" });
  return { incidents: failed.length, steps: byStep.size };
}
