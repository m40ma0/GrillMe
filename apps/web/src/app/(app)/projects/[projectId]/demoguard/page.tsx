import type { Metadata } from "next";
import { UpcomingScreen } from "@/components/app/upcoming-screen";

export const metadata: Metadata = { title: "DemoGuard" };

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <UpcomingScreen projectId={projectId} title="DemoGuard" milestone="M5" summary="Map a golden run and switch to disclosed fallback footage if the live demo fails." />;
}
