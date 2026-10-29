import { z } from "zod";
import { SessionMode } from "./ws";

export const CreateSessionBody = z.object({
  mode: SessionMode,
  difficulty: z.number().int().min(1).max(5).default(3),
  drillSection: z.enum(["hook", "problem", "demo", "how", "impact", "close"]).optional(),
  /** Every recording starts with a consent checkbox per session. */
  consent: z.literal(true, { errorMap: () => ({ message: "Confirm consent to record this session." }) }),
});
export type CreateSessionBody = z.infer<typeof CreateSessionBody>;

export const CreateSessionResponse = z.object({ sessionId: z.string().uuid(), wsUrl: z.string(), wsToken: z.string() });
export type CreateSessionResponse = z.infer<typeof CreateSessionResponse>;

export const SessionTokenClaims = z.object({ sid: z.string().uuid(), pid: z.string().uuid(), uid: z.string().uuid() });
export type SessionTokenClaims = z.infer<typeof SessionTokenClaims>;

/** WebSocket tokens expire after 15 minutes and are scoped to one session. */
export const SESSION_TOKEN_TTL_SEC = 15 * 60;

/** Interruptions: at most one per judge per 45 s, only at sentence boundaries. */
export const JUDGE_COOLDOWN_MS = 45_000;
/** A judge yields when the presenter talks over it for this long, or says "let me finish". */
export const TALK_OVER_YIELD_MS = 1_500;

export interface SessionSummary {
  score: number;
  durationMs: number;
  claims: Record<"verified" | "contradicted" | "unverified" | "not_shown", number>;
  interruptions: number;
  latency: { stepKey: string; n: number; p50: number | null; p95: number | null }[];
  modelCostUsd: number | null;
  modelCalls: number;
  stt: string;
}
