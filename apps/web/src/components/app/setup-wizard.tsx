"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { CreateProjectBody, autoSectionPlan, isTimeZone, type SectionPlanItem } from "@stage-ready/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import type { ProjectBundle, ProjectDTO } from "@/lib/types";
import { ErrorAlert } from "./error-alert";
import { EventSpecEditor } from "./event-spec-editor";
import { RepoPanel } from "./repo-panel";
import { SectionPlanEditor } from "./section-plan-editor";
import { SourcesForm } from "./sources-form";
import { WinnersTable } from "./winners-table";

const STEPS = ["Basics", "Event", "Past winners", "Repo", "Pitch"] as const;

type BasicsInput = z.input<typeof CreateProjectBody>;

function BasicsStep({ project, onDone }: { project: ProjectDTO | null; onDone: (id: string) => void }) {
  const form = useForm<BasicsInput>({
    resolver: zodResolver(CreateProjectBody),
    defaultValues: { name: project?.name ?? "", tagline: project?.tagline ?? "", timezone: project?.timezone ?? "Asia/Singapore" },
  });
  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (project) {
        await api(`/api/projects/${project.id}`, { method: "PATCH", json: { ...values, setupStep: 1 } });
        onDone(project.id);
      } else {
        const { project: created } = await api<{ project: ProjectDTO }>("/api/projects", { method: "POST", json: values });
        onDone(created.id);
      }
    } catch (error) {
      toast.error((error as Error).message);
    }
  });
  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Project name</FormLabel>
              <FormControl>
                <Input {...field} autoFocus placeholder="What you are presenting" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="tagline"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tagline</FormLabel>
              <FormControl>
                <Input {...field} placeholder="One line on what it does" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="timezone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Time zone</FormLabel>
              <FormControl>
                <Input {...field} className="font-mono" list="timezones" />
              </FormControl>
              <datalist id="timezones">
                {["Asia/Singapore", "America/New_York", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Asia/Tokyo", "Australia/Sydney", "UTC"].map((tz) => (
                  <option key={tz} value={tz} />
                ))}
              </datalist>
              <FormDescription>Deadlines and countdowns use this zone.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            Continue <ArrowRight />
          </Button>
        </div>
      </form>
    </Form>
  );
}

function PitchStep({ bundle, onDone }: { bundle: ProjectBundle; onDone: () => void }) {
  const limit = bundle.eventSpec?.requirements.videoMaxSec ?? bundle.project.videoLimitSec;
  const [script, setScript] = useState(bundle.project.pitchScript);
  // Start from the event's limit unless the saved plan already fits it exactly.
  const [plan, setPlan] = useState<SectionPlanItem[]>(() =>
    bundle.sectionPlan.length === 6 && bundle.sectionPlan.reduce((sum, s) => sum + s.budgetSec, 0) === limit ? bundle.sectionPlan : autoSectionPlan(limit),
  );
  const [pending, setPending] = useState(false);
  const finish = async () => {
    setPending(true);
    try {
      await api(`/api/projects/${bundle.project.id}`, { method: "PATCH", json: { pitchScript: script, sectionPlan: plan, videoLimitSec: Math.round(limit), setupStep: 5 } });
      if (bundle.eventSpec && bundle.eventSpec.criteria.length > 0 && bundle.personas.length === 0) {
        await api(`/api/projects/${bundle.project.id}/personas/generate`, { method: "POST", json: { difficulty: 3 } });
      }
      onDone();
    } catch (error) {
      toast.error((error as Error).message);
      setPending(false);
    }
  };
  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Label htmlFor="pitch">Outline or script</Label>
        <Textarea id="pitch" rows={8} value={script} onChange={(e) => setScript(e.target.value)} placeholder="Hook, problem, demo steps, how it works, impact, close." />
      </div>
      <div className="grid gap-2">
        <h3 className="text-base font-medium">Section plan</h3>
        <SectionPlanEditor value={plan} onChange={setPlan} limitSec={limit} />
      </div>
      <div>
        <Button onClick={finish} disabled={pending}>
          <Check /> {pending ? "Finishing" : "Finish setup"}
        </Button>
      </div>
    </div>
  );
}

/** Shaped like the wizard (progress, tabs, one step card), so loading never shows a blank block. */
function WizardSkeleton({ step }: { step: number }) {
  return (
    <div className="grid gap-6" aria-busy="true" aria-label="Loading setup">
      <div className="grid gap-2">
        <div className="flex justify-between text-sm">
          <span className="font-medium">
            Step {Math.min(5, Math.max(1, step + 1))} of 5 · {STEPS[Math.min(4, Math.max(0, step))]}
          </span>
        </div>
        <Progress value={Math.max(0, step) * 20} aria-label="Setup progress" />
      </div>
      <Skeleton className="h-9 w-full rounded-lg" />
      <div className="grid gap-4 rounded-xl border p-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-9 w-32" />
      </div>
    </div>
  );
}

