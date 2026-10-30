import "server-only";
import { edls, projects, renderJobs, sectionPlans, takeScores, takes } from "@stage-ready/db";
import { firstTwentySeconds, timelineMs, type EdlItem, type SectionKey } from "@stage-ready/shared";
import { asc, desc, eq } from "drizzle-orm";
import type { DirectorDTO, RenderDTO, TakeDTO } from "@/lib/types";
import { db } from "./db";

type Breakdown = { wpm?: number; fillerPer100?: number; longPauses?: number; contradictedClaims?: { text: string; reason: string }[] };

export const toRenderDTO = (r: typeof renderJobs.$inferSelect): RenderDTO => ({
  id: r.id,
  status: r.status,
  progress: r.progress,
  error: r.error,
  createdAt: r.createdAt.toISOString(),
  outputs: { mp4: r.outputs.mp4 ?? null, srt: r.outputs.srt ?? null, thumbnail: r.outputs.thumbnail ?? null, chapters: r.outputs.chapters ?? null },
});

export async function loadTakes(projectId: string): Promise<TakeDTO[]> {
  const rows = await db()
    .select({ take: takes, key: sectionPlans.key, score: takeScores })
    .from(takes)
    .innerJoin(sectionPlans, eq(sectionPlans.id, takes.sectionPlanId))
    .leftJoin(takeScores, eq(takeScores.takeId, takes.id))
    .where(eq(takes.projectId, projectId))
    .orderBy(asc(takes.createdAt), asc(takes.id));
  return rows.map(({ take, key, score }) => {
    const b = (score?.breakdown ?? {}) as Breakdown;
    return {
      id: take.id,
      sectionKey: key,
      durationMs: take.durationMs,
      status: take.status,
      error: take.error,
      createdAt: take.createdAt.toISOString(),
      transcript: take.transcript?.text ?? "",
      fixture: Boolean(take.mediaUrl?.startsWith("demo/")),
      hasMedia: Boolean(take.mediaUrl?.startsWith("s3://")),
      hasThumbnail: Boolean(take.thumbnailUrl),
      score: score
        ? {
            total: score.total,
            delivery: score.delivery,
            coverage: score.coverage,
            claimPenalty: score.claimPenalty,
            demoSuccess: score.demoSuccess,
            timeFit: score.timeFit,
            wpm: b.wpm ?? 0,
            fillerPer100: b.fillerPer100 ?? 0,
            longPauses: b.longPauses ?? 0,
            contradictedClaims: b.contradictedClaims ?? [],
          }
        : null,
    };
  });
}

/** The section rail, take grid, current EDL, First-20-seconds check and latest render. */
export async function loadDirector(projectId: string): Promise<DirectorDTO> {
  const [[project], sections, takeList, [edl], [render]] = await Promise.all([
    db().select().from(projects).where(eq(projects.id, projectId)),
    db().select().from(sectionPlans).where(eq(sectionPlans.projectId, projectId)).orderBy(asc(sectionPlans.order)),
    loadTakes(projectId),
    db().select().from(edls).where(eq(edls.projectId, projectId)).orderBy(desc(edls.createdAt)).limit(1),
    db().select().from(renderJobs).where(eq(renderJobs.projectId, projectId)).orderBy(desc(renderJobs.createdAt)).limit(1),
  ]);
  const limitSec = project?.videoLimitSec ?? 180;
  const totalMs = edl ? timelineMs(edl.items) : 0;
  return {
    limitSec,
    strongestMoment: project?.strongestMoment ?? "",
    cloudUploadEnabled: project?.cloudUploadEnabled ?? false,
    demoMode: project?.demoMode ?? false,
    sections: sections.map((s) => ({ key: s.key, title: s.title, budgetSec: s.budgetSec, order: s.order })),
    takes: takeList,
    edl: edl ? { id: edl.id, version: edl.version, items: edl.items, totalMs, fits: totalMs <= limitSec * 1000 } : null,
    firstTwenty: firstTwentyCheck(edl?.items ?? [], takeList, project?.strongestMoment ?? ""),
    render: render ? toRenderDTO(render) : null,
  };
}

/** Warns when the Hook take in the cut does not contain the strongest demo moment. */
export function firstTwentyCheck(items: EdlItem[], takeList: Pick<TakeDTO, "id" | "transcript">[], moment: string) {
  const hook = items.find((i) => i.sectionKey === ("hook" satisfies SectionKey));
  if (!hook || !moment.trim()) return null;
  return firstTwentySeconds(takeList.find((t) => t.id === hook.takeId)?.transcript ?? "", moment);
}
