import { randomUUID } from "node:crypto";
import { promisedLatencyMs, prompts, type Ai } from "@stage-ready/ai";
import { sessions as sessionsTable, type Db } from "@stage-ready/db";
import { eq } from "drizzle-orm";
import {
  PERSONA_ROLE_LABEL,
  TALK_OVER_YIELD_MS,
  demoRehearsalScript,
  formatSeconds,
  latencySummary,
  type Claim,
  type ClaimStatus,
  type ClaimType,
  type ClaimVerdict,
  type ClientMessage,
  type Segment,
  type ServerMessage,
  type SessionSummary,
  type AuditFlag,
  type ModelTag,
  type UiRegion,
} from "@stage-ready/shared";
import { hamming } from "@stage-ready/shared/ws-binary";
import type { Logger } from "pino";
import { detectCanned, fineHash } from "../auditor/canned";
import { Coverage } from "../auditor/coverage";
import { RECHECK_WINDOW_MS, enforceEvidenceRule, verifyDeterministic, type LatencyRecord } from "../auditor/rules";
import { Stopwatch, type StopwatchEvent } from "../auditor/stopwatch";
import { candidates, type Candidate, type PolicyClaim } from "../judges/policy";
import { ScriptedStt } from "../stt/scripted";
import { SttUnavailableError, type SttStream } from "../stt/types";
import { Vad, pcmFromBytes } from "../stt/vad";
import { VisionWhisperStt } from "../stt/vision";
import type { Tracker } from "../vision/tracker";
import type { SessionContext } from "./context";
import { persistSession } from "./persist";
import { asksToFinish, isVagueAnswer, splitSentences } from "./sentences";

export interface SessionDeps {
  db: Db;
  ai: Ai;
  logger: Logger;
  tracker: Tracker;
  visionUrl: string | undefined;
  visionToken: string | undefined;
  speechModelConfigured: boolean;
  /** Called once the session is persisted. */
  onEnded?: (projectId: string, sessionId: string) => void;
}

interface LedgerClaim extends PolicyClaim {
  type: ClaimType;
  verdict: ClaimVerdict;
  segmentLocalId: string;
  claim: Claim;
  pendingUntilMs: number | null;
  /** Set once a running step has already outlasted the promise, before its final measurement. */
  earlyContradicted?: boolean;
  /** The model behind the current verdict (extraction, or the later verification). */
  model?: ModelTag;
}

interface Turn {
  personaId: string;
  atMs: number;
  kind: "interrupt" | "question" | "follow_up";
  text: string;
  trigger: string | null;
  answerSegmentLocalIds: string[];
  model?: ModelTag;
}

const tagOf = (r: { modelId: string; latencyMs: number; fallback?: "budget" | "error" }): ModelTag => ({
  modelId: r.modelId,
  latencyMs: Math.max(0, Math.round(r.latencyMs)),
  ...(r.fallback ? { fallback: r.fallback } : {}),
});

const mmss = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0")}`;

/** Extra quiet after a final (which already follows ~600 ms of silence) before the answer counts as finished. */
const ANSWER_PAUSE_MS = 1_500;
const QA_PROMPTS: Record<string, (criterion: string) => string> = {
  technical: (c) => `How did you measure ${c.toLowerCase()}, and what is the evidence?`,
  impact: (c) => `Who is the user, and what measured change in ${c.toLowerCase()} have you seen?`,
  product: (c) => `What happens when the product is wrong, and how does that affect ${c.toLowerCase()}?`,
};

/** One live rehearsal: transcript, claim ledger, latency stopwatch, coverage and the judge panel. */
export class LiveSession {
  state: "ready" | "live" | "qa" | "ended" = "ready";
  private send: (message: ServerMessage) => void = () => undefined;
  private stt: SttStream | null = null;
  private readonly vad = new Vad();
  private readonly stopwatch = new Stopwatch();
  private readonly coverage: Coverage;
  private ticker: NodeJS.Timeout | null = null;
  private pipeline: Promise<void> = Promise.resolve();

  // Clock: session time is the browser's (ms since it pressed Start), carried on every binary message.
  private lastClientMs = 0;
  private lastWallMs = Date.now();
  private startedAt: Date | null = null;

