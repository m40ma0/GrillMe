import { BookOpenCheck, CircleAlert, Film, Gauge, NotebookPen, ShieldCheck, Video } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CloudUploadToggle } from "@/components/app/cloud-upload-toggle";
import { ComplianceCard } from "@/components/app/compliance-card";
import { DeadlineCountdown } from "@/components/app/deadline-countdown";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { ReadinessChart } from "@/components/app/readiness-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/server/auth";
import { loadBundle, loadOverviewExtras, requireProject } from "@/lib/server/projects";

export const metadata: Metadata = { title: "Overview" };

export default async function ProjectOverview({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  if (!user) return null;
  const project = await requireProject(user.id, projectId);
  const [bundle, extras] = await Promise.all([loadBundle(project), loadOverviewExtras(project.id)]);
  const heatmap = extras.latestSession?.rubricHeatmap ?? null;
  const readiness = bundle.eventSpec?.criteria.map((c) => {
    const cells = Object.values(heatmap?.[c.name] ?? {}).filter((v): v is number => typeof v === "number");
    return { criterion: c.name, readiness: cells.length ? Math.round((cells.reduce((a, b) => a + b, 0) / cells.length) * 100) : 0 };
  });
  const base = `/projects/${project.id}`;

  return (
    <div className="grid gap-6">
      <PageHeader
        title={project.name}
        description={project.tagline || bundle.eventSpec?.name}
        actions={
          <>
            <Button asChild>
              <Link href={`${base}/rehearse`}>
                <Video /> Rehearse
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`${base}/qa-kit`}>
                <BookOpenCheck /> Q&amp;A Kit
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`${base}/director`}>
                <Film /> Director
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`${base}/demoguard`}>
                <ShieldCheck /> DemoGuard
              </Link>
            </Button>
          </>
        }
      />
      {project.setupStep < 5 ? (
        <Card className="gap-3 py-4">
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <p>
              Setup is at step <span className="font-mono tabular-nums">{project.setupStep}</span> of 5.
            </p>
            <Button asChild size="sm">
              <Link href={`/projects/new?project=${project.id}`}>Continue setup</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <ComplianceCard items={bundle.compliance} />
        <Card>
          <CardHeader>
            <CardTitle>Deadline</CardTitle>
            <CardDescription>{bundle.eventSpec?.name ?? "No event yet"}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <DeadlineCountdown deadlineIso={bundle.eventSpec?.requirements.deadlineIso ?? null} timezone={project.timezone} className="text-2xl font-semibold" />
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Time zone {project.timezone}</Badge>
              <Badge variant="outline">
                <span className="font-mono tabular-nums">{project.videoLimitSec} s</span> video limit
              </Badge>
              <Badge variant="outline">
                <span className="font-mono tabular-nums">{bundle.personas.length}</span> fictional judges
              </Badge>
            </div>
            <Button asChild variant="outline" size="sm" className="w-fit">
              <Link href={`${base}/calibration`}>
                <Gauge /> Open calibration
              </Link>
            </Button>
            <CloudUploadToggle projectId={project.id} enabled={project.cloudUploadEnabled} />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Readiness per criterion</CardTitle>
          <CardDescription>From the latest rehearsal&apos;s rubric heatmap.</CardDescription>
        </CardHeader>
        <CardContent>
          {readiness && heatmap ? (
            <ReadinessChart data={readiness} />
          ) : (
            <EmptyState
              icon={Gauge}
              action={
                <Button asChild>
                  <Link href={`${base}/rehearse`}>Start rehearsal</Link>
                </Button>
              }
            >
              Rehearse once to see how well each criterion is covered.
            </EmptyState>
          )}
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Open Fix Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            {extras.openTasks.length === 0 ? (
              <EmptyState icon={CircleAlert}>No open Fix Tasks. They appear when a claim or question lacks evidence.</EmptyState>
            ) : (
              <ul className="grid gap-3">
                {extras.openTasks.map((t) => (
                  <li key={t.id} className="rounded-lg border p-3">
                    <div className="font-medium">{t.title}</div>
                    {t.detail ? <p className="text-muted-foreground">{t.detail}</p> : null}
                    <Badge variant="outline" className="mt-2">
                      From {t.origin}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Latest Coach Notes</CardTitle>
          </CardHeader>
          <CardContent>
            {extras.coachNote ? (
              <div className="grid gap-3">
                {(
                  [
                    ["Resolved", extras.coachNote.resolved],
                    ["Still open", extras.coachNote.open],
                    ["New", extras.coachNote.newIssues],
                    ["Next session", extras.coachNote.nextPlan],
                  ] as const
                ).map(([label, items]) =>
                  items.length ? (
                    <div key={label}>
                      <h3 className="text-sm font-medium">{label}</h3>
                      <ul className="text-muted-foreground list-disc pl-5">
                        {items.map((i) => (
                          <li key={i}>{i}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null,
                )}
              </div>
            ) : (
              <EmptyState icon={NotebookPen}>Coach Notes are written after each rehearsal.</EmptyState>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
