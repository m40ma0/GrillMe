import { z } from "zod";

// DemoGuard (F6): the state machine as a pure reducer, the decision policy, and pre-flight checks.
// The realtime server feeds it events; the effects it returns say what to switch and what to record.

export const DgPhase = z.enum(["idle", "preflight", "armed", "live", "suspect", "fallback", "recovering", "frozen", "done"]);
export type DgPhase = z.infer<typeof DgPhase>;

export const SignalKind = z.enum(["error_dialog", "http_5xx", "http_timeout", "spinner_over_budget", "step_over_budget", "blank_screen", "state_mismatch"]);
export type SignalKind = z.infer<typeof SignalKind>;

/** One of these alone switches to fallback; everything else needs a corroborating second signal. */
export const CRITICAL_SIGNALS = new Set<SignalKind>(["error_dialog", "http_5xx"]);

export const SIGNAL_LABEL: Record<SignalKind, string> = {
  error_dialog: "Error dialog or toast",
  http_5xx: "HTTP 5xx on the demo path",
  http_timeout: "Request timed out",
  spinner_over_budget: "Spinner over budget",
  step_over_budget: "Step over its maximum duration",
  blank_screen: "Blank screen",
  state_mismatch: "Screen does not match the expected state",
};

export interface DgStep {
  maxDurationMs: number;
  fallbackInMs: number;
  fallbackOutMs: number;
}

export interface DgPolicy {
  /** A lone non-critical signal clears after this long without a second one. */
  suspectClearMs: number;
  /** Two different non-critical signals within this window corroborate each other. */
  corroborateMs: number;
}

export const DEFAULT_POLICY: DgPolicy = { suspectClearMs: 1_000, corroborateMs: 3_000 };

export interface DgSignal {
  kind: SignalKind;
  atMs: number;
  detail: string;
}

export interface DgState {
  phase: DgPhase;
  stepIndex: number;
  /** When the current step started, live or on the fallback clip. */
  stepStartedMs: number;
  /** Recent signals inside the corroboration window. */
  recent: DgSignal[];
  /** When the current fallback began, for the time-on-fallback total. */
  fallbackSinceMs: number | null;
  totalFallbackMs: number;
}

export const initialDgState = (): DgState => ({ phase: "idle", stepIndex: 0, stepStartedMs: 0, recent: [], fallbackSinceMs: null, totalFallbackMs: 0 });

export type DgEvent =
  | { type: "preflight"; atMs: number }
  | { type: "arm"; atMs: number; criticalFailures: number }
  /** The live app moved: the first step has started. */
  | { type: "activity"; atMs: number }
  | { type: "signal"; signal: DgSignal }
  /** The live app finished the current step (its result appeared). */
  | { type: "step_complete"; atMs: number }
  /** While on fallback, the live app reached the expected state again. */
  | { type: "recovered"; atMs: number }
  | { type: "hotkey"; action: "panic" | "resume" | "freeze"; atMs: number }
  | { type: "tick"; atMs: number }
  | { type: "end"; atMs: number };

export type DgEffect =
  | { type: "switch"; to: "fallback" | "live"; stepIndex: number; seekMs: number | null }
  | { type: "incident"; action: "switch" | "recover" | "panic" | "resume" | "freeze"; stepIndex: number; signals: DgSignal[]; fallbackMs: number }
  | { type: "step"; stepIndex: number }
  | { type: "rejected"; reason: string };

export interface DgResult {
  state: DgState;
  effects: DgEffect[];
}

const clipMs = (s: DgStep | undefined) => (s ? Math.max(1_000, s.fallbackOutMs - s.fallbackInMs) : 1_000);

function toFallback(state: DgState, steps: DgStep[], atMs: number, action: "switch" | "panic", signals: DgSignal[]): DgResult {
  const step = steps[state.stepIndex];
  // The clip is cued to the current step's in-point and plays this step from its start.
  const next: DgState = { ...state, phase: "fallback", stepStartedMs: atMs, fallbackSinceMs: atMs, recent: [] };
  return {
    state: next,
    effects: [
      { type: "switch", to: "fallback", stepIndex: state.stepIndex, seekMs: step?.fallbackInMs ?? 0 },
      { type: "incident", action, stepIndex: state.stepIndex, signals, fallbackMs: 0 },
    ],
  };
}

function toLive(state: DgState, atMs: number, action: "recover" | "resume", stepIndex: number): DgResult {
  const fallbackMs = state.fallbackSinceMs === null ? 0 : atMs - state.fallbackSinceMs;
  const next: DgState = { ...state, phase: "live", stepIndex, stepStartedMs: atMs, fallbackSinceMs: null, totalFallbackMs: state.totalFallbackMs + fallbackMs, recent: [] };
  return {
    state: next,
    effects: [
      { type: "switch", to: "live", stepIndex, seekMs: null },
      { type: "incident", action, stepIndex, signals: [], fallbackMs },
    ],
  };
}

