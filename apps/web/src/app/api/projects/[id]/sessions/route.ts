import { signSessionToken } from "@stage-ready/config";
import { personas, sessions } from "@stage-ready/db";
import { CreateSessionBody, type CreateSessionResponse } from "@stage-ready/shared";
import { eq } from "drizzle-orm";
import { ApiError, body, route } from "@/lib/server/api";
import { db } from "@/lib/server/db";
import { env } from "@/lib/server/env";
import { requireProject } from "@/lib/server/projects";

/** Creates a rehearsal session and a WebSocket token valid for 15 minutes, scoped to it. */
export const POST = route<{ id: string }>(
  async (req, { user, params }) => {
    const project = await requireProject(user.id, params.id);
    const input = await body(req, CreateSessionBody);
    if (input.mode === "section_drill" && !input.drillSection) throw new ApiError(400, "invalid_request", "Pick the section to drill.");
    const judges = await db().select({ id: personas.id }).from(personas).where(eq(personas.projectId, project.id));
    if (judges.length === 0) throw new ApiError(409, "no_personas", "Build the judge personas in Calibration first.");
    const [session] = await db()
      .insert(sessions)
      .values({ projectId: project.id, mode: input.mode, summary: { difficulty: input.difficulty, drillSection: input.drillSection ?? null, consentAt: new Date().toISOString() } })
      .returning({ id: sessions.id });
    if (!session) throw new Error("Session insert returned no row.");
    const wsToken = await signSessionToken({ sid: session.id, pid: project.id, uid: user.id }, env().REALTIME_JWT_SECRET);
    const response: CreateSessionResponse = { sessionId: session.id, wsUrl: `${env().REALTIME_URL.replace(/\/+$/, "")}/ws`, wsToken };
    return Response.json(response, { status: 201 });
  },
  { rateLimit: { limit: 20, windowMs: 60_000 } },
);
