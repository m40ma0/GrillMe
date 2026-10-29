import { WinnersBody } from "@stage-ready/shared";
import { body, route } from "@/lib/server/api";
import { requireProject } from "@/lib/server/projects";
import { enqueue } from "@/lib/server/queue";

export const POST = route<{ id: string }>(
  async (req, { user, params }) => {
    const project = await requireProject(user.id, params.id);
    const input = await body(req, WinnersBody);
    const jobId = await enqueue({ name: "winners", projectId: project.id, urls: input.urls, ...(input.text ? { text: input.text } : {}) });
    return Response.json({ jobId }, { status: 202 });
  },
  { rateLimit: { limit: 10, windowMs: 60_000 } },
);
