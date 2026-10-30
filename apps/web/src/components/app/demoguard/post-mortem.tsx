"use client";
import { SIGNAL_LABEL, type SignalKind } from "@stage-ready/shared";
import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DemoGuardRunDTO } from "@/lib/types";
import { EmptyState } from "../empty-state";

const ACTION = { switch: "Switched to fallback", recover: "Recovered to live", panic: "Panic", resume: "Resumed live", freeze: "Froze" } as const;
const sec = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const fmt = (iso: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

/** Incidents per run: their signals, detection time, and the time spent on fallback. */
export function PostMortemTab({ runs }: { runs: DemoGuardRunDTO[] }) {
  if (runs.length === 0) return <EmptyState icon={History}>Incidents from DemoGuard runs appear here.</EmptyState>;
  return (
    <div className="grid gap-4">
      {runs.map((r) => (
        <Card key={r.sessionId}>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">{fmt(r.startedAt)}</CardTitle>
              <Badge variant={r.incidents.some((i) => i.action === "switch" || i.action === "panic") ? "fallback" : "verified"}>
                {r.incidents.length} {r.incidents.length === 1 ? "incident" : "incidents"} · {sec(r.totalFallbackMs)} on fallback
              </Badge>
            </div>
            <CardDescription>{r.endedAt ? "Ended." : "Still running or not ended cleanly."}</CardDescription>
          </CardHeader>
          <CardContent>
            {r.incidents.length ? (
              <ol className="relative grid gap-3 border-l pl-4" aria-label="Incident timeline">
                {r.incidents.map((i) => (
                  <li key={i.id} className="grid gap-0.5">
                    <span className="text-sm font-medium">
                      <span className="text-muted-foreground mr-2 font-mono tabular-nums">{sec(i.atMs)}</span>
                      {ACTION[i.action]}
                      {i.stepName ? ` during ${i.stepName}` : ""}
                    </span>
                    {i.signals.length ? <span className="text-muted-foreground text-xs">{i.signals.map((s) => SIGNAL_LABEL[s as SignalKind] ?? s).join(", ")}</span> : null}
                    {i.detectionMs !== null ? <span className="text-muted-foreground text-xs">Decided {i.detectionMs} ms after the frame arrived.</span> : null}
                    {i.fallbackMs > 0 ? <span className="text-muted-foreground text-xs">{sec(i.fallbackMs)} on fallback.</span> : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-muted-foreground text-sm">No incidents. The live demo held up.</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