export function SetupWizard() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const projectId = params.get("project");
  const requested = Number(params.get("step") ?? NaN);
  const bundle = useQuery({ queryKey: ["project", projectId], queryFn: () => api<ProjectBundle>(`/api/projects/${projectId}`), enabled: Boolean(projectId) });
  const savedStep = bundle.data ? Math.min(4, bundle.data.project.setupStep) : 0;
  const step = Number.isInteger(requested) && requested >= 0 && requested <= 4 ? requested : projectId ? savedStep : 0;

  useEffect(() => {
    if (bundle.data?.project.timezone && !isTimeZone(bundle.data.project.timezone)) toast.error("This project's time zone is not valid.");
  }, [bundle.data]);

  // Step changes are optimistic: the URL changes through the history API (no server round trip; Next keeps
  // useSearchParams in sync), the cached project moves forward at once, and the server is told in the background.
  const go = (id: string, next: number) => {
    queryClient.setQueryData<ProjectBundle>(["project", id], (old) => (old ? { ...old, project: { ...old.project, setupStep: Math.max(old.project.setupStep, next) } } : old));
    void queryClient.invalidateQueries({ queryKey: ["project", id] });
    window.history.replaceState(null, "", `/projects/new?project=${id}&step=${next}`);
  };
  const advance = async (next: number) => {
    if (!projectId) return;
    go(projectId, next);
    void api(`/api/projects/${projectId}`, { method: "PATCH", json: { setupStep: next } }).catch(() => undefined);
  };
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["project", projectId] });

  if (projectId && bundle.isPending) return <WizardSkeleton step={Number.isInteger(requested) ? requested : 0} />;
  if (projectId && bundle.error) return <ErrorAlert title="Could not load this project" error={bundle.error} onRetry={() => void bundle.refetch()} />;
  const data = bundle.data ?? null;

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <div className="flex justify-between text-sm">
          <span className="font-medium">
            Step {step + 1} of 5 · {STEPS[step]}
          </span>
          <span className="text-muted-foreground font-mono tabular-nums">{step * 20}%</span>
        </div>
        <Progress value={step * 20} aria-label="Setup progress" />
      </div>
      <Tabs value={String(step)} onValueChange={(v) => projectId && go(projectId, Number(v))}>
        <TabsList className="w-full">
          {STEPS.map((label, i) => (
            <TabsTrigger key={label} value={String(i)} disabled={!projectId || i > savedStep + 1}>
              <span className="font-mono tabular-nums">{i + 1}</span> <span className="hidden sm:inline">{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="0">
          <Card>
            <CardHeader>
              <CardTitle>Basics</CardTitle>
              <CardDescription>Name the project and set the time zone for deadlines.</CardDescription>
            </CardHeader>
            <CardContent>
              <BasicsStep project={data?.project ?? null} onDone={(id) => go(id, 1)} />
            </CardContent>
          </Card>
        </TabsContent>

        {data ? (
          <>
            <TabsContent value="1" className="grid gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Event</CardTitle>
                  <CardDescription>Add the event page. Every field Stage Ready fills is quoted from it; anything it cannot quote stays unknown.</CardDescription>
                </CardHeader>
                <CardContent>
                  <SourcesForm
                    projectId={data.project.id}
                    jobName="event-ingest"
                    endpoint={`/api/projects/${data.project.id}/event/ingest`}
                    urlLabel="Event page URLs"
                    textLabel="Or paste the event text"
                    submitLabel="Read event"
                    jobTitle="Event ingestion"
                    onDone={refresh}
                  />
                </CardContent>
              </Card>
              {data.eventSpec ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Confirm the EventSpec</CardTitle>
                    <CardDescription>Check each field against its quote, then save.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <EventSpecEditor
                      key={data.eventSpec.id + data.eventSpec.criteria.map((c) => c.id).join()}
                      projectId={data.project.id}
                      spec={data.eventSpec}
                      timezone={data.project.timezone}
                      submitLabel="Save and continue"
                      onSaved={() => void advance(2)}
                    />
                  </CardContent>
                </Card>
              ) : null}
            </TabsContent>

            <TabsContent value="2" className="grid gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Past winners</CardTitle>
                  <CardDescription>Add results pages from past editions. Each profile field cites its source.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-6">
                  <SourcesForm
                    projectId={data.project.id}
                    jobName="winners"
                    endpoint={`/api/projects/${data.project.id}/winners`}
                    urlLabel="Winner or results page URLs"
                    textLabel="Or paste the winner text"
                    submitLabel="Read winners"
                    jobTitle="Winner profiles"
                    onDone={refresh}
                  />
                  <WinnersTable winners={data.winners} />
                </CardContent>
              </Card>
              <StepNav onBack={() => go(data.project.id, 1)} onNext={() => void advance(3)} nextLabel={data.winners.length ? "Continue" : "Skip for now"} />
            </TabsContent>

            <TabsContent value="3" className="grid gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Repo</CardTitle>
                  <CardDescription>The digest lets the Claim Auditor check claims against your dependencies, code paths and tests.</CardDescription>
                </CardHeader>
                <CardContent>
                  <RepoPanel projectId={data.project.id} repo={data.repo} onDone={refresh} />
                </CardContent>
              </Card>
              <StepNav onBack={() => go(data.project.id, 2)} onNext={() => void advance(4)} nextLabel={data.repo ? "Continue" : "Skip for now"} />
            </TabsContent>

            <TabsContent value="4">
              <Card>
                <CardHeader>
                  <CardTitle>Pitch</CardTitle>
                  <CardDescription>Add an outline or script. The section plan starts from the event&apos;s video limit and is fully editable.</CardDescription>
                </CardHeader>
                <CardContent>
                  <PitchStep key={data.project.id} bundle={data} onDone={() => router.push(`/projects/${data.project.id}`)} />
                </CardContent>
              </Card>
            </TabsContent>
          </>
        ) : null}
      </Tabs>
    </div>
  );
}

function StepNav({ onBack, onNext, nextLabel }: { onBack: () => void; onNext: () => void; nextLabel: string }) {
  return (
    <div className="flex justify-between">
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft /> Back
      </Button>
      <Button onClick={onNext}>
        {nextLabel} <ArrowRight />
      </Button>
    </div>
  );
}
