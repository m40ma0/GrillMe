import { steps } from "@stage-ready/db";
import { PatchStepBody } from "@stage-ready/shared";
import { eq } from "drizzle-orm";
import { ApiError, body, notFound, route, uuidParam } from "@/lib/server/api";
import { db } from "@/lib/server/db";
import { requireProject } from "@/lib/server/projects";

/** Edit a step: name, narration, maximum duration, fallback in and out points. */
export const PATCH = route<{ id: string }>(async (req, { user, params }) => {
  uuidParam(params.id, "Step");
  const [step] = await db().select().from(steps).where(eq(steps.id, params.id));
  if (!step) throw notFound("Step");
  await requireProject(user.id, step.projectId);
  const input = await body(req, PatchStepBody);
  if ((input.fallbackOutMs ?? step.fallbackOutMs) <= (input.fallbackInMs ?? step.fallbackInMs)) throw new ApiError(400, "invalid_request", "The out-point must come after the in-point.");
  const [updated] = await db().update(steps).set(input).where(eq(steps.id, step.id)).returning();
  return Response.json({ id: updated?.id });
});
