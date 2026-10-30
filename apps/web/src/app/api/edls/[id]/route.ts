import { edls, sectionPlans, takes } from "@stage-ready/db";
import { PatchEdlBody, timelineMs } from "@stage-ready/shared";
import { and, eq, inArray } from "drizzle-orm";
import { ApiError, body, notFound, route, uuidParam } from "@/lib/server/api";
import { db } from "@/lib/server/db";
import { requireProject } from "@/lib/server/projects";

/** Manual swaps and trims. Each item must be a ready take of its section, trimmed within its length. */
export const PATCH = route<{ id: string }>(async (req, { user, params }) => {
  uuidParam(params.id, "EDL");
  const [edl] = await db().select().from(edls).where(eq(edls.id, params.id));
  if (!edl) throw notFound("EDL");
  const project = await requireProject(user.id, edl.projectId);
  const { items } = await body(req, PatchEdlBody);
  const rows = await db()
    .select({ take: takes, key: sectionPlans.key, order: sectionPlans.order })
    .from(takes)
    .innerJoin(sectionPlans, eq(sectionPlans.id, takes.sectionPlanId))
    .where(
      and(
        eq(takes.projectId, project.id),
        inArray(
          takes.id,
          items.map((i) => i.takeId),
        ),
      ),
    );
  const byId = new Map(rows.map((r) => [r.take.id, r]));
  const seen = new Set<string>();
  for (const item of items) {
    const row = byId.get(item.takeId);
    if (!row) throw new ApiError(400, "invalid_request", "The edit uses a take from another project or one that was deleted.");
    if (row.key !== item.sectionKey) throw new ApiError(400, "invalid_request", `That take belongs to ${row.key}, not ${item.sectionKey}.`);
    if (seen.has(item.sectionKey)) throw new ApiError(400, "invalid_request", `Use one take for ${item.sectionKey}.`);
    seen.add(item.sectionKey);
    if (row.take.status !== "ready") throw new ApiError(409, "take_not_ready", "A take in the edit is still processing.");
    if (item.outMs > row.take.durationMs || item.inMs >= item.outMs || item.outMs - item.inMs < 1_000) throw new ApiError(400, "invalid_request", "Trims must keep at least 1 s inside the take.");
  }
  const ordered = [...items].sort((a, b) => (byId.get(a.takeId)?.order ?? 0) - (byId.get(b.takeId)?.order ?? 0));
  const [updated] = await db()
    .update(edls)
    .set({ items: ordered, version: edl.version + 1 })
    .where(eq(edls.id, edl.id))
    .returning();
  const totalMs = timelineMs(ordered);
  return Response.json({ id: updated?.id, version: updated?.version, items: ordered, totalMs, fits: totalMs <= project.videoLimitSec * 1000 });
});
