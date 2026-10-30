import { z } from "zod";
import { ClaimStatus, ClaimType, ClaimVerdict } from "./core";
import { DgPhase, PreflightCheck, SignalKind } from "./demoguard";

// WebSocket contracts for the realtime server. Binary audio and frames use ws-binary.ts.
// Messages marked "M2 addition" extend the BUILD_PROMPT table; see docs/decisions/0002-m2-decisions.md.

const Word = z.object({ text: z.string(), startMs: z.number().int(), endMs: z.number().int() });
export const Segment = z.object({ id: z.string(), startMs: z.number().int(), endMs: z.number().int(), speaker: z.string(), text: z.string(), words: z.array(Word) });
export type Segment = z.infer<typeof Segment>;
export type Word = z.infer<typeof Word>;

// M5 addition: "demoguard" sessions are live presentations watched by DemoGuard.
export const SessionMode = z.enum(["full_pitch", "qa_only", "section_drill", "demoguard"]);
export type SessionMode = z.infer<typeof SessionMode>;

export const UiRegion = z.object({ label: z.enum(["spinner", "error_dialog", "result_region", "progress_bar"]), box: z.tuple([z.number(), z.number(), z.number(), z.number()]), score: z.number() });
export type UiRegion = z.infer<typeof UiRegion>;

