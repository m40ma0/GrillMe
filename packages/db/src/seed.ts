import { and, eq } from "drizzle-orm";
import { DbEnv, loadRootEnv, parseEnv } from "@stage-ready/config";
import {
  DEMO_FALLBACK_CLIP,
  DEMO_PROJECT_NAME,
  PERSONA_ROLE_LABEL,
  autoSectionPlan,
  demoEventSpec,
  demoPatterns,
  demoPersonas,
  demoRubricHeatmap,
  demoPitchScript,
  demoReadme,
  demoSubmissionText,
  demoRepo,
  demoSession,
  demoSteps,
  demoTakes,
  demoWinners,
} from "@stage-ready/shared";
import { createDb, type Db } from "./index";
import * as t from "./schema";

export const DEV_USER = { email: "dev@stage-ready.local", name: "Local developer", githubLogin: null };

export async function ensureDevUser(db: Db) {
  const [existing] = await db.select().from(t.users).where(eq(t.users.email, DEV_USER.email));
  if (existing) return existing;
  const [created] = await db.insert(t.users).values(DEV_USER).returning();
  if (!created) throw new Error("Could not create the local developer user.");
  return created;
}

/** Replaces the Demo Mode project for `ownerId` with fresh fixtures. Returns its id. */
export async function seedDemoProject(db: Db, ownerId: string): Promise<string> {
  return db.transaction(async (tx) => {
    await tx.delete(t.projects).where(and(eq(t.projects.ownerId, ownerId), eq(t.projects.demoMode, true)));
    const [project] = await tx
      .insert(t.projects)
      .values({
        ownerId,
        name: DEMO_PROJECT_NAME,
        tagline: "Turn noisy field reports into a clear response plan.",
        videoLimitSec: 180,
        timezone: "Asia/Singapore",
        demoMode: true,
        pitchScript: demoPitchScript,
        submissionText: demoSubmissionText,
        setupStep: 5,
      })
      .returning();
    if (!project) throw new Error("Demo project could not be created.");
    const projectId = project.id;

    const [spec] = await tx
      .insert(t.eventSpecs)
      .values({
        projectId,
        name: demoEventSpec.name,
        sourceUrls: [],
        tracks: demoEventSpec.tracks,
        requirements: demoEventSpec.requirements,
        requiredTech: demoEventSpec.requiredTech,
        deadlineAt: demoEventSpec.requirements.deadlineIso ? new Date(demoEventSpec.requirements.deadlineIso) : null,
        weightsInferred: demoEventSpec.weightsInferred,
        sourceQuotes: demoEventSpec.sourceQuotes,
        peopleNamed: demoEventSpec.peopleNamed,
        confirmedAt: new Date(),
      })
      .returning();
    if (!spec) throw new Error("Demo EventSpec could not be created.");
    await tx.insert(t.criteria).values(
      demoEventSpec.criteria.map((c, order) => ({
        projectId,
        eventSpecId: spec.id,
        order,
        name: c.name,
        description: c.description,
        weight: c.weight,
        sourceQuote: demoEventSpec.sourceQuotes[`criteria.${order}`] ?? null,
      })),
    );

    await tx.insert(t.pastWinners).values(demoWinners.map((w) => ({ projectId, sourceUrl: w.sourceUrl, title: w.profile.title, placement: w.profile.placement, profile: w.profile })));
    await tx.insert(t.winningPatterns).values(demoPatterns.map((p) => ({ projectId, ...p })));

    const [repo] = await tx
      .insert(t.repos)
      .values({
        projectId,
        githubFullName: demoRepo.githubFullName,
        commitSha: demoRepo.commitSha,
        visibility: demoRepo.visibility,
        fileCount: 38,
        digestTokens: 21_400,
        readme: demoReadme,
        dependencies: [{ name: "generative-ai-sdk (fictional)", version: "1.0.0", manifest: "package.json" }],
      })
      .returning();
    if (!repo) throw new Error("Demo repo could not be created.");
    await tx.insert(t.repoFindings).values(demoRepo.findings.map((f) => ({ projectId, repoId: repo.id, ...f })));

    const personaRows = await tx
      .insert(t.personas)
      .values(demoPersonas.map((p) => ({ projectId, ...p })))
      .returning();
    const personaByRole = new Map(personaRows.map((p) => [p.role, p.id]));

    const plan = autoSectionPlan(project.videoLimitSec);
    const sections = await tx
      .insert(t.sectionPlans)
      .values(plan.map((s, order) => ({ projectId, order, ...s })))
      .returning();

    const started = new Date(Date.now() - 2 * 86_400_000);
    const [session] = await tx
      .insert(t.sessions)
      .values({
        projectId,
        mode: demoSession.mode,
        startedAt: started,
        endedAt: new Date(started.getTime() + demoSession.durationMs),
        recordingUrl: "demo/rehearsal-1.webm",
        summary: { score: 72, modelCostUsd: 0 },
        rubricHeatmap: demoRubricHeatmap,
      })
      .returning();
    if (!session) throw new Error("Demo session could not be created.");

    const segments = await tx
      .insert(t.transcriptSegments)
      .values(demoSession.transcript.map((text, i) => ({ projectId, sessionId: session.id, startMs: 12_000 + i * 15_000, endMs: 12_000 + i * 15_000 + 4_000, speaker: "presenter", text, words: [] })))
      .returning();
    for (const [i, c] of demoSession.claims.entries()) {
      const segment = segments[i];
      const [claim] = await tx
        .insert(t.claims)
        .values({
          projectId,
          sessionId: session.id,
          segmentId: segment?.id ?? null,
          text: segment?.text ?? "",
          type: c.type,
          status: c.status,
          confidence: c.status === "unverified" ? 0.4 : 0.9,
          suggestedRewrite: c.rewrite,
        })
        .returning();
      if (claim) await tx.insert(t.evidence).values({ projectId, claimId: claim.id, kind: c.evidence.kind, ref: { value: c.evidence.ref }, summary: c.evidence.summary });
    }
    await tx.insert(t.latencySamples).values(
      demoSession.latency.map(([stepKey, durationMs], i) => ({
        projectId,
        sessionId: session.id,
        stepKey,
        startMs: 40_000 + i * 20_000,
        endMs: 40_000 + i * 20_000 + durationMs,
        durationMs,
        detector: "fixture",
      })),
    );
    await tx.insert(t.judgeTurns).values(
      demoSession.judgeTurns.map((j) => ({
        projectId,
        sessionId: session.id,
        personaId: personaByRole.get(j.role) ?? null,
        atMs: j.atMs,
        kind: "question" as const,
        text: j.text,
        trigger: j.trigger,
      })),
    );

    for (const section of sections) {
      for (const durationMs of demoTakes[section.key]) {
        await tx.insert(t.takes).values({ projectId, sectionPlanId: section.id, sessionId: session.id, mediaUrl: `demo/${section.key}-${durationMs}.webm`, durationMs });
      }
    }

    const [stepMap] = await tx.insert(t.stepMaps).values({ projectId, goldenRunSessionId: session.id, fallbackClipUrl: DEMO_FALLBACK_CLIP }).returning();
    if (stepMap) await tx.insert(t.steps).values(demoSteps.map((s, order) => ({ projectId, stepMapId: stepMap.id, order, ...s })));

    await tx.insert(t.fixTasks).values([
      {
        projectId,
        title: "Add an evaluation result for the 92% accuracy claim",
        detail: "No eval file or result supports the number.",
        origin: "claim",
        suggestedArtifact: "eval/classifier_accuracy.py",
      },
      { projectId, title: "Show offline mode or remove the claim", detail: "Offline mode was mentioned but never shown in the demo section.", origin: "claim" },
      { projectId, title: "Reach the response plan reveal before 60 s", detail: "Past winners showed their strongest moment within the first minute.", origin: "pattern" },
    ]);
    await tx.insert(t.coachNotes).values({
      projectId,
      sessionId: session.id,
      resolved: [{ key: "criterion:problem-statement", text: "Problem statement now names the responder", severity: "medium" }],
      open: [{ key: "claim:the summary is instant", text: 'Fix the contradicted claim "The summary is instant": it took 9.2 s.', severity: "high" }],
      newIssues: [{ key: "pace:hook", text: "The hook runs long before the first demo moment", severity: "medium" }],
      nextPlan: ["Show the offline flow or cut the line", "Add classifier evaluation evidence", "Drill the impact question"],
    });

    return projectId;
  });
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  loadRootEnv();
  const env = parseEnv("db", DbEnv);
  const db = createDb(env.DATABASE_URL, { max: 1 });
  try {
    const user = await ensureDevUser(db);
    const projectId = await seedDemoProject(db, user.id);
    console.info(`Demo Mode project seeded (${projectId}) with personas: ${Object.values(PERSONA_ROLE_LABEL).join(", ")}.`);
  } finally {
    await db.close();
  }
}
