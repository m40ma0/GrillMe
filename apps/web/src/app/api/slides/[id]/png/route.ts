import { slides } from "@stage-ready/db";
import { eq } from "drizzle-orm";
import { ApiError, notFound, route, uuidParam } from "@/lib/server/api";
import { db } from "@/lib/server/db";
import { requireProject } from "@/lib/server/projects";
import { presignGet } from "@/lib/server/storage";

/** Redirects to the slide PNG; the browser caches it so the Cmd+K finder shows it instantly. */
export const GET = route<{ id: string }>(async (_req, { user, params }) => {
  uuidParam(params.id, "Slide");
  const [slide] = await db().select().from(slides).where(eq(slides.id, params.id));
  if (!slide) throw notFound("Slide");
  await requireProject(user.id, slide.projectId);
  const url = slide.pngUrl ? await presignGet(slide.pngUrl) : null;
  if (!url) throw new ApiError(404, "not_found", "The slide has not been rendered yet.");
  return new Response(null, { status: 302, headers: { location: url, "cache-control": "private, max-age=600" } });
});
