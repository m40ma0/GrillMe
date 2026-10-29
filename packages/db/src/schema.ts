import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, real, text, timestamp, uniqueIndex, uuid, vector } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import type { ClaimVerdict, CoachItem, Persona, RepoDigest, SectionKey, WinnerProfile, WinningPattern } from "@stage-ready/shared";

// Data model from BUILD_PROMPT "Data model". Every table has a uuid v7 id,
// createdAt and updatedAt; every child table carries projectId for row-level scoping.

/** Embedding width is fixed when the migration is generated. Regenerate if EMBED_DIM changes. */
export const EMBED_DIM = Number(process.env.EMBED_DIM || 1024);

const id = () =>
  uuid()
    .primaryKey()
    .$defaultFn(() => uuidv7());
const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
const projectRef = () =>
  uuid()
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" });

export const users = pgTable("users", {
  id: id(),
  email: text().notNull().unique(),
  name: text(),
  githubLogin: text().unique(),
  ...timestamps,
});

export const projects = pgTable(
  "projects",
  {
    id: id(),
    ownerId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text().notNull(),
    tagline: text().notNull().default(""),
    videoLimitSec: integer().notNull().default(180),
    timezone: text().notNull().default("Asia/Singapore"),
    cloudUploadEnabled: boolean().notNull().default(false),
    demoMode: boolean().notNull().default(false),
    pitchScript: text().notNull().default(""),
    /** The written submission (Devpost text etc.), checked against spoken claims. */
    submissionText: text().notNull().default(""),
    setupStep: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [index().on(t.ownerId)],
);

export const eventSpecs = pgTable("event_specs", {
  id: id(),
  projectId: projectRef().unique(),
  name: text().notNull().default(""),
  sourceUrls: text()
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  /** sha256 of the normalised source; EventSpecs are cached by it. */
  sourceHash: text(),
  tracks: jsonb().$type<{ name: string; description: string }[]>().notNull().default([]),
  requirements: jsonb().$type<{ videoMaxSec: number | null; repoPublic: boolean | null; deadlineIso: string | null }>().notNull().default({ videoMaxSec: null, repoPublic: null, deadlineIso: null }),
  requiredTech: jsonb().$type<string[]>().notNull().default([]),
  deadlineAt: timestamp({ withTimezone: true }),
  weightsInferred: boolean().notNull().default(true),
  sourceQuotes: jsonb().$type<Record<string, string>>().notNull().default({}),
  peopleNamed: jsonb().$type<string[]>().notNull().default([]),
  droppedFields: jsonb().$type<string[]>().notNull().default([]),
  confirmedAt: timestamp({ withTimezone: true }),
  ...timestamps,
});

export const criteria = pgTable(
  "criteria",
  {
    id: id(),
    projectId: projectRef(),
    eventSpecId: uuid()
      .notNull()
      .references(() => eventSpecs.id, { onDelete: "cascade" }),
    name: text().notNull(),
    description: text().notNull().default(""),
    weight: real().notNull(),
    order: integer().notNull(),
    sourceQuote: text(),
    ...timestamps,
  },
  (t) => [index().on(t.eventSpecId), check("criteria_weight_range", sql`${t.weight} >= 0 and ${t.weight} <= 1`)],
);

export const pastWinners = pgTable(
  "past_winners",
  {
    id: id(),
    projectId: projectRef(),
    sourceUrl: text(),
    title: text().notNull(),
    placement: text().notNull(),
    profile: jsonb().$type<WinnerProfile>().notNull(),
    ...timestamps,
  },
  (t) => [index().on(t.projectId)],
);

export const winningPatterns = pgTable(
  "winning_patterns",
  {
    id: id(),
    projectId: projectRef(),
    statement: text().notNull(),
    evidence: jsonb().$type<WinningPattern["evidence"]>().notNull(),
    check: text().notNull(),
    checkResult: text({ enum: ["pass", "fail", "unknown"] })
      .notNull()
      .default("unknown"),
    checkDetail: text(),
    ...timestamps,
  },
  (t) => [index().on(t.projectId)],
);

export const repos = pgTable("repos", {
  id: id(),
  projectId: projectRef().unique(),
  githubFullName: text().notNull(),
  ref: text(),
  commitSha: text(),
  visibility: text({ enum: ["public", "private", "unknown"] })
    .notNull()
    .default("unknown"),
  digestUrl: text(),
  digestTokens: integer(),
  fileCount: integer(),
  dependencies: jsonb().$type<RepoDigest["dependencies"]>().notNull().default([]),
  readme: text(),
  ...timestamps,
});

export const repoFindings = pgTable(
  "repo_findings",
  {
    id: id(),
    projectId: projectRef(),
    repoId: uuid()
      .notNull()
      .references(() => repos.id, { onDelete: "cascade" }),
    kind: text({ enum: ["dependency", "mock_response", "secret", "todo", "test", "capability"] }).notNull(),
    filePath: text().notNull(),
    line: integer(),
    summary: text().notNull(),
    severity: text({ enum: ["info", "low", "medium", "high"] }).notNull(),
    ...timestamps,
  },
  (t) => [index().on(t.repoId)],
);

export const personas = pgTable(
  "personas",
  {
    id: id(),
    projectId: projectRef(),
    role: text({ enum: ["technical", "impact", "product"] }).notNull(),
    difficulty: integer().notNull().default(3),
    criteriaWeights: jsonb().$type<Persona["criteriaWeights"]>().notNull(),
    questionStyle: text().notNull(),
    voicePreset: text().notNull(),
    isFictional: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [index().on(t.projectId), check("personas_is_fictional", sql`${t.isFictional} = true`), check("personas_difficulty_range", sql`${t.difficulty} between 1 and 5`)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    projectId: projectRef(),
    mode: text({ enum: ["full_pitch", "qa_only", "section_drill"] }).notNull(),
    startedAt: timestamp({ withTimezone: true }),
    endedAt: timestamp({ withTimezone: true }),
    recordingUrl: text(),
    summary: jsonb().$type<Record<string, unknown>>(),
    rubricHeatmap: jsonb().$type<Record<string, Partial<Record<SectionKey, number>>>>(),
    ...timestamps,
  },
  (t) => [index().on(t.projectId)],
);

export const transcriptSegments = pgTable(
  "transcript_segments",
  {
    id: id(),
    projectId: projectRef(),
    sessionId: uuid()
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    startMs: integer().notNull(),
    endMs: integer().notNull(),
    /** "presenter" or "judge:<personaId>" */
    speaker: text().notNull(),
    text: text().notNull(),
    words: jsonb().$type<{ text: string; startMs: number; endMs: number }[]>().notNull().default([]),
    ...timestamps,
  },
  (t) => [index().on(t.sessionId)],
);

export const claims = pgTable(
  "claims",
  {
    id: id(),
    projectId: projectRef(),
    sessionId: uuid()
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    segmentId: uuid().references(() => transcriptSegments.id, { onDelete: "set null" }),
    text: text().notNull(),
    type: text({ enum: ["performance", "accuracy", "feature", "security_privacy", "scale", "comparison", "market"] }).notNull(),
    status: text({ enum: ["verified", "contradicted", "unverified", "not_shown"] }).notNull(),
    confidence: real().notNull().default(0),
    suggestedRewrite: text(),
    ...timestamps,
  },
  (t) => [index().on(t.sessionId)],
);

export const evidence = pgTable(
  "evidence",
  {
    id: id(),
    projectId: projectRef(),
    claimId: uuid()
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    kind: text({ enum: ["frame", "latency", "repo", "test", "doc"] }).notNull(),
    /** A timestamp, file:line or URL. */
    ref: jsonb().$type<{ value: string } & Record<string, unknown>>().notNull(),
    summary: text().notNull(),
    ...timestamps,
  },
  (t) => [index().on(t.claimId)],
);

export const latencySamples = pgTable(
  "latency_samples",
  {
    id: id(),
    projectId: projectRef(),
    sessionId: uuid()
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    stepKey: text().notNull(),
    startMs: integer().notNull(),
    endMs: integer().notNull(),
    /** 256-bit dHash (hex) of the screen before the action and of the result; the canned-response detector compares them. */
    inputHash: text(),
    outputHash: text(),
    durationMs: integer().notNull(),
    detector: text().notNull(),
    ...timestamps,
  },
  (t) => [index().on(t.sessionId)],
);

export const judgeTurns = pgTable(
  "judge_turns",
  {
    id: id(),
    projectId: projectRef(),
    sessionId: uuid()
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    personaId: uuid().references(() => personas.id, { onDelete: "set null" }),
    atMs: integer().notNull(),
    kind: text({ enum: ["interrupt", "question", "follow_up"] }).notNull(),
    text: text().notNull(),
    trigger: text({ enum: ["claim", "coverage_gap", "over_time", "vague_answer", "qa_phase"] }),
    presenterAnswerSegmentIds: uuid()
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    ...timestamps,
  },
  (t) => [index().on(t.sessionId)],
);

export const questions = pgTable(
  "questions",
  {
    id: id(),
    projectId: projectRef(),
    text: text().notNull(),
    personaId: uuid().references(() => personas.id, { onDelete: "set null" }),
    likelihood: real().notNull(),
    damage: real().notNull(),
    sourceRefs: jsonb().$type<string[]>().notNull().default([]),
    askedCount: integer().notNull().default(0),
    lastScore: real(),
    ...timestamps,
  },
  (t) => [index().on(t.projectId)],
);

export const answerCards = pgTable("answer_cards", {
  id: id(),
  projectId: projectRef(),
  questionId: uuid()
    .notNull()
    .unique()
    .references(() => questions.id, { onDelete: "cascade" }),
  script: text().notNull(),
  bridgeLine: text().notNull(),
  evidenceRefs: jsonb().$type<string[]>().notNull().default([]),
  ...timestamps,
});

export const slides = pgTable("slides", {
  id: id(),
  projectId: projectRef(),
  answerCardId: uuid()
    .notNull()
    .references(() => answerCards.id, { onDelete: "cascade" }),
  pngUrl: text(),
  pdfUrl: text(),
  dataSnapshot: jsonb().$type<Record<string, unknown>>().notNull(),
  verification: text({ enum: ["passed", "failed", "fallback"] }),
  ...timestamps,
});

export const sectionPlans = pgTable(
  "section_plans",
  {
    id: id(),
    projectId: projectRef(),
    order: integer().notNull(),
    key: text({ enum: ["hook", "problem", "demo", "how", "impact", "close"] }).notNull(),
    title: text().notNull(),
    budgetSec: integer().notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex().on(t.projectId, t.key)],
);

export const takes = pgTable(
  "takes",
  {
    id: id(),
    projectId: projectRef(),
    sectionPlanId: uuid()
      .notNull()
      .references(() => sectionPlans.id, { onDelete: "cascade" }),
    sessionId: uuid().references(() => sessions.id, { onDelete: "set null" }),
    mediaUrl: text(),
    durationMs: integer().notNull(),
    transcriptRef: text(),
    ...timestamps,
  },
  (t) => [index().on(t.sectionPlanId)],
);

export const takeScores = pgTable("take_scores", {
  id: id(),
  projectId: projectRef(),
  takeId: uuid()
    .notNull()
    .unique()
    .references(() => takes.id, { onDelete: "cascade" }),
  total: real().notNull(),
  delivery: real().notNull(),
  coverage: real().notNull(),
  claimPenalty: real().notNull(),
  demoSuccess: real().notNull(),
  timeFit: real().notNull(),
  breakdown: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  ...timestamps,
});

export const edls = pgTable("edls", {
  id: id(),
  projectId: projectRef(),
  version: integer().notNull().default(1),
  items: jsonb().$type<{ takeId: string; inMs: number; outMs: number; transition: string }[]>().notNull().default([]),
  ...timestamps,
});

export const renderJobs = pgTable("render_jobs", {
  id: id(),
  projectId: projectRef(),
  edlId: uuid()
    .notNull()
    .references(() => edls.id, { onDelete: "cascade" }),
  status: text({ enum: ["queued", "running", "done", "failed"] })
    .notNull()
    .default("queued"),
  progress: real().notNull().default(0),
  outputs: jsonb().$type<{ mp4?: string; srt?: string; thumbnail?: string; chapters?: string }>().notNull().default({}),
  error: text(),
  ...timestamps,
});

export const stepMaps = pgTable("step_maps", {
  id: id(),
  projectId: projectRef(),
  goldenRunSessionId: uuid().references(() => sessions.id, { onDelete: "set null" }),
  fallbackClipUrl: text(),
  version: integer().notNull().default(1),
  ...timestamps,
});

export const steps = pgTable(
  "steps",
  {
    id: id(),
    projectId: projectRef(),
    stepMapId: uuid()
      .notNull()
      .references(() => stepMaps.id, { onDelete: "cascade" }),
    order: integer().notNull(),
    name: text().notNull(),
    expectedKeyframeUrls: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    maxDurationMs: integer().notNull(),
    successSignal: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    fallbackInMs: integer().notNull(),
    fallbackOutMs: integer().notNull(),
    narration: text().notNull().default(""),
    ...timestamps,
  },
  (t) => [index().on(t.stepMapId)],
);

export const incidents = pgTable("incidents", {
  id: id(),
  projectId: projectRef(),
  stepMapId: uuid()
    .notNull()
    .references(() => stepMaps.id, { onDelete: "cascade" }),
  sessionId: uuid().references(() => sessions.id, { onDelete: "set null" }),
  stepId: uuid().references(() => steps.id, { onDelete: "set null" }),
  atMs: integer().notNull(),
  signals: jsonb().$type<string[]>().notNull().default([]),
  action: text({ enum: ["switch", "recover", "panic", "resume", "freeze"] }).notNull(),
  fallbackMs: integer().notNull().default(0),
  ...timestamps,
});

export const fixTasks = pgTable(
  "fix_tasks",
  {
    id: id(),
    projectId: projectRef(),
    title: text().notNull(),
    detail: text().notNull().default(""),
    origin: text({ enum: ["claim", "question", "pattern", "incident"] }).notNull(),
    status: text({ enum: ["open", "done"] })
      .notNull()
      .default("open"),
    suggestedArtifact: text(),
    ...timestamps,
  },
  (t) => [index().on(t.projectId)],
);

export const coachNotes = pgTable(
  "coach_notes",
  {
    id: id(),
    projectId: projectRef(),
    sessionId: uuid().references(() => sessions.id, { onDelete: "set null" }),
    resolved: jsonb().$type<CoachItem[]>().notNull().default([]),
    open: jsonb().$type<CoachItem[]>().notNull().default([]),
    newIssues: jsonb().$type<CoachItem[]>().notNull().default([]),
    nextPlan: jsonb().$type<string[]>().notNull().default([]),
    embedding: vector({ dimensions: EMBED_DIM }),
    ...timestamps,
  },
  (t) => [index().on(t.projectId)],
);

export type ClaimEvidenceRow = ClaimVerdict["evidence"][number];
