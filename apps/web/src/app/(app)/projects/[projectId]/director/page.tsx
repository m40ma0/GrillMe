import type { Metadata } from "next";
import { Director } from "@/components/app/director/director";
import { PageHeader } from "@/components/app/page-header";
import { getCurrentUser } from "@/lib/server/auth";
import { loadDirector } from "@/lib/server/director";
import { requireProject } from "@/lib/server/projects";

export const metadata: Metadata = { title: "Best-Take Director" };

export default async function DirectorPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  if (!user) return null;
  const project = await requireProject(user.id, projectId);
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Best-Take Director"
        description="Every take scored, the best one per section assembled into your submission video. Only your real takes appear in it; the cards and captions are the only generated parts."
      />
      <Director projectId={project.id} initial={await loadDirector(project.id)} />
    </div>
  );
}
