import "server-only";
import { answerCards, fixTasks, personas, questions, slides } from "@stage-ready/db";
import type { SlideSnapshot } from "@stage-ready/shared";
import { and, eq } from "drizzle-orm";
import type { QaKitDTO } from "@/lib/types";
import { db } from "./db";

/** The ranked question bank with answer cards and slide status, highest likelihood × damage first. */
export async function loadQaKit(projectId: string): Promise<QaKitDTO> {
  const [rows, gaps] = await Promise.all([
    db()
      .select({ q: questions, card: answerCards, slide: slides, personaRole: personas.role })
      .from(questions)
      .leftJoin(answerCards, eq(answerCards.questionId, questions.id))
      .leftJoin(slides, eq(slides.answerCardId, answerCards.id))
      .leftJoin(personas, eq(personas.id, questions.personaId))
      .where(eq(questions.projectId, projectId)),
    db()
      .select({ id: fixTasks.id })
      .from(fixTasks)
      .where(and(eq(fixTasks.projectId, projectId), eq(fixTasks.origin, "question"), eq(fixTasks.status, "open"))),
  ]);
  const list = rows
    .map(({ q, card, slide, personaRole }) => ({
      id: q.id,
      text: q.text,
      personaRole,
      likelihood: q.likelihood,
      damage: q.damage,
      askedCount: q.askedCount,
      lastScore: q.lastScore,
      sourceRefs: q.sourceRefs,
      model: q.modelId ? { modelId: q.modelId, latencyMs: q.modelLatencyMs } : null,
      card: card ? { id: card.id, script: card.script, bridgeLine: card.bridgeLine, evidenceRefs: card.evidenceRefs } : null,
      slide: slide ? { id: slide.id, verification: slide.verification, snapshot: slide.dataSnapshot as SlideSnapshot, hasPng: Boolean(slide.pngUrl) } : null,
    }))
    .sort((a, b) => b.likelihood * b.damage - a.likelihood * a.damage);
  return { questions: list, appendix: rows.some((r) => Boolean(r.slide?.pdfUrl)), gapTasks: gaps.length };
}
