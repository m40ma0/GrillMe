import type { Metadata } from "next";
import { UpcomingScreen } from "@/components/app/upcoming-screen";

export const metadata: Metadata = { title: "Progress" };

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <UpcomingScreen projectId={projectId} title="Progress" milestone="M3" summary="Trends per criterion, weak-spot history and the next-session plan." />;
}
