import { sectionPlans, takes } from "@stage-ready/db";
import { CreateTakeBody } from "@stage-ready/shared";
import { and, eq } from "drizzle-orm";
import { ApiError, body, route } from "@/lib/server/api";
import { db } from "@/lib/server/db";
import { loadTakes } from "@/lib/server/director";
import { requireProject } from "@/lib/server/projects";
import { enqueue } from "@/lib/server/queue";
import { s3Uri } from "@/lib/server/storage";

export const GET = route<{ id: string }>(async (_req, { user, params }) => {
  const project = await requireProject(user.id, params.id);
  return Response.json({ takes: await loadTakes(project.id) });
});

/** Registers an uploaded take; queues transcription and scoring. */
export const POST = route<{ id: string }>(
  async (req, { user, params }) => {
    const project = await requireProject(user.id, params.id);
    if (!project.cloudUploadEnabled) throw new ApiError(409, "cloud_upload_off", "Turn on cloud upload for this project to record takes: they are transcribed and rendered on the server.");
    const input = await body(req, CreateTakeBody);
    if (!input.key.startsWith(`projects/${project.id}/takes/`)) throw new ApiError(400, "invalid_request", "That upload key does not belong to this project.");
    const [section] = await db()
      .select()
      .from(sectionPlans)
      .where(and(eq(sectionPlans.projectId, project.id), eq(sectionPlans.key, input.sectionKey)));
    if (!section) throw new ApiError(409, "no_section", "That section is not in the section plan.");
    const [take] = await db()
      .insert(takes)
      .values({ projectId: project.id, sectionPlanId: section.id, sessionId: input.sessionId ?? null, mediaUrl: s3Uri(input.key), durationMs: input.durationMs, status: "uploaded" })
      .returning();
    if (!take) throw new Error("Take insert returned no row.");
    const jobId = await enqueue({ name: "take-process", projectId: project.id, takeId: take.id });
    return Response.json({ takeId: take.id, jobId }, { status: 201 });
  },
  { rateLimit: { limit: 60, windowMs: 60_000 } },
);
