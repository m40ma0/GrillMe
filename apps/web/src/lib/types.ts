import type {
  CheckResult,
  ClaimStatus,
  ComplianceItem,
  EdlItem,
  SessionSummary,
  Persona,
  PersonaRole,
  RepoFinding,
  SectionKey,
  SectionPlanItem,
  SlideSnapshot,
  WinnerProfile,
  WinningPattern,
} from "@stage-ready/shared";

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
  strongestMoment: string;
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

// ---------- Director (F5) ----------

export interface TakeScoreDTO {
  total: number;
  delivery: number;
  coverage: number;
  claimPenalty: number;
  demoSuccess: number;
  timeFit: number;
  wpm: number;
  fillerPer100: number;
  longPauses: number;
  contradictedClaims: { text: string; reason: string }[];
}

export interface TakeDTO {
  id: string;
  sectionKey: SectionKey;
  durationMs: number;
  status: "uploaded" | "processing" | "ready" | "failed";
  error: string | null;
  createdAt: string;
  transcript: string;
  /** Fixture takes have no recording to preview. */
  fixture: boolean;
  hasMedia: boolean;
  /** A frame of the uploaded take, served by /api/takes/:id/thumbnail. */
  hasThumbnail: boolean;
  score: TakeScoreDTO | null;
}

export interface RenderDTO {
  id: string;
  status: "queued" | "running" | "done" | "failed";
  progress: number;
  error: string | null;
  createdAt: string;
  outputs: { mp4: string | null; srt: string | null; thumbnail: string | null; chapters: string | null };
}

export interface DirectorDTO {
  limitSec: number;
  strongestMoment: string;
  cloudUploadEnabled: boolean;
  demoMode: boolean;
  sections: { key: SectionKey; title: string; budgetSec: number; order: number }[];
  takes: TakeDTO[];
  edl: { id: string; version: number; items: EdlItem[]; totalMs: number; fits: boolean } | null;
  firstTwenty: { ok: boolean; matched: string[]; missing: string[] } | null;
  render: RenderDTO | null;
}

// ---------- Evidence Q&A Kit (F4) ----------

export interface QuestionDTO {
  id: string;
  text: string;
  personaRole: PersonaRole | null;
  likelihood: number;
  damage: number;
  askedCount: number;
  lastScore: number | null;
  sourceRefs: string[];
  card: { id: string; script: string; bridgeLine: string; evidenceRefs: string[] } | null;
  slide: { id: string; verification: "passed" | "failed" | "fallback" | null; snapshot: SlideSnapshot; hasPng: boolean } | null;
}

export interface QaKitDTO {
  questions: QuestionDTO[];
  appendix: boolean;
  gapTasks: number;
}

// ---------- DemoGuard (F6) ----------

export interface StepDTO {
  id: string;
  order: number;
  name: string;
  narration: string;
  maxDurationMs: number;
  fallbackInMs: number;
  fallbackOutMs: number;
  hasExpectedState: boolean;
  goldenDurationMs: number | null;
}

export interface IncidentDTO {
  id: string;
  atMs: number;
  action: "switch" | "recover" | "panic" | "resume" | "freeze";
  stepName: string | null;
  signals: string[];
  fallbackMs: number;
  detectionMs: number | null;
  detail: string;
}

export interface DemoGuardRunDTO {
  sessionId: string;
  startedAt: string;
  endedAt: string | null;
  totalFallbackMs: number;
  incidents: IncidentDTO[];
}

export interface DemoGuardDTO {
  stepMap: { id: string; version: number; goldenRunSessionId: string | null; fallbackClipUrl: string | null; createdAt: string } | null;
  steps: StepDTO[];
  goldenRuns: { id: string; startedAt: string; mode: string; steps: number }[];
  runs: DemoGuardRunDTO[];
}
