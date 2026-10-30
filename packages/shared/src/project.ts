import { z } from "zod";

export const SectionKey = z.enum(["hook", "problem", "demo", "how", "impact", "close"]);
export type SectionKey = z.infer<typeof SectionKey>;

export const SECTION_TITLES: Record<SectionKey, string> = {
  hook: "Hook",
  problem: "Problem",
  demo: "Demo",
  how: "How it works",
  impact: "Impact",
  close: "Close",
};

/** Default share of the video limit per section. Sums to 1. */
export const SECTION_SHARES: Record<SectionKey, number> = {
  hook: 0.08,
  problem: 0.14,
  demo: 0.34,
  how: 0.19,
  impact: 0.17,
  close: 0.08,
};

export const SectionPlanItem = z.object({
  key: SectionKey,
  title: z.string().trim().min(1).max(80),
  budgetSec: z.number().int().min(1),
});
export type SectionPlanItem = z.infer<typeof SectionPlanItem>;

export const DEFAULT_VIDEO_LIMIT_SEC = 180;

/** Splits the video limit across the six sections; the total always equals the limit. */
export function autoSectionPlan(videoLimitSec: number): SectionPlanItem[] {
  const limit = Math.max(SectionKey.options.length, Math.round(videoLimitSec));
  const keys = SectionKey.options;
  const items = keys.map((key) => ({ key, title: SECTION_TITLES[key], budgetSec: Math.max(1, Math.floor(limit * SECTION_SHARES[key])) }));
  const remainder = limit - items.reduce((sum, item) => sum + item.budgetSec, 0);
  const demo = items.find((item) => item.key === "demo");
  if (demo) demo.budgetSec += remainder;
  return items;
}

export const isTimeZone = (value: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

export const TimeZone = z.string().refine(isTimeZone, "Use an IANA time zone, for example Asia/Singapore.");

export const CreateProjectBody = z.object({
  name: z.string().trim().min(1, "Name your project.").max(120),
  tagline: z.string().trim().max(200).default(""),
  timezone: TimeZone.default("Asia/Singapore"),
});
export type CreateProjectBody = z.infer<typeof CreateProjectBody>;

export const SectionPlanUpdate = z.array(SectionPlanItem).length(6);

export const PatchProjectBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  tagline: z.string().trim().max(200).optional(),
  timezone: TimeZone.optional(),
  videoLimitSec: z.number().int().min(10).max(3600).optional(),
  pitchScript: z.string().max(50_000).optional(),
  submissionText: z.string().max(50_000).optional(),
  cloudUploadEnabled: z.boolean().optional(),
  sectionPlan: SectionPlanUpdate.optional(),
  setupStep: z.number().int().min(0).max(5).optional(),
  strongestMoment: z.string().trim().max(300).optional(),
});
export type PatchProjectBody = z.infer<typeof PatchProjectBody>;

export const JobState = z.enum(["waiting", "active", "completed", "failed", "delayed", "unknown"]);
export const JobStatus = z.object({
  id: z.string(),
  name: z.string(),
  state: JobState,
  progress: z.object({ pct: z.number().min(0).max(100), step: z.string() }),
  error: z.string().nullable(),
  result: z.unknown().nullable(),
});
export type JobStatus = z.infer<typeof JobStatus>;

export const JobProgress = z.object({ pct: z.number(), step: z.string() });
export type JobProgress = z.infer<typeof JobProgress>;

export const QueuedJob = z.object({ jobId: z.string() });

/** Redis key a running job polls at each progress update; set by DELETE /api/jobs/:id. */
export const cancelKey = (jobId: string) => `stage-ready:cancel:${jobId}`;

/** Queue names and job payloads shared by the web app and the worker. */
export const QUEUE_NAME = "stage-ready-jobs";
export const JobPayload = z.discriminatedUnion("name", [
  z.object({ name: z.literal("event-ingest"), projectId: z.string().uuid(), urls: z.array(z.string().url()), text: z.string().optional() }),
  z.object({ name: z.literal("winners"), projectId: z.string().uuid(), urls: z.array(z.string().url()), text: z.string().optional() }),
  z.object({ name: z.literal("session-review"), projectId: z.string().uuid(), sessionId: z.string().uuid() }),
  z.object({ name: z.literal("take-process"), projectId: z.string().uuid(), takeId: z.string().uuid() }),
  z.object({ name: z.literal("render"), projectId: z.string().uuid(), renderJobId: z.string().uuid() }),
  z.object({ name: z.literal("questions"), projectId: z.string().uuid(), reason: z.enum(["manual", "session"]).default("manual") }),
  z.object({ name: z.literal("slides"), projectId: z.string().uuid(), answerCardIds: z.array(z.string().uuid()).optional() }),
  z.object({ name: z.literal("repo-digest"), projectId: z.string().uuid(), githubFullName: z.string(), ref: z.string().optional(), githubTokenSealed: z.string().optional() }),
]);
export type JobPayload = z.infer<typeof JobPayload>;
export type JobName = JobPayload["name"];
