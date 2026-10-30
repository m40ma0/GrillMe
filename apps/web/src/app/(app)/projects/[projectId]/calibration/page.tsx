import { CalendarSearch } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CalibrationClient } from "@/components/app/calibration-client";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/server/auth";
import { loadBundle, requireProject } from "@/lib/server/projects";

export const metadata: Metadata = { title: "Calibration" };

export default async function CalibrationPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  if (!user) return null;
  const bundle = await loadBundle(await requireProject(user.id, projectId));
  return (
    <div className="grid gap-6">
      <PageHeader title="Calibration" description="The event's criteria, what won before, and the fictional judges built from both." />
      {bundle.eventSpec ? (
        <CalibrationClient bundle={bundle} />
      ) : (
        <EmptyState
          icon={CalendarSearch}
          action={
            <Button asChild>
              <Link href={`/projects/new?project=${projectId}&step=1`}>Add the event</Link>
            </Button>
          }
        >
          Add the event page so Stage Ready can read its criteria.
        </EmptyState>
      )}
    </div>
  );
}
