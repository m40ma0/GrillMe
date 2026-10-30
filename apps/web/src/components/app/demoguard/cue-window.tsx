"use client";
import { useEffect, useState } from "react";
import { cueChannel, type CueMessage } from "@/lib/demoguard/capture";
import { cn } from "@/lib/utils";

/** Second-monitor cue: current step, next step and the narration line, large and high contrast. */
export function CueWindow({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [cue, setCue] = useState<CueMessage | null>(null);
  useEffect(() => {
    const channel = new BroadcastChannel(cueChannel(projectId));
    channel.onmessage = (e: MessageEvent<CueMessage>) => setCue(e.data);
    return () => channel.close();
  }, [projectId]);
  const fallback = cue?.state === "fallback" || cue?.state === "recovering";
  const watching = cue && cue.state !== "idle" && cue.state !== "preflight";
  return (
    <main className={cn("flex min-h-screen flex-col justify-center gap-8 p-12", fallback ? "bg-black text-white" : "bg-background text-foreground")}>
      <p className={cn("text-xl", fallback ? "text-white/80" : "text-muted-foreground")}>
        {projectName} · presenter cue{cue ? ` · ${cue.state}` : ""}
      </p>
      {watching && cue.step ? (
        <>
          {fallback ? (
            <p className="rounded-lg bg-[oklch(0.75_0.18_55)] px-4 py-2 text-2xl font-semibold text-black" role="status">
              On fallback. Keep narrating this step.
            </p>
          ) : null}
          <div aria-live="polite">
            <p className={cn("text-2xl", fallback ? "text-white/80" : "text-muted-foreground")}>
              Step {cue.step.index + 1} of {cue.total}
            </p>
            <p className="text-6xl leading-tight font-semibold tracking-tight">{cue.step.name}</p>
          </div>
          {cue.step.narration ? <p className="max-w-5xl text-4xl leading-snug">{cue.step.narration}</p> : null}
          <p className={cn("text-3xl", fallback ? "text-white/80" : "text-muted-foreground")}>Next: {cue.next ? cue.next.name : "Last step"}</p>
        </>
      ) : (
        <p className="text-4xl leading-10 font-semibold">DemoGuard is not armed. Start pre-flight from the DemoGuard page; this window follows it.</p>
      )}
    </main>
  );
}
