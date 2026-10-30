"use client";
import type { ClaimStatus, ClaimType, ClaimVerdict, Segment, ServerMessage, UiRegion } from "@stage-ready/shared";
import { create } from "zustand";

export interface LedgerRow {
  id: string;
  text: string;
  type: ClaimType;
  status: ClaimStatus;
  verdict: ClaimVerdict;
  atMs: number;
  updatedAt: number;
}

export interface JudgeLine {
  personaId: string;
  text: string;
  kind: string;
  trigger: string | null;
  at: number;
  yielded: boolean;
}

type Phase = "idle" | "connecting" | "ready" | "live" | "qa" | "ending" | "ended";

interface StudioState {
  phase: Phase;
  sessionId: string | null;
  connected: boolean;
  reconnecting: boolean;
  elapsedMs: number;
  sectionKey: string | null;
  stt: string;
  vision: string;
  finals: Segment[];
  partial: Segment | null;
  ledger: Record<string, LedgerRow>;
  stepRunning: { stepKey: string; startMs: number } | null;
  lastStep: { stepKey: string; durationMs: number } | null;
  samples: { stepKey: string; durationMs: number; detector?: string }[];
  coverage: Record<string, Record<string, number>>;
  speaking: JudgeLine | null;
  judgeLog: JudgeLine[];
  queued: { personaId: string; text: string }[];
  regions: UiRegion[];
  metrics: Record<string, number[]>;
  errors: { code: string; message: string; at: number }[];
  micLevel: number;
  summaryId: string | null;
  reset(): void;
  set(patch: Partial<StudioState>): void;
  apply(message: ServerMessage): void;
}

const initial = {
  phase: "idle" as Phase,
  sessionId: null,
  connected: false,
  reconnecting: false,
  elapsedMs: 0,
  sectionKey: null,
  stt: "",
  vision: "",
  finals: [],
  partial: null,
  ledger: {},
  stepRunning: null,
  lastStep: null,
  samples: [],
  coverage: {},
  speaking: null,
  judgeLog: [],
  queued: [],
  regions: [],
  metrics: {},
  errors: [],
  micLevel: 0,
  summaryId: null,
};

export const useStudio = create<StudioState>((set, get) => ({
  ...initial,
  reset: () => set({ ...initial }),
  set: (patch) => set(patch),
  apply: (m) => {
    const s = get();
    switch (m.type) {
      case "session.state":
        return set({ phase: m.state === "ended" ? (s.summaryId ? "ended" : "ending") : m.state, sectionKey: m.sectionKey, stt: m.stt, vision: m.vision });
      case "transcript.partial":
        return set({ partial: m.segment });
      case "transcript.final":
        return set({ finals: [...s.finals, m.segment].slice(-200), partial: null });
      case "ledger.update":
        return set({
          ledger: {
            ...s.ledger,
            [m.claim.id]: { id: m.claim.id, text: m.claim.text, type: m.claim.type, status: m.claim.status, verdict: m.verdict, atMs: m.claim.segmentStartMs ?? 0, updatedAt: Date.now() },
          },
        });
      case "latency.step":
        if (m.phase === "started") return set({ stepRunning: { stepKey: m.stepKey, startMs: m.startMs } });
        if (m.phase === "completed" && m.durationMs !== null) return set({ stepRunning: null, lastStep: { stepKey: m.stepKey, durationMs: m.durationMs } });
        return set({ stepRunning: null });
      case "latency.sample":
        return set({ samples: [...s.samples, { stepKey: m.stepKey, durationMs: m.durationMs, ...(m.detector ? { detector: m.detector } : {}) }] });
      case "coverage.update":
        return set({ coverage: { ...s.coverage, [m.criterionId]: { ...(s.coverage[m.criterionId] ?? {}), [m.sectionKey]: m.score } } });
      case "judge.speak": {
        const line = { personaId: m.personaId, text: m.text, kind: m.kind ?? "interrupt", trigger: m.trigger ?? null, at: Date.now(), yielded: false };
        return set({ speaking: line, judgeLog: [...s.judgeLog, line], queued: s.queued.filter((q) => q.text !== m.text) });
      }
      case "judge.yield":
        return set({
          speaking: null,
          queued: [...s.queued, { personaId: m.personaId, text: m.queuedQuestion }],
          judgeLog: s.judgeLog.map((l) => (l.text === m.queuedQuestion && l.personaId === m.personaId ? { ...l, yielded: true } : l)),
        });
      case "ui.states":
        return set({ regions: m.regions });
      case "metric":
        return set({ metrics: { ...s.metrics, [m.path]: [...(s.metrics[m.path] ?? []), m.ms].slice(-200) } });
      case "session.summary":
        return set({ summaryId: m.summaryId, phase: "ended" });
      case "error":
        return set({ errors: [...s.errors, { code: m.code, message: m.message, at: Date.now() }].slice(-20) });
      default:
        return;
    }
  },
}));
