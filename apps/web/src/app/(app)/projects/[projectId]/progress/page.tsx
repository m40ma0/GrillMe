import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { ProgressView } from "@/components/app/progress-view";
import { getCurrentUser } from "@/lib/server/auth";
import { loadProgress } from "@/lib/server/sessions";

export const metadata: Metadata = { title: "Progress" };

export default async function ProgressPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  if (!user) return null;
  const data = await loadProgress(user.id, projectId);
  return (
    <div className="grid gap-6">
      <PageHeader title="Progress" description="How each criterion and weak spot changed across rehearsals, and what to work on next." />
      <ProgressView data={data} />
    </div>
  );
}