  private readonly segments: Segment[] = [];
  private readonly ledger: LedgerClaim[] = [];
  private readonly latency: (LatencyRecord & { endMs: number; detector: string; inputHash: string | null; outputHash: string | null })[] = [];
  /** Recent changed frames (the browser skips unchanged ones), for show-or-strike and the canned detector. */
  private readonly frames: { atMs: number; jpeg: Uint8Array }[] = [];
  private readonly flags: AuditFlag[] = [];
  private demoEndedAtMs: number | null = null;
  private readonly turns: Turn[] = [];
  private readonly fixTasks = new Map<string, { title: string; detail: string; suggestedArtifact: string }>();
  private readonly personaLastTurn = new Map<string, number>();
  private readonly queued: { personaId: string; text: string; kind: Turn["kind"]; trigger: string | null; model?: ModelTag }[] = [];
  private readonly coveredGapAsked = new Set<string>();
  private readonly stepCount = new Map<string, number>();
  private lastHash: bigint | null = null;
  private openStep: { startMs: number; key: string } | null = null;
  private lastInterruptAtMs: number | null = null;
  private judgeSpeaking: { personaId: string; text: string; since: number; kind: Turn["kind"]; trigger: string | null; model?: ModelTag } | null = null;
  private judgeSpeakTimer: NodeJS.Timeout | null = null;
  private answerTimer: NodeJS.Timeout | null = null;
  private currentAnswer: string[] = [];
  private currentAnswerIds: string[] = [];
  private deciding = false;
  private manualSections = false;
  private sectionIndex = 0;
  private sectionStartedMs = 0;
  private overTimeAsked = new Set<string>();
  private modelCalls = 0;
  private mockedCalls = 0;
  private modelCost: number | null = 0;
  private latestRegions: { atMs: number; labels: string[] }[] = [];
  private difficulty: number;

  constructor(
    readonly ctx: SessionContext,
    private readonly deps: SessionDeps,
  ) {
    this.coverage = new Coverage(ctx.criteria);
    this.difficulty = ctx.difficulty;
    if (ctx.mode === "section_drill" && ctx.drillSection)
      this.sectionIndex = Math.max(
        0,
        ctx.sections.findIndex((s) => s.key === ctx.drillSection),
      );
  }

  attach(send: (message: ServerMessage) => void) {
    this.send = send;
    this.sendState();
  }

  detach() {
    this.send = () => undefined;
  }

  private now(): number {
    return this.lastClientMs + (Date.now() - this.lastWallMs);
  }

  private observe(clientMs: number) {
    if (clientMs >= this.lastClientMs) {
      this.lastClientMs = clientMs;
      this.lastWallMs = Date.now();
    }
  }

  private section() {
    return this.ctx.sections[this.sectionIndex] ?? null;
  }

  private sendState() {
    this.send({
      type: "session.state",
      state: this.state,
      elapsedMs: Math.max(0, Math.round(this.now())),
      sectionKey: this.section()?.key ?? null,
      stt: this.stt?.name ?? "not started",
      vision: this.deps.tracker.available ? "sam" : "phash",
    });
  }

  private track<T>(result: { costUsd: number | null; value: T; modelId: string }): T {
    this.modelCalls++;
    if (result.modelId === "mock") this.mockedCalls++;
    this.modelCost = this.modelCost === null || result.costUsd === null ? null : this.modelCost + result.costUsd;
    return result.value;
  }

  // ---------- lifecycle ----------

  async start(msg: Extract<ClientMessage, { type: "session.start" }>): Promise<void> {
    if (this.state !== "ready") return;
    if (msg.difficulty) this.difficulty = msg.difficulty;
    if (msg.personaIds.length > 0) {
      const keep = new Set(msg.personaIds);
      this.ctx.personas = this.ctx.personas.filter((p) => keep.has(p.id));
    }
    const handlers = {
      partial: (segment: Segment) => this.onPartial(segment),
      final: (segment: Segment) => {
        this.pipeline = this.pipeline.then(() => this.onFinal(segment)).catch((error: unknown) => this.deps.logger.error({ err: error }, "sentence pipeline failed"));
      },
      error: (error: Error) => {
        this.deps.logger.error({ err: error }, "speech to text error");
        this.send({ type: "error", code: "stt_error", message: error.message });
      },
    };
    try {
      if (this.ctx.demoMode) this.stt = new ScriptedStt(demoRehearsalScript, handlers);
      else if (this.deps.speechModelConfigured)
        throw new SttUnavailableError("MODEL_STT is set, but the Meta speech adapter needs its endpoint confirmed in the Meta Model API docs. Clear MODEL_STT to use faster-whisper.");
      else if (this.deps.visionUrl) this.stt = await VisionWhisperStt.connect(this.deps.visionUrl, this.deps.visionToken, handlers);
      else throw new SttUnavailableError("Speech to text is not configured. Start the vision service (services/vision) and set VISION_SERVICE_URL.");
    } catch (error) {
      const message = error instanceof SttUnavailableError ? error.message : `Speech to text failed to start: ${(error as Error).message}`;
      this.send({ type: "error", code: "stt_unavailable", message });
      return;
    }
    await this.deps.tracker.probe();
    this.startedAt = new Date();
    // Recorded now, so a running rehearsal is never mistaken for one that never started (those are pruned).
    const startedAt = this.startedAt;
    void Promise.resolve()
      .then(() => this.deps.db.update(sessionsTable).set({ startedAt }).where(eq(sessionsTable.id, this.ctx.sessionId)))
      .catch((error: unknown) => this.deps.logger.warn({ err: error }, "could not record the session start"));
    this.lastClientMs = 0;
    this.lastWallMs = Date.now();
    this.state = this.ctx.mode === "qa_only" ? "qa" : "live";
    this.sectionStartedMs = 0;
    this.ticker = setInterval(() => this.tick(), 200);
    this.sendState();
    if (this.state === "qa") setTimeout(() => void this.decide({ qaTurnDue: true }), 1_500);
  }

