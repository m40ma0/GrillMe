import { ArrowRight, FileCheck2, Play, ShieldCheck, Sparkles, Video } from "lucide-react";
import Link from "next/link";
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
          <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg">
            <Sparkles size={16} aria-hidden />
          </span>
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
          <p className="text-muted-foreground text-xs">Demo Mode opens a fictional project and runs without API keys.</p>
        </div>
        <figure className="bg-muted overflow-hidden rounded-xl border">
          {/* The 20-second product clip is recorded with Stage Ready's own Director in M6. */}
          <div className="flex aspect-video items-center justify-center p-6 text-center">
            <p className="text-muted-foreground">Product clip: recorded with the Director before launch.</p>
          </div>
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
