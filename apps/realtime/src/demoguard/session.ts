import type { Db } from "@stage-ready/db";
import { incidents, sessions, stepMaps, steps as stepsTable } from "@stage-ready/db";
import {
  CRITICAL_SIGNALS,
  DEFAULT_POLICY,
  SIGNAL_LABEL,
  criticalFailures,
  dgReduce,
  initialDgState,
  mergeChecks,
  type ClientMessage,
  type DgEffect,
  type DgEvent,
  type DgSignal,
  type DgState,
  type PreflightCheck,
  type ServerMessage,
  type SignalKind,
  type UiRegion,
} from "@stage-ready/shared";
import { hamming } from "@stage-ready/shared/ws-binary";
import { and, asc, desc, eq } from "drizzle-orm";
import type { Logger } from "pino";
import type { Vision } from "@stage-ready/ai";
import { fineHash, hexHamming } from "../auditor/canned";
import { DEFAULT_STOPWATCH, Stopwatch } from "../auditor/stopwatch";
import type { Tracker } from "../vision/tracker";
import { BLANK_STD, RedBaseline, frameStats } from "./detectors";

export type Sender = (message: ServerMessage) => void;

export interface DgStepRow {
  id: string;
  name: string;
  narration: string;
  maxDurationMs: number;
  fallbackInMs: number;
  fallbackOutMs: number;
  /** 256-bit hash of the screen when the step succeeded in the golden run, if known. */
  expectedHash: string | null;
}

export interface DemoGuardContext {
  sessionId: string;
  projectId: string;
  demoMode: boolean;
  stepMapId: string;
  fallbackClipUrl: string | null;
  steps: DgStepRow[];
  badgeVisible: boolean;
  ended: boolean;
}

export async function loadDemoGuardContext(db: Db, sessionId: string, projectId: string, demoMode: boolean): Promise<DemoGuardContext | null> {
  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.projectId, projectId)));
  if (!session || session.mode !== "demoguard") return null;
  const [map] = await db.select().from(stepMaps).where(eq(stepMaps.projectId, projectId)).orderBy(desc(stepMaps.createdAt)).limit(1);
  if (!map) return null;
  const rows = await db.select().from(stepsTable).where(eq(stepsTable.stepMapId, map.id)).orderBy(asc(stepsTable.order));
  const summary = session.summary ?? {};
  return {
    sessionId,
    projectId,
    demoMode,
    stepMapId: map.id,
    fallbackClipUrl: map.fallbackClipUrl,
    steps: rows.map((s) => ({
      id: s.id,
      name: s.name,
      narration: s.narration,
      maxDurationMs: s.maxDurationMs,
      fallbackInMs: s.fallbackInMs,
      fallbackOutMs: s.fallbackOutMs,
      expectedHash: typeof s.successSignal.outputHash === "string" ? s.successSignal.outputHash : null,
    })),
    badgeVisible: summary.badgeVisible !== false,
    ended: session.endedAt !== null,
  };
}

export interface DemoGuardDeps {
  db: Db;
  logger: Logger;
  tracker: Tracker;
  /** Muse Spark vision: confirms an expected-state mismatch before it becomes a signal. Absent in Demo Mode. */
  vision?: Vision | null;
  onEnded?: (projectId: string, sessionId: string) => void;
}

/** How long the model may take to confirm a mismatch before the perceptual hash decides alone. */
const CONFIRM_TIMEOUT_MS = 3_000;

/** Frames in DemoGuard are sampled at 4 fps. */
export const DEMOGUARD_FPS = 4;
const TICK_MS = 100;
/** The browser re-sends an unchanged frame every second, so a static blank screen is still seen. */
const BLANK_FOR_MS = 750;
const HEALTHY_FOR_MS = 1_500;
/** Of 256 bits; above this the screen is not the expected state. */
const MISMATCH_BITS = 48;
/** A spinner visible for half of the step's allowance counts as over budget. */
const SPINNER_SHARE = 0.5;

