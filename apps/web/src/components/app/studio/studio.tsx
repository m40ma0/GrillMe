"use client";
import type { CreateSessionResponse, SessionMode } from "@stage-ready/shared";
import { CircleAlert, Download, MessagesSquare, Play, SkipForward, Square } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { api } from "@/lib/api-client";
import { acquireMedia, releaseMedia, startCapture, type Capture, type Media, type VideoSource } from "@/lib/studio/capture";
import { downloadBlob } from "@/lib/studio/download";
import { StudioSocket } from "@/lib/studio/socket";
import { speakJudge } from "@/lib/studio/tts";
import { useStudio } from "@/stores/studio";
import { JudgePanel } from "./judge-panel";
import { LatencyHud } from "./latency-hud";
import { LedgerPanel } from "./ledger-panel";
import { PreviewPanel } from "./preview-panel";
import { SummaryCard } from "./summary-card";
import { clock, type StudioProps } from "./types";

const MODES: { value: SessionMode; label: string }[] = [
  { value: "full_pitch", label: "Full pitch, then Q&A" },
  { value: "qa_only", label: "Q&A only" },
  { value: "section_drill", label: "Section drill" },
];

export function Studio(props: StudioProps) {
  const store = useStudio();
  const [mode, setMode] = useState<SessionMode>("full_pitch");
  const [difficulty, setDifficulty] = useState(3);
  const [drill, setDrill] = useState<string>(props.sections.find((s) => s.key === "demo")?.key ?? props.sections[0]?.key ?? "demo");
  const [source, setSource] = useState<VideoSource>("screen");
  const [consentOpen, setConsentOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [overlay, setOverlay] = useState(true);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [recording, setRecording] = useState<Blob | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [wide, setWide] = useState(true);
  const socket = useRef<StudioSocket | null>(null);
  const capture = useRef<Capture | null>(null);
  const t0 = useRef(0);
  const stopSpeech = useRef<() => void>(() => undefined);
  const live = store.phase === "live" || store.phase === "qa";
  const busy = store.phase === "connecting" || store.phase === "ending";

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(
    () => () => {
      capture.current?.stop();
      socket.current?.close();
      stopSpeech.current();
      useStudio.getState().reset();
    },
    [],
  );

  // Session clock for the top bar and the stopwatch.
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => useStudio.getState().set({ elapsedMs: performance.now() - t0.current }), 200);
    return () => clearInterval(timer);
  }, [live]);

  // Judges speak through the configured TTS provider (browser speechSynthesis in dev).
  const speaking = store.speaking;
  useEffect(() => {
    if (!speaking) {
      stopSpeech.current();
      return;
    }
    const persona = props.personas.find((p) => p.id === speaking.personaId);
    stopSpeech.current = speakJudge(speaking.text, persona?.voicePreset ?? "preset-a", {
      start: () => socket.current?.json({ type: "judge.playback", personaId: speaking.personaId, state: "started" }),
      end: () => {
        socket.current?.json({ type: "judge.playback", personaId: speaking.personaId, state: "ended" });
        if (useStudio.getState().speaking?.at === speaking.at) useStudio.getState().set({ speaking: null });
      },
    });
  }, [speaking, props.personas]);

  const start = useCallback(async () => {
    setConsentOpen(false);
    setStartError(null);
    setRecording(null);
    useStudio.getState().reset();
    useStudio.getState().set({ phase: "connecting" });
    let media: Media | null = null;
    try {
      // Capture first: if the browser blocks the screen or mic, no session row is created.
      media = await acquireMedia(source);
      const session = await api<CreateSessionResponse>(`/api/projects/${props.projectId}/sessions`, {
        method: "POST",
        json: { mode, difficulty, consent: true, ...(mode === "section_drill" ? { drillSection: drill } : {}) },
      });
      const ws = new StudioSocket(session.wsUrl, session.wsToken, {
        message: (m) => useStudio.getState().apply(m),
        status: (connected, reconnecting) => useStudio.getState().set({ connected, reconnecting }),
      });
      await ws.connect();
      socket.current = ws;
      t0.current = performance.now();
      const cap = await startCapture({
        media,
        t0: t0.current,
        onAudio: (chunk) => ws.binary(chunk),
        onFrame: (frame) => ws.binary(frame),
        onLevel: (level) => useStudio.getState().set({ micLevel: level }),
      });
      capture.current = cap;
      setStream(cap.video);
      cap.video.getVideoTracks()[0]?.addEventListener("ended", () => void stop());
      ws.json({ type: "session.start", sessionId: session.sessionId, mode, personaIds: props.personas.map((p) => p.id), difficulty, ...(mode === "section_drill" ? { drillSection: drill } : {}) });
      useStudio.getState().set({ sessionId: session.sessionId });
    } catch (error) {
      capture.current?.stop();
      releaseMedia(media);
      socket.current?.close();
      setStream(null);
      useStudio.getState().set({ phase: "idle" });
      setStartError(error instanceof DOMException && error.name === "NotAllowedError" ? "Screen or microphone access was blocked. Allow both in the browser and try again." : (error as Error).message);
    }
    // stop is stable via ref below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, difficulty, drill, source, props.projectId, props.personas]);

  const stop = useCallback(async () => {
    const { sessionId } = useStudio.getState();
    useStudio.getState().set({ phase: "ending" });
    stopSpeech.current();
    const blob = capture.current?.stop() ?? null;
    setRecording(blob);
    capture.current = null;
    setStream(null);
    if (sessionId) socket.current?.json({ type: "session.end", sessionId });
    // Recordings stay local unless this project opted in to cloud upload.
    if (blob && sessionId && props.cloudUploadEnabled) {
      try {
        const { url, key } = await api<{ url: string; key: string }>("/api/uploads/presign", {
          method: "POST",
          json: { projectId: props.projectId, kind: "recording", sessionId, contentType: "video/webm", bytes: blob.size },
        });
        const put = await fetch(url, { method: "PUT", body: blob, headers: { "content-type": "video/webm" } });
        if (!put.ok) throw new Error(`Upload failed with ${put.status}.`);
        await api(`/api/sessions/${sessionId}/recording`, { method: "POST", json: { key } });
        toast.success("Recording uploaded.");
      } catch (error) {
        toast.error(`The recording stayed on this computer: ${(error as Error).message}`);
      }
    }
  }, [props.cloudUploadEnabled, props.projectId]);

  const yieldJudge = useCallback(() => {
    stopSpeech.current();
    socket.current?.json({ type: "presenter.event", kind: "yield_request", sectionKey: useStudio.getState().sectionKey ?? "" });
  }, []);

  const nextSection = () => {
    const i = props.sections.findIndex((s) => s.key === useStudio.getState().sectionKey);
    const next = props.sections[i + 1];
    if (next) socket.current?.json({ type: "presenter.event", kind: "section_start", sectionKey: next.key });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "Enter") {
        e.preventDefault();
        const phase = useStudio.getState().phase;
        if (phase === "live" || phase === "qa") void stop();
        else if (phase === "idle" || phase === "ended") setConsentOpen(true);
      } else if (e.key === ".") {
        e.preventDefault();
        yieldJudge();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stop, yieldJudge]);

  if (!wide) {
    return (
      <Alert>
        <CircleAlert />
        <AlertTitle>Rehearsal Studio needs a wider window</AlertTitle>
        <AlertDescription>
          <p>The Studio needs at least 1280 px. Review past sessions on any screen size.</p>
          <Button asChild variant="outline" size="sm">
            <Link href={`/projects/${props.projectId}/sessions`}>Review sessions</Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const lastError = store.errors.at(-1);
  return (
    <div className="flex h-[calc(100svh-7.5rem)] min-h-[640px] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-2">
        {live || busy ? (
          <Button variant="destructive" onClick={() => void stop()} disabled={busy} aria-label="Stop rehearsal (Cmd+Enter)">
            <Square /> {store.phase === "ending" ? "Saving" : "Stop"}
          </Button>
        ) : (
          <Button onClick={() => setConsentOpen(true)} aria-label="Start rehearsal (Cmd+Enter)">
            <Play /> Start rehearsal
          </Button>
        )}
        {live ? (
          <span className="text-status-contradicted-foreground inline-flex items-center gap-1.5 font-medium" role="status">
            <span className="bg-status-contradicted size-2.5 rounded-full motion-safe:animate-pulse" aria-hidden /> Recording
          </span>
        ) : null}
        <span className="font-mono text-lg tabular-nums" aria-label="Elapsed time">
          {clock(store.elapsedMs)}
        </span>
        <div
          className="bg-muted h-2 w-24 overflow-hidden rounded-full"
          role="meter"
          aria-label="Microphone level"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(Math.min(1, store.micLevel * 8) * 100)}
        >
          <div className="bg-status-live h-full transition-[width] duration-150" style={{ width: `${Math.min(1, store.micLevel * 8) * 100}%` }} />
        </div>
        {store.reconnecting ? <span className="text-status-unverified-foreground text-xs">Reconnecting; still recording locally</span> : null}
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {live && store.phase === "live" && mode === "full_pitch" ? (
            <>
              <Button variant="outline" size="sm" onClick={nextSection}>
                <SkipForward /> Next section
              </Button>
              <Button variant="outline" size="sm" onClick={() => socket.current?.json({ type: "presenter.event", kind: "qa_start", sectionKey: "qa" })}>
                <MessagesSquare /> Start Q&amp;A
              </Button>
            </>
          ) : null}
          <Select value={mode} onValueChange={(v) => setMode(v as SessionMode)} disabled={live || busy}>
            <SelectTrigger size="sm" aria-label="Mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODES.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {mode === "section_drill" ? (
            <Select value={drill} onValueChange={setDrill} disabled={live || busy}>
              <SelectTrigger size="sm" aria-label="Section to drill">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {props.sections.map((s) => (
                  <SelectItem key={s.key} value={s.key}>
                    {s.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <div className="flex w-40 items-center gap-2">
            <Label htmlFor="studio-difficulty" className="text-xs whitespace-nowrap">
              Difficulty <span className="font-mono tabular-nums">{difficulty}</span>
            </Label>
            <Slider id="studio-difficulty" aria-label="Difficulty" min={1} max={5} step={1} value={[difficulty]} onValueChange={([v]) => setDifficulty(v ?? 3)} disabled={live || busy} />
          </div>
          <Select value={source} onValueChange={(v) => setSource(v as VideoSource)} disabled={live || busy}>
            <SelectTrigger size="sm" aria-label="Video source">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="screen">Share screen</SelectItem>
              <SelectItem value="camera">Camera or virtual camera</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {startError || lastError ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>{startError ? "The rehearsal could not start" : "Something needs attention"}</AlertTitle>
          <AlertDescription>
            <p>{startError ?? lastError?.message}</p>
            {lastError && !startError ? (
              <details className="text-xs">
                <summary className="cursor-pointer">Error detail</summary>
                <code className="font-mono">{lastError.code}</code>
              </details>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {store.phase === "ended" && store.summaryId ? <SummaryCard projectId={props.projectId} sessionId={store.summaryId} recording={recording} /> : null}

      <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1 rounded-xl border" autoSaveId="studio-panels">
        <ResizablePanel defaultSize={25} minSize={18}>
          <JudgePanel personas={props.personas} onYield={yieldJudge} />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={50} minSize={35}>
          <PreviewPanel stream={stream} sections={props.sections} overlay={overlay} onOverlay={setOverlay} expectedVision={props.expectedVision} />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={25} minSize={18}>
          <LedgerPanel criteria={props.criteria} />
        </ResizablePanel>
      </ResizablePanelGroup>

      <Dialog open={consentOpen} onOpenChange={setConsentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start rehearsal</DialogTitle>
            <DialogDescription>
              Stage Ready records your screen and microphone for this session.{" "}
              {props.cloudUploadEnabled ? "This project uploads recordings to its cloud storage when you stop." : "The recording stays on this computer; you can download it when you stop."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-3">
            <Checkbox id="consent" checked={consent} onCheckedChange={(v) => setConsent(v === true)} />
            <Label htmlFor="consent" className="leading-5 font-normal">
              I consent to recording this session.
            </Label>
          </div>
          <p className="text-muted-foreground text-xs">Use headphones so the judges&apos; voices are not picked up by your microphone.</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConsentOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void start()} disabled={!consent}>
              <Play /> Start
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {process.env.NODE_ENV !== "production" ? <LatencyHud /> : null}
      {recording && store.phase !== "ended" ? (
        <Button variant="outline" size="sm" className="self-start" onClick={() => downloadBlob(recording, props.projectName)}>
          <Download /> Download recording
        </Button>
      ) : null}
    </div>
  );
}
