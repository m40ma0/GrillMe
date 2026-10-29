import type { Metadata } from "next";
import { CueWindow } from "@/components/app/demoguard/cue-window";
import { getCurrentUser } from "@/lib/server/auth";
import { requireProject } from "@/lib/server/projects";

export const metadata: Metadata = { title: "Presenter cue" };

/** Second-monitor cue window. It follows the DemoGuard page open in the same browser. */
export default async function CuePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  if (!user) return null;
  const project = await requireProject(user.id, projectId);
  return <CueWindow projectId={project.id} projectName={project.name} />;
}
