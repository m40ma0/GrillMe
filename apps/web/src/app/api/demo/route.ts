import { seedDemoProject } from "@stage-ready/db/seed";
import { ApiError, route } from "@/lib/server/api";
import { db } from "@/lib/server/db";

/** "Try Demo Mode": (re)creates the fictional fixture project for this user and opens it. */
export const POST = route(
  async (_req, { user }) => {
    const projectId = await seedDemoProject(db(), user.id);
    if (!projectId) throw new ApiError(500, "seed_failed", "The Demo Mode project could not be created.");
    // Relative Location: the dev server binds 0.0.0.0, which req.url would leak into the redirect.
    return new Response(null, { status: 303, headers: { location: `/projects/${projectId}` } });
  },
  { rateLimit: { limit: 5, windowMs: 60_000 } },
);
