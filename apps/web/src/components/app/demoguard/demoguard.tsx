"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api-client";
import type { DemoGuardDTO } from "@/lib/types";
import { LiveControlTab } from "./live-control";
import { PostMortemTab } from "./post-mortem";
import { PreflightTab } from "./preflight";
import { StepMapTab } from "./step-map";
import { useDemoGuardRun } from "./use-run";

export function DemoGuard({ projectId, initial }: { projectId: string; initial: DemoGuardDTO }) {
  const client = useQueryClient();
  const { data = initial } = useQuery({ queryKey: ["demoguard", projectId], queryFn: () => api<DemoGuardDTO>(`/api/projects/${projectId}/demoguard`), initialData: initial });
  const refresh = () => void client.invalidateQueries({ queryKey: ["demoguard", projectId] });
  const dg = useDemoGuardRun(projectId, data.steps);
  const [tab, setTab] = useState(data.steps.length ? "preflight" : "steps");
  const [wide, setWide] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // Arming moves to Live control; the end of a run refreshes the post-mortem.
  const { phase, ended } = dg.run;
  useEffect(() => {
    if (phase === "armed") setTab("live");
  }, [phase]);
  useEffect(() => {
    if (ended) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh is stable enough; run once per end
  }, [ended]);

  if (!wide) {
    return (
      <Alert>
        <CircleAlert />
        <AlertTitle>DemoGuard needs a wider window</AlertTitle>
        <AlertDescription>
          <p>DemoGuard needs at least 1280 px. Session reviews work on any screen size.</p>
          <Button asChild variant="outline" size="sm">
            <Link href={`/projects/${projectId}/sessions`}>Review sessions</Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Tabs value={tab} onValueChange={setTab} className="grid gap-4">
      <TabsList>
        <TabsTrigger value="steps">Step map</TabsTrigger>
        <TabsTrigger value="preflight">Pre-flight</TabsTrigger>
        <TabsTrigger value="live">Live control</TabsTrigger>
        <TabsTrigger value="postmortem">Post-mortem</TabsTrigger>
      </TabsList>
      <TabsContent value="steps">
        <StepMapTab projectId={projectId} data={data} onChange={refresh} />
      </TabsContent>
      <TabsContent value="preflight">
        <PreflightTab dg={dg} hasSteps={data.steps.length > 0} />
      </TabsContent>
      <TabsContent value="live">
        <LiveControlTab projectId={projectId} dg={dg} steps={data.steps} />
      </TabsContent>
      <TabsContent value="postmortem">
        <PostMortemTab runs={data.runs} />
      </TabsContent>
    </Tabs>
  );
}