/** One presentation watched by DemoGuard. The browser streams frames; the companion streams network signals and runs local checks. */
export class DemoGuardSession {
  private readonly senders = new Set<Sender>();
  private companion: { send: Sender; version: string } | null = null;
  private state: DgState = initialDgState();
  private checks: PreflightCheck[] = [];
  private readonly t0 = performance.now();
  private readonly stopwatch = new Stopwatch(DEFAULT_STOPWATCH);
  private readonly red = new RedBaseline();
  private lastHash: bigint | null = null;
  private blankSinceMs: number | null = null;
  private spinnerSinceMs: number | null = null;
  private healthySinceMs: number | null = null;
  private stepFlags = new Set<SignalKind>();
  private feed: { kind: SignalKind; detail: string; atMs: number }[] = [];
  private lastFrame: { receivedMs: number; frameTs: number } | null = null;
  private readonly timer: NodeJS.Timeout;
  private ending: Promise<void> | null = null;
  private visionMode: "sam" | "heuristic" = "heuristic";
  /** Fine hash of the latest frame, only computed when the current step has an expected state. */
  private lastJpegHash: string | null = null;
  private lastJpeg: Uint8Array | null = null;

  constructor(
    readonly ctx: DemoGuardContext,
    private readonly deps: DemoGuardDeps,
  ) {
    this.timer = setInterval(() => this.dispatch({ type: "tick", atMs: this.now() }), TICK_MS);
    void deps.tracker.probe().then((ok) => {
      this.visionMode = ok ? "sam" : "heuristic";
      this.publishState();
    });
  }

  private now() {
    return Math.round(performance.now() - this.t0);
  }

  attach(send: Sender) {
    this.senders.add(send);
    this.publishState(send);
    send({ type: "demoguard.preflight", checks: this.checks, criticalFailures: criticalFailures(this.checks) });
  }

  detach(send: Sender) {
    this.senders.delete(send);
    if (this.companion?.send === send) {
      this.companion = null;
      this.checks = mergeChecks(this.checks, [
        {
          id: "companion",
          label: "Companion connected",
          status: "warn",
          detail: "The companion disconnected. Network signals and local checks are off; frame detection continues.",
          critical: false,
          source: "server",
        },
      ]);
      this.publishPreflight();
      this.publishState();
    }
  }

  get clients() {
    return this.senders.size;
  }

  private broadcast(message: ServerMessage) {
    for (const send of this.senders) send(message);
  }

  private publishState(to?: Sender) {
    const step = this.ctx.steps[this.state.stepIndex];
    const onFallback = this.state.phase === "fallback" || this.state.phase === "recovering";
    const message: ServerMessage = {
      type: "demoguard.state",
      state: this.state.phase,
      stepId: step?.id ?? null,
      stepIndex: this.state.stepIndex,
      signals: this.state.recent.map((s) => s.kind),
      totalFallbackMs: this.state.totalFallbackMs,
      fallbackSeekMs: onFallback ? (step?.fallbackInMs ?? null) : null,
      badgeVisible: this.ctx.badgeVisible,
      companion: { connected: this.companion !== null, version: this.companion?.version ?? null },
      vision: this.visionMode,
    };
    if (to) to(message);
    else this.broadcast(message);
  }

  private publishPreflight() {
    this.broadcast({ type: "demoguard.preflight", checks: this.checks, criticalFailures: criticalFailures(this.checks) });
  }

  private serverChecks(): PreflightCheck[] {
    const n = this.ctx.steps.length;
    return [
      {
        id: "stepmap",
        label: "Step map has steps",
        status: n > 0 ? "pass" : "fail",
        detail: n > 0 ? `${n} steps from the golden run.` : "Build the step map from a golden run first.",
        critical: true,
        source: "server",
      },
      {
        id: "vision",
        label: "UI tracking (SAM 3.1)",
        status: this.visionMode === "sam" ? "pass" : "warn",
        detail: this.visionMode === "sam" ? "Error dialogs and spinners come from SAM 3.1." : "SAM is not loaded: DemoGuard uses frame hashes, pixel heuristics and network signals only.",
        critical: false,
        source: "server",
      },
      {
        id: "companion",
        label: "Companion connected",
        status: this.companion ? "pass" : "warn",
        detail: this.companion ? `Companion ${this.companion.version}.` : "Run the companion for network signals and local checks. Without it, browser mode still watches the screen.",
        critical: false,
        source: "server",
      },
    ];
  }

