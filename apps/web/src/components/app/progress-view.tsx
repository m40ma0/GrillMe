"use client";
import { Activity, ListChecks } from "lucide-react";
import Link from "next/link";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { ProgressDTO } from "@/lib/types";
import { EmptyState } from "./empty-state";
import { StatusBadge } from "./status-badge";
import { ModelCaption } from "@/components/app/model-caption";

const SERIES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export function ProgressView({ data }: { data: ProgressDTO }) {
  const keyed = data.criteria.map((name, i) => ({ name, key: `c${i}`, color: SERIES[i % SERIES.length] ?? "var(--chart-1)" }));
  const config = Object.fromEntries(keyed.map((c) => [c.key, { label: `${c.name} (%)`, color: c.color }])) satisfies ChartConfig;
  const rows = data.trends.map((t) => ({ label: t.label, ...Object.fromEntries(keyed.map((c) => [c.key, t.criteria[c.name] ?? 0])) }));
  const resolved = data.history.flatMap((h) => h.resolved.map((r) => ({ ...r, when: h.createdAt })));
  const latest = data.history[0];
  const open = latest ? [...latest.open, ...latest.newIssues] : [];
  const fmt = (iso: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: data.project.timezone }).format(new Date(iso));

  if (data.trends.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        action={
          <Button asChild>
            <Link href={`/projects/${data.project.id}/rehearse`}>Start rehearsal</Link>
          </Button>
        }
      >
        Rehearse to start tracking progress per criterion.
      </EmptyState>
    );
  }
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Coverage per criterion</CardTitle>
          <CardDescription>Each point is one rehearsal, in order.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={config} className="aspect-auto h-72 w-full">
            <LineChart data={rows} margin={{ left: 8, right: 16, bottom: 16 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" label={{ value: "Rehearsal", position: "insideBottom", offset: -8 }} height={40} />
              <YAxis domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} label={{ value: "Coverage (%)", angle: -90, position: "insideLeft" }} width={64} />
              <ChartTooltip content={<ChartTooltipContent formatter={(v) => `${v}%`} />} />
              {keyed.map((c) => (
                <Line key={c.key} dataKey={c.key} stroke={`var(--color-${c.key})`} strokeWidth={2} dot isAnimationActive={false} />
              ))}
            </LineChart>
          </ChartContainer>
          <ul className="mt-2 flex flex-wrap gap-4 text-xs" aria-label="Legend">
            {keyed.map((c) => (
              <li key={c.key} className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-[2px]" style={{ backgroundColor: c.color }} aria-hidden />
                {c.name}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Next session plan</CardTitle>
          </CardHeader>
          <CardContent>
            {data.nextPlan.length ? (
              <>
                <ol className="list-decimal pl-5">
                  {data.nextPlan.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ol>
                <ModelCaption modelId={data.nextPlanModel?.modelId} latencyMs={data.nextPlanModel?.latencyMs ?? null} className="mt-2" />
              </>
            ) : (
              <p className="text-muted-foreground">Written after your next rehearsal.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Open weak spots</CardTitle>
          </CardHeader>
          <CardContent>
            {open.length ? (
              <ul className="grid gap-2">
                {open.map((i) => (
                  <li key={i.key} className="flex items-start gap-2">
                    <StatusBadge status={i.severity === "high" ? "contradicted" : "unverified"} label={i.severity === "high" ? "High" : "Medium"} />
                    <span>{i.text}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">Nothing open.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Resolved</CardTitle>
          </CardHeader>
          <CardContent>
            {resolved.length ? (
              <ul className="grid gap-2">
                {resolved.map((i) => (
                  <li key={`${i.key}-${i.when}`} className="flex items-start gap-2">
                    <StatusBadge status="verified" label="Resolved" />
                    <span>
                      {i.text} <span className="text-muted-foreground text-xs">({fmt(i.when)})</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">Nothing resolved yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
      <Button asChild variant="outline" className="w-fit">
        <Link href={`/projects/${data.project.id}/sessions`}>
          <ListChecks /> All sessions
        </Link>
      </Button>
    </div>
  );
}
