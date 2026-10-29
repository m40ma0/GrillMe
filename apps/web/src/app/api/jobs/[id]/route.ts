import { JobProgress, type JobStatus } from "@stage-ready/shared";
import { notFound, route } from "@/lib/server/api";
import { requireProject } from "@/lib/server/projects";
import { queue } from "@/lib/server/queue";

export const GET = route<{ id: string }>(async (_req, { user, params }) => {
  const job = await queue().getJob(params.id);
  if (!job) throw notFound("Job");
  await requireProject(user.id, String((job.data as { projectId?: string }).projectId ?? ""));
  const state = await job.getState();
  const progress = JobProgress.safeParse(job.progress);
  const status: JobStatus = {
    id: String(job.id),
    name: job.name,
    state: (["waiting", "active", "completed", "failed", "delayed"] as const).find((s) => s === state) ?? (state === "prioritized" || state === "waiting-children" ? "waiting" : "unknown"),
    progress: progress.success
      ? { pct: Math.max(0, Math.min(100, progress.data.pct)), step: progress.data.step }
      : { pct: state === "completed" ? 100 : 0, step: state === "waiting" ? "Waiting for a worker" : "" },
    error: job.failedReason ?? null,
    result: job.returnvalue ?? null,
  };
  return Response.json(status);
});
