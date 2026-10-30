import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { SessionReview } from "@/components/app/review/session-review";
import { getCurrentUser } from "@/lib/server/auth";
import { loadSessionReview } from "@/lib/server/sessions";

export const metadata: Metadata = { title: "Session review" };

const MODE: Record<string, string> = { full_pitch: "Full pitch", qa_only: "Q&A only", section_drill: "Section drill", demoguard: "DemoGuard run" };

export default async function SessionReviewPage({ params }: { params: Promise<{ projectId: string; sessionId: string }> }) {
  const { sessionId } = await params;
  const user = await getCurrentUser();
  if (!user) return null;
  const data = await loadSessionReview(user.id, sessionId);
  const when = data.session.startedAt
    ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: data.project.timezone }).format(new Date(data.session.startedAt))
    : "Not started";
  return (
    <div className="grid gap-6">
      <PageHeader title="Session review" description={`${MODE[data.session.mode] ?? data.session.mode} · ${when}`} />
      <SessionReview data={data} />
    </div>
  );
}
