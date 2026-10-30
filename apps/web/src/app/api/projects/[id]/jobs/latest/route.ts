import { JobPayload } from "@stage-ready/shared";
import { z } from "zod";
import { route, uuidParam } from "@/lib/server/api";
import { requireProject } from "@/lib/server/projects";
import { queue } from "@/lib/server/queue";

const Name = z.enum(JobPayload.options.map((o) => o.shape.name.value) as [string, ...string[]]);
/** Finished jobs older than this are not resumed. */
const RECENT_MS = 60 * 60_000;

/**
 * The project's most recent job of one kind (?name=repo-digest): running, queued, or finished in the last
 * hour. Panels call this on mount and after a failed request, so a reload never loses a running job.
 */
export const GET = route<{ id: string }>(async (req, { user, params }) => {
  const project = await requireProject(user.id, uuidParam(params.id));
  const name = Name.parse(new URL(req.url).searchParams.get("name"));
  const jobs = await queue().getJobs(["active", "waiting", "delayed", "prioritized", "failed", "completed"], 0, 300);
  const mine = jobs.filter((j) => j && j.name === name && (j.data as { projectId?: string }).projectId === project.id).sort((a, b) => b.timestamp - a.timestamp);
  const latest = mine[0];
  if (!latest?.id) return Response.json({ job: null });
  const state = await latest.getState();
  const finished = state === "completed" || state === "failed";
  if (finished && Date.now() - (latest.finishedOn ?? latest.timestamp) > RECENT_MS) return Response.json({ job: null });
  return Response.json({ job: { id: String(latest.id), state } });
});