  async end(): Promise<string | null> {
    if (this.state === "ended") return this.ctx.sessionId;
    const wasStarted = this.startedAt !== null;
    this.state = "ended";
    if (this.ticker) clearInterval(this.ticker);
    if (this.answerTimer) clearTimeout(this.answerTimer);
    if (this.judgeSpeakTimer) clearTimeout(this.judgeSpeakTimer);
    await this.stt?.close().catch(() => undefined);
    await this.pipeline;
    if (wasStarted) await this.showOrStrike();
    this.sendState();
    if (!wasStarted) return null;
    const summary = this.summary();
    await persistSession(this.deps.db, this.ctx.projectId, this.ctx.sessionId, {
      startedAt: this.startedAt ?? new Date(),
      endedAt: new Date(),
      segments: this.segments,
      claims: this.ledger.map((c) => ({ localId: c.id, segmentLocalId: c.segmentLocalId, text: c.text, type: c.type, status: c.status, verdict: c.verdict, ...(c.model ? { model: c.model } : {}) })),
      latency: this.latency.map((l) => ({
        stepKey: l.stepKey,
        startMs: Math.round(l.startMs),
        endMs: Math.round(l.endMs),
        durationMs: Math.round(l.durationMs),
        detector: l.detector,
        inputHash: l.inputHash,
        outputHash: l.outputHash,
      })),
      turns: this.turns,
      fixTasks: [...this.fixTasks.values()],
      summary,
      rubricHeatmap: this.heatmap(),
    });
    this.send({ type: "session.summary", summaryId: this.ctx.sessionId });
    this.deps.onEnded?.(this.ctx.projectId, this.ctx.sessionId);
    return this.ctx.sessionId;
  }

  private heatmap(): Record<string, Record<string, number>> {
    const matrix = this.coverage.matrix();
    return Object.fromEntries(this.ctx.criteria.map((c) => [c.name, matrix[c.id] ?? {}]));
  }

  summary(): SessionSummary {
    const counts = { verified: 0, contradicted: 0, unverified: 0, not_shown: 0 } satisfies Record<ClaimStatus, number>;
    for (const c of this.ledger) counts[c.status]++;
    const total = Math.max(1, this.ledger.length);
    const coverageAvg = this.ctx.criteria.length ? this.ctx.criteria.reduce((sum, c) => sum + this.coverage.total(c.id), 0) / this.ctx.criteria.length : 0;
    const claimHealth = 1 - Math.min(1, (counts.contradicted + 0.4 * counts.unverified + 0.6 * counts.not_shown) / total);
    const steps = [...new Set(this.latency.map((l) => l.stepKey))];
    return {
      score: Math.max(0, Math.min(100, Math.round(60 * coverageAvg + 40 * claimHealth))),
      durationMs: Math.round(this.now()),
      claims: counts,
      interruptions: this.turns.filter((t) => t.kind === "interrupt").length,
      latency: steps.map((stepKey) => ({ stepKey, ...latencySummary(this.latency.filter((l) => l.stepKey === stepKey).map((l) => l.durationMs)) })),
      modelCostUsd: this.modelCost === null ? null : Math.round(this.modelCost * 10_000) / 10_000,
      modelCalls: this.modelCalls,
      mockedCalls: this.mockedCalls,
      stt: this.stt?.name ?? "none",
      flags: this.flags,
    };
  }

  // ---------- inputs ----------