function done(state: DgState, atMs: number): DgResult {
  const fallbackMs = state.fallbackSinceMs === null ? 0 : atMs - state.fallbackSinceMs;
  return { state: { ...state, phase: "done", fallbackSinceMs: null, totalFallbackMs: state.totalFallbackMs + fallbackMs, recent: [] }, effects: [] };
}

const isWatching = (p: DgPhase) => p === "live" || p === "suspect";
const onFallback = (p: DgPhase) => p === "fallback" || p === "recovering";

/** The DemoGuard state machine. Pure: the same events always give the same states and effects. */
export function dgReduce(state: DgState, event: DgEvent, steps: DgStep[], policy: DgPolicy = DEFAULT_POLICY): DgResult {
  const same = { state, effects: [] as DgEffect[] };
  const last = steps.length - 1;
  switch (event.type) {
    case "preflight":
      return state.phase === "idle" || state.phase === "preflight" || state.phase === "armed" ? { state: { ...state, phase: "preflight" }, effects: [] } : same;

    case "arm":
      if (state.phase !== "preflight") return { state, effects: [{ type: "rejected", reason: "Run pre-flight first." }] };
      if (event.criticalFailures > 0)
        return { state, effects: [{ type: "rejected", reason: `${event.criticalFailures} critical pre-flight ${event.criticalFailures === 1 ? "check fails" : "checks fail"}.` }] };
      if (steps.length === 0) return { state, effects: [{ type: "rejected", reason: "The step map has no steps." }] };
      return { state: { ...state, phase: "armed" }, effects: [] };

    case "activity":
      return state.phase === "armed" ? { state: { ...state, phase: "live", stepIndex: 0, stepStartedMs: event.atMs }, effects: [{ type: "step", stepIndex: 0 }] } : same;

    case "signal": {
      if (!isWatching(state.phase)) return same;
      const s = event.signal;
      if (CRITICAL_SIGNALS.has(s.kind)) return toFallback(state, steps, s.atMs, "switch", [...state.recent, s]);
      const recent = [...state.recent.filter((r) => s.atMs - r.atMs <= policy.corroborateMs), s];
      const kinds = new Set(recent.map((r) => r.kind));
      if (kinds.size >= 2) return toFallback(state, steps, s.atMs, "switch", recent);
      return { state: { ...state, phase: "suspect", recent }, effects: [] };
    }

    case "step_complete": {
      if (isWatching(state.phase)) {
        if (state.stepIndex >= last) return done(state, event.atMs);
        const stepIndex = state.stepIndex + 1;
        return { state: { ...state, phase: "live", stepIndex, stepStartedMs: event.atMs, recent: [] }, effects: [{ type: "step", stepIndex }] };
      }
      return same;
    }

    case "recovered":
      return state.phase === "fallback" ? { state: { ...state, phase: "recovering" }, effects: [] } : same;

    case "hotkey":
      if (event.action === "panic") return isWatching(state.phase) || state.phase === "recovering" || state.phase === "frozen" ? toFallback(state, steps, event.atMs, "panic", []) : same;
      if (event.action === "freeze") {
        // From live: hold the live picture. From recovering: hold on the fallback clip (fallbackSinceMs keeps
        // counting) instead of cutting back at the next step boundary, until Resume.
        if (!isWatching(state.phase) && state.phase !== "recovering") return same;
        return { state: { ...state, phase: "frozen", recent: [] }, effects: [{ type: "incident", action: "freeze", stepIndex: state.stepIndex, signals: [], fallbackMs: 0 }] };
      }
      // Resume: back to live from fallback, recovering or frozen.
      if (onFallback(state.phase) || state.phase === "frozen") {
        if (state.phase === "frozen" && state.fallbackSinceMs === null)
          return { state: { ...state, phase: "live", stepStartedMs: event.atMs }, effects: [{ type: "incident", action: "resume", stepIndex: state.stepIndex, signals: [], fallbackMs: 0 }] };
        return toLive(state, event.atMs, "resume", state.stepIndex);
      }
      return same;

    case "tick": {
      if (state.phase === "suspect") {
        const latest = Math.max(...state.recent.map((r) => r.atMs));
        if (event.atMs - latest >= policy.suspectClearMs) return { state: { ...state, phase: "live", recent: [] }, effects: [] };
        return same;
      }
      if (onFallback(state.phase)) {
        // The fallback clip plays the step from its in-point to its out-point; then the next step starts.
        if (event.atMs - state.stepStartedMs < clipMs(steps[state.stepIndex])) return same;
        if (state.stepIndex >= last) return done(state, event.atMs);
        const stepIndex = state.stepIndex + 1;
        // Recovery cuts back only at a step boundary.
        if (state.phase === "recovering") return toLive(state, event.atMs, "recover", stepIndex);
        return { state: { ...state, stepIndex, stepStartedMs: event.atMs }, effects: [{ type: "step", stepIndex }] };
      }
      return same;
    }

    case "end":
      return state.phase === "idle" || state.phase === "done" ? same : done(state, event.atMs);
  }
}

