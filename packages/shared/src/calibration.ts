import { z } from "zod";
import { EventSpec, WinnerProfile } from "./core";

// ---------- Event ingestion ----------

/**
 * What the model returns for an event page. `sourceQuotes` maps a field path
 * ("name", "tracks.0", "criteria.1", "criteria.1.weight", "requiredTech.0",
 * "requirements.videoMaxSec", ...) to the verbatim span that supports it.
 * `peopleNamed` lists real people on the page (judges, hosts) so persona
 * generation can refuse to use them. It is never shown in a persona.
 */
export const EventSpecExtraction = EventSpec.extend({
  sourceQuotes: z.record(z.string(), z.string()),
  peopleNamed: z.array(z.string()),
});
export type EventSpecExtraction = z.infer<typeof EventSpecExtraction>;

export const IngestEventBody = z
  .object({ urls: z.array(z.string().url()).max(10).default([]), text: z.string().max(200_000).optional() })
  .refine((b) => b.urls.length > 0 || (b.text?.trim().length ?? 0) > 0, "Add an event URL or paste the event text.");
export type IngestEventBody = z.infer<typeof IngestEventBody>;

export const WEIGHT_TOLERANCE = 0.0005;

export const CriterionInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(600),
  weight: z.number().min(0).max(1),
});
export type CriterionInput = z.infer<typeof CriterionInput>;

/** Saving criteria is only allowed when weights sum to 100%. */
export const CriteriaUpdate = z
  .array(CriterionInput)
  .min(1, "Add at least one criterion.")
  .refine((list) => Math.abs(list.reduce((sum, c) => sum + c.weight, 0) - 1) <= WEIGHT_TOLERANCE, {
    message: "Criteria weights must sum to 100%.",
  });

export const EventSpecUpdate = z.object({
  name: z.string().trim().max(200),
  tracks: EventSpec.shape.tracks,
  criteria: CriteriaUpdate,
  requiredTech: z.array(z.string().trim().min(1)),
  requirements: EventSpec.shape.requirements,
  weightsInferred: z.boolean(),
});
export type EventSpecUpdate = z.infer<typeof EventSpecUpdate>;

// ---------- Past winners and patterns ----------

export const WinnersBody = z
  .object({ urls: z.array(z.string().url()).max(20).default([]), text: z.string().max(200_000).optional() })
  .refine((b) => b.urls.length > 0 || (b.text?.trim().length ?? 0) > 0, "Add a winner URL or paste the winner text.");
export type WinnersBody = z.infer<typeof WinnersBody>;

/** One page can describe several winners (a results post). */
export const WinnerExtraction = z.object({ winners: z.array(WinnerProfile) });
export type WinnerExtraction = z.infer<typeof WinnerExtraction>;

export const CheckResult = z.enum(["pass", "fail", "unknown"]);
export type CheckResult = z.infer<typeof CheckResult>;

export const PatternEvidence = z.object({ winnerTitle: z.string(), quote: z.string(), sourceUrl: z.string().nullable() });

export const WinningPattern = z.object({
  statement: z.string().max(240),
  evidence: z.array(PatternEvidence).min(2),
  check: z.string().max(240),
  checkResult: CheckResult,
  checkDetail: z.string().max(240).nullable(),
});
export type WinningPattern = z.infer<typeof WinningPattern>;

export const WinningPatterns = z.object({ patterns: z.array(WinningPattern).max(6) });
export type WinningPatterns = z.infer<typeof WinningPatterns>;

export const TrackRecommendation = z.object({
  track: z.string().nullable(),
  reasons: z.array(z.object({ criterion: z.string(), reason: z.string().max(240) })),
});
export type TrackRecommendation = z.infer<typeof TrackRecommendation>;

// ---------- Repo digest ----------

export const RepoBody = z.object({
  githubFullName: z.string().regex(/^[\w.-]+\/[\w.-]+$/, "Use the owner/name form, for example vercel/next.js."),
  ref: z.string().max(200).optional(),
});
export type RepoBody = z.infer<typeof RepoBody>;

export const RepoFindingKind = z.enum(["dependency", "mock_response", "secret", "todo", "test", "capability"]);
export type RepoFindingKind = z.infer<typeof RepoFindingKind>;
export const Severity = z.enum(["info", "low", "medium", "high"]);
export type Severity = z.infer<typeof Severity>;

export const RepoFinding = z.object({
  kind: RepoFindingKind,
  filePath: z.string(),
  line: z.number().int().positive().nullable(),
  summary: z.string().max(240),
  severity: Severity,
});
export type RepoFinding = z.infer<typeof RepoFinding>;

export const RepoDependency = z.object({ name: z.string(), version: z.string(), manifest: z.string() });
export type RepoDependency = z.infer<typeof RepoDependency>;

export const RepoDigest = z.object({
  githubFullName: z.string(),
  commitSha: z.string(),
  visibility: z.enum(["public", "private", "unknown"]),
  fileCount: z.number().int(),
  files: z.array(z.object({ path: z.string(), bytes: z.number().int() })),
  dependencies: z.array(RepoDependency),
  findings: z.array(RepoFinding),
  readme: z.string().nullable(),
});
export type RepoDigest = z.infer<typeof RepoDigest>;

/** Model pass over the digest: capabilities with file:line evidence. */
export const RepoCapabilities = z.object({
  capabilities: z.array(z.object({ summary: z.string().max(240), filePath: z.string(), line: z.number().int().positive().nullable() })).max(30),
});
export type RepoCapabilities = z.infer<typeof RepoCapabilities>;

// ---------- Personas ----------

export const PersonaRole = z.enum(["technical", "impact", "product"]);
export type PersonaRole = z.infer<typeof PersonaRole>;

export const PERSONA_ROLE_LABEL: Record<PersonaRole, string> = {
  technical: "Technical judge",
  impact: "Impact and domain judge",
  product: "Product and business judge",
};

export const VOICE_PRESETS: Record<PersonaRole, string> = {
  technical: "preset-a",
  impact: "preset-b",
  product: "preset-c",
};

export const Persona = z.object({
  role: PersonaRole,
  difficulty: z.number().int().min(1).max(5),
  criteriaWeights: z.record(z.string(), z.number().min(0).max(1)),
  questionStyle: z.string().min(10).max(240),
  voicePreset: z.string(),
  isFictional: z.literal(true),
});
export type Persona = z.infer<typeof Persona>;

/** The model writes only the question style; roles, weights and voices are deterministic. */
export const PersonaStyles = z.object({
  styles: z.array(z.object({ role: PersonaRole, questionStyle: z.string().min(10).max(240) })).length(3),
});
export type PersonaStyles = z.infer<typeof PersonaStyles>;

export const GeneratePersonasBody = z.object({ difficulty: z.number().int().min(1).max(5).default(3) });

// ---------- Compliance ----------

export const ComplianceItem = z.object({
  id: z.enum(["video_limit", "required_tech", "repo_public", "deadline"]),
  label: z.string(),
  status: CheckResult,
  detail: z.string(),
});
export type ComplianceItem = z.infer<typeof ComplianceItem>;

/** True when text mentions any of the named people (full name or any part of 3+ letters). Personas never carry real names. */
export function mentionsPerson(text: string, people: string[]): boolean {
  const lower = text.toLowerCase();
  return people.some((person) => {
    const parts = person
      .toLowerCase()
      .split(/\s+/)
      .filter((p) => p.length >= 3);
    return lower.includes(person.toLowerCase()) || parts.some((part) => new RegExp(`\\b${part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lower));
  });
}
