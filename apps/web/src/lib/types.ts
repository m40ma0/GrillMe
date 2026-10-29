import type { CheckResult, ComplianceItem, Persona, RepoFinding, SectionPlanItem, WinnerProfile, WinningPattern } from "@stage-ready/shared";

// JSON shapes the API returns and server components pass to client components.

export interface ProjectDTO {
  id: string;
  name: string;
  tagline: string;
  timezone: string;
  videoLimitSec: number;
  demoMode: boolean;
  pitchScript: string;
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
