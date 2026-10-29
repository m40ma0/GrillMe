import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleAlert, Clock3, FileCheck2, Sparkles } from "lucide-react";
import { demoModeProject } from "@stage-ready/shared";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";

const pages: Record<string, { title: string; summary: string; action: string }> = {
  projects: { title: "Projects", summary: "Keep your event, rehearsal evidence and presentation plan together.", action: "Open Signal Garden" },
  calibration: { title: "Calibration", summary: "Review event criteria and the fictional Demo Mode winner profiles.", action: "Review criteria" },
  "qa-kit": { title: "Evidence Q&A Kit", summary: "Prepare concise answers and connect each one to supporting evidence.", action: "Review likely questions" },
  progress: { title: "Progress", summary: "Track the rehearsal themes, unresolved evidence and next practice items.", action: "Review session notes" },
  rehearse: { title: "Rehearsal Studio", summary: "Practice the Signal Garden pitch with three fictional judge personas.", action: "Review fixture session" },
  sessions: { title: "Session review", summary: "Explore the recorded Demo Mode claims, questions and timing samples.", action: "Review claims" },
  director: { title: "Best-Take Director", summary: "Compare two fixture takes for each pitch section.", action: "Review section takes" },
  demoguard: { title: "DemoGuard", summary: "Review the five-step golden-run map and disclosed fallback setup.", action: "Review step map" },
  settings: { title: "Settings", summary: "Configure this local workspace and its project connections.", action: "Open project" },
};

export default async function WorkspacePage({ params }: { params: Promise<{ segments: string[] }> }) {
  const { segments } = await params;
  const route = segments[0] ?? "projects";
  const page = pages[route] ?? { title: "New project", summary: "Set up an event, add past winners and prepare your pitch outline.", action: "Open Signal Garden fixture" };
  return <AppShell><div className="space-y-6">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground"><span>Workspace</span><span>/</span><span className="text-foreground">{page.title}</span><span className="rounded-full border px-2 py-0.5">Demo Mode</span></div><h1 className="text-3xl font-semibold tracking-tight">{page.title}</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">{page.summary}</p></div><Button asChild><Link href="/projects/demo-project">{page.action}<ArrowRight size={16}/></Link></Button></div>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
      { label: "Event", value: demoModeProject.event.name, icon: Sparkles },
      { label: "Video limit", value: `${demoModeProject.event.videoLimitSeconds} s`, icon: Clock3 },
      { label: "Criteria", value: `${demoModeProject.event.criteria.length} weighted`, icon: CheckCircle2 },
      { label: "Winner profiles", value: `${demoModeProject.winners.length} fictional`, icon: FileCheck2 },
    ].map(({label,value,icon:Icon})=><article key={label} className="rounded-xl border bg-card p-4"><div className="flex items-center justify-between text-sm text-muted-foreground"><span>{label}</span><Icon size={16}/></div><div className="mt-3 text-lg font-semibold tracking-tight">{value}</div></article>)}</section>
    <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]"><section className="rounded-xl border bg-card"><div className="border-b p-5"><h2 className="font-semibold">Signal Garden</h2><p className="mt-1 text-sm text-muted-foreground">{demoModeProject.tagline}</p></div><div className="divide-y">{demoModeProject.event.criteria.map((criterion)=><div key={criterion.id} className="flex items-center justify-between gap-4 p-4"><div><div className="text-sm font-medium">{criterion.name}</div><div className="mt-1 text-xs text-muted-foreground">{criterion.description}</div></div><div className="font-mono text-sm tabular-nums">{criterion.weight}%</div></div>)}</div><div className="border-t p-4"><Link className="inline-flex items-center gap-2 text-sm text-primary" href="/projects/demo-project">Open project overview<ArrowRight size={15}/></Link></div></section>
    <aside className="space-y-4"><section className="rounded-xl border bg-card p-5"><div className="flex items-center gap-2 font-medium"><CircleAlert size={17} className="text-amber-400"/>Open Fix Tasks</div><div className="mt-4 space-y-3"><div className="rounded-lg bg-muted/50 p-3"><div className="text-sm">Add evaluation evidence for the accuracy claim</div><div className="mt-1 text-xs text-muted-foreground">No evaluation result attached</div></div><div className="rounded-lg bg-muted/50 p-3"><div className="text-sm">Show offline mode or remove the claim</div><div className="mt-1 text-xs text-muted-foreground">Feature was not demonstrated</div></div></div></section><section className="rounded-xl border bg-muted/30 p-5"><div className="flex items-center gap-2 text-sm font-medium"><Sparkles size={16} className="text-primary"/>Fixture data notice</div><p className="mt-2 text-sm leading-6 text-muted-foreground">Signal Garden and its event and winner profiles are fictional Demo Mode fixtures. Replace them with your own project evidence before presenting.</p></section></aside></div>
  </div></AppShell>;
}
