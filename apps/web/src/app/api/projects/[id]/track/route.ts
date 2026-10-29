import { prompts } from "@stage-ready/ai";
import { route } from "@/lib/server/api";
import { aiFor } from "@/lib/server/ai";
import { loadEventSpec, requireProject } from "@/lib/server/projects";

export const GET = route<{ id: string }>(async (_req, { user, params }) => {
  const project = await requireProject(user.id, params.id);
  const spec = await loadEventSpec(project.id);
  if (!spec || spec.tracks.length === 0) return Response.json({ recommendation: { track: null, reasons: [] } });
  const { value } = await aiFor(project).llm.generateObject(
    prompts.trackRecommendV1({ tracks: spec.tracks, criteria: spec.criteria.map((c) => c.name), pitch: `${project.tagline}\n${project.pitchScript}` }),
  );
  const track = spec.tracks.some((t) => t.name === value.track) ? value.track : null;
  return Response.json({ recommendation: { ...value, track } });
});
