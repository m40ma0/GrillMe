import { ArrowRight, FileCheck2, Play, ShieldCheck, Video } from "lucide-react";
import Link from "next/link";
import { StageReadyMark } from "@/components/app/stage-ready-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const FEATURES = [
  {
    title: "Claim Auditor",
    body: "Checks every claim you make against the screen, measured timings and your own code, live during rehearsal.",
    icon: FileCheck2,
    tone: "bg-persona-1/15 text-persona-1",
  },
  { title: "Best-Take Director", body: "Scores each take per section and assembles the strongest ones into a captioned submission video.", icon: Video, tone: "bg-persona-2/15 text-persona-2" },
  { title: "DemoGuard", body: "Watches the live demo and cuts to disclosed rehearsal footage of the same step if the app fails.", icon: ShieldCheck, tone: "bg-persona-3/15 text-persona-3" },
];

export default function Landing() {
  return (
    <div className="mx-auto grid max-w-7xl gap-12 px-4 py-6 md:px-6">
      <header className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2 font-semibold">
          <StageReadyMark title={null} />
          Stage Ready
        </span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild variant="outline" size="sm">
            <Link href="/projects">Open workspace</Link>
          </Button>
        </div>
      </header>
      <section className="grid gap-8 lg:grid-cols-2 lg:items-center">
        <div className="grid gap-6">
          <h1 className="text-4xl leading-10 font-semibold tracking-tight">Rehearse against honest judges. Present with a safety net.</h1>
          <p className="text-muted-foreground text-base leading-6">
            A panel of fictional judges built from your event&apos;s real criteria interrupts with hard questions, every claim is checked against evidence, and your live demo has a disclosed fallback.
          </p>
          <div className="flex flex-wrap gap-3">
            <form action="/api/demo" method="post">
              <Button type="submit" size="lg">
                <Play /> Try Demo Mode
              </Button>
            </form>
            <Button asChild size="lg" variant="outline">
              <Link href="/projects/new">
                Create a project <ArrowRight />
              </Link>
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">No sign-up: Demo Mode opens a fictional project in a guest workspace for 24 hours.</p>
        </div>
        <figure className="bg-muted overflow-hidden rounded-xl border">
          {/* Recorded from the real app in Demo Mode (pnpm --filter @stage-ready/web clip); captions are burned in. */}
          <video
            className="aspect-video w-full"
            src="/clip.mp4"
            poster="/clip-poster.jpg"
            width={1280}
            height={720}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-label="A 20-second tour of Stage Ready in Demo Mode: one click into a fictional project, judges interrupting while the Claim Auditor contradicts a claim, the Q&A Kit, the Director and DemoGuard."
          />
        </figure>
      </section>
      <section className="grid gap-4 md:grid-cols-3" aria-label="Features">
        {FEATURES.map(({ title, body, icon: Icon, tone }) => (
          <Card key={title}>
            <CardHeader>
              <span className={`flex size-10 items-center justify-center rounded-lg ${tone}`}>
                <Icon size={20} strokeWidth={1.75} aria-hidden />
              </span>
              <CardTitle className="mt-2">{title}</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground">{body}</CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
