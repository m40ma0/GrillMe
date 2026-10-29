import { renderJobs } from "@stage-ready/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { ApiError, notFound, route, uuidParam } from "@/lib/server/api";
import { db } from "@/lib/server/db";
import { requireProject } from "@/lib/server/projects";
import { presignGet } from "@/lib/server/storage";

const Kind = z.enum(["mp4", "srt", "thumbnail", "chapters"]);

/** Redirects to a short-lived URL for one render output (?kind=mp4|srt|thumbnail|chapters). */
export const GET = route<{ id: string }>(async (req, { user, params }) => {
  uuidParam(params.id, "Render");
  const kind = Kind.parse(new URL(req.url).searchParams.get("kind"));
  const [job] = await db().select().from(renderJobs).where(eq(renderJobs.id, params.id));
  if (!job) throw notFound("Render");
  await requireProject(user.id, job.projectId);
  const uri = job.outputs[kind];
  const url = uri ? await presignGet(uri) : null;
  if (!url) throw new ApiError(404, "not_found", "That output is not ready.");
  return new Response(null, { status: 302, headers: { location: url, "cache-control": "private, max-age=600" } });
});
