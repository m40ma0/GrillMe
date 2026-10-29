import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/server/auth";
import { requireProject } from "@/lib/server/projects";

export const metadata: Metadata = { title: "Presenter cue" };

/** Second-monitor cue window: large type, high contrast. Live step data arrives with DemoGuard in M5. */
export default async function CuePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  if (!user) return null;
  const project = await requireProject(user.id, projectId);
  return (
    <main className="bg-background text-foreground flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-muted-foreground text-xl">{project.name} · presenter cue</p>
      <p className="text-4xl leading-10 font-semibold">DemoGuard is not armed.</p>
      <p className="text-muted-foreground text-xl">Steps and narration appear here once DemoGuard (M5) is armed.</p>
    </main>
  );
}