  audio(atMs: number, bytes: Uint8Array) {
    if (this.state !== "live" && this.state !== "qa") return;
    this.observe(atMs);
    const pcm = pcmFromBytes(bytes);
    this.stt?.push(pcm, atMs);
    this.vad.push(pcm, atMs);
    // Turn-taking: the judge yields when the presenter keeps talking over it.
    const since = this.vad.speechSince;
    if (this.judgeSpeaking && since !== null && since >= this.judgeSpeaking.since && this.now() - since >= TALK_OVER_YIELD_MS) this.yieldJudge("talk_over");
  }

  frame(atMs: number, hash: bigint, jpeg: Uint8Array) {
    if (this.state !== "live" && this.state !== "qa") return;
    this.observe(atMs);
    const distance = this.lastHash === null ? 0 : hamming(hash, this.lastHash);
    this.lastHash = hash;
    this.frames.push({ atMs, jpeg });
    if (this.frames.length > 120) this.frames.shift();
    this.onStopwatch(this.stopwatch.frame(atMs, distance, null));
    if (this.deps.tracker.available) {
      const started = Date.now();
      void this.deps.tracker.track(jpeg).then((regions) => {
        if (!regions) return;
        this.send({ type: "metric", path: "frame_state", ms: Date.now() - started });
        this.send({ type: "ui.states", frameTs: atMs, regions, detector: "sam" });
        this.latestRegions.push({ atMs, labels: regions.map((r: UiRegion) => r.label) });
        if (this.latestRegions.length > 40) this.latestRegions.shift();
        this.onStopwatch(this.stopwatch.frame(atMs, 0, regions));
      });
    }
  }

  async event(msg: ClientMessage) {
    switch (msg.type) {
      case "session.start":
        return this.start(msg);
      case "session.end":
        return void (await this.end());
      case "presenter.event":
        if (msg.kind === "yield_request") return this.yieldJudge("request");
        if (msg.kind === "qa_start" && this.state === "live") {
          this.state = "qa";
          this.sendState();
          return void (await this.decide({ qaTurnDue: true }));
        }
        if (msg.kind === "section_start") {
          const index = this.ctx.sections.findIndex((s) => s.key === msg.sectionKey);
          if (index >= 0) {
            this.manualSections = true;
            this.changeSection(index);
            this.sectionStartedMs = this.now();
            this.sendState();
          }
        }
        return;
      case "judge.playback":
        if (msg.state === "ended" && this.judgeSpeaking?.personaId === msg.personaId) this.judgeDone();
        if (msg.state === "started" && this.judgeSpeaking?.personaId === msg.personaId) this.judgeSpeaking.since = this.now();
        return;
      case "signal.input":
        return this.onStopwatch(this.stopwatch.input(this.now()));
      default:
        return;
    }
  }

  private tick() {
    if (this.state !== "live" && this.state !== "qa") return;
    const now = this.now();
    this.onStopwatch(this.stopwatch.tick(now));
    this.contradictWhileRunning(now);
    // Sections advance on their budgets unless the presenter marks them.
    if (!this.manualSections && this.ctx.mode === "full_pitch" && this.state === "live") {
      let elapsed = 0;
      let index = this.ctx.sections.length - 1;
      for (const [i, s] of this.ctx.sections.entries()) {
        elapsed += s.budgetSec * 1000;
        if (now < elapsed) {
          index = i;
          break;
        }
      }
      if (index !== this.sectionIndex) {
        this.changeSection(index);
        this.sendState();
      }
    }
    for (const c of this.ledger) if (c.pendingUntilMs !== null && now > c.pendingUntilMs) c.pendingUntilMs = null;
  }

  private changeSection(index: number) {
    const leaving = this.section();
    this.sectionIndex = index;
    // Show or strike runs once, at the end of the demo section.
    if (leaving?.key === "demo" && this.section()?.key !== "demo") void this.showOrStrike();
  }

