import { latencySamples, sessions, stepMaps, steps, transcriptSegments } from "@stage-ready/db";
import { deriveSteps } from "@stage-ready/shared";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { ApiError, body, route } from "@/lib/server/api";
import { db } from "@/lib/server/db";
import { loadDemoGuard } from "@/lib/server/demoguard";
import { requireProject } from "@/lib/server/projects";

/** Derives a new step map version from a golden-run rehearsal's timed steps. */
export const POST = route<{ id: string }>(async (req, { user, params }) => {
  const project = await requireProject(user.id, params.id);
  const { goldenRunSessionId } = await body(req, z.object({ goldenRunSessionId: z.string().uuid() }));
  const [session] = await db()
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, goldenRunSessionId), eq(sessions.projectId, project.id)));
  if (!session || session.mode === "demoguard") throw new ApiError(404, "not_found", "Pick a finished rehearsal as the golden run.");
  const [samples, transcript] = await Promise.all([
    db().select().from(latencySamples).where(eq(latencySamples.sessionId, session.id)).orderBy(asc(latencySamples.startMs)),
    db().select().from(transcriptSegments).where(eq(transcriptSegments.sessionId, session.id)).orderBy(asc(transcriptSegments.startMs)),
  ]);
  if (samples.length === 0) throw new ApiError(409, "no_steps", "That rehearsal has no timed steps. Rehearse the demo with the screen shared so the stopwatch can time each step.");
  const derived = deriveSteps(samples, transcript);
  const [prior] = await db().select().from(stepMaps).where(eq(stepMaps.projectId, project.id)).orderBy(desc(stepMaps.createdAt)).limit(1);
  await db().transaction(async (tx) => {
    const [map] = await tx
      .insert(stepMaps)
      .values({ projectId: project.id, goldenRunSessionId: session.id, fallbackClipUrl: session.recordingUrl, version: (prior?.version ?? 0) + 1 })
      .returning();
    if (!map) throw new Error("Step map insert returned no row.");
    await tx.insert(steps).values(derived.map((s, order) => ({ projectId: project.id, stepMapId: map.id, order, ...s })));
  });
  return Response.json(await loadDemoGuard(project.id), { status: 201 });
});
