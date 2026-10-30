import { route } from "@/lib/server/api";
import { computeProjectCompliance, loadEventSpec, loadSectionPlan, requireProject } from "@/lib/server/projects";

export const GET = route<{ id: string }>(async (_req, { user, params }) => {
  const project = await requireProject(user.id, params.id);
  const [spec, plan] = await Promise.all([loadEventSpec(project.id), loadSectionPlan(project.id)]);
  return Response.json({ items: await computeProjectCompliance(project, spec, plan) });
});