// ---------- Pre-flight ----------

export const CheckStatus = z.enum(["pass", "fail", "warn", "unknown"]);
export type CheckStatus = z.infer<typeof CheckStatus>;

export const PreflightCheck = z.object({
  id: z.string(),
  label: z.string(),
  status: CheckStatus,
  detail: z.string(),
  critical: z.boolean().default(false),
  source: z.enum(["server", "companion", "browser"]).default("server"),
});
export type PreflightCheck = z.infer<typeof PreflightCheck>;

/** Checks merge by id; the newest result for an id wins. */
export function mergeChecks(current: PreflightCheck[], incoming: PreflightCheck[]): PreflightCheck[] {
  const byId = new Map(current.map((c) => [c.id, c]));
  for (const c of incoming) byId.set(c.id, c);
  return [...byId.values()];
}

export const criticalFailures = (checks: PreflightCheck[]) => checks.filter((c) => c.critical && c.status !== "pass").length;

/** Presenter checklist items the browser shows; they never block Arm. */
export const MANUAL_CHECKS = [
  { id: "manual:dnd", label: "Do Not Disturb is on" },
  { id: "manual:tabs", label: "Sensitive tabs and windows are closed" },
  { id: "manual:power", label: "The laptop is on power" },
] as const;

/** Companion config (stage-ready.demoguard.json on the presenter machine). */
export const CompanionConfig = z.object({
  /** The demo app the proxy forwards to, e.g. http://localhost:5173. */
  target: z.string().url().optional(),
  proxyPort: z.number().int().min(1024).max(65535).default(8787),
  /** Requests slower than this count as timeouts. */
  timeoutMs: z.number().int().positive().default(5_000),
  requiredEnv: z.array(z.string()).default([]),
  endpoints: z.array(z.object({ url: z.string().url(), budgetMs: z.number().int().positive().default(2_000) })).default([]),
  login: z
    .object({
      url: z.string().url(),
      method: z.enum(["GET", "POST"]).default("POST"),
      headers: z.record(z.string()).default({}),
      body: z.string().optional(),
      expectStatus: z.number().int().default(200),
    })
    .optional(),
  minFreeDiskGb: z.number().positive().default(5),
});
export type CompanionConfig = z.infer<typeof CompanionConfig>;

// ---------- Step map from a golden run ----------

export interface GoldenSample {
  stepKey: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  outputHash: string | null;
  outputFrame?: string | null;
}

export interface DerivedStep {
  name: string;
  maxDurationMs: number;
  successSignal: { stepKey: string; outputHash: string | null; goldenDurationMs: number };
  fallbackInMs: number;
  fallbackOutMs: number;
  narration: string;
  /** The golden run's result screen for this step, when it was captured. */
  expectedKeyframeUrls: string[];
}

const LEAD_MS = 1_000;
const TAIL_MS = 1_500;

const titleCase = (key: string) => {
  const s = key.replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/**
 * Turns the timed steps of a golden-run rehearsal into a step map: each step's fallback clip runs
 * from just before the action to just after its result, and its maximum duration leaves headroom
 * over the golden run (1.5x, at least 2 s more, at least 3 s). Narration is what was said during it.
 */
export function deriveSteps(samples: GoldenSample[], transcript: { startMs: number; endMs: number; text: string }[]): DerivedStep[] {
  return [...samples]
    .sort((a, b) => a.startMs - b.startMs)
    .map((s) => {
      const said = transcript.filter((t) => t.endMs >= s.startMs - 3_000 && t.startMs <= s.endMs).map((t) => t.text);
      return {
        name: titleCase(s.stepKey),
        maxDurationMs: Math.max(Math.round(s.durationMs * 1.5), s.durationMs + 2_000, 3_000),
        successSignal: { stepKey: s.stepKey, outputHash: s.outputHash, goldenDurationMs: s.durationMs },
        fallbackInMs: Math.max(0, s.startMs - LEAD_MS),
        fallbackOutMs: s.endMs + TAIL_MS,
        narration: said.join(" ").slice(0, 400),
        expectedKeyframeUrls: s.outputFrame ? [s.outputFrame] : [],
      };
    });
}

export const PatchStepBody = z
  .object({
    name: z.string().trim().min(1).max(120),
    narration: z.string().max(400),
    maxDurationMs: z.number().int().min(500).max(300_000),
    fallbackInMs: z.number().int().min(0),
    fallbackOutMs: z.number().int().min(1),
  })
  .partial()
  .refine((s) => s.fallbackInMs === undefined || s.fallbackOutMs === undefined || s.fallbackOutMs > s.fallbackInMs, "The out-point must come after the in-point.");
