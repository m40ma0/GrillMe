"use client";
import { MANUAL_CHECKS, type CreateSessionResponse, type DgPhase, type PreflightCheck, type ServerMessage, type SignalKind } from "@stage-ready/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { cueChannel, startFrameCapture, type CueMessage, type FrameCapture } from "@/lib/demoguard/capture";
import { StudioSocket } from "@/lib/studio/socket";
import type { StepDTO } from "@/lib/types";

export interface FeedItem {
  id: number;
  kind: SignalKind;
  critical: boolean;
  detail: string;
  atMs: number;
}

export interface IncidentItem {
  id: number;
  action: "switch" | "recover" | "panic" | "resume" | "freeze";
  stepIndex: number;
  signals: SignalKind[];
  fallbackMs: number;
  detectionMs: number | null;
  /** Capture time of the triggering frame to the moment the browser heard the decision, in ms. */
  switchMs: number | null;
}

export interface RunState {
  sessionId: string | null;
  connected: boolean;
  capturing: boolean;
  phase: DgPhase;
  stepIndex: number;
  totalFallbackMs: number;
  fallbackSeekMs: number | null;
  badgeVisible: boolean;
  companion: { connected: boolean; version: string | null };
  vision: "sam" | "heuristic" | null;
  checks: PreflightCheck[];
  criticalFailures: number;
  manual: Record<string, boolean>;
  feed: FeedItem[];
  incidents: IncidentItem[];
  error: string | null;
  ended: boolean;
}

const initial: RunState = {
  sessionId: null,
  connected: false,
  capturing: false,
  phase: "idle",
  stepIndex: 0,
  totalFallbackMs: 0,
  fallbackSeekMs: null,
  badgeVisible: true,
  companion: { connected: false, version: null },
  vision: null,
  checks: [],
  criticalFailures: 0,
  manual: Object.fromEntries(MANUAL_CHECKS.map((m) => [m.id, false])),
  feed: [],
  incidents: [],
  error: null,
  ended: false,
};

