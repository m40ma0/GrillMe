import type { Metadata } from "next";
import { DemoGuard } from "@/components/app/demoguard/demoguard";
import { PageHeader } from "@/components/app/page-header";
import { getCurrentUser } from "@/lib/server/auth";
import { loadDemoGuard } from "@/lib/server/demoguard";
import { requireProject } from "@/lib/server/projects";

export const metadata: Metadata = { title: "DemoGuard" };

export default async function DemoGuardPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  if (!user) return null;
  const project = await requireProject(user.id, projectId);
  return (
    <div className="grid gap-6">
      <PageHeader
        title="DemoGuard"
        description="Watches your live demo step by step. On an error dialog, a 5xx or two corroborating signals it switches to fallback for that step, and cuts back once the app recovers."
      />
      <DemoGuard projectId={project.id} initial={await loadDemoGuard(project.id)} />
    </div>
  );
}
