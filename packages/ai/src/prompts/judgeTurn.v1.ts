import { JudgeTurn } from "@stage-ready/shared";
import { UNTRUSTED_NOTICE, quoted } from "../json";
import type { Prompt } from "../types";

export interface JudgeCandidate {
  personaId: string;
  role: string;
  questionStyle: string;
  criteria: Record<string, number>;
}

export interface TurnTrigger {
  trigger: "claim" | "coverage_gap" | "over_time" | "vague_answer" | "qa_phase";
  detail: string;
  personaId: string;
}

export interface JudgeTurnInput {
  eventName: string;
  difficulty: number;
  candidates: JudgeCandidate[];
  triggers: TurnTrigger[];
  recentTranscript: string[];
  sectionKey: string | null;
  phase: "pitch" | "qa";
}

const TEMPLATES: Record<TurnTrigger["trigger"], (detail: string) => string> = {
  claim: (d) => `You said "${d.replace(/[.!?]+$/, "").slice(0, 90)}". What measurement backs that up?`,
  coverage_gap: (d) => `You have not covered ${d} yet. How does your project address it?`,
  over_time: (d) => `You are over time on ${d}. What is the one thing we need to know here?`,
  vague_answer: () => "That was general. Can you give one concrete number or example?",
  qa_phase: (d) => `${d}`,
};

/** Interruption decision and question text. Eligibility (cooldowns, boundaries) is enforced in code before and after. */
export function judgeTurnV1(input: JudgeTurnInput): Prompt<JudgeTurn> {
  const personas = input.candidates
    .map((c) => `- ${c.personaId}: ${c.role}, a fictional judge for ${input.eventName}. Scores only against ${JSON.stringify(c.criteria)}. Style: ${c.questionStyle}`)
    .join("\n");
  return {
    id: "judgeTurn",
    version: 1,
    model: "spark",
    schema: JudgeTurn,
    system: [
      "You decide whether one of these fictional judges interrupts now, and write the question.",
      personas,
      `Difficulty ${input.difficulty} (1 friendly to 5 hostile). Ask one question, 30 words or fewer. Never claim to be a real person. Prefer questions that make the presenter show evidence.`,
      'Only interrupt for one of the listed triggers, with that trigger\'s personaId. Use kind "question" in the Q&A phase, "follow_up" for a vague answer, otherwise "interrupt".',
      UNTRUSTED_NOTICE,
    ].join("\n"),
    user: [
      quoted("triggers", JSON.stringify(input.triggers)),
      quoted("recent_transcript", input.recentTranscript.slice(-8).join("\n"), 6_000),
      `Section: ${input.sectionKey ?? "unknown"}. Phase: ${input.phase}.`,
    ].join("\n\n"),
    mock: () => {
      const t = input.triggers[0];
      if (!t) return { interrupt: false, personaId: null, kind: null, text: null, trigger: null };
      return {
        interrupt: true,
        personaId: t.personaId,
        kind: t.trigger === "vague_answer" ? "follow_up" : input.phase === "qa" ? "question" : "interrupt",
        text: TEMPLATES[t.trigger](t.detail).slice(0, 220),
        trigger: t.trigger,
      };
    },
  };
}
