import { projects, sectionPlans } from "@stage-ready/db";
import { PatchProjectBody } from "@stage-ready/shared";
import { eq } from "drizzle-orm";
import { ApiError, body, route } from "@/lib/server/api";
import { db } from "@/lib/server/db";
import { loadBundle, requireProject } from "@/lib/server/projects";

export const GET = route<{ id: string }>(async (_req, { user, params }) => Response.json(await loadBundle(await requireProject(user.id, params.id))));

export const PATCH = route<{ id: string }>(async (req, { user, params }) => {
  const project = await requireProject(user.id, params.id);
  const { sectionPlan, ...fields } = await body(req, PatchProjectBody);
  if (sectionPlan && new Set(sectionPlan.map((s) => s.key)).size !== sectionPlan.length) throw new ApiError(400, "invalid_request", "Each section can appear only once.");
  await db().transaction(async (tx) => {
    if (Object.keys(fields).length > 0)
      await tx
        .update(projects)
        .set({ ...fields, setupStep: fields.setupStep === undefined ? undefined : Math.max(project.setupStep, fields.setupStep) })
        .where(eq(projects.id, project.id));
    if (sectionPlan) {
      await tx.delete(sectionPlans).where(eq(sectionPlans.projectId, project.id));
      await tx.insert(sectionPlans).values(sectionPlan.map((s, order) => ({ projectId: project.id, order, ...s })));
    }
  });
  return Response.json(await loadBundle(await requireProject(user.id, project.id)));
});
