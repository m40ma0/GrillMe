import { edls, renderJobs } from "@stage-ready/db";
import { and, eq, inArray } from "drizzle-orm";
import { ApiError, notFound, route, uuidParam } from "@/lib/server/api";
import { db } from "@/lib/server/db";
import { requireProject } from "@/lib/server/projects";
import { enqueue } from "@/lib/server/queue";

/** Queues the FFmpeg render of an EDL. */
export const POST = route<{ id: string }>(
  async (_req, { user, params }) => {
    uuidParam(params.id, "EDL");
    const [edl] = await db().select().from(edls).where(eq(edls.id, params.id));
    if (!edl) throw notFound("EDL");
    const project = await requireProject(user.id, edl.projectId);
    if (edl.items.length === 0) throw new ApiError(409, "empty_edl", "Assemble the timeline before rendering.");
    const [running] = await db()
      .select({ id: renderJobs.id })
      .from(renderJobs)
      .where(and(eq(renderJobs.projectId, project.id), inArray(renderJobs.status, ["queued", "running"])));
    if (running) throw new ApiError(409, "render_running", "A render is already running for this project.");
    const [job] = await db().insert(renderJobs).values({ projectId: project.id, edlId: edl.id }).returning();
    if (!job) throw new Error("Render job insert returned no row.");
    const jobId = await enqueue({ name: "render", projectId: project.id, renderJobId: job.id });
    return Response.json({ renderJobId: job.id, jobId }, { status: 202 });
  },
  { rateLimit: { limit: 6, windowMs: 60_000 } },
);
