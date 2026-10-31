import { z } from "zod";
import { AnswerCard } from "./core";
import { PersonaRole } from "./calibration";
import { EdlItem } from "./director";
import { SectionKey } from "./project";

// Evidence Q&A Kit and Director API contracts.

export const MIN_QUESTIONS = 20;

/** One ranked question with its answer card, as the question bank prompt returns it. */
export const BankQuestion = z.object({
  text: z.string().min(8).max(300),
  personaRole: PersonaRole.nullable(),
  likelihood: z.number().min(0).max(1),
  damage: z.number().min(0).max(1),
  /** Where the question comes from: "criterion:<name>", "claim:<text>", "repo:<file:line>", "persona:<role>", "session:<key>". */
  sourceRefs: z.array(z.string()).max(6),
  card: AnswerCard,
  /** What would answer it when there is no evidence yet, such as "eval/accuracy.py". */
  suggestedArtifact: z.string().max(120).nullable(),
});
export type BankQuestion = z.infer<typeof BankQuestion>;

export const QuestionBank = z.object({ questions: z.array(BankQuestion).min(MIN_QUESTIONS).max(40) });
export type QuestionBank = z.infer<typeof QuestionBank>;

/** The one-page pre-pitch brief Muse Wonder writes with the question bank, from everything the project knows. */
export const PrePitchBrief = z.object({
  summary: z.string().max(800),
  strengths: z.array(z.string().max(300)).max(5),
  risks: z.array(z.string().max(300)).max(5),
  mustSay: z.array(z.string().max(300)).max(5),
  mustShow: z.array(z.string().max(300)).max(5),
});
export type PrePitchBrief = z.infer<typeof PrePitchBrief>;

/** questionBank.v2: the bank and the brief from one long-context call. */
export const PrePitchBriefBank = QuestionBank.extend({ brief: PrePitchBrief });
export type PrePitchBriefBank = z.infer<typeof PrePitchBriefBank>;

/** The exact numbers a slide shows, captured when it was rendered. */
export const SlideSnapshot = z.object({
  title: z.string(),
  subtitle: z.string(),
  chart: z.object({ kind: z.enum(["bar", "none"]), unit: z.string(), series: z.array(z.object({ label: z.string(), value: z.number() })) }),
  facts: z.array(z.object({ label: z.string(), value: z.string() })).max(4),
  sources: z.array(z.string()),
});
export type SlideSnapshot = z.infer<typeof SlideSnapshot>;

/** Numbers a reader should find on the slide, formatted as rendered. */
export function snapshotNumbers(s: SlideSnapshot): string[] {
  const fromChart = s.chart.series.map((p) => formatValue(p.value, s.chart.unit));
  const fromFacts = s.facts.flatMap((f) => f.value.match(/\d[\d,.]*/g) ?? []);
  return [...new Set([...fromChart, ...fromFacts])];
}

export function formatValue(value: number, unit: string): string {
  const v = Math.abs(value) >= 100 || Number.isInteger(value) ? String(Math.round(value)) : value.toFixed(1);
  return unit === "%" ? `${v}%` : unit ? `${v} ${unit}` : v;
}

const numbersIn = (s: string) => s.replace(/,/g, "").match(/\d+(?:\.\d+)?/g) ?? [];

/** Compares the numbers read off a rendered slide with its snapshot: every expected number must appear. */
export function verifySlideNumbers(expected: string[], read: string[]): { ok: boolean; missing: string[] } {
  const seen = new Set(read.flatMap(numbersIn));
  const missing = expected.filter((e) => numbersIn(e).some((n) => !seen.has(n)));
  return { ok: missing.length === 0, missing };
}

export const DrillAnswerBody = z.object({
  durationMs: z.number().int().min(0).max(120_000),
  /** Demo Mode only: the fixture answer to score instead of recorded audio. */
  demoAnswer: z.enum(["strong", "weak"]).optional(),
});

export const CreateTakeBody = z.object({
  sectionKey: SectionKey,
  /** The object key returned by POST /api/uploads/presign with kind "take". */
  key: z.string().min(1).max(300),
  durationMs: z
    .number()
    .int()
    .positive()
    .max(30 * 60_000),
  sessionId: z.string().uuid().optional(),
});

export const PatchEdlBody = z.object({ items: z.array(EdlItem).min(1).max(12) });
