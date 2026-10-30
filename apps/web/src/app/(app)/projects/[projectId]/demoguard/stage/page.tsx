import { stepMaps } from "@stage-ready/db";
import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { StageWindow } from "@/components/app/demoguard/stage-window";
import { getCurrentUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { requireProject } from "@/lib/server/projects";
import { presignGet } from "@/lib/server/storage";

export const metadata: Metadata = { title: "Stage" };
export const dynamic = "force-dynamic";

/** The window the presenter shares: live demo, or the golden-run clip while DemoGuard is on fallback. */
export default async function StagePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  if (!user) return null;
  const project = await requireProject(user.id, projectId);
  const [map] = await db().select({ clip: stepMaps.fallbackClipUrl }).from(stepMaps).where(eq(stepMaps.projectId, project.id)).orderBy(desc(stepMaps.createdAt)).limit(1);
  // The golden run's uploaded recording, if the project uploads recordings; otherwise the presenter loads the local file.
  const clip = map?.clip ? await presignGet(map.clip, 6 * 3600).catch(() => null) : null;
  return <StageWindow projectId={project.id} projectName={project.name} fallbackClipUrl={clip} />;
}
