import { projects, sectionPlans } from "@stage-ready/db";
import { CreateProjectBody, DEFAULT_VIDEO_LIMIT_SEC, autoSectionPlan } from "@stage-ready/shared";
import { body, route } from "@/lib/server/api";
import { db } from "@/lib/server/db";
import { listProjects, toProjectDTO } from "@/lib/server/projects";

export const GET = route(async (_req, { user }) => Response.json({ projects: await listProjects(user.id) }));

export const POST = route(
  async (req, { user }) => {
    const input = await body(req, CreateProjectBody);
    const project = await db().transaction(async (tx) => {
      const [row] = await tx
        .insert(projects)
        .values({ ownerId: user.id, name: input.name, tagline: input.tagline, timezone: input.timezone, videoLimitSec: DEFAULT_VIDEO_LIMIT_SEC, setupStep: 1 })
        .returning();
      if (!row) throw new Error("Project insert returned no row.");
      await tx.insert(sectionPlans).values(autoSectionPlan(row.videoLimitSec).map((s, order) => ({ projectId: row.id, order, ...s })));
      return row;
    });
    return Response.json({ project: toProjectDTO(project) }, { status: 201 });
  },
  { guests: "create your own project" },
);
