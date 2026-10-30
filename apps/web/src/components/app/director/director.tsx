"use client";
import { CARD_MS, timelineMs, type EdlItem, type SectionKey } from "@stage-ready/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, Clapperboard, Download, FileText, Film, Image as ImageIcon, ListOrdered, Plus, Save, Sparkles, TriangleAlert, Wand2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/api-client";
import type { DirectorDTO, RenderDTO, TakeDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { EmptyState } from "../empty-state";
import { JobProgress } from "../job-progress";
import { formatClock } from "./format";
import { TakeCard } from "./take-card";
import { TakeRecorder } from "./take-recorder";
import { Timeline } from "./timeline";

const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

function Preview({ take, item }: { take: TakeDTO | undefined; item: EdlItem | undefined }) {
  const { data } = useQuery({ queryKey: ["take-media", take?.id], queryFn: () => api<{ url: string | null }>(`/api/takes/${take?.id}/media`), enabled: Boolean(take?.hasMedia), staleTime: 600_000 });
  if (!take || !item) return <div className="bg-muted aspect-video w-full rounded-lg border" />;
  if (data?.url)
    return (
      <video
        key={`${take.id}-${item.inMs}`}
        src={`${data.url}#t=${item.inMs / 1000},${item.outMs / 1000}`}
        controls
        className="aspect-video w-full rounded-lg border bg-black"
        aria-label="Preview of the selected clip"
        onTimeUpdate={(e) => e.currentTarget.currentTime * 1000 >= item.outMs && e.currentTarget.pause()}
      />
    );
  return (
    <div className="bg-muted flex aspect-video w-full flex-col justify-center gap-2 overflow-y-auto rounded-lg border p-4">
      <p className="text-muted-foreground inline-flex items-center gap-1 text-xs">
        <Clapperboard size={14} aria-hidden /> {take.fixture ? "Demo Mode fixture take: the render draws labelled colour bars for it." : "No recording to preview."}
      </p>
      <p className="text-sm leading-relaxed">{take.transcript}</p>
    </div>
  );
}

function Exports({ render }: { render: RenderDTO }) {
  const href = (kind: string) => `/api/render-jobs/${render.id}/download?kind=${kind}`;
  const items = [
    { kind: "mp4", label: "Video", detail: "MP4 1080p30 H.264", icon: Film },
    { kind: "srt", label: "Captions", detail: "SRT", icon: FileText },
    { kind: "thumbnail", label: "Thumbnail", detail: "PNG", icon: ImageIcon },
    { kind: "chapters", label: "Chapters", detail: "Text", icon: ListOrdered },
  ] as const;
  return (
    <div className="grid gap-2">
      <img src={href("thumbnail")} alt="Rendered video thumbnail" className="aspect-video w-full rounded-lg border object-cover" width={1920} height={1080} />
      <ul className="grid grid-cols-2 gap-2">
        {items.map(({ kind, label, detail, icon: Icon }) => (
          <li key={kind}>
            <a href={href(kind)} download className="hover:bg-muted focus-visible:ring-ring flex items-center gap-2 rounded-lg border p-2 text-sm focus-visible:ring-2 focus-visible:outline-none">
              <Icon size={16} aria-hidden className="text-muted-foreground" />
              <span className="grid">
                <span className="font-medium">{label}</span>
                <span className="text-muted-foreground text-xs">{detail}</span>
              </span>
              <Download size={14} aria-hidden className="text-muted-foreground ml-auto" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Director({ projectId, initial }: { projectId: string; initial: DirectorDTO }) {
  const client = useQueryClient();
  const key = ["director", projectId];
  const { data = initial } = useQuery({
    queryKey: key,
    queryFn: () => api<DirectorDTO>(`/api/projects/${projectId}/director`),
    initialData: initial,
    refetchInterval: (q) => {
      const d = q.state.data;
      return d && (d.takes.some((t) => t.status === "processing" || t.status === "uploaded") || d.render?.status === "queued" || d.render?.status === "running") ? 2_000 : false;
    },
  });
  const refresh = useCallback(() => client.invalidateQueries({ queryKey: ["director", projectId] }), [client, projectId]);
  const [wide, setWide] = useState(true);
  const [active, setActive] = useState<SectionKey>(initial.sections[0]?.key ?? "hook");
  const [items, setItems] = useState<EdlItem[]>(initial.edl?.items ?? []);
  const [dirty, setDirty] = useState(false);
  const [clip, setClip] = useState(0);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [takeJob, setTakeJob] = useState<string | null>(null);
  const [moment, setMoment] = useState(initial.strongestMoment);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  useEffect(() => {
    if (!dirty) setItems(data.edl?.items ?? []);
  }, [data.edl, dirty]);

  const takesById = useMemo(() => new Map(data.takes.map((t) => [t.id, t])), [data.takes]);
  const titles = Object.fromEntries(data.sections.map((s) => [s.key, s.title]));
  const section = data.sections.find((s) => s.key === active) ?? data.sections[0];
  const sectionTakes = data.takes.filter((t) => t.sectionKey === section?.key);
  const totalMs = timelineMs(items);
  const limitMs = data.limitSec * 1000;
  const fits = totalMs <= limitMs;

  const changeItems = (next: EdlItem[]) => {
    setItems(next);
    setDirty(true);
  };
  const pickTake = (take: TakeDTO) => {
    const item: EdlItem = { takeId: take.id, sectionKey: take.sectionKey, inMs: 0, outMs: take.durationMs, transition: "crossfade" };
    const order = new Map(data.sections.map((s) => [s.key, s.order]));
    const next = [...items.filter((i) => i.sectionKey !== take.sectionKey), item].sort((a, b) => (order.get(a.sectionKey as SectionKey) ?? 0) - (order.get(b.sectionKey as SectionKey) ?? 0));
    changeItems(next);
    setClip(next.findIndex((i) => i.takeId === take.id));
  };

  // J / K: previous or next take in the active section.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== "j" && e.key !== "k") return;
      if (sectionTakes.length === 0) return;
      e.preventDefault();
      const at = Math.max(
        0,
        sectionTakes.findIndex((t) => t.id === focusId),
      );
      const next = sectionTakes[(at + (e.key === "k" ? 1 : -1) + sectionTakes.length) % sectionTakes.length];
      if (next) {
        setFocusId(next.id);
        document.querySelector<HTMLElement>(`[data-take-id="${next.id}"] button`)?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sectionTakes, focusId]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const assemble = () =>
    run("assemble", async () => {
      const out = await api<{ swaps: { sectionKey: string; savedMs: number }[]; fits: boolean; missing: string[] }>(`/api/projects/${projectId}/edl/auto`, { method: "POST" });
      setDirty(false);
      await refresh();
      toast.success(
        out.swaps.length
          ? `Assembled. The length fitter swapped in tighter takes for ${out.swaps.map((s) => titles[s.sectionKey] ?? s.sectionKey).join(", ")}.`
          : "Assembled the best take per section.",
      );
      if (out.missing.length) toast.warning(`No usable take yet for ${out.missing.map((k) => titles[k] ?? k).join(", ")}.`);
    });
  const save = () =>
    run("save", async () => {
      if (!data.edl) return;
      await api(`/api/edls/${data.edl.id}`, { method: "PATCH", json: { items } });
      setDirty(false);
      await refresh();
      toast.success("Timeline saved.");
    });
  const render = () =>
    run("render", async () => {
      if (!data.edl) return;
      if (dirty) await api(`/api/edls/${data.edl.id}`, { method: "PATCH", json: { items } });
      setDirty(false);
      await api(`/api/edls/${data.edl.id}/render`, { method: "POST" });
      await refresh();
    });
  const saveMoment = () =>
    run("moment", async () => {
      await api(`/api/projects/${projectId}`, { method: "PATCH", json: { strongestMoment: moment } });
      await refresh();
    });
  const deleteTake = (take: TakeDTO) =>
    run("delete", async () => {
      await api(`/api/takes/${take.id}`, { method: "DELETE" });
      changeItems(items.filter((i) => i.takeId !== take.id));
      await refresh();
    });

  if (!wide) {
    return (
      <Alert>
        <CircleAlert />
        <AlertTitle>The Director needs a wider window</AlertTitle>
        <AlertDescription>
          <p>The Director needs at least 1280 px. The Q&A Kit and session reviews work on any screen size.</p>
          <Button asChild variant="outline" size="sm">
            <Link href={`/projects/${projectId}/qa-kit`}>Open the Q&A Kit</Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const usedBySection = new Map(items.map((i) => [i.sectionKey, i]));
  const renderState = data.render;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_20rem] gap-4">
      <div className="grid min-w-0 gap-4">
        <nav aria-label="Sections" className="grid grid-cols-6 gap-2">
          {data.sections.map((s) => {
            const used = usedBySection.get(s.key);
            const actual = used ? used.outMs - used.inMs : 0;
            const delta = actual - s.budgetSec * 1000;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setActive(s.key)}
                aria-current={s.key === active}
                className={cn("hover:bg-muted grid gap-1 rounded-lg border p-2 text-left", s.key === active && "border-primary bg-muted")}
              >
                <span className="truncate text-sm font-medium">{s.title}</span>
                <span className="text-muted-foreground font-mono text-xs tabular-nums">
                  {used ? formatClock(actual) : "–"} / {formatClock(s.budgetSec * 1000)}
                </span>
                {used ? (
                  <span className={cn("text-xs", delta > 0 ? "text-status-unverified-foreground" : "text-status-verified-foreground")}>
                    {delta > 0 ? `${formatClock(delta)} over` : `${formatClock(-delta)} under`}
                  </span>
                ) : (
                  <span className="text-muted-foreground text-xs">No take in cut</span>
                )}
              </button>
            );
          })}
        </nav>

        <section aria-label={`${section?.title ?? ""} takes`} className="grid gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {section?.title} takes <span className="text-muted-foreground text-sm font-normal">(J / K to move between takes)</span>
            </h2>
            <Button
              variant="outline"
              onClick={() => setRecording(true)}
              disabled={!data.cloudUploadEnabled}
              title={data.cloudUploadEnabled ? undefined : "Turn on cloud upload on the project overview to record takes"}
            >
              <Plus /> Record take
            </Button>
          </div>
          {!data.cloudUploadEnabled ? (
            <p className="text-muted-foreground text-sm">
              Recording takes needs cloud upload: takes are transcribed and rendered on the server. Turn it on from the{" "}
              <Link href={`/projects/${projectId}`} className="underline underline-offset-4">
                project overview
              </Link>
              .
            </p>
          ) : null}
          {takeJob ? (
            <JobProgress
              jobId={takeJob}
              title="Transcribing and scoring the take"
              onDone={() => {
                setTakeJob(null);
                void refresh();
              }}
            />
          ) : null}
          {sectionTakes.length ? (
            <div className="grid grid-cols-3 gap-3 2xl:grid-cols-4">
              {sectionTakes.map((t, i) => (
                <TakeCard
                  key={t.id}
                  take={t}
                  index={i}
                  inCut={usedBySection.get(t.sectionKey)?.takeId === t.id}
                  focused={focusId === t.id}
                  budgetSec={section?.budgetSec ?? 0}
                  onUse={() => pickTake(t)}
                  onFocus={() => setFocusId(t.id)}
                  onDelete={() => void deleteTake(t)}
                />
              ))}
            </div>
          ) : (
            <EmptyState icon={Clapperboard}>No takes for {section?.title} yet. Record one to start.</EmptyState>
          )}
        </section>

        <section aria-label="Timeline" className="grid gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Timeline</h2>
            <div className="flex gap-2">
              <Button variant="outline" onClick={assemble} disabled={busy !== null}>
                <Wand2 /> Auto-assemble
              </Button>
              <Button variant="outline" onClick={save} disabled={!dirty || !data.edl || busy !== null}>
                <Save /> Save timeline
              </Button>
            </div>
          </div>
          {items.length ? (
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,22rem)] gap-4">
              <Timeline items={items} takes={takesById} titles={titles} selected={Math.min(clip, items.length - 1)} onSelect={setClip} onChange={changeItems} />
              <Preview take={takesById.get(items[Math.min(clip, items.length - 1)]?.takeId ?? "")} item={items[Math.min(clip, items.length - 1)]} />
            </div>
          ) : (
            <EmptyState
              icon={Sparkles}
              action={
                <Button onClick={assemble} disabled={busy !== null}>
                  <Wand2 /> Auto-assemble
                </Button>
              }
            >
              Assemble the best take per section into a cut that fits the limit.
            </EmptyState>
          )}
        </section>
      </div>

      <aside className="grid content-start gap-4" aria-label="Checks and render">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">First 20 seconds</CardTitle>
            <CardDescription>The Hook should show your strongest demo moment.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {data.firstTwenty ? (
              data.firstTwenty.ok ? (
                <p className="text-status-verified-foreground inline-flex items-center gap-1.5 text-sm">
                  <CircleCheck size={16} aria-hidden /> The Hook take shows it.
                </p>
              ) : (
                <div className="text-status-unverified-foreground grid gap-1 text-sm" role="alert">
                  <p className="inline-flex items-center gap-1.5 font-medium">
                    <TriangleAlert size={16} aria-hidden /> The Hook take does not show the strongest moment.
                  </p>
                  <p className="text-muted-foreground text-xs">Missing: {data.firstTwenty.missing.join(", ")}</p>
                </div>
              )
            ) : (
              <p className="text-muted-foreground text-sm">Name the strongest moment and put a Hook take in the cut.</p>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="strongest-moment">Strongest demo moment</Label>
              <div className="flex gap-2">
                <Input id="strongest-moment" value={moment} maxLength={300} onChange={(e) => setMoment(e.target.value)} />
                <Button size="icon" variant="outline" onClick={saveMoment} disabled={moment === data.strongestMoment || busy !== null} aria-label="Save strongest moment">
                  <Save />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Total length</CardTitle>
            <CardDescription>Intro and outro cards ({CARD_MS.intro / 1000} s each) included.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-2xl font-semibold tabular-nums">{formatClock(totalMs)}</span>
              <span className="text-muted-foreground font-mono text-sm tabular-nums">limit {formatClock(limitMs)}</span>
            </div>
            <Progress value={Math.min(100, (totalMs / limitMs) * 100)} aria-label="Length against the limit" />
            {items.length ? (
              fits ? (
                <Badge variant="verified" className="justify-self-start">
                  <CircleCheck aria-hidden /> Fits the limit
                </Badge>
              ) : (
                <Badge variant="contradicted" className="justify-self-start">
                  <TriangleAlert aria-hidden /> {formatClock(totalMs - limitMs)} over the limit
                </Badge>
              )
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Render</CardTitle>
            <CardDescription>Crossfades, −14 LUFS, burned-in captions, chapter cards.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button onClick={render} disabled={!data.edl || items.length === 0 || !fits || busy !== null || renderState?.status === "queued" || renderState?.status === "running"}>
              <Film /> Render video
            </Button>
            {renderState && (renderState.status === "queued" || renderState.status === "running") ? (
              <div className="grid gap-1" aria-live="polite">
                <Progress value={renderState.progress * 100} aria-label="Render progress" />
                <span className="text-muted-foreground text-xs">{renderState.status === "queued" ? "Waiting for the renderer" : `Rendering, ${Math.round(renderState.progress * 100)}%`}</span>
              </div>
            ) : null}
            {renderState?.status === "failed" ? (
              <p className="text-status-contradicted-foreground text-sm" role="alert">
                {renderState.error ?? "The render failed."}
              </p>
            ) : null}
            {renderState?.status === "done" ? <Exports render={renderState} /> : null}
          </CardContent>
        </Card>
      </aside>

      <TakeRecorder
        projectId={projectId}
        section={section ? { key: section.key, title: section.title } : null}
        budgetSec={section?.budgetSec ?? 0}
        open={recording}
        onOpenChange={setRecording}
        onUploaded={(jobId) => (setTakeJob(jobId), void refresh())}
      />
    </div>
  );
}
