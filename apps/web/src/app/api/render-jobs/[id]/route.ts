import { renderJobs } from "@stage-ready/db";
import { eq } from "drizzle-orm";
import { notFound, route, uuidParam } from "@/lib/server/api";
import { db } from "@/lib/server/db";
import { toRenderDTO } from "@/lib/server/director";
import { requireProject } from "@/lib/server/projects";

export const GET = route<{ id: string }>(async (_req, { user, params }) => {
  uuidParam(params.id, "Render");
  const [job] = await db().select().from(renderJobs).where(eq(renderJobs.id, params.id));
  if (!job) throw notFound("Render");
  await requireProject(user.id, job.projectId);
  return Response.json(toRenderDTO(job));
});
