import { CircleAlert, FolderPlus, Gauge, Play } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DeadlineCountdown } from "@/components/app/deadline-countdown";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/server/auth";
import { listProjects } from "@/lib/server/projects";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const user = await getCurrentUser();
  const projects = user ? await listProjects(user.id) : [];
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Projects"
        description="Each project holds one event, its rehearsals and your presentation plan."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/demo/starting">
                <Play /> Try Demo Mode
              </Link>
            </Button>
            <Button asChild>
              <Link href="/projects/new">
                <FolderPlus /> Create project
              </Link>
            </Button>
          </>
        }
      />
      {projects.length === 0 ? (
        <EmptyState
          icon={FolderPlus}
          action={
            <Button asChild>
              <Link href="/projects/new">Create your first project</Link>
            </Button>
          }
        >
          Create your first project. Add the event page and Stage Ready builds judges from its criteria.
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <Card key={p.id} className="gap-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Link href={p.setupStep < 5 ? `/projects/new?project=${p.id}` : `/projects/${p.id}`} className="hover:underline">
                    {p.name}
                  </Link>
                  {p.demoMode ? <Badge variant="outline">Demo Mode</Badge> : null}
                  {p.setupStep < 5 ? <Badge variant="secondary">Setup {p.setupStep} of 5</Badge> : null}
                </CardTitle>
                <CardDescription>{p.eventName ?? "No event yet"}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                <DeadlineCountdown deadlineIso={p.deadlineIso} timezone={p.timezone} />
                <span className="inline-flex items-center gap-1.5">
                  <Gauge size={16} strokeWidth={1.75} aria-hidden />
                  {p.lastScore === null ? (
                    <span className="text-muted-foreground">No rehearsal yet</span>
                  ) : (
                    <span>
                      Last session <span className="font-mono tabular-nums">{p.lastScore}</span> / 100
                    </span>
                  )}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CircleAlert size={16} strokeWidth={1.75} aria-hidden />
                  <span className="font-mono tabular-nums">{p.openFixTasks}</span> open Fix Task{p.openFixTasks === 1 ? "" : "s"}
                </span>
              </CardContent>
              <CardFooter>
                <Button asChild variant="outline" size="sm">
                  <Link href={p.setupStep < 5 ? `/projects/new?project=${p.id}` : `/projects/${p.id}`}>{p.setupStep < 5 ? "Continue setup" : "Open project"}</Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
