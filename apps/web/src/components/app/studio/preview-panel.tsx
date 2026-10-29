"use client";
import type { UiRegion } from "@stage-ready/shared";
import { MonitorPlay } from "lucide-react";
import { useEffect, useRef } from "react";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { useStudio } from "@/stores/studio";
import { cn } from "@/lib/utils";
import { clock } from "./types";

const REGION_STYLE: Record<UiRegion["label"], string> = {
  spinner: "border-status-unverified",
  progress_bar: "border-status-unverified",
  error_dialog: "border-status-contradicted",
  result_region: "border-status-verified",
};
const REGION_LABEL: Record<UiRegion["label"], string> = { spinner: "Spinner", progress_bar: "Progress", error_dialog: "Error", result_region: "Result" };

/** The screen-share preview (nothing ever pops over it), SAM outlines, the section timer and the transcript. */
export function PreviewPanel({
  stream,
  sections,
  overlay,
  onOverlay,
}: {
  stream: MediaStream | null;
  sections: { key: string; title: string; budgetSec: number }[];
  overlay: boolean;
  onOverlay: (v: boolean) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const regions = useStudio((s) => s.regions);
  const elapsed = useStudio((s) => s.elapsedMs);
  const sectionKey = useStudio((s) => s.sectionKey);
  const finals = useStudio((s) => s.finals);
  const partial = useStudio((s) => s.partial);
  const vision = useStudio((s) => s.vision);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [finals.length, partial]);
  const total = sections.reduce((sum, s) => sum + s.budgetSec, 0) * 1000 || 1;

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className={cn("relative aspect-video w-full overflow-hidden rounded-lg border", stream ? "bg-black" : "bg-muted")}>
        {stream ? (
          <video ref={ref} autoPlay muted playsInline className="h-full w-full object-contain" aria-label="Screen share preview" />
        ) : (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2">
            <MonitorPlay size={20} aria-hidden />
            <p>Your screen appears here when the rehearsal starts.</p>
          </div>
        )}
        {overlay
          ? regions.map((r, i) => (
              <div
                key={`${r.label}-${i}`}
                className={cn("pointer-events-none absolute border-2", REGION_STYLE[r.label])}
                style={{ left: `${r.box[0] * 100}%`, top: `${r.box[1] * 100}%`, width: `${(r.box[2] - r.box[0]) * 100}%`, height: `${(r.box[3] - r.box[1]) * 100}%` }}
              >
                <span className="bg-background/90 absolute -top-5 left-0 rounded px-1 text-[11px]">{REGION_LABEL[r.label]}</span>
              </div>
            ))
          : null}
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Switch id="overlay" checked={overlay} onCheckedChange={onOverlay} />
          <Label htmlFor="overlay">UI outlines</Label>
        </div>
        <span className="text-muted-foreground text-xs">{vision === "sam" ? "SAM 3.1 tracking" : "Screen hashes only (vision service has no SAM)"}</span>
      </div>
      <section aria-label="Section timer" className="grid gap-1">
        <div className="bg-muted relative flex h-6 overflow-hidden rounded-md">
          {sections.map((s) => (
            <div
              key={s.key}
              className={cn("border-background flex items-center border-r-2 px-1 text-[11px]", s.key === sectionKey ? "bg-primary/25 font-medium" : "")}
              style={{ width: `${((s.budgetSec * 1000) / total) * 100}%` }}
              title={`${s.title}: ${s.budgetSec} s`}
            >
              <span className="truncate">{s.title}</span>
            </div>
          ))}
          <div className="bg-foreground absolute inset-y-0 w-0.5" style={{ left: `${Math.min(100, (elapsed / total) * 100)}%` }} aria-hidden />
        </div>
        <div className="text-muted-foreground flex justify-between font-mono text-xs tabular-nums">
          <span>{clock(elapsed)}</span>
          <span>{clock(total)}</span>
        </div>
      </section>
      <section aria-label="Transcript" className="min-h-0 flex-1">
        <h2 className="mb-2 text-sm font-medium">Transcript</h2>
        <ScrollArea className="h-full max-h-72 rounded-lg border p-3">
          <div className="grid gap-1.5">
            {finals.length === 0 && !partial ? <p className="text-muted-foreground">Start speaking; the transcript follows you.</p> : null}
            {finals.map((s) => (
              <p key={s.id}>
                <span className="text-muted-foreground mr-2 font-mono text-xs tabular-nums">{clock(s.startMs)}</span>
                {s.text}
              </p>
            ))}
            {partial ? <p className="text-muted-foreground italic">{partial.text}</p> : null}
            <div ref={end} />
          </div>
        </ScrollArea>
      </section>
    </div>
  );
}
