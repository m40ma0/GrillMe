import { slides } from "@stage-ready/db";
import { and, eq, isNotNull } from "drizzle-orm";
import { ApiError, route } from "@/lib/server/api";
import { db } from "@/lib/server/db";
import { requireProject } from "@/lib/server/projects";
import { presignGet } from "@/lib/server/storage";

/** Redirects to the PDF appendix of every evidence slide. */
export const GET = route<{ id: string }>(async (_req, { user, params }) => {
  const project = await requireProject(user.id, params.id);
  const [row] = await db()
    .select({ pdfUrl: slides.pdfUrl })
    .from(slides)
    .where(and(eq(slides.projectId, project.id), isNotNull(slides.pdfUrl)))
    .limit(1);
  const url = row?.pdfUrl ? await presignGet(row.pdfUrl) : null;
  if (!url) throw new ApiError(404, "not_found", "Render the slides first; the appendix is built with them.");
  return new Response(null, { status: 302, headers: { location: url } });
});
