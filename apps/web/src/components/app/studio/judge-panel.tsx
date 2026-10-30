"use client";
import { Hand, ListOrdered } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ModelCaption } from "../model-caption";
import { useStudio } from "@/stores/studio";
import { cn } from "@/lib/utils";
import { DISC, type StudioPersona } from "./types";

const initials = (label: string) =>
  label
    .split(/\s+/)
    .filter((w) => /^[A-Z]/.test(w))
    .map((w) => w[0])
    .join("")
    .slice(0, 2);

/** Abstract judges: initials on a coloured disc, a ring while speaking, and captions for every word they say. */
export function JudgePanel({ personas, onYield }: { personas: StudioPersona[]; onYield: () => void }) {
  const speaking = useStudio((s) => s.speaking);
  const queued = useStudio((s) => s.queued);
  const log = useStudio((s) => s.judgeLog);
  const byId = new Map(personas.map((p, i) => [p.id, { ...p, i }]));
  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="grid gap-3">
        {personas.map((p, i) => {
          const active = speaking?.personaId === p.id;
          return (
            <div key={p.id} className="flex items-center gap-3">
              <span
                className={cn(
                  "text-foreground flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ring-2 transition-[box-shadow] duration-200 ease-out",
                  DISC[i % 3],
                  active && "ring-4 ring-offset-2 ring-offset-background motion-safe:animate-pulse",
                )}
                aria-hidden
              >
                {initials(p.label)}
              </span>
              <div className="min-w-0">
                <div className="truncate font-medium">{p.label}</div>
                <div className="text-muted-foreground text-xs">{active ? "Speaking" : "Listening"} · Fictional persona</div>
              </div>
            </div>
          );
        })}
      </div>
      <section aria-label="Judge captions" className="bg-muted/40 min-h-24 rounded-lg border p-3" aria-live="polite">
        {speaking ? (
          <>
            <p className="text-muted-foreground mb-1 text-xs">{byId.get(speaking.personaId)?.label ?? "Judge"}</p>
            <p className="text-base leading-6">{speaking.text}</p>
            <ModelCaption modelId={speaking.model?.modelId} latencyMs={speaking.model?.latencyMs ?? null} fallback={speaking.model?.fallback} className="mt-1" />
            <Button variant="outline" size="sm" className="mt-2" onClick={onYield} aria-label="Let me finish (Cmd+.)">
              <Hand /> Let me finish <kbd className="text-muted-foreground font-mono text-[11px]">⌘.</kbd>
            </Button>
          </>
        ) : (
          <p className="text-muted-foreground">Judges speak at sentence boundaries. Their words appear here as captions.</p>
        )}
      </section>
      {queued.length > 0 ? (
        <section aria-label="Queued questions">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
            <ListOrdered size={16} aria-hidden /> Queued questions
          </h3>
          <ul className="grid gap-2">
            {queued.map((q) => (
              <li key={q.text} className="rounded-md border p-2 text-xs">
                <span className="text-muted-foreground">{byId.get(q.personaId)?.label}: </span>
                {q.text}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section aria-label="Judge turns" className="min-h-0 flex-1">
        <h3 className="mb-2 text-sm font-medium">Turns</h3>
        <ScrollArea className="h-full max-h-80">
          <ul className="grid gap-2 pr-3">
            {[...log].reverse().map((l) => (
              <li key={`${l.at}-${l.personaId}`} className="text-xs">
                <Badge variant="outline" className="mr-1">
                  {l.kind === "follow_up" ? "Follow-up" : l.kind === "question" ? "Question" : "Interrupt"}
                </Badge>
                {l.yielded ? (
                  <Badge variant="secondary" className="mr-1">
                    Yielded
                  </Badge>
                ) : null}
                <span className="text-muted-foreground">{byId.get(l.personaId)?.label}: </span>
                {l.text}
                <ModelCaption modelId={l.model?.modelId} latencyMs={l.model?.latencyMs ?? null} fallback={l.model?.fallback} className="mt-0.5 flex" />
              </li>
            ))}
          </ul>
        </ScrollArea>
      </section>
    </div>
  );
}