/** One DemoGuard run: the session, its realtime connection, the 4 fps capture, and the cue window feed. */
export function useDemoGuardRun(projectId: string, steps: StepDTO[]) {
  const [run, setRun] = useState<RunState>(initial);
  const socket = useRef<StudioSocket | null>(null);
  const capture = useRef<FrameCapture | null>(null);
  const t0 = useRef(0);
  const seq = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    channel.current = new BroadcastChannel(cueChannel(projectId));
    return () => channel.current?.close();
  }, [projectId]);

  // The cue window follows the current step.
  useEffect(() => {
    const step = steps[run.stepIndex];
    const message: CueMessage = {
      state: run.phase,
      step: step ? { index: run.stepIndex, name: step.name, narration: step.narration } : null,
      next: steps[run.stepIndex + 1] ? { name: steps[run.stepIndex + 1]!.name } : null,
      total: steps.length,
      fallbackSeekMs: run.fallbackSeekMs,
    };
    channel.current?.postMessage(message);
  }, [run.phase, run.stepIndex, run.fallbackSeekMs, steps]);

  const browserChecks = useCallback(
    (connected: boolean, capturing: boolean): PreflightCheck[] => [
      {
        id: "browser:realtime",
        label: "Realtime connection",
        status: connected ? "pass" : "fail",
        detail: connected ? "Connected." : "Not connected to the realtime server.",
        critical: true,
        source: "browser",
      },
      {
        id: "browser:capture",
        label: "Screen shared",
        status: capturing ? "pass" : "fail",
        detail: capturing ? "Frames at 4 fps." : "Share the demo screen so DemoGuard can watch it.",
        critical: true,
        source: "browser",
      },
    ],
    [],
  );

  const onMessage = useCallback((m: ServerMessage) => {
    setRun((r) => {
      switch (m.type) {
        case "demoguard.state":
          return {
            ...r,
            phase: m.state,
            stepIndex: m.stepIndex ?? r.stepIndex,
            totalFallbackMs: m.totalFallbackMs ?? r.totalFallbackMs,
            fallbackSeekMs: m.fallbackSeekMs ?? null,
            badgeVisible: m.badgeVisible ?? r.badgeVisible,
            companion: m.companion ?? r.companion,
            vision: m.vision ?? r.vision,
          };
        case "demoguard.preflight":
          return { ...r, checks: m.checks, criticalFailures: m.criticalFailures };
        case "demoguard.signal":
          return { ...r, feed: [{ id: ++seq.current, kind: m.kind, critical: m.critical, detail: m.detail, atMs: m.atMs }, ...r.feed].slice(0, 50) };
        case "demoguard.incident":
          return {
            ...r,
            incidents: [
              {
                id: ++seq.current,
                action: m.action,
                stepIndex: m.stepIndex,
                signals: m.signals,
                fallbackMs: m.fallbackMs,
                detectionMs: m.detectionMs,
                switchMs: m.detectionMs === null ? null : Math.round(performance.now() - t0.current - m.atMs),
              },
              ...r.incidents,
            ],
          };
        case "session.summary":
          return { ...r, ended: true, connected: false };
        case "error":
          return { ...r, error: m.message };
        default:
          return r;
      }
    });
  }, []);

  const sendBrowserChecks = useCallback((connected: boolean, capturing: boolean) => socket.current?.json({ type: "preflight.result", checks: browserChecks(connected, capturing) }), [browserChecks]);

  /** Creates the DemoGuard session, connects, starts watching the screen and runs pre-flight. */
  const start = useCallback(
    async (source: "screen" | "camera") => {
      setRun((r) => ({ ...r, error: null }));
      try {
        const created = await api<CreateSessionResponse>(`/api/projects/${projectId}/sessions`, { method: "POST", json: { mode: "demoguard", consent: true } });
        const s = new StudioSocket(created.wsUrl, created.wsToken, {
          message: onMessage,
          status: (connected) => setRun((r) => ({ ...r, connected })),
        });
        socket.current = s;
        await s.connect();
        t0.current = performance.now();
        capture.current = await startFrameCapture({
          source,
          t0: t0.current,
          onFrame: (frame) => s.binary(frame),
          onEnded: () => {
            setRun((r) => ({ ...r, capturing: false }));
            sendBrowserChecks(true, false);
          },
        });
        setRun((r) => ({ ...r, sessionId: created.sessionId, connected: true, capturing: true, ended: false, feed: [], incidents: [] }));
        s.json({ type: "demoguard.control", action: "preflight" });
        sendBrowserChecks(true, true);
      } catch (e) {
        setRun((r) => ({ ...r, error: (e as Error).message }));
      }
    },
    [onMessage, projectId, sendBrowserChecks],
  );

  const rerun = useCallback(() => {
    socket.current?.json({ type: "demoguard.control", action: "preflight" });
    sendBrowserChecks(run.connected, run.capturing);
  }, [run.connected, run.capturing, sendBrowserChecks]);

  const arm = useCallback(() => {
    setRun((r) => ({ ...r, error: null }));
    socket.current?.json({ type: "demoguard.control", action: "arm" });
  }, []);
  const hotkey = useCallback((action: "panic" | "resume" | "freeze") => socket.current?.json({ type: "demoguard.hotkey", action }), []);
  const setBadge = useCallback((badgeVisible: boolean) => {
    setRun((r) => ({ ...r, badgeVisible }));
    socket.current?.json({ type: "demoguard.settings", badgeVisible });
  }, []);
  const tickManual = useCallback((id: string, done: boolean) => setRun((r) => ({ ...r, manual: { ...r.manual, [id]: done } })), []);

  const end = useCallback(() => {
    socket.current?.json({ type: "demoguard.control", action: "end" });
    capture.current?.stop();
    capture.current = null;
    setRun((r) => ({ ...r, capturing: false, ended: true }));
  }, []);

  useEffect(
    () => () => {
      capture.current?.stop();
      socket.current?.close();
    },
    [],
  );

  /** A fresh companion command (tokens last 15 minutes). */
  const companionCommand = useCallback(async () => {
    if (!run.sessionId) return null;
    const { wsUrl, wsToken } = await api<{ wsUrl: string; wsToken: string }>(`/api/sessions/${run.sessionId}/token`, { method: "POST" });
    return `pnpm companion --url '${wsUrl}?token=${wsToken}'`;
  }, [run.sessionId]);

  return { run, start, rerun, arm, hotkey, setBadge, tickManual, end, companionCommand };
}
