"use client";
import { formatSeconds, latencySummary } from "@stage-ready/shared";
import { createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import { Timer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useStudio, type LedgerRow } from "@/stores/studio";
import { StatusBadge } from "../status-badge";

const TYPE_LABEL: Record<string, string> = {
  performance: "Performance",
  accuracy: "Accuracy",
  feature: "Feature",
  security_privacy: "Security",
  scale: "Scale",
  comparison: "Comparison",
  market: "Market",
};
const col = createColumnHelper<LedgerRow>();

function Evidence({ row }: { row: LedgerRow }) {
  return (
    <HoverCard openDelay={100}>
      <HoverCardTrigger asChild>
        <button type="button" className="focus-visible:ring-primary rounded-sm text-left focus-visible:ring-2">
          <StatusBadge status={row.status} />
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-80" align="end">
        <p className="mb-2 text-sm font-medium">Evidence</p>
        {row.verdict.evidence.length === 0 ? (
          <p className="text-muted-foreground text-xs">No evidence yet, so this stays Unverified.</p>
        ) : (
          <ul className="grid gap-2 text-xs">
            {row.verdict.evidence.map((e) => (
              <li key={e.ref + e.summary}>
                <code className="font-mono">{e.ref}</code> <span className="text-muted-foreground">{e.summary}</span>
              </li>
            ))}
          </ul>
        )}
        {row.verdict.suggestedRewrite ? (
          <p className="mt-2 text-xs">
            <span className="text-muted-foreground">Say instead: </span>
            {row.verdict.suggestedRewrite}
          </p>
        ) : null}
      </HoverCardContent>
    </HoverCard>
  );
}

const columns = [
  col.accessor("text", {
    header: "Claim",
    cell: (c) => (
      <div className="grid gap-0.5">
        <span className="line-clamp-3">{c.getValue()}</span>
        <span className="text-muted-foreground text-xs">{TYPE_LABEL[c.row.original.type] ?? c.row.original.type}</span>
      </div>
    ),
  }),
  col.accessor("status", { header: "Status", cell: (c) => <Evidence row={c.row.original} /> }),
];

function Stopwatch() {
  const running = useStudio((s) => s.stepRunning);
  const last = useStudio((s) => s.lastStep);
  const samples = useStudio((s) => s.samples);
  const elapsed = useStudio((s) => s.elapsedMs);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => tick((n) => n + 1), 100);
    return () => clearInterval(t);
  }, [running]);
  const stats = latencySummary(samples.map((s) => s.durationMs));
  const live = running ? Math.max(0, elapsed - running.startMs) : null;
  return (
    <section aria-label="Latency stopwatch" className="grid gap-2 rounded-lg border p-3">
      <h3 className="flex items-center gap-1.5 text-sm font-medium">
        <Timer size={16} aria-hidden /> Latency stopwatch
      </h3>
      <div className="font-mono text-2xl tabular-nums">{live !== null ? formatSeconds(live) : last ? formatSeconds(last.durationMs) : "–"}</div>
      <p className="text-muted-foreground text-xs">{running ? `Timing ${running.stepKey}` : last ? `Last step ${last.stepKey}` : "Starts when you click or the screen changes."}</p>
      <dl className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-muted-foreground">Steps</dt>
          <dd className="font-mono tabular-nums">{stats.n}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">p50</dt>
          <dd className="font-mono tabular-nums">{stats.p50 === null ? "–" : formatSeconds(stats.p50)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">p95</dt>
          <dd className="font-mono tabular-nums">{stats.p95 === null ? "–" : formatSeconds(stats.p95)}</dd>
        </div>
      </dl>
    </section>
  );
}

function CoverageMeter({ criteria }: { criteria: { id: string; name: string }[] }) {
  const coverage = useStudio((s) => s.coverage);
  return (
    <section aria-label="Criteria coverage" className="grid gap-2 rounded-lg border p-3">
      <h3 className="text-sm font-medium">Coverage</h3>
      {criteria.map((c) => {
        const total = Math.min(
          1,
          Object.values(coverage[c.id] ?? {}).reduce((a, b) => a + b, 0),
        );
        return (
          <div key={c.id} className="grid gap-1">
            <div className="flex justify-between gap-2 text-xs">
              <span className="truncate">{c.name}</span>
              <span className="font-mono tabular-nums">{Math.round(total * 100)}%</span>
            </div>
            <Progress value={total * 100} aria-label={`${c.name} coverage`} />
          </div>
        );
      })}
    </section>
  );
}

export function LedgerPanel({ criteria }: { criteria: { id: string; name: string }[] }) {
  const ledger = useStudio((s) => s.ledger);
  const data = useMemo(() => Object.values(ledger).sort((a, b) => b.atMs - a.atMs), [ledger]);
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getRowId: (r) => r.id });
  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <h2 className="text-base font-semibold">Claim ledger</h2>
      <ScrollArea className="min-h-0 flex-1 rounded-lg border">
        <div aria-live="polite" aria-label="Claim ledger">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((g) => (
                <TableRow key={g.id}>
                  {g.headers.map((h) => (
                    <TableHead key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="text-muted-foreground py-6 text-center">
                    Claims appear here as you make them.
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 duration-200">
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="align-top whitespace-normal">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </ScrollArea>
      <Stopwatch />
      <CoverageMeter criteria={criteria} />
    </div>
  );
}
