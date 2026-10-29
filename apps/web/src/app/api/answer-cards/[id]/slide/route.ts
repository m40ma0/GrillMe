import { answerCards } from "@stage-ready/db";
import { eq } from "drizzle-orm";
import { notFound, route, uuidParam } from "@/lib/server/api";
import { db } from "@/lib/server/db";
import { requireProject } from "@/lib/server/projects";
import { enqueue } from "@/lib/server/queue";

/** Queues the slide render plus verification for one answer card. */
export const POST = route<{ id: string }>(
  async (_req, { user, params }) => {
    uuidParam(params.id, "Answer card");
    const [card] = await db().select().from(answerCards).where(eq(answerCards.id, params.id));
    if (!card) throw notFound("Answer card");
    const project = await requireProject(user.id, card.projectId);
    return Response.json({ jobId: await enqueue({ name: "slides", projectId: project.id, answerCardIds: [card.id] }) }, { status: 202 });
  },
  { rateLimit: { limit: 30, windowMs: 60_000 } },
);
