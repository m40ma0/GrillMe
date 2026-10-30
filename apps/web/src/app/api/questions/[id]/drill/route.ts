import { answerCards, projects, questions } from "@stage-ready/db";
import { DrillAnswerBody, scoreDrillAnswer } from "@stage-ready/shared";
import { eq, sql } from "drizzle-orm";
import { ApiError, notFound, route, uuidParam } from "@/lib/server/api";
import { db } from "@/lib/server/db";
import { requireProject } from "@/lib/server/projects";
import { transcribeAudio } from "@/lib/server/vision";

const WEAK_DEMO_ANSWER = "Um, that's a good question. I think it works pretty well for most people, and the team is really happy with how it turned out so far.";

/**
 * Scores one drill answer: multipart form with `audio` and `durationMs`, or (Demo Mode only)
 * JSON { durationMs, demoAnswer }. Updates the question's drill history for spaced repetition.
 */
export const POST = route<{ id: string }>(
  async (req, { user, params }) => {
    uuidParam(params.id, "Question");
    const [row] = await db()
      .select({ question: questions, card: answerCards, demoMode: projects.demoMode })
      .from(questions)
      .innerJoin(projects, eq(projects.id, questions.projectId))
      .leftJoin(answerCards, eq(answerCards.questionId, questions.id))
      .where(eq(questions.id, params.id));
    if (!row) throw notFound("Question");
    await requireProject(user.id, row.question.projectId);
    if (!row.card) throw new ApiError(409, "no_card", "This question has no answer card yet.");

    let answer: string;
    let durationMs: number;
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await req.formData();
      const audio = form.get("audio");
      if (!(audio instanceof Blob) || audio.size === 0) throw new ApiError(400, "invalid_request", "Attach the recorded answer as `audio`.");
      if (audio.size > 10 * 1024 * 1024) throw new ApiError(413, "too_large", "A drill answer must be under 10 MB.");
      durationMs = DrillAnswerBody.shape.durationMs.parse(Number(form.get("durationMs")));
      answer = (await transcribeAudio(await audio.arrayBuffer(), audio.type || "audio/webm")).text;
    } else {
      const input = DrillAnswerBody.parse(await req.json().catch(() => ({})));
      if (!row.demoMode || !input.demoAnswer) throw new ApiError(400, "invalid_request", "Send the recorded answer as multipart form data.");
      answer = input.demoAnswer === "strong" ? row.card.script : WEAK_DEMO_ANSWER;
      durationMs = input.durationMs;
    }
    const score = scoreDrillAnswer(answer, durationMs, row.card);
    await db()
      .update(questions)
      .set({ askedCount: sql`${questions.askedCount} + 1`, lastScore: score.total })
      .where(eq(questions.id, row.question.id));
    return Response.json({ transcript: answer, durationMs, score });
  },
  { rateLimit: { limit: 60, windowMs: 60_000 } },
);
