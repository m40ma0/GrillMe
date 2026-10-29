import { route } from "@/lib/server/api";
import { loadDemoGuard } from "@/lib/server/demoguard";
import { requireProject } from "@/lib/server/projects";

export const GET = route<{ id: string }>(async (_req, { user, params }) => {
  const project = await requireProject(user.id, params.id);
  return Response.json(await loadDemoGuard(project.id));
});