  async event(msg: ClientMessage, from: Sender) {
    switch (msg.type) {
      case "companion.hello":
        this.companion = { send: from, version: msg.version };
        this.publishState();
        from({ type: "preflight.run" });
        return;
      case "preflight.result":
        this.checks = mergeChecks(this.checks, msg.checks);
        this.publishPreflight();
        return;
      case "demoguard.control":
        if (msg.action === "preflight") {
          await this.deps.tracker.probe().then((ok) => (this.visionMode = ok ? "sam" : "heuristic"));
          this.checks = mergeChecks(this.checks, this.serverChecks());
          this.companion?.send({ type: "preflight.run" });
          this.dispatch({ type: "preflight", atMs: this.now() });
          this.publishPreflight();
        } else if (msg.action === "arm") {
          this.dispatch({ type: "arm", atMs: this.now(), criticalFailures: criticalFailures(this.checks) }, from);
        } else await this.end();
        return;
      case "demoguard.settings":
        this.ctx.badgeVisible = msg.badgeVisible;
        this.companion?.send({ type: "obs.badge", visible: msg.badgeVisible });
        this.publishState();
        return;
      case "demoguard.hotkey":
        this.dispatch({ type: "hotkey", action: msg.action, atMs: this.now() });
        return;
      case "demoguard.test":
        // The Stage window shows a fake error dialog; this is the signal DemoGuard would have raised for it.
        // Recovery comes from the real frames, so a test shows a true switch and cut back.
        this.signal("error_dialog", "Test of the safety net: an injected error dialog.", this.now());
        return;
      case "signal.network": {
        const atMs = this.now();
        if (msg.status >= 500) this.signal("http_5xx", `${msg.status} from ${msg.url}`, atMs);
        else if (msg.status === 0) this.signal("http_timeout", `${msg.url} timed out after ${Math.round(msg.durationMs)} ms`, atMs);
        return;
      }
      case "signal.input":
        if (this.state.phase === "armed") this.dispatch({ type: "activity", atMs: this.now() });
        this.onStopwatch(this.stopwatch.input(this.now()));
        return;
      default:
        return;
    }
  }

  frame(frameTs: number, hash: bigint, jpeg: Uint8Array) {
    const atMs = this.now();
    this.lastFrame = { receivedMs: atMs, frameTs };
    const distance = this.lastHash === null ? 0 : hamming(hash, this.lastHash);
    this.lastHash = hash;
    const phase = this.state.phase;
    if (phase === "idle" || phase === "preflight" || phase === "done") return;
    if (phase === "armed" && distance >= DEFAULT_STOPWATCH.minChange) this.dispatch({ type: "activity", atMs });

    this.lastJpegHash = this.ctx.steps[this.state.stepIndex]?.expectedHash ? fineHash(jpeg) : null;
    this.lastJpeg = jpeg;
    const stats = frameStats(jpeg);
    const errorByPixels = stats ? this.red.isError(atMs, stats) : false;
    const blank = stats ? stats.lumaStd < BLANK_STD : false;
    if (blank) this.blankSinceMs ??= atMs;
    else this.blankSinceMs = null;
    const finish = (regions: UiRegion[] | null) => {
      // Live control draws SAM's boxes over its preview.
      if (regions) this.broadcast({ type: "ui.states", frameTs, regions, detector: "sam" });
      const samError = regions?.some((r) => r.label === "error_dialog" && r.score >= 0.5) ?? false;
      // SAM catches dialogs of any colour; the red-region heuristic stays on as a backstop.
      const error = samError || errorByPixels;
      const spinner = regions?.some((r) => r.label === "spinner" || r.label === "progress_bar") ?? false;
      this.watch(atMs, { error, blank: this.blankSinceMs !== null && atMs - this.blankSinceMs >= BLANK_FOR_MS, spinner });
      this.onStopwatch(this.stopwatch.frame(atMs, distance, regions));
    };
    if (this.visionMode === "sam") void this.deps.tracker.track(jpeg).then(finish);
    else finish(null);
  }

