import { route } from "@/lib/server/api";
import { requireProject } from "@/lib/server/projects";
import { loadQaKit } from "@/lib/server/qa-kit";

export const GET = route<{ id: string }>(async (_req, { user, params }) => {
  const project = await requireProject(user.id, params.id);
  return Response.json(await loadQaKit(project.id));
});
