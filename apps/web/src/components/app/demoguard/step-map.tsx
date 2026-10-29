"use client";
import { Fingerprint, ListOrdered, Save, Wand2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import type { DemoGuardDTO, StepDTO } from "@/lib/types";
import { EmptyState } from "../empty-state";

const sec = (ms: number) => (ms / 1000).toFixed(1);
const fmtDate = (iso: string) => (iso ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) : "Unknown time");

function StepEditor({ step, onSaved }: { step: StepDTO; onSaved: () => void }) {
  const [name, setName] = useState(step.name);
  const [narration, setNarration] = useState(step.narration);
  const [max, setMax] = useState(sec(step.maxDurationMs));
  const [inS, setIn] = useState(sec(step.fallbackInMs));
  const [outS, setOut] = useState(sec(step.fallbackOutMs));
  const [saving, setSaving] = useState(false);
  const ms = (s: string) => Math.round(Number(s) * 1000);
  const valid = name.trim().length > 0 && ms(max) >= 500 && ms(outS) > ms(inS) && ms(inS) >= 0;
  const dirty = name !== step.name || narration !== step.narration || ms(max) !== step.maxDurationMs || ms(inS) !== step.fallbackInMs || ms(outS) !== step.fallbackOutMs;
  const id = (k: string) => `step-${step.id}-${k}`;
  const save = async () => {
    setSaving(true);
    try {
      await api(`/api/steps/${step.id}`, { method: "PATCH", json: { name, narration, maxDurationMs: ms(max), fallbackInMs: ms(inS), fallbackOutMs: ms(outS) } });
      toast.success(`Saved ${name}.`);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <li className="grid gap-3 rounded-xl border p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground font-mono text-sm tabular-nums">Step {step.order + 1}</span>
        {step.hasExpectedState ? (
          <Badge variant="outline">
            <Fingerprint aria-hidden /> Expected state from the golden run
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            No expected-state keyframe
          </Badge>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_1fr]">
        <div className="grid gap-1.5">
          <Label htmlFor={id("name")}>Name</Label>
          <Input id={id("name")} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={id("max")}>Max duration (s)</Label>
          <Input id={id("max")} type="number" min={0.5} step={0.5} value={max} onChange={(e) => setMax(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={id("in")}>Fallback in (s)</Label>
          <Input id={id("in")} type="number" min={0} step={0.1} value={inS} onChange={(e) => setIn(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={id("out")}>Fallback out (s)</Label>
          <Input id={id("out")} type="number" min={0} step={0.1} value={outS} onChange={(e) => setOut(e.target.value)} aria-invalid={ms(outS) <= ms(inS)} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={id("narration")}>Narration for the cue window</Label>
        <Textarea id={id("narration")} rows={2} value={narration} maxLength={400} onChange={(e) => setNarration(e.target.value)} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs">{step.goldenDurationMs !== null ? `Took ${sec(step.goldenDurationMs)} s in the golden run.` : "Fixture step."}</span>
        <Button size="sm" onClick={save} disabled={!dirty || !valid || saving}>
          <Save /> {saving ? "Saving" : "Save step"}
        </Button>
      </div>
    </li>
  );
}

export function StepMapTab({ projectId, data, onChange }: { projectId: string; data: DemoGuardDTO; onChange: () => void }) {
  const [golden, setGolden] = useState<string>(data.goldenRuns[0]?.id ?? "");
  const [building, setBuilding] = useState(false);
  const build = async () => {
    setBuilding(true);
    try {
      await api(`/api/projects/${projectId}/stepmaps`, { method: "POST", json: { goldenRunSessionId: golden } });
      toast.success("Step map built from the golden run.");
      onChange();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBuilding(false);
    }
  };
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Golden run</CardTitle>
          <CardDescription>Pick a rehearsal where the demo went right. Each timed step becomes a DemoGuard step with its fallback in and out points.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          {data.goldenRuns.length ? (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="golden-run">Rehearsal</Label>
                <Select value={golden} onValueChange={setGolden}>
                  <SelectTrigger id="golden-run" className="w-80">
                    <SelectValue placeholder="Pick a rehearsal" />
                  </SelectTrigger>
                  <SelectContent>
                    {data.goldenRuns.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {fmtDate(g.startedAt)} · {g.steps} timed steps
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={build} disabled={!golden || building}>
                <Wand2 /> {data.stepMap ? "Rebuild step map" : "Build step map"}
              </Button>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">No rehearsal has timed steps yet. Rehearse the demo with the screen shared so the stopwatch times each step.</p>
          )}
        </CardContent>
      </Card>
      {data.steps.length ? (
        <section aria-label="Steps" className="grid gap-2">
          <p className="text-muted-foreground text-sm">
            Version {data.stepMap?.version} · {data.steps.length} steps{data.stepMap?.fallbackClipUrl ? " · fallback clip from the golden run's recording" : " · no fallback recording uploaded"}
          </p>
          <ol className="grid gap-3">
            {data.steps.map((s) => (
              <StepEditor key={`${s.id}-${s.name}-${s.maxDurationMs}-${s.fallbackInMs}-${s.fallbackOutMs}`} step={s} onSaved={onChange} />
            ))}
          </ol>
        </section>
      ) : (
        <EmptyState icon={ListOrdered}>Build the step map from a golden run to start.</EmptyState>
      )}
    </div>
  );
}
