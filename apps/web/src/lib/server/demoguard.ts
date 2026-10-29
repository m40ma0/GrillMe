import "server-only";
import { incidents, latencySamples, sessions, stepMaps, steps } from "@stage-ready/db";
import { and, asc, count, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import type { DemoGuardDTO } from "@/lib/types";
import { db } from "./db";

/** The step map, golden-run candidates, and every DemoGuard run with its incidents (the post-mortem). */
export async function loadDemoGuard(projectId: string): Promise<DemoGuardDTO> {
  const [[map], golden, runs] = await Promise.all([
    db().select().from(stepMaps).where(eq(stepMaps.projectId, projectId)).orderBy(desc(stepMaps.createdAt)).limit(1),
    db()
      .select({ id: sessions.id, startedAt: sessions.startedAt, mode: sessions.mode, steps: count(latencySamples.id) })
      .from(sessions)
      .innerJoin(latencySamples, eq(latencySamples.sessionId, sessions.id))
      .where(and(eq(sessions.projectId, projectId), isNotNull(sessions.endedAt), ne(sessions.mode, "demoguard")))
      .groupBy(sessions.id)
      .orderBy(desc(sessions.startedAt))
      .limit(20),
    db()
      .select()
      .from(sessions)
      .where(and(eq(sessions.projectId, projectId), eq(sessions.mode, "demoguard")))
      .orderBy(desc(sessions.startedAt))
      .limit(20),
  ]);
  const stepRows = map ? await db().select().from(steps).where(eq(steps.stepMapId, map.id)).orderBy(asc(steps.order)) : [];
  const incidentRows = runs.length
    ? await db()
        .select({ incident: incidents, stepName: steps.name })
        .from(incidents)
        .leftJoin(steps, eq(steps.id, incidents.stepId))
        .where(
          inArray(
            incidents.sessionId,
            runs.map((r) => r.id),
          ),
        )
        .orderBy(asc(incidents.atMs))
    : [];
  return {
    stepMap: map ? { id: map.id, version: map.version, goldenRunSessionId: map.goldenRunSessionId, fallbackClipUrl: map.fallbackClipUrl, createdAt: map.createdAt.toISOString() } : null,
    steps: stepRows.map((s) => ({
      id: s.id,
      order: s.order,
      name: s.name,
      narration: s.narration,
      maxDurationMs: s.maxDurationMs,
      fallbackInMs: s.fallbackInMs,
      fallbackOutMs: s.fallbackOutMs,
      hasExpectedState: typeof s.successSignal.outputHash === "string",
      goldenDurationMs: typeof s.successSignal.goldenDurationMs === "number" ? s.successSignal.goldenDurationMs : null,
    })),
    goldenRuns: golden.map((g) => ({ id: g.id, startedAt: g.startedAt?.toISOString() ?? "", mode: g.mode, steps: g.steps })),
    runs: runs.map((r) => {
      const summary = (r.summary ?? {}) as { demoguard?: { totalFallbackMs?: number } };
      return {
        sessionId: r.id,
        startedAt: (r.startedAt ?? r.createdAt).toISOString(),
        endedAt: r.endedAt?.toISOString() ?? null,
        totalFallbackMs: summary.demoguard?.totalFallbackMs ?? 0,
        incidents: incidentRows
          .filter((i) => i.incident.sessionId === r.id)
          .map(({ incident: i, stepName }) => ({ id: i.id, atMs: i.atMs, action: i.action, stepName, signals: i.signals, fallbackMs: i.fallbackMs, detectionMs: i.detectionMs, detail: i.detail })),
      };
    }),
  };
}
