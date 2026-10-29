import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { SetupWizard } from "@/components/app/setup-wizard";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "New project" };

export default function NewProjectPage() {
  return (
    <div className="grid gap-6">
      <PageHeader title="Set up a project" description="Five steps: basics, the event, past winners, your repo and your pitch." />
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <SetupWizard />
      </Suspense>
    </div>
  );
}
