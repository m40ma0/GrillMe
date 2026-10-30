import { RepoBody } from "@stage-ready/shared";
import { body, route } from "@/lib/server/api";
import { sealedGitHubToken } from "@/lib/server/auth";
import { requireProject } from "@/lib/server/projects";
import { enqueue } from "@/lib/server/queue";

export const POST = route<{ id: string }>(
  async (req, { user, params }) => {
    const project = await requireProject(user.id, params.id);
    const input = await body(req, RepoBody);
    const githubTokenSealed = await sealedGitHubToken();
    const jobId = await enqueue({
      name: "repo-digest",
      projectId: project.id,
      githubFullName: input.githubFullName,
      ...(input.ref ? { ref: input.ref } : {}),
      ...(githubTokenSealed ? { githubTokenSealed } : {}),
    });
    return Response.json({ jobId }, { status: 202 });
  },
  { rateLimit: { limit: 6, windowMs: 60_000 }, guests: "link a repo" },
);
