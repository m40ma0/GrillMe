import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StageReadyMark } from "@/components/app/stage-ready-mark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Something went wrong" };

/** Where failed form posts and other navigations land instead of a raw JSON error. */
export default async function ProblemPage({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const { message } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <StageReadyMark className="size-12" title={null} />
          <CardTitle className="mt-3 text-lg">
            <h1 className="flex items-center gap-2">
              <TriangleAlert size={18} aria-hidden /> Something went wrong
            </h1>
          </CardTitle>
          <CardDescription>{(message ?? "").slice(0, 300) || "The request could not be completed."}</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center gap-2">
          <Button asChild variant="outline">
            <Link href="/">Home</Link>
          </Button>
          <Button asChild>
            <Link href="/projects">Your projects</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