  /** Flags every feature mentioned before the demo ended that was never shown, and verifies the ones that were. */
  private async showOrStrike() {
    if (this.demoEndedAtMs !== null || this.ctx.mode === "qa_only") return;
    this.demoEndedAtMs = this.now();
    const candidates = this.ledger.filter((c) => c.type === "feature" && c.status === "unverified" && c.atMs <= (this.demoEndedAtMs ?? 0));
    let struck = 0;
    for (const c of candidates) {
      const frames = this.frames.filter((f) => f.atMs >= c.claim.segmentStartMs && f.atMs <= c.atMs + 20_000).slice(-3);
      try {
        const result = await this.deps.ai.llm.generateObject(
          prompts.showOrStrikeV1({ claim: c.text, claimAtMs: c.atMs, frames, actions: this.latency.map((l) => ({ stepKey: l.stepKey, startMs: l.startMs, durationMs: l.durationMs })) }),
        );
        const verdict = this.track(result);
        const model = tagOf(result);
        if (verdict.shown) {
          this.updateClaim(c, { status: "verified", confidence: 0.7, evidence: [{ kind: "frame", ref: mmss(verdict.atMs ?? c.atMs), summary: verdict.summary }], suggestedRewrite: null }, model);
        } else {
          struck++;
          const feature = c.claim.featureName ?? c.text.replace(/[.!?]+$/, "");
          this.updateClaim(
            c,
            {
              status: "not_shown",
              confidence: 0.7,
              evidence: [{ kind: "frame", ref: "demo section", summary: verdict.summary }],
              suggestedRewrite: "Add the step to the demo, or cut the line.",
            },
            model,
          );
          this.fixTasks.set(`Show it or cut it: ${feature}`.slice(0, 120), {
            title: `Show it or cut it: ${feature}`.slice(0, 120),
            detail: `Mentioned at ${mmss(c.claim.segmentStartMs)} but never shown in the demo.`,
            suggestedArtifact: "A demo step that shows it working",
          });
        }
      } catch (error) {
        this.deps.logger.warn({ err: error }, "show-or-strike failed");
      }
    }
    if (struck > 0) this.flag({ kind: "show_or_strike", detail: `${struck} feature${struck === 1 ? " was" : "s were"} mentioned but not shown in the demo.`, refs: [] });
  }

  private flag(f: AuditFlag) {
    this.flags.push(f);
    this.send({ type: "audit.flag", ...f });
  }

  // ---------- stopwatch ----------

  /** The step key is fixed when an action starts, so a section change mid-wait does not rename it. */
  private stepKeyFor(startMs: number): string {
    if (this.openStep?.startMs === startMs) return this.openStep.key;
    const sectionKey = this.section()?.key ?? "pitch";
    const key = `${sectionKey}:${(this.stepCount.get(sectionKey) ?? 0) + 1}`;
    this.openStep = { startMs, key };
    return key;
  }

  private onStopwatch(events: StopwatchEvent[]) {
    for (const e of events) {
      const stepKey = this.stepKeyFor(e.startMs);
      if (e.type === "started") this.send({ type: "latency.step", stepKey, phase: "started", startMs: e.startMs, durationMs: null });
      if (e.type === "abandoned") {
        this.openStep = null;
        this.send({ type: "latency.step", stepKey, phase: "abandoned", startMs: e.startMs, durationMs: null });
      }
      if (e.type === "completed") {
        const sectionKey = stepKey.split(":")[0] ?? "pitch";
        this.stepCount.set(sectionKey, (this.stepCount.get(sectionKey) ?? 0) + 1);
        this.openStep = null;
        // The input is the screen just before the action; the output is the screen when the result appeared.
        const before = [...this.frames].reverse().find((f) => f.atMs < e.startMs);
        const after = this.frames.find((f) => f.atMs >= e.endMs - 50);
        const inputHash = before ? fineHash(before.jpeg) : null;
        const outputHash = after ? fineHash(after.jpeg) : null;
        this.latency.push({ stepKey, startMs: e.startMs, endMs: e.endMs, durationMs: e.durationMs, detector: e.detector, inputHash, outputHash });
        this.checkCanned(stepKey);
        this.send({ type: "latency.step", stepKey, phase: "completed", startMs: e.startMs, durationMs: e.durationMs });
        this.send({ type: "latency.sample", stepKey, durationMs: e.durationMs, detector: e.detector });
        this.recheckPending();
      }
    }
  }

  private checkCanned(stepKey: string) {
    if (this.flags.some((f) => f.kind === "canned_response" && f.detail.includes(`Step ${stepKey} `))) return;
    const samples = [
      ...this.ctx.priorSteps,
      ...this.latency.map((l) => ({ sessionId: this.ctx.sessionId, stepKey: l.stepKey, startMs: l.startMs, inputHash: l.inputHash, outputHash: l.outputHash })),
    ].filter((s) => s.stepKey === stepKey);
    for (const f of detectCanned(samples)) {
      this.flag({ kind: "canned_response", detail: f.detail, refs: f.refs });
      this.fixTasks.set(`Check ${stepKey} for a canned response`, {
        title: `Check ${stepKey} for a canned response`,
        detail: f.detail,
        suggestedArtifact: "Run the step with two different inputs and confirm the outputs differ",
      });
    }
  }

