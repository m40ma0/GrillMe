import "server-only";
import { claims, coachNotes, criteria, eventSpecs, evidence, judgeTurns, latencySamples, personas, sectionPlans, sessions, transcriptSegments } from "@stage-ready/db";
import { PERSONA_ROLE_LABEL, latencySummary, toCoachItems, type SessionSummary } from "@stage-ready/shared";
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, ne } from "drizzle-orm";
import type { SessionReviewDTO, ProgressDTO } from "@/lib/types";
import { notFound, uuidParam } from "./api";
import { db } from "./db";
import { requireProject } from "./projects";

/** A rehearsal that never started (blocked capture, closed tab) is removed after this long. */
export const ORPHAN_SESSION_MS = 5 * 60_000;

/** Deletes the project's rehearsal sessions that never started (no audio, so no start time). */
export async function pruneOrphanSessions(projectId: string, now = Date.now()) {
  await db()
    .delete(sessions)
    .where(and(eq(sessions.projectId, projectId), ne(sessions.mode, "demoguard"), isNull(sessions.startedAt), lt(sessions.createdAt, new Date(now - ORPHAN_SESSION_MS))));
}

export async function loadSessionReview(userId: string, sessionId: string): Promise<SessionReviewDTO> {
  uuidParam(sessionId, "Session");
  const [session] = await db().select().from(sessions).where(eq(sessions.id, sessionId));
  if (!session) throw notFound("Session");
  const project = await requireProject(userId, session.projectId);
  const [spec] = await db().select({ id: eventSpecs.id }).from(eventSpecs).where(eq(eventSpecs.projectId, project.id));
  const [claimRows, latency, turns, transcript, personaRows, sectionRows, criteriaRows, [note], projectLatency] = await Promise.all([
    db().select().from(claims).where(eq(claims.sessionId, session.id)).orderBy(asc(claims.createdAt)),
    db().select().from(latencySamples).where(eq(latencySamples.sessionId, session.id)).orderBy(asc(latencySamples.startMs)),
    db().select().from(judgeTurns).where(eq(judgeTurns.sessionId, session.id)).orderBy(asc(judgeTurns.atMs)),
    db().select().from(transcriptSegments).where(eq(transcriptSegments.sessionId, session.id)).orderBy(asc(transcriptSegments.startMs)),
    db().select().from(personas).where(eq(personas.projectId, project.id)),
    db().select().from(sectionPlans).where(eq(sectionPlans.projectId, project.id)).orderBy(asc(sectionPlans.order)),
    spec ? db().select({ name: criteria.name }).from(criteria).where(eq(criteria.eventSpecId, spec.id)).orderBy(asc(criteria.order)) : Promise.resolve([]),
    db().select().from(coachNotes).where(eq(coachNotes.sessionId, session.id)).limit(1),
    db().select({ stepKey: latencySamples.stepKey, durationMs: latencySamples.durationMs }).from(latencySamples).where(eq(latencySamples.projectId, project.id)),
  ]);
  const evidenceRows = claimRows.length
    ? await db()
        .select()
        .from(evidence)
        .where(
          inArray(
            evidence.claimId,
            claimRows.map((c) => c.id),
          ),
        )
    : [];
  const segText = new Map(transcript.map((s) => [s.id, s.text]));
  const steps = [...new Set(projectLatency.map((l) => l.stepKey))].sort();
  return {
    project: { id: project.id, name: project.name, timezone: project.timezone },
    session: { id: session.id, mode: session.mode, startedAt: session.startedAt?.toISOString() ?? null, endedAt: session.endedAt?.toISOString() ?? null, recordingUrl: session.recordingUrl },
    summary: (session.summary ?? null) as SessionSummary | null,
    rubric: {
      criteria: criteriaRows.map((c) => c.name),
      sections: sectionRows.map((s) => ({ key: s.key, title: s.title, budgetSec: s.budgetSec })),
      cells: (session.rubricHeatmap ?? {}) as Record<string, Record<string, number>>,
    },
    claims: claimRows.map((c) => ({
      id: c.id,
      text: c.text,
      type: c.type,
      status: c.status,
      confidence: c.confidence,
      suggestedRewrite: c.suggestedRewrite,
      atMs: transcript.find((s) => s.id === c.segmentId)?.startMs ?? null,
      evidence: evidenceRows.filter((e) => e.claimId === c.id).map((e) => ({ kind: e.kind, ref: e.ref.value, summary: e.summary })),
      model: c.modelId ? { modelId: c.modelId, latencyMs: c.modelLatencyMs } : null,
    })),
    latency: {
      samples: latency.map((l) => ({ stepKey: l.stepKey, startMs: l.startMs, durationMs: l.durationMs, detector: l.detector })),
      acrossRehearsals: steps.map((stepKey) => {
        const values = projectLatency.filter((l) => l.stepKey === stepKey).map((l) => l.durationMs);
        const mine = latency.filter((l) => l.stepKey === stepKey).map((l) => l.durationMs);
        return { stepKey, ...latencySummary(values), thisSession: mine.length ? Math.max(...mine) : null };
      }),
    },
    turns: turns.map((t) => {
      const p = personaRows.find((x) => x.id === t.personaId);
      return {
        id: t.id,
        atMs: t.atMs,
        kind: t.kind,
        trigger: t.trigger,
        text: t.text,
        persona: p ? PERSONA_ROLE_LABEL[p.role] : "Judge",
        model: t.modelId ? { modelId: t.modelId, latencyMs: t.modelLatencyMs } : null,
        answer: t.presenterAnswerSegmentIds
          .map((id) => segText.get(id) ?? "")
          .filter(Boolean)
          .join(" "),
      };
    }),
    transcript: transcript.map((s) => ({ id: s.id, startMs: s.startMs, endMs: s.endMs, speaker: s.speaker, text: s.text })),
    coachNote: note
      ? {
          resolved: toCoachItems(note.resolved),
          open: toCoachItems(note.open),
          newIssues: toCoachItems(note.newIssues),
          notRetested: toCoachItems(note.notRetested),
          nextPlan: note.nextPlan,
          model: note.modelId ? { modelId: note.modelId, latencyMs: note.modelLatencyMs } : null,
        }
      : null,
  };
}

