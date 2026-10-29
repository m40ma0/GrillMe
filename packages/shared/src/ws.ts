import { z } from "zod";
import { ClaimStatus, ClaimType, ClaimVerdict } from "./core";

// WebSocket contracts for the realtime server. Binary audio and frames use ws-binary.ts.
// Messages marked "M2 addition" extend the BUILD_PROMPT table; see docs/decisions/0002-m2-decisions.md.

const Word = z.object({ text: z.string(), startMs: z.number().int(), endMs: z.number().int() });
export const Segment = z.object({ id: z.string(), startMs: z.number().int(), endMs: z.number().int(), speaker: z.string(), text: z.string(), words: z.array(Word) });
export type Segment = z.infer<typeof Segment>;
export type Word = z.infer<typeof Word>;

export const SessionMode = z.enum(["full_pitch", "qa_only", "section_drill"]);
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
  z.object({
    type: z.literal("preflight.result"),
    checks: z.array(z.object({ id: z.string(), label: z.string(), status: z.enum(["pass", "fail", "warn", "unknown"]), detail: z.string() })),
  }),
  z.object({ type: z.literal("demoguard.hotkey"), action: z.enum(["panic", "resume", "freeze"]) }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

export const ServerMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("transcript.partial"), segment: Segment }),
  z.object({ type: z.literal("transcript.final"), segment: Segment }),
  z.object({
    type: z.literal("ledger.update"),
    claim: z.object({ id: z.string(), text: z.string(), type: ClaimType, status: ClaimStatus, segmentStartMs: z.number().int().optional() }),
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
  }),
  // M2 addition: live session state, UI regions for the overlay, and server-side timings for the latency HUD.
  z.object({ type: z.literal("session.state"), state: z.enum(["ready", "live", "qa", "ended"]), elapsedMs: z.number(), sectionKey: z.string().nullable(), stt: z.string(), vision: z.string() }),
  z.object({ type: z.literal("ui.states"), frameTs: z.number(), regions: z.array(UiRegion), detector: z.enum(["sam", "phash"]) }),
  z.object({ type: z.literal("metric"), path: z.enum(["stt_partial", "claim_chip", "judge_decision", "frame_state"]), ms: z.number() }),
  z.object({ type: z.literal("judge.yield"), personaId: z.string(), queuedQuestion: z.string() }),
  z.object({
    type: z.literal("demoguard.state"),
    state: z.enum(["idle", "preflight", "armed", "live", "suspect", "fallback", "recovering", "frozen", "done"]),
    stepId: z.string().nullable(),
    signals: z.array(z.string()),
  }),
  z.object({ type: z.literal("obs.switch"), scene: z.enum(["live", "fallback"]), mediaPath: z.string().nullable(), seekMs: z.number().nullable() }),
  z.object({ type: z.literal("obs.badge"), visible: z.boolean() }),
  z.object({ type: z.literal("demoguard.hotkey"), action: z.enum(["panic", "resume", "freeze"]) }),
  z.object({ type: z.literal("session.summary"), summaryId: z.string() }),
  z.object({ type: z.literal("error"), code: z.string(), message: z.string() }),
]);
export type ServerMessage = z.infer<typeof ServerMessage>;
