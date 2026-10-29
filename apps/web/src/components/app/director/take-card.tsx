"use client";
import { Clapperboard, Film, Loader, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { TakeDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatClock, pct } from "./format";

function Breakdown({ take }: { take: TakeDTO }) {
  const s = take.score;
  if (!s) return <p className="text-muted-foreground text-sm">Not scored yet.</p>;
  const rows: [string, string, string][] = [
    ["Delivery", pct(s.delivery), `${s.wpm} wpm (target 140–170), ${s.fillerPer100} fillers per 100 words, ${s.longPauses} long pauses`],
    ["Criteria coverage", pct(s.coverage), "How much of the judging criteria this take covers"],
    ["Demo success", pct(s.demoSuccess), "DemoGuard incidents during the take"],
    ["Time fit", pct(s.timeFit), "Fit to the section budget"],
  ];
  return (
    <div className="grid gap-2 text-sm">
      <dl className="grid gap-1.5">
        {rows.map(([label, value, hint]) => (
          <div key={label}>
            <div className="flex justify-between gap-4">
              <dt className="font-medium">{label}</dt>
              <dd className="font-mono tabular-nums">{value}</dd>
            </div>
            <p className="text-muted-foreground text-xs">{hint}</p>
          </div>
        ))}
        <div className="flex justify-between gap-4">
          <dt className="font-medium">Claim penalty</dt>
          <dd className={cn("font-mono tabular-nums", s.claimPenalty > 0 && "text-status-contradicted-foreground")}>−{pct(s.claimPenalty)}</dd>
        </div>
      </dl>
      {s.contradictedClaims.length ? (
        <ul className="grid gap-1 border-t pt-2">
          {s.contradictedClaims.map((c) => (
            <li key={c.text} className="text-xs">
              <span className="text-status-contradicted-foreground font-medium">Contradicted:</span> “{c.text}” {c.reason}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** One take: thumbnail, score and duration; the breakdown shows on hover or focus. */
export function TakeCard({
  take,
  index,
  inCut,
  focused,
  budgetSec,
  onUse,
  onFocus,
  onDelete,
}: {
  take: TakeDTO;
  index: number;
  inCut: boolean;
  focused: boolean;
  budgetSec: number;
  onUse: () => void;
  onFocus: () => void;
  onDelete: () => void;
}) {
  const over = take.durationMs > budgetSec * 1000;
  return (
    <div className={cn("bg-card grid min-w-0 gap-2 rounded-xl border p-3 transition-shadow", inCut && "ring-primary ring-2", focused && !inCut && "ring-ring/60 ring-2")} data-take-id={take.id}>
      <HoverCard openDelay={150}>
        <HoverCardTrigger asChild>
          <button
            type="button"
            onClick={onFocus}
            onFocus={onFocus}
            className="bg-muted text-muted-foreground relative flex aspect-video w-full flex-col items-center justify-center gap-1 rounded-lg text-xs"
          >
            <span className="sr-only">Take {index + 1} score breakdown:</span>
            {take.status === "processing" || take.status === "uploaded" ? (
              <Loader className="animate-spin motion-reduce:animate-none" aria-hidden />
            ) : take.fixture ? (
              <Clapperboard aria-hidden />
            ) : (
              <Film aria-hidden />
            )}
            <span>{take.status === "processing" || take.status === "uploaded" ? "Transcribing and scoring" : take.fixture ? "Fixture take" : "Recorded take"}</span>
            <span className="bg-background/80 absolute right-1.5 bottom-1.5 rounded px-1 font-mono tabular-nums">{formatClock(take.durationMs)}</span>
          </button>
        </HoverCardTrigger>
        <HoverCardContent className="w-80" side="right" align="start">
          <Breakdown take={take} />
        </HoverCardContent>
      </HoverCard>
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Take {index + 1}</p>
          <p className={cn("text-xs", over ? "text-status-unverified-foreground" : "text-muted-foreground")}>
            {over ? `${formatClock(take.durationMs - budgetSec * 1000)} over budget` : "Within budget"}
          </p>
        </div>
        <p className="font-mono text-2xl font-semibold tabular-nums" aria-label="Score">
          {take.score ? pct(take.score.total) : "–"}
        </p>
      </div>
      {take.status === "failed" ? (
        <p className="text-status-contradicted-foreground flex items-start gap-1 text-xs">
          <TriangleAlert size={14} aria-hidden /> {take.error ?? "Processing failed."}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button size="sm" variant={inCut ? "secondary" : "default"} className="flex-1" onClick={onUse} disabled={inCut || take.status !== "ready"}>
          {inCut ? "In the cut" : "Use this take"}
        </Button>
        {!take.fixture ? (
          <Button size="sm" variant="ghost" onClick={onDelete} aria-label={`Delete take ${index + 1}`}>
            <Trash2 />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
