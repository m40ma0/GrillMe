import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { QaKit } from "@/components/app/qa-kit/qa-kit";
import { getCurrentUser } from "@/lib/server/auth";
import { requireProject } from "@/lib/server/projects";
import { loadQaKit } from "@/lib/server/qa-kit";

export const metadata: Metadata = { title: "Evidence Q&A Kit" };

export default async function QaKitPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  if (!user) return null;
  const project = await requireProject(user.id, projectId);
  return (
    <div className="grid gap-6">
      <PageHeader title="Evidence Q&A Kit" description="The questions judges are most likely to ask, a 20-second answer for each, and a slide whose numbers come straight from your data." />
      <QaKit projectId={project.id} demoMode={project.demoMode} initial={await loadQaKit(project.id)} />
    </div>
  );
}
