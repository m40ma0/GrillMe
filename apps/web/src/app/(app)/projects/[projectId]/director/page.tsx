import type { Metadata } from "next";
import { UpcomingScreen } from "@/components/app/upcoming-screen";

export const metadata: Metadata = { title: "Best-Take Director" };

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <UpcomingScreen projectId={projectId} title="Best-Take Director" milestone="M4" summary="Score every take and assemble the best ones into the submission video." />;
}
