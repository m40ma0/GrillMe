import { takes } from "@stage-ready/db";
import { eq } from "drizzle-orm";
import { notFound, route, uuidParam } from "@/lib/server/api";
import { db } from "@/lib/server/db";
import { requireProject } from "@/lib/server/projects";
import { presignGet } from "@/lib/server/storage";

/** A short-lived URL to preview an uploaded take; fixture takes have none. */
export const GET = route<{ id: string }>(async (_req, { user, params }) => {
  uuidParam(params.id, "Take");
  const [take] = await db().select().from(takes).where(eq(takes.id, params.id));
  if (!take) throw notFound("Take");
  await requireProject(user.id, take.projectId);
  return Response.json({ url: take.mediaUrl ? await presignGet(take.mediaUrl) : null });
});
