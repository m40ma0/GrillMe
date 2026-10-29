import { Lightbulb } from "lucide-react";
import type { PatternDTO } from "@/lib/types";
import { EmptyState } from "./empty-state";
import { StatusBadge } from "./status-badge";

export function PatternsList({ patterns }: { patterns: PatternDTO[] }) {
  if (patterns.length === 0) return <EmptyState icon={Lightbulb}>Patterns appear once at least two winners are profiled.</EmptyState>;
  return (
    <ul className="grid gap-3">
      {patterns.map((p) => (
        <li key={p.id} className="grid gap-2 rounded-lg border p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="font-medium">{p.statement}</p>
            <StatusBadge status={p.checkResult} />
          </div>
          <p>
            <span className="text-muted-foreground">Check: </span>
            {p.check}
          </p>
          {p.checkDetail ? <p className="text-muted-foreground">{p.checkDetail}</p> : null}
          <ul className="text-muted-foreground grid gap-1 text-xs">
            {p.evidence.map((e) => (
              <li key={`${e.winnerTitle}-${e.quote}`}>
                {e.sourceUrl ? (
                  <a href={e.sourceUrl} target="_blank" rel="noreferrer noopener" className="text-primary underline underline-offset-2">
                    {e.winnerTitle}
                  </a>
                ) : (
                  e.winnerTitle
                )}
                : <q className="italic">{e.quote}</q>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
