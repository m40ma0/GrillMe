import type { Metadata } from "next";
import { UpcomingScreen } from "@/components/app/upcoming-screen";

export const metadata: Metadata = { title: "Rehearsal Studio" };

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <UpcomingScreen projectId={projectId} title="Rehearsal Studio" milestone="M2" summary="Pitch to three fictional judges while the Claim Auditor builds a live ledger." />;
}
