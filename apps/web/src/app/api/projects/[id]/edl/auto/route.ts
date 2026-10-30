import { edls } from "@stage-ready/db";
import { buildAutoEdl } from "@stage-ready/shared";
import { desc, eq } from "drizzle-orm";
import { ApiError, route } from "@/lib/server/api";
import { db } from "@/lib/server/db";
import { loadDirector } from "@/lib/server/director";
import { requireProject } from "@/lib/server/projects";

/** Builds the best-take EDL within the video limit; the length fitter swaps in tighter takes if needed. */
export const POST = route<{ id: string }>(async (_req, { user, params }) => {
  const project = await requireProject(user.id, params.id);
  const director = await loadDirector(project.id);
  const auto = buildAutoEdl(
    director.sections,
    director.takes.map((t) => ({ id: t.id, sectionKey: t.sectionKey, durationMs: t.durationMs, score: t.score?.total ?? null, valid: t.status === "ready" && t.transcript.length > 0 })),
    director.limitSec,
  );
  if (auto.items.length === 0) throw new ApiError(409, "no_takes", "Record and score at least one take before assembling.");
  const [prior] = await db().select({ version: edls.version }).from(edls).where(eq(edls.projectId, project.id)).orderBy(desc(edls.createdAt)).limit(1);
  const [edl] = await db()
    .insert(edls)
    .values({ projectId: project.id, items: auto.items, version: (prior?.version ?? 0) + 1 })
    .returning();
  return Response.json({ edlId: edl?.id, ...auto }, { status: 201 });
});
