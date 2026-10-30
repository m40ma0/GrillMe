import { ExternalLink, Trophy } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { WinnerDTO } from "@/lib/types";
import { EmptyState } from "./empty-state";

const unknown = (v: string) => (v === "unknown" ? <span className="text-muted-foreground">Unknown</span> : v);

export function WinnersTable({ winners, emptyAction }: { winners: WinnerDTO[]; emptyAction?: React.ReactNode }) {
  if (winners.length === 0)
    return (
      <EmptyState icon={Trophy} action={emptyAction}>
        Add past winner pages to learn what actually won this event.
      </EmptyState>
    );
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Winner</TableHead>
          <TableHead>Placement</TableHead>
          <TableHead>Input → output</TableHead>
          <TableHead className="text-right">Strongest moment</TableHead>
          <TableHead>Source</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {winners.map((w) => (
          <TableRow key={w.id}>
            <TableCell className="font-medium">
              <HoverCard>
                <HoverCardTrigger asChild>
                  <button type="button" className="hover:underline">
                    {w.profile.title}
                  </button>
                </HoverCardTrigger>
                <HoverCardContent className="w-80">
                  <p className="mb-2 text-xs font-medium">Source quotes</p>
                  <dl className="grid gap-1 text-xs">
                    {Object.entries(w.profile.sourceQuotes).map(([field, quote]) => (
                      <div key={field}>
                        <dt className="text-muted-foreground">{field}</dt>
                        <dd>
                          <q className="italic">{quote}</q>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </HoverCardContent>
              </HoverCard>
            </TableCell>
            <TableCell>{unknown(w.profile.placement)}</TableCell>
            <TableCell>
              {unknown(w.profile.inputType)} → {unknown(w.profile.outputType)}
            </TableCell>
            <TableCell className="text-right font-mono tabular-nums">
              {w.profile.strongestMomentSec === null ? <span className="text-muted-foreground font-sans">Unknown</span> : `${w.profile.strongestMomentSec} s`}
            </TableCell>
            <TableCell>
              {w.sourceUrl ? (
                <a href={w.sourceUrl} target="_blank" rel="noreferrer noopener" className="text-primary inline-flex items-center gap-1 underline underline-offset-2">
                  {new URL(w.sourceUrl).hostname} <ExternalLink size={12} aria-hidden />
                </a>
              ) : (
                <span className="text-muted-foreground">Pasted text</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
