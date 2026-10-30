import type { Db } from "@stage-ready/db";
import { claims, evidence, fixTasks, judgeTurns, latencySamples, sessions, transcriptSegments } from "@stage-ready/db";
import type { ClaimStatus, ClaimType, ClaimVerdict, ModelTag, Segment, SessionSummary } from "@stage-ready/shared";
import { and, eq, inArray } from "drizzle-orm";

export interface SessionRecord {
  startedAt: Date;
  endedAt: Date;
  segments: Segment[];
  claims: { localId: string; segmentLocalId: string; text: string; type: ClaimType; status: ClaimStatus; verdict: ClaimVerdict; model?: ModelTag }[];
  latency: { stepKey: string; startMs: number; endMs: number; durationMs: number; detector: string; inputHash: string | null; outputHash: string | null; outputFrame: string | null }[];
  turns: { personaId: string; atMs: number; kind: "interrupt" | "question" | "follow_up"; text: string; trigger: string | null; answerSegmentLocalIds: string[]; model?: ModelTag }[];
  fixTasks: { title: string; detail: string; suggestedArtifact: string; origin?: "claim" | "incident" }[];
  summary: SessionSummary;
  rubricHeatmap: Record<string, Record<string, number>>;
}

const TRIGGERS = ["claim", "coverage_gap", "over_time", "vague_answer", "qa_phase"] as const;

/** Writes the whole session in one transaction at session end. */
export async function persistSession(db: Db, projectId: string, sessionId: string, record: SessionRecord): Promise<void> {
  await db.transaction(async (tx) => {
    const segmentIds = new Map<string, string>();
    if (record.segments.length > 0) {
      const rows = await tx
        .insert(transcriptSegments)
        .values(record.segments.map((s) => ({ projectId, sessionId, startMs: s.startMs, endMs: s.endMs, speaker: s.speaker, text: s.text, words: s.words })))
        .returning({ id: transcriptSegments.id });
      record.segments.forEach((s, i) => segmentIds.set(s.id, rows[i]?.id ?? ""));
    }
    for (const c of record.claims) {
      const [row] = await tx
        .insert(claims)
        .values({
          projectId,
          sessionId,
          segmentId: segmentIds.get(c.segmentLocalId) || null,
          text: c.text,
          type: c.type,
          status: c.status,
          confidence: c.verdict.confidence,
          suggestedRewrite: c.verdict.suggestedRewrite,
          modelId: c.model?.modelId ?? null,
          modelLatencyMs: c.model?.latencyMs ?? null,
        })
        .returning({ id: claims.id });
      if (row && c.verdict.evidence.length > 0)
        await tx.insert(evidence).values(c.verdict.evidence.map((e) => ({ projectId, claimId: row.id, kind: e.kind, ref: { value: e.ref }, summary: e.summary })));
    }
    if (record.latency.length > 0) await tx.insert(latencySamples).values(record.latency.map((l) => ({ projectId, sessionId, ...l })));
    if (record.turns.length > 0) {
      await tx.insert(judgeTurns).values(
        record.turns.map((t) => ({
          projectId,
          sessionId,
          personaId: t.personaId,
          atMs: t.atMs,
          kind: t.kind,
          text: t.text,
          trigger: TRIGGERS.find((x) => x === t.trigger) ?? null,
          presenterAnswerSegmentIds: t.answerSegmentLocalIds.map((id) => segmentIds.get(id)).filter((id): id is string => Boolean(id)),
          modelId: t.model?.modelId ?? null,
          modelLatencyMs: t.model?.latencyMs ?? null,
        })),
      );
    }
    if (record.fixTasks.length > 0) {
      const titles = record.fixTasks.map((f) => f.title);
      const existing = await tx
        .select({ title: fixTasks.title })
        .from(fixTasks)
        .where(and(eq(fixTasks.projectId, projectId), inArray(fixTasks.title, titles)));
      const fresh = record.fixTasks.filter((f) => !existing.some((e) => e.title === f.title));
      if (fresh.length > 0) await tx.insert(fixTasks).values(fresh.map((f) => ({ projectId, ...f, origin: f.origin ?? ("claim" as const) })));
    }
    const [current] = await tx.select({ summary: sessions.summary }).from(sessions).where(eq(sessions.id, sessionId));
    await tx
      .update(sessions)
      .set({ startedAt: record.startedAt, endedAt: record.endedAt, summary: { ...(current?.summary ?? {}), ...record.summary }, rubricHeatmap: record.rubricHeatmap })
      .where(eq(sessions.id, sessionId));
  });
}
