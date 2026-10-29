import { sessions } from "@stage-ready/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { ApiError, body, route } from "@/lib/server/api";
import { db } from "@/lib/server/db";
import { requireProject } from "@/lib/server/projects";
import { presignPut } from "@/lib/server/storage";

const PresignBody = z.object({
  projectId: z.string().uuid(),
  kind: z.enum(["recording", "take"]),
  sessionId: z.string().uuid().optional(),
  contentType: z.enum(["video/webm", "video/mp4"]),
  bytes: z
    .number()
    .int()
    .positive()
    .max(4 * 1024 * 1024 * 1024),
});

/** Presigned PUT for takes and recordings. Only for projects that opted in to cloud upload. */
export const POST = route(
  async (req, { user }) => {
    const input = await body(req, PresignBody);
    const project = await requireProject(user.id, input.projectId);
    if (!project.cloudUploadEnabled) throw new ApiError(409, "cloud_upload_off", "Cloud upload is off for this project, so recordings stay on this computer.");
    if (input.sessionId) {
      const [s] = await db()
        .select({ id: sessions.id })
        .from(sessions)
        .where(and(eq(sessions.id, input.sessionId), eq(sessions.projectId, project.id)));
      if (!s) throw new ApiError(404, "not_found", "Session not found.");
    }
    const ext = input.contentType === "video/mp4" ? "mp4" : "webm";
    const key = `projects/${project.id}/${input.kind}s/${input.sessionId ?? crypto.randomUUID()}.${ext}`;
    return Response.json(await presignPut(key, input.contentType));
  },
  { rateLimit: { limit: 30, windowMs: 60_000 } },
);