export const ClientMessage = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("session.start"),
    sessionId: z.string().uuid(),
    mode: SessionMode,
    personaIds: z.array(z.string().uuid()),
    // M2 addition: difficulty for this run and the section repeated in section drill.
    difficulty: z.number().int().min(1).max(5).optional(),
    drillSection: z.string().optional(),
  }),
  // M2 addition: "qa_start" moves a full pitch into its Q&A phase.
  z.object({ type: z.literal("presenter.event"), kind: z.enum(["section_start", "section_end", "yield_request", "qa_start"]), sectionKey: z.string() }),
  // M2 addition: the browser reports when a judge's speech starts and ends playing.
  z.object({ type: z.literal("judge.playback"), personaId: z.string(), state: z.enum(["started", "ended"]) }),
  z.object({ type: z.literal("session.end"), sessionId: z.string().uuid() }),
  z.object({ type: z.literal("companion.hello"), deviceId: z.string(), obsConnected: z.boolean(), version: z.string() }),
  z.object({ type: z.literal("signal.network"), url: z.string(), status: z.number().int(), durationMs: z.number(), ts: z.number() }),
  z.object({ type: z.literal("signal.input"), kind: z.enum(["click", "key"]), ts: z.number() }),
  // M5: checks may say whether they are critical (block Arm) and who ran them.
  z.object({ type: z.literal("preflight.result"), checks: z.array(PreflightCheck) }),
  z.object({ type: z.literal("demoguard.hotkey"), action: z.enum(["panic", "resume", "freeze"]) }),
  // M5 additions: the Live control tab runs pre-flight, arms and ends; and sets the Recorded-segment badge.
  z.object({ type: z.literal("demoguard.control"), action: z.enum(["preflight", "arm", "end"]) }),
  z.object({ type: z.literal("demoguard.settings"), badgeVisible: z.boolean() }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

/** Which model produced a claim verdict or a judge line, and how long it took ("mock" when mocked). */
export const ModelTag = z.object({ modelId: z.string(), latencyMs: z.number().int().nonnegative(), fallback: z.enum(["budget", "error"]).optional() });
export type ModelTag = z.infer<typeof ModelTag>;

export const ServerMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("transcript.partial"), segment: Segment }),
  z.object({ type: z.literal("transcript.final"), segment: Segment }),
  z.object({
    type: z.literal("ledger.update"),
    claim: z.object({ id: z.string(), text: z.string(), type: ClaimType, status: ClaimStatus, segmentStartMs: z.number().int().optional(), model: ModelTag.optional() }),
    verdict: ClaimVerdict,
  }),
  z.object({ type: z.literal("latency.sample"), stepKey: z.string(), durationMs: z.number(), detector: z.string().optional() }),
  // M2 addition: the stopwatch for the step in progress.
  z.object({ type: z.literal("latency.step"), stepKey: z.string(), phase: z.enum(["started", "completed", "abandoned"]), startMs: z.number(), durationMs: z.number().nullable() }),
  z.object({ type: z.literal("coverage.update"), criterionId: z.string(), sectionKey: z.string(), score: z.number().min(0).max(1) }),
  z.object({
    type: z.literal("judge.speak"),
    personaId: z.string(),
    text: z.string(),
    audioStreamId: z.string().nullable(),
    kind: z.enum(["interrupt", "question", "follow_up"]).optional(),
    trigger: z.string().nullable().optional(),
    model: ModelTag.optional(),
  }),
  // M2 addition: live session state, UI regions for the overlay, and server-side timings for the latency HUD.
  z.object({ type: z.literal("session.state"), state: z.enum(["ready", "live", "qa", "ended"]), elapsedMs: z.number(), sectionKey: z.string().nullable(), stt: z.string(), vision: z.string() }),
  z.object({ type: z.literal("ui.states"), frameTs: z.number(), regions: z.array(UiRegion), detector: z.enum(["sam", "phash"]) }),
  // M3 addition: auditor flags that are not claims (canned responses, show-or-strike summary, cross-source).
  z.object({ type: z.literal("audit.flag"), kind: z.enum(["canned_response", "cross_source", "show_or_strike"]), detail: z.string(), refs: z.array(z.string()) }),
  z.object({ type: z.literal("metric"), path: z.enum(["stt_partial", "claim_chip", "judge_decision", "frame_state"]), ms: z.number() }),
  z.object({ type: z.literal("judge.yield"), personaId: z.string(), queuedQuestion: z.string() }),
  z.object({
    type: z.literal("demoguard.state"),
    state: DgPhase,
    stepId: z.string().nullable(),
    signals: z.array(z.string()),
    // M5 additions: step position, time on fallback, and the fallback clip point for the current step.
    stepIndex: z.number().int().optional(),
    totalFallbackMs: z.number().optional(),
    fallbackSeekMs: z.number().nullable().optional(),
    badgeVisible: z.boolean().optional(),
    companion: z.object({ connected: z.boolean(), version: z.string().nullable() }).optional(),
    vision: z.enum(["sam", "heuristic"]).optional(),
  }),
  // M5 additions: pre-flight results, the signal feed, incidents, and a re-run request to the companion.
  z.object({ type: z.literal("demoguard.preflight"), checks: z.array(PreflightCheck), criticalFailures: z.number().int() }),
  z.object({ type: z.literal("demoguard.signal"), kind: SignalKind, critical: z.boolean(), detail: z.string(), atMs: z.number() }),
  z.object({
    type: z.literal("demoguard.incident"),
    action: z.enum(["switch", "recover", "panic", "resume", "freeze"]),
    stepIndex: z.number().int(),
    signals: z.array(SignalKind),
    fallbackMs: z.number(),
    detectionMs: z.number().nullable(),
    atMs: z.number(),
  }),
  z.object({ type: z.literal("preflight.run") }),
  z.object({ type: z.literal("obs.switch"), scene: z.enum(["live", "fallback"]), mediaPath: z.string().nullable(), seekMs: z.number().nullable() }),
  z.object({ type: z.literal("obs.badge"), visible: z.boolean() }),
  z.object({ type: z.literal("demoguard.hotkey"), action: z.enum(["panic", "resume", "freeze"]) }),
  z.object({ type: z.literal("session.summary"), summaryId: z.string() }),
  z.object({ type: z.literal("error"), code: z.string(), message: z.string() }),
]);
export type ServerMessage = z.infer<typeof ServerMessage>;

/** "muse-spark-1.3" → "Muse Spark 1.3"; "mock" → "Mocked". */
export function modelLabel(modelId: string): string {
  if (modelId === "mock") return "Mocked";
  return modelId
    .split("-")
    .map((part) => (/^\d/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" ");
}

/** The attribution caption: "Muse Spark 1.3 · 1.9 s", or why it was mocked. */
export function modelCaption(tag: { modelId: string; latencyMs: number | null; fallback?: "budget" | "error" | undefined }): string {
  if (tag.fallback === "budget") return "Mocked · today's demo allowance is used up";
  if (tag.fallback === "error") return "Mocked · the model call failed";
  if (tag.modelId === "mock") return "Mocked";
  return tag.latencyMs === null ? modelLabel(tag.modelId) : `${modelLabel(tag.modelId)} · ${(tag.latencyMs / 1000).toFixed(1)} s`;
}
