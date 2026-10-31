import type { Metadata } from "next";
import { DemoStarter } from "@/components/app/demo-starter";
import { StageReadyMark } from "@/components/app/stage-ready-mark";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Setting up your demo" };

/**
 * Where every "Try Demo Mode" button goes: a static page that paints at once, then creates the guest
 * workspace and the Demo Mode project in the background and opens it.
 */
export default function DemoStartingPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <StageReadyMark className="size-12" title={null} />
          <CardTitle className="mt-3 text-lg">
            <h1>Setting up your demo project…</h1>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DemoStarter />
        </CardContent>
      </Card>
    </main>
  );
}
