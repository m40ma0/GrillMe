import type { Metadata } from "next";
import { UpcomingScreen } from "@/components/app/upcoming-screen";

export const metadata: Metadata = { title: "Session review" };

export default async function Page({ params }: { params: Promise<{ projectId: string; sessionId: string }> }) {
  const { projectId } = await params;
  return <UpcomingScreen projectId={projectId} title="Session review" milestone="M3" summary="Summary, claims, rubric heatmap, latency, judge turns and transcript for one rehearsal." />;
}
