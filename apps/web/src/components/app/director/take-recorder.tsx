"use client";
import type { SectionKey } from "@stage-ready/shared";
import { Circle, Square, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api-client";
import { startTakeCapture, type TakeCapture } from "@/lib/studio/take-capture";
import { formatClock } from "./format";

/** Records a take for one section, uploads it straight to storage, and queues transcription and scoring. */
export function TakeRecorder({
  projectId,
  section,
  budgetSec,
  open,
  onOpenChange,
  onUploaded,
}: {
  projectId: string;
  section: { key: SectionKey; title: string } | null;
  budgetSec: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: (jobId: string) => void;
}) {
  const [camera, setCamera] = useState(true);
  const [phase, setPhase] = useState<"idle" | "recording" | "uploading">("idle");
  const [elapsed, setElapsed] = useState(0);
  const capture = useRef<TakeCapture | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const started = useRef(0);

  useEffect(() => {
    if (phase !== "recording") return;
    const id = window.setInterval(() => setElapsed(Date.now() - started.current), 250);
    return () => window.clearInterval(id);
  }, [phase]);
  useEffect(() => () => capture.current?.cancel(), []);

  const start = async () => {
    try {
      capture.current = await startTakeCapture({ camera });
      if (video.current) video.current.srcObject = capture.current.preview;
      started.current = Date.now();
      setElapsed(0);
      setPhase("recording");
    } catch {
      toast.error("Allow screen and microphone access to record a take.");
    }
  };

  const stop = async () => {
    if (!capture.current || !section) return;
    const { blob, durationMs } = await capture.current.stop();
    capture.current = null;
    setPhase("uploading");
    try {
      const { url, key } = await api<{ url: string; key: string }>("/api/uploads/presign", { method: "POST", json: { projectId, kind: "take", contentType: "video/webm", bytes: blob.size } });
      const put = await fetch(url, { method: "PUT", body: blob, headers: { "content-type": "video/webm" } });
      if (!put.ok) throw new Error(`Upload failed with ${put.status}.`);
      const { jobId } = await api<{ jobId: string }>(`/api/projects/${projectId}/takes`, { method: "POST", json: { sectionKey: section.key, key, durationMs } });
      onUploaded(jobId);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPhase("idle");
    }
  };

  const over = elapsed > budgetSec * 1000;
  return (
    <Dialog open={open} onOpenChange={(o) => phase === "idle" && onOpenChange(o)}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Record a take: {section?.title}</DialogTitle>
          <DialogDescription>Screen, camera and mic. Budget {budgetSec} s. Record as many takes as you like; the Director keeps the best.</DialogDescription>
        </DialogHeader>
        <video ref={video} muted playsInline autoPlay className="bg-muted aspect-video w-full rounded-lg border" aria-label="Take preview" />
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Switch id="take-camera" checked={camera} onCheckedChange={setCamera} disabled={phase !== "idle"} />
            <Label htmlFor="take-camera">Camera picture-in-picture</Label>
          </div>
          <span className={over ? "text-status-contradicted-foreground font-mono tabular-nums" : "text-muted-foreground font-mono tabular-nums"} role="timer" aria-live="off">
            {formatClock(elapsed)} / {formatClock(budgetSec * 1000)}
          </span>
        </div>
        <DialogFooter>
          {phase === "idle" ? (
            <Button onClick={start}>
              <Circle className="fill-current" /> Start take
            </Button>
          ) : phase === "recording" ? (
            <Button variant="destructive" onClick={stop}>
              <Square /> Stop and upload
            </Button>
          ) : (
            <Button disabled>
              <Upload /> Uploading
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