  /**
   * A speed claim waiting on a step that is still running: once the step has outlasted the promise,
   * that is already a measurement, so the chip turns Contradicted now. The final duration refines it.
   */
  private contradictWhileRunning(now: number) {
    const running = this.stopwatch.running;
    if (!running) return;
    const elapsed = now - running.startMs;
    for (const c of this.ledger) {
      if (c.pendingUntilMs === null || c.earlyContradicted || c.type !== "performance") continue;
      if (running.startMs < c.claim.segmentStartMs - 2_000 || running.startMs > c.claim.segmentStartMs + RECHECK_WINDOW_MS) continue;
      const promised = promisedLatencyMs(c.text);
      if (promised === null || elapsed <= promised) continue;
      c.earlyContradicted = true;
      this.updateClaim(c, {
        status: "contradicted",
        confidence: 0.8,
        evidence: [{ kind: "latency", ref: `running @ ${mmss(running.startMs)}`, summary: `Still waiting after ${formatSeconds(elapsed)}; promised ${formatSeconds(promised)} or less.` }],
        suggestedRewrite: "Say how long it takes once you have measured it.",
      });
    }
  }

  private recheckPending() {
    for (const c of this.ledger) {
      if (c.pendingUntilMs === null) continue;
      const result = verifyDeterministic(c.claim, this.latency, this.ctx.repo, this.ctx.docs);
      if (!result || result.pending) continue;
      c.pendingUntilMs = null;
      this.updateClaim(c, result.verdict);
    }
  }

  // ---------- transcript and auditor ----------

  private onPartial(segment: Segment) {
    if (this.state === "ended") return;
    this.send({ type: "transcript.partial", segment });
    this.send({ type: "metric", path: "stt_partial", ms: Math.max(0, Math.round(this.now() - segment.endMs)) });
    if (this.answerTimer) clearTimeout(this.answerTimer);
    if (this.judgeSpeaking && asksToFinish(segment.text)) this.yieldJudge("asked");
  }

  private async onFinal(raw: Segment) {
    if (this.state === "ended" && this.stt === null) return;
    const received = Date.now();
    for (const segment of splitSentences(raw)) {
      this.segments.push(segment);
      this.send({ type: "transcript.final", segment });
      if (this.judgeSpeaking && asksToFinish(segment.text)) this.yieldJudge("asked");
      const sectionKey = this.state === "qa" ? "qa" : (this.section()?.key ?? "pitch");
      for (const cell of this.coverage.add(segment.text, sectionKey)) this.send({ type: "coverage.update", ...cell });
      if (this.state === "qa") {
        this.currentAnswer.push(segment.text);
        this.currentAnswerIds.push(segment.id);
      }
      await this.extractClaims(segment, received);
    }
    if (this.state === "live") await this.decide({});
    this.scheduleAnswerCheck();
  }

  private async extractClaims(segment: Segment, received: number) {
    let extracted: Claim[] = [];
    let model: ModelTag | undefined;
    try {
      const result = await this.deps.ai.llm.generateObject(
        prompts.claimExtractV1({ sentence: segment.text, segmentStartMs: segment.startMs, context: this.segments.slice(-4, -1).map((s) => s.text) }),
      );
      extracted = this.track(result).claims;
      model = tagOf(result);
    } catch (error) {
      this.deps.logger.warn({ err: error }, "claim extraction failed");
      this.send({ type: "error", code: "claim_extract_failed", message: "A sentence could not be checked for claims." });
    }
    for (const claim of extracted) {
      const rule = verifyDeterministic(claim, this.latency, this.ctx.repo, this.ctx.docs);
      const verdict = rule?.verdict ?? { status: "unverified" as const, confidence: 0.3, evidence: [], suggestedRewrite: null };
      const entry: LedgerClaim = {
        id: randomUUID(),
        text: claim.text,
        type: claim.type,
        status: verdict.status,
        verdict,
        atMs: segment.endMs,
        challenged: false,
        segmentLocalId: segment.id,
        claim,
        pendingUntilMs: rule?.pending ? segment.endMs + RECHECK_WINDOW_MS : null,
        ...(model ? { model } : {}),
      };
      if (rule?.fixTask) this.fixTasks.set(rule.fixTask.title, rule.fixTask);
      this.ledger.push(entry);
      this.send({ type: "ledger.update", claim: { id: entry.id, text: entry.text, type: entry.type, status: entry.status, segmentStartMs: segment.startMs, ...(model ? { model } : {}) }, verdict });
      this.send({ type: "metric", path: "claim_chip", ms: Date.now() - received });
      if (!rule && this.deps.ai.mode === "meta") void this.verifyWithModel(entry);
    }
  }

