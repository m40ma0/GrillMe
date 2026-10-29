import { signSessionToken } from "@stage-ready/config";
import { sessions } from "@stage-ready/db";
import { eq } from "drizzle-orm";
import { ApiError, notFound, route, uuidParam } from "@/lib/server/api";
import { db } from "@/lib/server/db";
import { env } from "@/lib/server/env";
import { requireProject } from "@/lib/server/projects";

/** A fresh 15-minute WebSocket token for a live session, so the companion can join it. */
export const POST = route<{ id: string }>(
  async (_req, { user, params }) => {
    uuidParam(params.id, "Session");
    const [session] = await db().select().from(sessions).where(eq(sessions.id, params.id));
    if (!session) throw notFound("Session");
    const project = await requireProject(user.id, session.projectId);
    if (session.endedAt) throw new ApiError(409, "session_ended", "This session has ended.");
    const wsToken = await signSessionToken({ sid: session.id, pid: project.id, uid: user.id }, env().REALTIME_JWT_SECRET);
    return Response.json({ wsUrl: `${env().REALTIME_URL.replace(/\/+$/, "")}/ws`, wsToken });
  },
  { rateLimit: { limit: 20, windowMs: 60_000 } },
);
