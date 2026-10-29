import { z } from "zod";

// Core schemas, as specified in docs/BUILD_PROMPT.md ("Core schemas").

export const ClaimType = z.enum(["performance", "accuracy", "feature", "security_privacy", "scale", "comparison", "market"]);
export type ClaimType = z.infer<typeof ClaimType>;

export const ClaimStatus = z.enum(["verified", "contradicted", "unverified", "not_shown"]);
export type ClaimStatus = z.infer<typeof ClaimStatus>;

export const Claim = z.object({
  text: z.string().min(3),
  type: ClaimType,
  quantity: z.object({ value: z.number(), unit: z.string() }).nullable(),
  featureName: z.string().nullable(),
  segmentStartMs: z.number().int(),
});
export type Claim = z.infer<typeof Claim>;

export const EvidenceKind = z.enum(["frame", "latency", "repo", "test", "doc"]);
export type EvidenceKind = z.infer<typeof EvidenceKind>;

export const ClaimVerdict = z.object({
  status: ClaimStatus,
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.object({ kind: EvidenceKind, ref: z.string(), summary: z.string().max(160) })),
  suggestedRewrite: z.string().max(140).nullable(),
});
export type ClaimVerdict = z.infer<typeof ClaimVerdict>;

export const JudgeTurn = z.object({
  interrupt: z.boolean(),
  personaId: z.string().uuid().nullable(),
  kind: z.enum(["interrupt", "question", "follow_up"]).nullable(),
  text: z.string().max(220).nullable(),
  trigger: z.enum(["claim", "coverage_gap", "over_time", "vague_answer", "qa_phase"]).nullable(),
});
export type JudgeTurn = z.infer<typeof JudgeTurn>;

export const EventSpec = z.object({
  name: z.string(),
  tracks: z.array(z.object({ name: z.string(), description: z.string() })),
  criteria: z.array(z.object({ name: z.string(), description: z.string(), weight: z.number().min(0).max(1) })),
  weightsInferred: z.boolean(),
  requiredTech: z.array(z.string()),
  requirements: z.object({
    videoMaxSec: z.number().nullable(),
    repoPublic: z.boolean().nullable(),
    deadlineIso: z.string().nullable(),
  }),
});
export type EventSpec = z.infer<typeof EventSpec>;

export const WinnerProfile = z.object({
  title: z.string(),
  placement: z.string(),
  inputType: z.string(),
  outputType: z.string(),
  demoStructure: z.array(z.string()),
  strongestMomentSec: z.number().nullable(),
  domain: z.string(),
  track: z.string().nullable(),
  tech: z.array(z.string()),
  sourceQuotes: z.record(z.string(), z.string()),
});
export type WinnerProfile = z.infer<typeof WinnerProfile>;

export const ANSWER_MAX_WORDS = 55;
export const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

export const AnswerCard = z.object({
  script: z.string().refine((s) => wordCount(s) <= 55, "55 words max"),
  bridgeLine: z.string().max(120),
  evidenceRefs: z.array(z.string()),
});
export type AnswerCard = z.infer<typeof AnswerCard>;