  private async verifyWithModel(entry: LedgerClaim) {
    try {
      const result = await this.deps.ai.llm.generateObject(
        prompts.claimVerifyV1({
          claim: entry.claim,
          latency: this.latency.map((l) => ({ stepKey: l.stepKey, durationMs: l.durationMs })),
          frames: [],
          uiStates: this.latestRegions,
          repoChunks: (this.ctx.repo?.capabilities ?? []).slice(0, 30).map((c) => ({ ref: c.ref, text: c.summary })),
        }),
      );
      const verdict = enforceEvidenceRule(this.track(result));
      if (verdict.status !== entry.status || verdict.evidence.length > 0) this.updateClaim(entry, verdict, tagOf(result));
    } catch (error) {
      this.deps.logger.warn({ err: error }, "claim verification failed");
    }
  }

  private updateClaim(entry: LedgerClaim, verdict: ClaimVerdict, model?: ModelTag) {
    entry.verdict = verdict;
    entry.status = verdict.status;
    if (model) entry.model = model;
    this.send({
      type: "ledger.update",
      claim: { id: entry.id, text: entry.text, type: entry.type, status: entry.status, segmentStartMs: entry.claim.segmentStartMs, ...(entry.model ? { model: entry.model } : {}) },
      verdict,
    });
    // Judges only cut in at a sentence boundary: decide now if the presenter is silent, else at the next final.
    if (this.state === "live" && this.vad.speechSince === null) void this.decide({});
  }

  // ---------- judges ----------

  private scheduleAnswerCheck() {
    if (this.answerTimer) clearTimeout(this.answerTimer);
    this.answerTimer = setTimeout(() => {
      if (this.state === "ended" || this.judgeSpeaking) return;
      const queued = this.queued.shift();
      if (queued) return void this.speak({ ...queued, kind: this.state === "qa" ? "question" : queued.kind, detail: "" }, queued.text, queued.model);
      if (this.state === "qa") {
        // The next question waits for an answer to the last one; only the opening question goes first.
        const asked = this.turns.some((t) => t.kind === "question" || t.trigger === "qa_phase");
        if (asked && this.currentAnswer.length === 0) return;
        const answer = this.currentAnswer.join(" ");
        const vague = answer && isVagueAnswer(answer) ? answer : null;
        void this.decide({ qaTurnDue: true, vagueAnswer: vague });
      }
    }, ANSWER_PAUSE_MS);
  }

  private uncovered(): string[] {
    const planned = this.ctx.sections.reduce((sum, s) => sum + s.budgetSec, 0) * 1000 || 180_000;
    if (this.now() < Math.max(60_000, planned * 0.5)) return [];
    return this.ctx.criteria.filter((c) => this.coverage.total(c.id) === 0 && !this.coveredGapAsked.has(c.name)).map((c) => c.name);
  }

  private overTime(): string | null {
    const s = this.section();
    if (!s || (!this.manualSections && this.ctx.mode !== "section_drill") || this.overTimeAsked.has(s.key)) return null;
    return this.now() - this.sectionStartedMs > s.budgetSec * 1000 ? s.title : null;
  }