export async function loadProgress(userId: string, projectId: string): Promise<ProgressDTO> {
  const project = await requireProject(userId, projectId);
  const [spec] = await db().select({ id: eventSpecs.id }).from(eventSpecs).where(eq(eventSpecs.projectId, project.id));
  const criteriaRows = spec ? await db().select({ name: criteria.name }).from(criteria).where(eq(criteria.eventSpecId, spec.id)).orderBy(asc(criteria.order)) : [];
  const [sessionRows, notes] = await Promise.all([
    db()
      .select()
      .from(sessions)
      .where(and(eq(sessions.projectId, project.id), isNotNull(sessions.endedAt), ne(sessions.mode, "demoguard")))
      .orderBy(asc(sessions.startedAt)),
    db().select().from(coachNotes).where(eq(coachNotes.projectId, project.id)).orderBy(desc(coachNotes.createdAt)),
  ]);
  const latest = notes[0];
  return {
    project: { id: project.id, name: project.name, timezone: project.timezone },
    criteria: criteriaRows.map((c) => c.name),
    trends: sessionRows.map((s, i) => {
      const cells = (s.rubricHeatmap ?? {}) as Record<string, Record<string, number>>;
      return {
        sessionId: s.id,
        label: `#${i + 1}`,
        startedAt: s.startedAt?.toISOString() ?? null,
        score: typeof s.summary?.score === "number" ? s.summary.score : null,
        // Average over the planned sections, the same readiness measure as the project overview.
        criteria: Object.fromEntries(
          criteriaRows.map((c) => [c.name, Math.round((Object.values(cells[c.name] ?? {}).reduce((a, b) => a + b, 0) / Math.max(1, Object.keys(cells[c.name] ?? {}).length, 6)) * 100)]),
        ),
      };
    }),
    history: notes.map((n) => ({
      sessionId: n.sessionId,
      createdAt: n.createdAt.toISOString(),
      resolved: toCoachItems(n.resolved),
      open: toCoachItems(n.open),
      newIssues: toCoachItems(n.newIssues),
      notRetested: toCoachItems(n.notRetested),
    })),
    nextPlan: latest?.nextPlan ?? [],
    nextPlanModel: latest?.modelId ? { modelId: latest.modelId, latencyMs: latest.modelLatencyMs } : null,
  };
}
