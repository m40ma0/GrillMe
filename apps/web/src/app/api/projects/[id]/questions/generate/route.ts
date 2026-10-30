import { route } from "@/lib/server/api";
import { requireProject } from "@/lib/server/projects";
import { enqueue } from "@/lib/server/queue";

/** Rebuilds the ranked question bank, its answer cards and slides. */
export const POST = route<{ id: string }>(
  async (_req, { user, params }) => {
    const project = await requireProject(user.id, params.id);
    return Response.json({ jobId: await enqueue({ name: "questions", projectId: project.id, reason: "manual" }) }, { status: 202 });
  },
  { rateLimit: { limit: 6, windowMs: 60_000 } },
);
