import type { Metadata } from "next";
import { UpcomingScreen } from "@/components/app/upcoming-screen";

export const metadata: Metadata = { title: "Evidence Q&A Kit" };

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <UpcomingScreen projectId={projectId} title="Evidence Q&A Kit" milestone="M4" summary="Ranked likely questions, 20-second answers and verified evidence slides." />;
}
