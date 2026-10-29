import { claims, evidence, judgeTurns, latencySamples, sessions, transcriptSegments } from "@stage-ready/db";
import { latencySummary } from "@stage-ready/shared";
import { asc, eq, inArray } from "drizzle-orm";
import { notFound, route, uuidParam } from "@/lib/server/api";
import { db } from "@/lib/server/db";
import { requireProject } from "@/lib/server/projects";

/** Summary, ledger, latencies, heatmap and judge turns for one session. */
export const GET = route<{ id: string }>(async (_req, { user, params }) => {
  uuidParam(params.id, "Session");
  const [session] = await db().select().from(sessions).where(eq(sessions.id, params.id));
  if (!session) throw notFound("Session");
  await requireProject(user.id, session.projectId);
  const [claimRows, latency, turns, transcript] = await Promise.all([
    db().select().from(claims).where(eq(claims.sessionId, session.id)).orderBy(asc(claims.createdAt)),
    db().select().from(latencySamples).where(eq(latencySamples.sessionId, session.id)).orderBy(asc(latencySamples.startMs)),
    db().select().from(judgeTurns).where(eq(judgeTurns.sessionId, session.id)).orderBy(asc(judgeTurns.atMs)),
    db().select().from(transcriptSegments).where(eq(transcriptSegments.sessionId, session.id)).orderBy(asc(transcriptSegments.startMs)),
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
  const steps = [...new Set(latency.map((l) => l.stepKey))];
  return Response.json({
    session: { id: session.id, mode: session.mode, startedAt: session.startedAt, endedAt: session.endedAt, recordingUrl: session.recordingUrl },
    summary: session.summary,
    rubricHeatmap: session.rubricHeatmap,
    claims: claimRows.map((c) => ({ ...c, evidence: evidenceRows.filter((e) => e.claimId === c.id) })),
    latency: { samples: latency, byStep: steps.map((stepKey) => ({ stepKey, ...latencySummary(latency.filter((l) => l.stepKey === stepKey).map((l) => l.durationMs)) })) },
    judgeTurns: turns,
    transcript,
  });
});