  private watch(atMs: number, seen: { error: boolean; blank: boolean; spinner: boolean }) {
    const step = this.ctx.steps[this.state.stepIndex];
    if (seen.error) this.signal("error_dialog", "An error dialog, toast or banner appeared on screen.", atMs);
    if (seen.blank) this.signal("blank_screen", "The captured screen is blank.", atMs);
    if (seen.spinner) this.spinnerSinceMs ??= atMs;
    else this.spinnerSinceMs = null;
    if (step && this.spinnerSinceMs !== null && atMs - this.spinnerSinceMs > step.maxDurationMs * SPINNER_SHARE)
      this.signal("spinner_over_budget", `A spinner has shown for ${((atMs - this.spinnerSinceMs) / 1000).toFixed(1)} s.`, atMs);

    // Recovery: on fallback, the live app counts as healthy once it shows no error and, if known, the expected state.
    if (this.state.phase === "fallback") {
      const expected = step?.expectedHash ?? null;
      const matches = expected === null || (this.lastJpegHash !== null && hexHamming(this.lastJpegHash, expected) <= MISMATCH_BITS);
      if (!seen.error && !seen.blank && matches) {
        this.healthySinceMs ??= atMs;
        if (atMs - this.healthySinceMs >= HEALTHY_FOR_MS) this.dispatch({ type: "recovered", atMs });
      } else this.healthySinceMs = null;
    } else this.healthySinceMs = null;
  }

  private onStopwatch(events: ReturnType<Stopwatch["frame"]>) {
    for (const e of events) {
      if (e.type !== "completed") continue;
      if (this.state.phase !== "live" && this.state.phase !== "suspect") continue;
      const step = this.ctx.steps[this.state.stepIndex];
      if (step?.expectedHash && this.lastJpegHash && hexHamming(this.lastJpegHash, step.expectedHash) > MISMATCH_BITS) {
        if (this.deps.vision && this.lastJpeg) void this.confirmMismatch(step, this.lastJpeg, this.state.stepIndex);
        else this.signal("state_mismatch", `After ${step.name}, the screen does not match the golden run.`, this.now());
        continue;
      }
      this.dispatch({ type: "step_complete", atMs: this.now() });
    }
  }

  /**
   * The hash says the screen differs from the golden run; Muse Spark looks at the frame. A screen that does
   * show the step's result (a cosmetic difference) completes the step; otherwise the mismatch is raised with
   * the model's reason. If the model fails or is slow, the hash decides.
   */
  private async confirmMismatch(step: { name: string; narration: string }, jpeg: Uint8Array, stepIndex: number) {
    const question = [
      `A live product demo just finished the step "${step.name}".`,
      step.narration ? `In the rehearsal the presenter said: "${step.narration.slice(0, 300)}"` : "",
      'Does this screenshot show that step\'s result, with no error dialog, spinner or blank screen? Answer "yes" or "no", then one short reason.',
    ]
      .filter(Boolean)
      .join("\n");
    let answer: string | null = null;
    try {
      answer = await Promise.race([this.deps.vision!.describeFrame({ jpeg, question }), new Promise<null>((resolve) => setTimeout(() => resolve(null), CONFIRM_TIMEOUT_MS))]);
    } catch (error) {
      this.deps.logger.warn({ err: error }, "expected-state confirmation failed; the hash decides");
    }
    if (this.state.stepIndex !== stepIndex) return;
    if (answer && /^\s*yes\b/i.test(answer)) {
      this.dispatch({ type: "step_complete", atMs: this.now() });
      return;
    }
    const reason = answer?.replace(/^\s*no\b[\s,.:;-]*/i, "").trim();
    this.signal("state_mismatch", `After ${step.name}, the screen does not match the golden run${reason ? ` (Muse Spark: ${reason.slice(0, 160)})` : "."}`, this.now());
  }

  private signal(kind: SignalKind, detail: string, atMs: number) {
    const phase = this.state.phase;
    if (phase !== "live" && phase !== "suspect") return;
    // Each kind is reported once per step, so a dialog that stays up does not flood the feed.
    if (this.stepFlags.has(kind)) return;
    this.stepFlags.add(kind);
    const s: DgSignal = { kind, atMs, detail };
    this.feed.push({ kind, detail, atMs });
    this.broadcast({ type: "demoguard.signal", kind, critical: CRITICAL_SIGNALS.has(kind), detail, atMs });
    this.dispatch({ type: "signal", signal: s });
  }

