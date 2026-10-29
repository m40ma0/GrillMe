import { z } from "zod";
import { ClaimStatus, ClaimType, ClaimVerdict } from "./core";

// WebSocket contracts for the realtime server. Binary audio and frames use ws-binary.ts.

const Word = z.object({ text: z.string(), startMs: z.number().int(), endMs: z.number().int() });
const Segment = z.object({ id: z.string(), startMs: z.number().int(), endMs: z.number().int(), speaker: z.string(), text: z.string(), words: z.array(Word) });

export const ClientMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("session.start"), sessionId: z.string().uuid(), mode: z.enum(["full_pitch", "qa_only", "section_drill"]), personaIds: z.array(z.string().uuid()) }),
  z.object({ type: z.literal("presenter.event"), kind: z.enum(["section_start", "section_end", "yield_request"]), sectionKey: z.string() }),
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
  z.object({ type: z.literal("ledger.update"), claim: z.object({ id: z.string(), text: z.string(), type: ClaimType, status: ClaimStatus }), verdict: ClaimVerdict }),
  z.object({ type: z.literal("latency.sample"), stepKey: z.string(), durationMs: z.number() }),
  z.object({ type: z.literal("coverage.update"), criterionId: z.string(), sectionKey: z.string(), score: z.number().min(0).max(1) }),
  z.object({ type: z.literal("judge.speak"), personaId: z.string(), text: z.string(), audioStreamId: z.string().nullable() }),
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
