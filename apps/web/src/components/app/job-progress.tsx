"use client";
import { CircleCheck, Loader } from "lucide-react";
import { useEffect, useRef } from "react";
import { Progress } from "@/components/ui/progress";
import { useJob } from "@/hooks/use-job";
import { ErrorAlert } from "./error-alert";

/** Long jobs: progress, the current step label, and the outcome. */
export function JobProgress({ jobId, title, onDone, onRetry }: { jobId: string; title: string; onDone?: (result: unknown) => void; onRetry?: (() => void) | undefined }) {
  const { data, error } = useJob(jobId);
  const notified = useRef(false);
  useEffect(() => {
    if (data?.state === "completed" && !notified.current) {
      notified.current = true;
      onDone?.(data.result);
    }
  }, [data, onDone]);
  if (error) return <ErrorAlert title={`Could not check on ${title.toLowerCase()}`} error={error} onRetry={onRetry} />;
  if (data?.state === "failed") return <ErrorAlert title={`${title} failed`} error={new Error(data.error ?? "The job failed.")} onRetry={onRetry} />;
  const pct = data?.progress.pct ?? 0;
  const done = data?.state === "completed";
  return (
    <div className="grid gap-2 rounded-lg border p-4" aria-live="polite">
      <div className="flex items-center justify-between gap-4">
        <span className="inline-flex items-center gap-2 font-medium">
          {done ? <CircleCheck size={16} className="text-status-verified" aria-hidden /> : <Loader size={16} className="text-muted-foreground animate-spin motion-reduce:animate-none" aria-hidden />}
          {title}
        </span>
        <span className="text-muted-foreground font-mono text-xs tabular-nums">{Math.round(pct)}%</span>
      </div>
      <Progress value={pct} aria-label={`${title} progress`} />
      <p className="text-muted-foreground text-xs">{data?.progress.step || (data ? "Starting" : "Queued")}</p>
    </div>
  );
}