  private dispatch(event: DgEvent, from?: Sender) {
    const before = this.state;
    // Step over budget, checked on each tick while watching.
    if (event.type === "tick" && (before.phase === "live" || before.phase === "suspect")) {
      const step = this.ctx.steps[before.stepIndex];
      if (step && event.atMs - before.stepStartedMs > step.maxDurationMs)
        this.signal("step_over_budget", `${step.name} has run past its ${(step.maxDurationMs / 1000).toFixed(0)} s maximum.`, event.atMs);
    }
    const { state, effects } = dgReduce(this.state, event, this.ctx.steps, DEFAULT_POLICY);
    this.state = state;
    for (const effect of effects) this.apply(effect, from);
    if (state.phase !== before.phase || state.stepIndex !== before.stepIndex) {
      if (state.stepIndex !== before.stepIndex) this.stepFlags.clear();
      this.publishState();
      if (state.phase === "done" && before.phase !== "done") void this.end();
    }
  }

  private apply(effect: DgEffect, from?: Sender) {
    const step = this.ctx.steps[effect.type === "rejected" ? 0 : effect.stepIndex];
    switch (effect.type) {
      case "rejected":
        from?.({ type: "error", code: "arm_blocked", message: effect.reason });
        return;
      case "step":
        return;
      case "switch":
        // Video switching is not built yet: the companion is told what it would cue, and logs it.
        this.companion?.send({ type: "obs.switch", scene: effect.to, mediaPath: effect.to === "fallback" ? this.ctx.fallbackClipUrl : null, seekMs: effect.seekMs });
        return;
      case "incident": {
        const atMs = this.now();
        const trigger = effect.signals.at(-1);
        // Detection time: from capture of the frame that was being processed (browser clock) to this decision.
        const detectionMs = trigger && this.lastFrame && effect.action === "switch" && trigger.kind !== "http_5xx" && trigger.kind !== "http_timeout" ? atMs - this.lastFrame.receivedMs : null;
        this.broadcast({
          type: "demoguard.incident",
          action: effect.action,
          stepIndex: effect.stepIndex,
          signals: effect.signals.map((s) => s.kind),
          fallbackMs: effect.fallbackMs,
          detectionMs,
          atMs: this.lastFrame && trigger ? this.lastFrame.frameTs : atMs,
        });
        void this.deps.db
          .insert(incidents)
          .values({
            projectId: this.ctx.projectId,
            stepMapId: this.ctx.stepMapId,
            sessionId: this.ctx.sessionId,
            stepId: step?.id ?? null,
            atMs,
            signals: effect.signals.map((s) => s.kind),
            action: effect.action,
            fallbackMs: effect.fallbackMs,
            detectionMs,
            detail: effect.signals.map((s) => `${SIGNAL_LABEL[s.kind]}: ${s.detail}`).join(" · "),
          })
          .catch((error: unknown) => this.deps.logger.error({ err: error }, "could not record an incident"));
        return;
      }
    }
  }

  end(): Promise<void> {
    this.ending ??= (async () => {
      clearInterval(this.timer);
      if (this.state.phase !== "done") this.dispatch({ type: "end", atMs: this.now() });
      const summary = {
        badgeVisible: this.ctx.badgeVisible,
        demoguard: { totalFallbackMs: this.state.totalFallbackMs, signals: this.feed.length, steps: this.ctx.steps.length, reachedStep: this.state.stepIndex },
      };
      const [row] = await this.deps.db.select({ summary: sessions.summary }).from(sessions).where(eq(sessions.id, this.ctx.sessionId));
      await this.deps.db
        .update(sessions)
        .set({ endedAt: new Date(), summary: { ...(row?.summary ?? {}), ...summary } })
        .where(eq(sessions.id, this.ctx.sessionId));
      this.broadcast({ type: "session.summary", summaryId: this.ctx.sessionId });
      this.deps.onEnded?.(this.ctx.projectId, this.ctx.sessionId);
    })();
    return this.ending;
  }
}
