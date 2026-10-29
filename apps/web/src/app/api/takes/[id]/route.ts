import { takes } from "@stage-ready/db";
import { eq } from "drizzle-orm";
import { notFound, route, uuidParam } from "@/lib/server/api";
import { db } from "@/lib/server/db";
import { requireProject } from "@/lib/server/projects";

export const DELETE = route<{ id: string }>(async (_req, { user, params }) => {
  uuidParam(params.id, "Take");
  const [take] = await db().select().from(takes).where(eq(takes.id, params.id));
  if (!take) throw notFound("Take");
  await requireProject(user.id, take.projectId);
  await db().delete(takes).where(eq(takes.id, take.id));
  return new Response(null, { status: 204 });
});
