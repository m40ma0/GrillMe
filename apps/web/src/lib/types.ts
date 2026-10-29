import type { CheckResult, ClaimStatus, ComplianceItem, SessionSummary, Persona, RepoFinding, SectionPlanItem, WinnerProfile, WinningPattern } from "@stage-ready/shared";

// JSON shapes the API returns and server components pass to client components.

export interface ProjectDTO {
  id: string;
  name: string;
  tagline: string;
  timezone: string;
  videoLimitSec: number;
  demoMode: boolean;
  pitchScript: string;
  submissionText: string;
  setupStep: number;
  cloudUploadEnabled: boolean;
}

export interface CriterionDTO {
  id: string;
  name: string;
  description: string;
  weight: number;
  sourceQuote: string | null;
}

export interface EventSpecDTO {
  id: string;
  name: string;
  sourceUrls: string[];
  tracks: { name: string; description: string }[];
  criteria: CriterionDTO[];
  weightsInferred: boolean;
  requiredTech: string[];
  requirements: { videoMaxSec: number | null; repoPublic: boolean | null; deadlineIso: string | null };
  sourceQuotes: Record<string, string>;
  droppedFields: string[];
  confirmedAt: string | null;
}

export interface WinnerDTO {
  id: string;
  sourceUrl: string | null;
  profile: WinnerProfile;
}

export interface PatternDTO extends WinningPattern {
  id: string;
  checkResult: CheckResult;
}

export interface RepoDTO {
  githubFullName: string;
  commitSha: string | null;
  visibility: "public" | "private" | "unknown";
  fileCount: number | null;
  digestTokens: number | null;
  findingCounts: Partial<Record<RepoFinding["kind"], number>>;
  topFindings: (RepoFinding & { id: string })[];
}

export interface PersonaDTO extends Persona {
  id: string;
}

export interface ProjectBundle {
  project: ProjectDTO;
  eventSpec: EventSpecDTO | null;
  winners: WinnerDTO[];
  patterns: PatternDTO[];
  repo: RepoDTO | null;
  personas: PersonaDTO[];
  sectionPlan: SectionPlanItem[];
  compliance: ComplianceItem[];
}

export interface ProjectCardDTO {
  id: string;
  name: string;
  tagline: string;
  demoMode: boolean;
  eventName: string | null;
  deadlineIso: string | null;
  timezone: string;
  lastScore: number | null;
  openFixTasks: number;
  setupStep: number;
}

export interface ApiErrorBody {
  error: { code: string; message: string; detail: unknown };
}

export interface CoachItemDTO {
  key: string;
  text: string;
  severity: "high" | "medium" | "low";
}

export interface SessionReviewDTO {
  project: { id: string; name: string; timezone: string };
  session: { id: string; mode: string; startedAt: string | null; endedAt: string | null; recordingUrl: string | null };
  summary: SessionSummary | null;
  rubric: { criteria: string[]; sections: { key: string; title: string; budgetSec: number }[]; cells: Record<string, Record<string, number>> };
  claims: {
    id: string;
    text: string;
    type: string;
    status: ClaimStatus;
    confidence: number;
    suggestedRewrite: string | null;
    atMs: number | null;
    evidence: { kind: string; ref: string; summary: string }[];
  }[];
  latency: {
    samples: { stepKey: string; startMs: number; durationMs: number; detector: string }[];
    acrossRehearsals: { stepKey: string; n: number; p50: number | null; p95: number | null; thisSession: number | null }[];
  };
  turns: { id: string; atMs: number; kind: string; trigger: string | null; text: string; persona: string; answer: string }[];
  transcript: { id: string; startMs: number; endMs: number; speaker: string; text: string }[];
  coachNote: { resolved: CoachItemDTO[]; open: CoachItemDTO[]; newIssues: CoachItemDTO[]; nextPlan: string[] } | null;
}

export interface ProgressDTO {
  project: { id: string; name: string; timezone: string };
  criteria: string[];
  trends: { sessionId: string; label: string; startedAt: string | null; score: number | null; criteria: Record<string, number> }[];
  history: { sessionId: string | null; createdAt: string; resolved: CoachItemDTO[]; open: CoachItemDTO[]; newIssues: CoachItemDTO[] }[];
  nextPlan: string[];
}
