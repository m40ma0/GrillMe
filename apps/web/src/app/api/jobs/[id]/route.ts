import { JobProgress, cancelKey, type JobStatus } from "@stage-ready/shared";
import { notFound, route } from "@/lib/server/api";
import { requireProject } from "@/lib/server/projects";
import { queue, redis } from "@/lib/server/queue";

async function ownedJob(userId: string, id: string) {
  const job = await queue().getJob(id);
  if (!job) throw notFound("Job");
  await requireProject(userId, String((job.data as { projectId?: string }).projectId ?? ""));
  return job;
}

export const GET = route<{ id: string }>(async (_req, { user, params }) => {
  const job = await ownedJob(user.id, params.id);
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

/** Cancels a job: waiting jobs are removed; a running job stops at its next progress update. */
export const DELETE = route<{ id: string }>(async (_req, { user, params }) => {
  const job = await ownedJob(user.id, params.id);
  const state = await job.getState();
  if (state === "waiting" || state === "delayed" || state === "prioritized") {
    await job.remove();
    return Response.json({ cancelled: true, state: "removed" });
  }
  if (state === "active") {
    await redis().set(cancelKey(String(job.id)), "1", "EX", 600);
    return Response.json({ cancelled: true, state: "stopping" });
  }
  return Response.json({ cancelled: false, state });
});
