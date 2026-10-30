"use client";
import { PERSONA_ROLE_LABEL, type Persona } from "@stage-ready/shared";
import { RefreshCw, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { api } from "@/lib/api-client";
import type { PersonaDTO } from "@/lib/types";
import { EmptyState } from "./empty-state";

// The disc carries the persona colour; initials stay in the foreground colour for contrast.
const DISC = ["bg-persona-1/15 ring-persona-1", "bg-persona-2/15 ring-persona-2", "bg-persona-3/15 ring-persona-3"];
const DIFFICULTY = ["", "Friendly", "Warm", "Direct", "Tough", "Hostile"];

/** Abstract avatars only: initials on a coloured disc. Personas are fictional and built from published criteria. */
export function PersonaCards({ projectId, personas, canGenerate }: { projectId: string; personas: PersonaDTO[]; canGenerate: boolean }) {
  const router = useRouter();
  const [difficulty, setDifficulty] = useState(personas[0]?.difficulty ?? 3);
  const [pending, setPending] = useState(false);
  const generate = async () => {
    setPending(true);
    try {
      await api<{ personas: Persona[] }>(`/api/projects/${projectId}/personas/generate`, { method: "POST", json: { difficulty } });
      toast.success("Personas rebuilt from the criteria.");
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="grid w-64 gap-2">
          <Label htmlFor="difficulty">
            Difficulty <span className="font-mono tabular-nums">{difficulty}</span> · {DIFFICULTY[difficulty]}
          </Label>
          <Slider id="difficulty" aria-label="Judge difficulty" min={1} max={5} step={1} value={[difficulty]} onValueChange={([v]) => setDifficulty(v ?? 3)} />
        </div>
        <Button variant="outline" onClick={generate} disabled={!canGenerate || pending}>
          <RefreshCw /> {personas.length ? "Rebuild personas" : "Build personas"}
        </Button>
      </div>
      {personas.length === 0 ? (
        <EmptyState icon={UsersRound}>{canGenerate ? "Build three fictional judges from your event's criteria." : "Save the event's criteria first; judges are built from them."}</EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {personas.map((p, i) => {
            const label = PERSONA_ROLE_LABEL[p.role];
            return (
              <article key={p.id} className="grid content-start gap-3 rounded-xl border p-4">
                <div className="flex items-center gap-3">
                  <span className={`flex size-10 items-center justify-center rounded-full text-foreground text-sm font-semibold ring-2 ${DISC[i % 3]}`} aria-hidden>
                    {label.slice(0, 1)}
                    {p.role.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <h3 className="font-medium">{label}</h3>
                    <Badge variant="outline">Fictional persona</Badge>
                  </div>
                </div>
                <p className="text-muted-foreground">{p.questionStyle}</p>
                <dl className="grid gap-1">
                  {Object.entries(p.criteriaWeights).map(([name, weight]) => (
                    <div key={name} className="flex justify-between gap-2 text-xs">
                      <dt>{name}</dt>
                      <dd className="font-mono tabular-nums">{Math.round(weight * 100)}%</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-muted-foreground text-xs">
                  Difficulty <span className="font-mono tabular-nums">{p.difficulty}</span> · voice {p.voicePreset}
                </p>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
