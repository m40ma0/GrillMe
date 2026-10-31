import { Github, Play } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { StageReadyMark } from "@/components/app/stage-ready-mark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/server/auth";
import { env } from "@/lib/server/env";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

/** Only same-site paths, so the sign-in page cannot be used to redirect elsewhere. */
const safePath = (value: string | undefined) => (value && value.startsWith("/") && !value.startsWith("//") ? value : "/projects");

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; error?: string }> }) {
  const { callbackUrl, error } = await searchParams;
  const target = safePath(callbackUrl);
  const user = await getCurrentUser();
  if (user && !user.guest) redirect(target);
  const github = Boolean(env().AUTH_GITHUB_ID && env().AUTH_GITHUB_SECRET);

  async function signInWithGitHub() {
    "use server";
    await signIn("github", { redirectTo: target });
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <StageReadyMark className="size-14" title={null} />
          <CardTitle className="mt-3 text-xl">
            <h1>Sign in to Stage Ready</h1>
          </CardTitle>
          <CardDescription>Rehearse against honest judges. Present with a safety net.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {error ? (
            <p role="alert" className="text-status-contradicted-foreground text-sm">
              Sign-in did not complete. Try again.
            </p>
          ) : null}
          {github ? (
            <form action={signInWithGitHub}>
              <Button type="submit" size="lg" className="w-full">
                <Github aria-hidden /> Continue with GitHub
              </Button>
            </form>
          ) : (
            <p className="text-muted-foreground text-sm">GitHub sign-in is not configured on this server.</p>
          )}
          <p className="text-muted-foreground text-center text-xs">Read-only repo access; Stage Ready never writes to your repo.</p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="bg-border h-px flex-1" /> or <span className="bg-border h-px flex-1" />
          </div>
          <Button asChild variant="outline" className="w-full">
            <Link href="/demo/starting">
              <Play aria-hidden /> Try the guest demo
            </Link>
          </Button>
          <p className="text-muted-foreground text-center text-xs">
            No account needed: a fictional project, kept for 24 hours.{" "}
            <Link href="/" className="underline underline-offset-4">
              Back to home
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
