import { eventSpecs } from "@stage-ready/db";
import { GeneratePersonasBody } from "@stage-ready/shared";
import { eq } from "drizzle-orm";
import { ApiError, body, route } from "@/lib/server/api";
import { db } from "@/lib/server/db";
import { generatePersonas } from "@/lib/server/personas";
import { loadEventSpec, requireProject } from "@/lib/server/projects";

export const POST = route<{ id: string }>(
  async (req, { user, params }) => {
    const project = await requireProject(user.id, params.id);
    const { difficulty } = await body(req, GeneratePersonasBody);
    const spec = await loadEventSpec(project.id);
    if (!spec) throw new ApiError(409, "no_event_spec", "Ingest the event page before generating personas.");
    const [row] = await db().select({ peopleNamed: eventSpecs.peopleNamed }).from(eventSpecs).where(eq(eventSpecs.projectId, project.id));
    const personas = await generatePersonas(project, spec, difficulty, row?.peopleNamed ?? []);
    return Response.json({ personas });
  },
  { rateLimit: { limit: 10, windowMs: 60_000 } },
);
