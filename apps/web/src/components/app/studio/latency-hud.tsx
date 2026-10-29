"use client";
import { latencySummary } from "@stage-ready/shared";
import { useEffect, useState } from "react";
import { useStudio } from "@/stores/studio";

const BUDGETS: Record<string, { label: string; budget: number }> = {
  stt_partial: { label: "Speech → transcript partial", budget: 600 },
  claim_chip: { label: "Sentence end → claim chip", budget: 2_000 },
  judge_decision: { label: "Sentence end → judge decision", budget: 1_200 },
  frame_state: { label: "Frame → SAM UI state", budget: 250 },
};

/** Dev-only latency HUD (Cmd+Shift+L): live p95 per path against its budget. */
export function LatencyHud() {
  const [open, setOpen] = useState(false);
  const metrics = useStudio((s) => s.metrics);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  if (!open) return null;
  return (
    <aside aria-label="Latency HUD" className="bg-popover fixed right-4 bottom-4 z-40 w-80 rounded-lg border p-3 text-xs shadow-sm">
      <p className="mb-2 font-medium">Latency HUD (p95, dev only)</p>
      <dl className="grid gap-1">
        {Object.entries(BUDGETS).map(([path, { label, budget }]) => {
          const { p95, n } = latencySummary(metrics[path] ?? []);
          const over = p95 !== null && p95 > budget;
          return (
            <div key={path} className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className={`font-mono tabular-nums ${over ? "text-status-contradicted-foreground" : ""}`}>
                {p95 === null ? "–" : `${Math.round(p95)} ms`} / {budget} ms <span className="text-muted-foreground">n={n}</span>
              </dd>
            </div>
          );
        })}
      </dl>
    </aside>
  );
}
