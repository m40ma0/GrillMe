import { answerCards } from "@stage-ready/db";
import { AnswerCard } from "@stage-ready/shared";
import { eq } from "drizzle-orm";
import { body, notFound, route, uuidParam } from "@/lib/server/api";
import { db } from "@/lib/server/db";
import { requireProject } from "@/lib/server/projects";

const PatchCard = AnswerCard.pick({ script: true, bridgeLine: true }).partial();

/** Edits the script or bridge line; the 55-word cap still applies. */
export const PATCH = route<{ id: string }>(async (req, { user, params }) => {
  uuidParam(params.id, "Answer card");
  const [card] = await db().select().from(answerCards).where(eq(answerCards.id, params.id));
  if (!card) throw notFound("Answer card");
  await requireProject(user.id, card.projectId);
  const input = await body(req, PatchCard);
  const [updated] = await db().update(answerCards).set(input).where(eq(answerCards.id, card.id)).returning();
  return Response.json({ id: updated?.id, script: updated?.script, bridgeLine: updated?.bridgeLine });
});
