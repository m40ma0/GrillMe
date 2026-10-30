import { route } from "@/lib/server/api";
import { loadDirector } from "@/lib/server/director";
import { requireProject } from "@/lib/server/projects";

export const GET = route<{ id: string }>(async (_req, { user, params }) => {
  const project = await requireProject(user.id, params.id);
  return Response.json(await loadDirector(project.id));
});
