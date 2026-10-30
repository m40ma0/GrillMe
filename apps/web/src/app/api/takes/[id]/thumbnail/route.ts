import { takes } from "@stage-ready/db";
import { eq } from "drizzle-orm";
import { ApiError, notFound, route, uuidParam } from "@/lib/server/api";
import { db } from "@/lib/server/db";
import { requireProject } from "@/lib/server/projects";
import { presignGet } from "@/lib/server/storage";

/** Redirects to a short-lived URL for a take's thumbnail (a frame grabbed by the take-process job). */
export const GET = route<{ id: string }>(async (_req, { user, params }) => {
  uuidParam(params.id, "Take");
  const [take] = await db().select().from(takes).where(eq(takes.id, params.id));
  if (!take) throw notFound("Take");
  await requireProject(user.id, take.projectId);
  const url = take.thumbnailUrl ? await presignGet(take.thumbnailUrl) : null;
  if (!url) throw new ApiError(404, "not_found", "This take has no thumbnail.");
  return new Response(null, { status: 302, headers: { location: url, "cache-control": "private, max-age=600" } });
});