  private async decide(opts: { qaTurnDue?: boolean; vagueAnswer?: string | null }) {
    if (this.deciding || this.judgeSpeaking || (this.state !== "live" && this.state !== "qa")) return;
    this.deciding = true;
    const started = Date.now();
    try {
      const phase = this.state === "qa" ? "qa" : "pitch";
      const list = candidates({
        nowMs: this.now(),
        difficulty: this.difficulty,
        phase,
        judgeSpeaking: false,
        lastInterruptAtMs: this.lastInterruptAtMs,
        personas: this.ctx.personas.map((p) => ({ id: p.id, role: p.role, criteria: Object.keys(p.criteriaWeights), lastTurnAtMs: this.personaLastTurn.get(p.id) ?? null })),
        // A speed claim waiting for its measurement is not challenged until the measurement decides it.
        claims: this.ledger.slice(-6).filter((c) => c.pendingUntilMs === null),
        uncovered: this.uncovered(),
        overTimeSection: this.overTime(),
        vagueAnswer: opts.vagueAnswer ?? null,
        qaTurnDue: opts.qaTurnDue ?? false,
      }).map((c) => (c.trigger === "qa_phase" ? { ...c, detail: this.qaQuestion(c.personaId) } : c));
      if (list.length === 0) return;
      const result = await this.deps.ai.llm.generateObject(
        prompts.judgeTurnV1({
          eventName: this.ctx.eventName,
          difficulty: this.difficulty,
          candidates: this.ctx.personas
            .filter((p) => list.some((c) => c.personaId === p.id))
            .map((p) => ({ personaId: p.id, role: PERSONA_ROLE_LABEL[p.role], questionStyle: p.questionStyle, criteria: p.criteriaWeights })),
          triggers: list.slice(0, 4).map((c) => ({ trigger: c.trigger, detail: c.detail, personaId: c.personaId })),
          recentTranscript: this.segments.slice(-8).map((s) => s.text),
          sectionKey: this.section()?.key ?? null,
          phase,
        }),
      );
      const turn = this.track(result);
      // Re-check what the model chose against what the policy allowed.
      const chosen = list.find((c) => c.personaId === turn.personaId && (turn.trigger === null || c.trigger === turn.trigger));
      if (!turn.interrupt || !chosen || !turn.text || this.judgeSpeaking || (this.state as string) === "ended") return;
      this.send({ type: "metric", path: "judge_decision", ms: Date.now() - started });
      this.speak(
        {
          personaId: chosen.personaId,
          kind: turn.kind ?? (phase === "qa" ? "question" : "interrupt"),
          trigger: chosen.trigger,
          detail: chosen.detail,
          ...(chosen.claimId ? { claimId: chosen.claimId } : {}),
        },
        turn.text,
        tagOf(result),
      );
    } catch (error) {
      this.deps.logger.warn({ err: error }, "judge decision failed");
    } finally {
      this.deciding = false;
    }
  }

  private qaQuestion(personaId: string): string {
    const persona = this.ctx.personas.find((p) => p.id === personaId);
    if (!persona) return "What is the strongest evidence that this works?";
    const criteria = Object.entries(persona.criteriaWeights)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
    const asked = this.turns.filter((t) => t.personaId === personaId).length;
    const criterion = criteria[asked % Math.max(1, criteria.length)] ?? "the result";
    return (QA_PROMPTS[persona.role] ?? QA_PROMPTS.technical!)(criterion);
  }

  private speak(c: Pick<Candidate, "personaId" | "detail"> & { kind: Turn["kind"]; trigger: string | null; claimId?: string }, text: string, model?: ModelTag) {
    const now = this.now();
    this.judgeSpeaking = { personaId: c.personaId, text, since: now, kind: c.kind, trigger: c.trigger, ...(model ? { model } : {}) };
    this.personaLastTurn.set(c.personaId, now);
    if (c.kind === "interrupt") this.lastInterruptAtMs = now;
    if (c.claimId) {
      const claim = this.ledger.find((x) => x.id === c.claimId);
      if (claim) claim.challenged = true;
    }
    if (c.trigger === "coverage_gap") this.coveredGapAsked.add(c.detail);
    if (c.trigger === "over_time") this.overTimeAsked.add(this.section()?.key ?? "");
    this.currentAnswer = [];
    this.currentAnswerIds = [];
    const turn: Turn = { personaId: c.personaId, atMs: Math.round(now), kind: c.kind, text, trigger: c.trigger, answerSegmentLocalIds: [], ...(model ? { model } : {}) };
    this.turns.push(turn);
    this.currentAnswerIds = turn.answerSegmentLocalIds;
    this.send({ type: "judge.speak", personaId: c.personaId, text, audioStreamId: null, kind: c.kind, trigger: c.trigger, ...(model ? { model } : {}) });
    // If the browser never reports playback ending, assume ~2.5 words per second plus a pause.
    if (this.judgeSpeakTimer) clearTimeout(this.judgeSpeakTimer);
    this.judgeSpeakTimer = setTimeout(() => this.judgeDone(), 1_500 + text.split(/\s+/).length * 400);
  }

  private judgeDone() {
    if (this.judgeSpeakTimer) clearTimeout(this.judgeSpeakTimer);
    this.judgeSpeaking = null;
    this.scheduleAnswerCheck();
  }

  /** The judge stops and queues its question for the next pause. */
  private yieldJudge(reason: "talk_over" | "asked" | "request") {
    const speaking = this.judgeSpeaking;
    if (!speaking) return;
    this.deps.logger.info({ reason, personaId: speaking.personaId }, "judge yielded");
    this.queued.push({ personaId: speaking.personaId, text: speaking.text, kind: speaking.kind, trigger: speaking.trigger, ...(speaking.model ? { model: speaking.model } : {}) });
    this.send({ type: "judge.yield", personaId: speaking.personaId, queuedQuestion: speaking.text });
    this.judgeDone();
  }
}
