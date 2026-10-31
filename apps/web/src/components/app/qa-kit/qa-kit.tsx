"use client";
import { PERSONA_ROLE_LABEL } from "@stage-ready/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileDown, MessagesSquare, RefreshCw, Timer, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api-client";
import type { QaKitDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { EmptyState } from "../empty-state";
import { ErrorAlert } from "../error-alert";
import { JobProgress } from "../job-progress";
import { AnswerCardEditor } from "./answer-card-editor";
import { DrillMode } from "./drill-mode";
import { SlidePreview } from "./slide-preview";
import { ModelCaption } from "@/components/app/model-caption";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function QaKit({ projectId, demoMode, initial }: { projectId: string; demoMode: boolean; initial: QaKitDTO }) {
  const client = useQueryClient();
  const { data = initial } = useQuery({ queryKey: ["qa-kit", projectId], queryFn: () => api<QaKitDTO>(`/api/projects/${projectId}/qa-kit`), initialData: initial });
  const [selectedId, setSelectedId] = useState<string | null>(initial.questions[0]?.id ?? null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [drill, setDrill] = useState(false);
  const refresh = () => client.invalidateQueries({ queryKey: ["qa-kit", projectId] });
  const selected = data.questions.find((q) => q.id === selectedId) ?? data.questions[0] ?? null;

  const rebuild = async () => {
    setError(null);
    try {
      setJobId((await api<{ jobId: string }>(`/api/projects/${projectId}/questions/generate`, { method: "POST" })).jobId);
    } catch (e) {
      setError(e as Error);
    }
  };

  const actions = (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={rebuild} disabled={Boolean(jobId)}>
        <RefreshCw /> Rebuild questions
      </Button>
      {data.appendix ? (
        <Button variant="outline" asChild>
          <a href={`/api/projects/${projectId}/qa-kit/appendix`} download>
            <FileDown /> Export PDF
          </a>
        </Button>
      ) : (
        <Button variant="outline" disabled title="Render the slides first">
          <FileDown /> Export PDF
        </Button>
      )}
      <Button onClick={() => setDrill(true)} disabled={data.questions.length === 0}>
        <Timer /> Start drill
      </Button>
    </div>
  );

  return (
    <div className="grid gap-4">
      {actions}
      {error ? <ErrorAlert title="Could not rebuild the question bank" error={error} onRetry={rebuild} /> : null}
      {jobId ? (
        <JobProgress
          jobId={jobId}
          title="Rebuilding questions and slides"
          onDone={() => {
            setJobId(null);
            void refresh();
          }}
          onRetry={rebuild}
        />
      ) : null}
      {data.brief ? <PrePitchBrief brief={data.brief} /> : null}
      {data.gapTasks > 0 ? (
        <Alert>
          <TriangleAlert aria-hidden />
          <AlertTitle>
            {data.gapTasks} {data.gapTasks === 1 ? "question has" : "questions have"} no evidence yet
          </AlertTitle>
          <AlertDescription>
            <p>
              Each one is now a Fix Task with the artefact that would answer it. See them on the{" "}
              <Link href={`/projects/${projectId}`} className="underline underline-offset-4">
                project overview
              </Link>
              .
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      {data.questions.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          action={
            <Button onClick={rebuild}>
              <RefreshCw /> Build questions
            </Button>
          }
        >
          Build the question bank from your criteria, claims, repo and rehearsals.
        </EmptyState>
      ) : (
        <>
          {selected ? (
            <section aria-label="Selected question" className="grid gap-4 lg:grid-cols-2">
              <AnswerCardEditor key={selected.id} question={selected} onSaved={refresh} />
              <SlidePreview key={`slide-${selected.id}`} question={selected} onRendered={refresh} />
            </section>
          ) : null}
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Question</TableHead>
                  <TableHead className="hidden md:table-cell">Judge</TableHead>
                  <TableHead className="text-right">Likelihood</TableHead>
                  <TableHead className="text-right">Damage</TableHead>
                  <TableHead className="text-right">Last drill</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.questions.map((q, i) => (
                  <TableRow
                    key={q.id}
                    data-state={q.id === selected?.id ? "selected" : undefined}
                    className={cn("cursor-pointer", q.id === selected?.id && "bg-muted/60")}
                    onClick={() => setSelectedId(q.id)}
                  >
                    <TableCell className="text-muted-foreground font-mono tabular-nums">{i + 1}</TableCell>
                    <TableCell className="max-w-xl whitespace-normal">
                      <button type="button" className="text-left hover:underline focus-visible:underline" aria-pressed={q.id === selected?.id} onClick={() => setSelectedId(q.id)}>
                        {q.text}
                      </button>
                      {q.card && q.card.evidenceRefs.length === 0 ? <span className="text-status-unverified-foreground ml-2 text-xs whitespace-nowrap">No evidence</span> : null}
                      <ModelCaption modelId={q.model?.modelId} latencyMs={q.model?.latencyMs ?? null} className="flex" />
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden md:table-cell">{q.personaRole ? PERSONA_ROLE_LABEL[q.personaRole] : "Any"}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{pct(q.likelihood)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{pct(q.damage)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{q.lastScore === null ? <span className="text-muted-foreground">Not drilled</span> : pct(q.lastScore)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
      {drill ? <DrillMode questions={data.questions} demoMode={demoMode} onClose={() => (setDrill(false), void refresh())} /> : null}
    </div>
  );
}

/** The one-page brief Muse Wonder writes from everything the project knows, read before presenting. */
function PrePitchBrief({ brief }: { brief: NonNullable<QaKitDTO["brief"]> }) {
  const sections: [string, string[]][] = [
    ["Lean on", brief.strengths],
    ["Judges will catch", brief.risks],
    ["Say", brief.mustSay],
    ["Show", brief.mustShow],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pre-pitch brief</CardTitle>
        <CardDescription>{brief.summary}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-4 md:grid-cols-2">
          {sections.map(([title, items]) =>
            items.length ? (
              <div key={title}>
                <h3 className="mb-1 text-sm font-medium">{title}</h3>
                <ul className="text-muted-foreground list-disc pl-5 text-sm">
                  {items.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
        </div>
        <ModelCaption modelId={brief.model.modelId} latencyMs={brief.model.latencyMs} />
      </CardContent>
    </Card>
  );
}
