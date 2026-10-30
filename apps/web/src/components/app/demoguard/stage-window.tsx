"use client";
import { FileVideo, MonitorUp, ShieldCheck, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cueChannel, type CueMessage, type StageRequest } from "@/lib/demoguard/capture";
import { cn } from "@/lib/utils";

/** How long the test dialog stays up: long enough for detection, short enough to watch the recovery. */
const TEST_DIALOG_MS = 4_000;

/**
 * The Stage window: the presenter shares this window (not the raw app). It shows the live demo window and,
 * when DemoGuard switches, crossfades in 200 ms to the golden-run clip at the step's in-point with the
 * Recorded-segment badge; it cuts back when DemoGuard returns to Live at a step boundary. It follows the
 * DemoGuard page open in the same browser, like the cue window.
 */
export function StageWindow({ projectId, projectName, fallbackClipUrl }: { projectId: string; projectName: string; fallbackClipUrl: string | null }) {
  const [cue, setCue] = useState<CueMessage | null>(null);
  const [live, setLive] = useState<MediaStream | null>(null);
  const [clipUrl, setClipUrl] = useState<string | null>(fallbackClipUrl);
  const [clipName, setClipName] = useState<string | null>(fallbackClipUrl ? "Golden-run recording" : null);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const liveRef = useRef<HTMLVideoElement>(null);
  const clipRef = useRef<HTMLVideoElement>(null);
  const channel = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    channel.current = new BroadcastChannel(cueChannel(projectId));
    channel.current.onmessage = (e: MessageEvent<CueMessage | StageRequest>) => {
      if ("state" in e.data) setCue(e.data);
    };
    return () => channel.current?.close();
  }, [projectId]);

  useEffect(() => {
    if (liveRef.current) liveRef.current.srcObject = live;
  }, [live]);

  const onFallback = cue?.state === "fallback" || cue?.state === "recovering";
  const frozen = cue?.state === "frozen";

  // Seek to the step's in-point before the crossfade starts, then play; pause it again on the way back.
  useEffect(() => {
    const clip = clipRef.current;
    if (!clip || !clipUrl) return;
    if (onFallback) {
      const seek = (cue?.fallbackSeekMs ?? 0) / 1000;
      if (Math.abs(clip.currentTime - seek) > 0.25) clip.currentTime = seek;
      void clip.play().catch(() => undefined);
    } else {
      clip.pause();
    }
  }, [onFallback, cue?.fallbackSeekMs, cue?.step?.index, clipUrl]);

  useEffect(() => {
    const el = liveRef.current;
    if (!el) return;
    if (frozen) el.pause();
    else void el.play().catch(() => undefined);
  }, [frozen]);

  const shareWindow = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
      stream.getVideoTracks()[0]?.addEventListener("ended", () => setLive(null));
      setLive(stream);
    } catch (e) {
      setError(e instanceof DOMException && e.name === "NotAllowedError" ? "Screen sharing was blocked. Allow it and try again." : (e as Error).message);
    }
  };

  const loadClip = (file: File | undefined) => {
    if (!file) return;
    setClipUrl(URL.createObjectURL(file));
    setClipName(file.name);
  };

  // The test: a fake error dialog on Stage, and a matching signal to DemoGuard, so a real switch and recovery follow.
  const testSafetyNet = useCallback(() => {
    setTesting(true);
    channel.current?.postMessage({ type: "stage.test" } satisfies StageRequest);
    setTimeout(() => setTesting(false), TEST_DIALOG_MS);
  }, []);

  const armed = cue && cue.state !== "idle" && cue.state !== "preflight";
  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black text-white" data-state={onFallback ? "fallback" : (cue?.state ?? "idle")} aria-label="Stage">
      <video ref={liveRef} className="absolute inset-0 h-full w-full object-contain" muted playsInline autoPlay aria-label="Live demo" />
      {testing && !onFallback ? (
        <div className="absolute inset-0 grid place-items-center" aria-hidden>
          <div className="w-[min(36rem,80vw)] rounded-xl border-4 border-[#dc2626] bg-[#ef4444] p-8 text-white shadow-2xl">
            <p className="flex items-center gap-3 text-3xl font-bold">
              <TriangleAlert size={36} /> Error
            </p>
            <p className="mt-3 text-xl">Something went wrong. Test of the safety net.</p>
          </div>
        </div>
      ) : null}
      {clipUrl ? (
        <video
          ref={clipRef}
          src={clipUrl}
          className={cn("absolute inset-0 h-full w-full object-contain transition-opacity duration-200 ease-linear", onFallback ? "opacity-100" : "pointer-events-none opacity-0")}
          muted
          playsInline
          preload="auto"
          aria-label="Fallback clip"
          data-testid="fallback-clip"
        />
      ) : null}
      {onFallback && cue?.badgeVisible !== false ? (
        <p className="absolute top-6 left-6 rounded-md bg-[oklch(0.75_0.18_55)] px-3 py-1.5 text-lg font-semibold text-black" role="status">
          Recorded segment
        </p>
      ) : null}
      {onFallback && !clipUrl ? (
        <p className="absolute inset-x-0 bottom-10 text-center text-2xl" role="status">
          On fallback, but no clip is loaded. Keep narrating.
        </p>
      ) : null}

      {/* Setup controls; they hide once DemoGuard is armed so the shared picture stays clean. */}
      <div
        className={cn(
          "absolute top-4 right-4 grid max-w-sm gap-2 rounded-xl bg-black/75 p-4 text-sm backdrop-blur transition-opacity",
          armed && live ? "opacity-0 hover:opacity-100 focus-within:opacity-100" : "opacity-100",
        )}
      >
        <p className="flex items-center gap-2 font-semibold">
          <ShieldCheck size={16} aria-hidden /> {projectName} · Stage · {cue?.state ?? "waiting for DemoGuard"}
        </p>
        <p className="text-white/70">Share this window in your call. It shows the live demo and switches to the golden-run clip on failure.</p>
        <Button size="sm" variant="secondary" onClick={shareWindow}>
          <MonitorUp aria-hidden /> {live ? "Change demo window" : "Show the demo window"}
        </Button>
        <label className="grid gap-1">
          <span className="flex items-center gap-1.5 text-white/80">
            <FileVideo size={14} aria-hidden /> Fallback clip: {clipName ?? "none loaded"}
          </span>
          <input
            type="file"
            accept="video/*"
            aria-label="Load fallback clip"
            className="text-xs file:mr-2 file:rounded file:border-0 file:bg-white/20 file:px-2 file:py-1 file:text-white"
            onChange={(e) => loadClip(e.target.files?.[0])}
          />
        </label>
        <Button size="sm" variant="secondary" onClick={testSafetyNet} disabled={!armed || testing}>
          Test the safety net
        </Button>
        {error ? (
          <p role="alert" className="text-red-300">
            {error}
          </p>
        ) : null}
      </div>
    </main>
  );
}
