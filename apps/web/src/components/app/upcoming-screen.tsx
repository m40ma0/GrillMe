import { Construction } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/server/auth";
import { requireProject } from "@/lib/server/projects";
import { EmptyState } from "./empty-state";
import { PageHeader } from "./page-header";

/** Screens whose features ship in a later milestone render the project and say so plainly. */
export async function UpcomingScreen({ projectId, title, milestone, summary }: { projectId: string; title: string; milestone: string; summary: string }) {
  const user = await getCurrentUser();
  if (!user) return null;
  const project = await requireProject(user.id, projectId);
  return (
    <div className="grid gap-6">
      <PageHeader title={title} description={summary} />
      <EmptyState
        icon={Construction}
        action={
          <Button asChild variant="outline">
            <Link href={`/projects/${project.id}`}>Back to {project.name}</Link>
          </Button>
        }
      >
        {title} for {project.name} arrives in {milestone} of the build plan.
      </EmptyState>
    </div>
  );
}
