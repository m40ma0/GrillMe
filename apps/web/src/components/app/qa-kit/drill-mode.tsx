"use client";
import { pickDrillQuestion } from "@stage-ready/shared";
import { Mic, SkipForward, Square, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api-client";
import type { QuestionDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ErrorAlert } from "../error-alert";

const LIMIT_MS = 20_000;

interface DrillResult {
  transcript: string;
  durationMs: number;
  score: { total: number; length: number; directness: number; evidence: number; words: number };
}

/** The 20-second ring: drains clockwise; turns amber in the last 5 s. */
function Ring({ elapsedMs }: { elapsedMs: number }) {
  const r = 88;
  const c = 2 * Math.PI * r;
  const left = Math.max(0, LIMIT_MS - elapsedMs);
  const late = left <= 5_000;
  return (
    <div className="relative size-52" role="timer" aria-label={`${Math.ceil(left / 1000)} seconds left`}>
      <svg viewBox="0 0 200 200" className="size-full -rotate-90" aria-hidden>
        <circle cx="100" cy="100" r={r} className="stroke-muted fill-none" strokeWidth="12" />
        <circle
          cx="100"
          cy="100"
          r={r}
          className={cn("fill-none transition-[stroke] motion-reduce:transition-none", late ? "stroke-status-unverified" : "stroke-primary")}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - left / LIMIT_MS)}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-5xl font-semibold tabular-nums">{Math.ceil(left / 1000)}</span>
    </div>
  );
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Full-screen drill: random questions (weak ones come back more often), a 20-second ring, and a score per answer. */
export function DrillMode({ questions, demoMode, onClose }: { questions: QuestionDTO[]; demoMode: boolean; onClose: () => void }) {
  const [history, setHistory] = useState<Record<string, { askedCount: number; lastScore: number | null }>>({});
  const pool = questions.filter((q) => q.card).map((q) => ({ ...q, ...history[q.id] }));
  const [current, setCurrent] = useState<QuestionDTO | null>(() => pickDrillQuestion(pool));
  const [phase, setPhase] = useState<"ready" | "answering" | "scoring" | "scored">("ready");
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<DrillResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const started = useRef(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);

  const submit = useCallback(
    async (form: FormData | { demoAnswer: "strong" | "weak" }, durationMs: number) => {
      if (!current) return;
      setPhase("scoring");
      try {
        const out =
          form instanceof FormData
            ? await api<DrillResult>(`/api/questions/${current.id}/drill`, { method: "POST", body: form })
            : await api<DrillResult>(`/api/questions/${current.id}/drill`, { method: "POST", json: { durationMs, demoAnswer: form.demoAnswer } });
        setResult(out);
        setHistory((h) => ({ ...h, [current.id]: { askedCount: (h[current.id]?.askedCount ?? current.askedCount) + 1, lastScore: out.score.total } }));
        setPhase("scored");
      } catch (e) {
        setError(e as Error);
        setPhase("ready");
      }
    },
    [current],
  );

  const stop = useCallback(() => {
    const durationMs = Math.min(Date.now() - started.current, 120_000);
    const rec = recorder.current;
    if (!rec) return;
    rec.onstop = () => {
      stream.current?.getTracks().forEach((t) => t.stop());
      const form = new FormData();
      form.set("audio", new Blob(chunks.current, { type: rec.mimeType || "audio/webm" }), "answer.webm");
      form.set("durationMs", String(durationMs));
      void submit(form, durationMs);
    };
    rec.stop();
    recorder.current = null;
  }, [submit]);

  const start = async () => {
    setError(null);
    setResult(null);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream.current);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.start(250);
      recorder.current = rec;
      started.current = Date.now();
      setElapsed(0);
      setPhase("answering");
    } catch {
      setError(new Error("Allow microphone access to record your answer."));
    }
  };

  // The ring keeps running past 20 s so overruns are visible; recording stops at 30 s.
  useEffect(() => {
    if (phase !== "answering") return;
    const id = window.setInterval(() => {
      const ms = Date.now() - started.current;
      setElapsed(ms);
      if (ms >= LIMIT_MS + 10_000) stop();
    }, 100);
    return () => window.clearInterval(id);
  }, [phase, stop]);

  useEffect(() => () => stream.current?.getTracks().forEach((t) => t.stop()), []);

  const next = () => {
    setCurrent(pickDrillQuestion(pool, Math.random, current?.id));
    setResult(null);
    setPhase("ready");
    setElapsed(0);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-dvh max-h-dvh w-screen max-w-none flex-col items-center justify-center gap-8 rounded-none border-0 p-8 sm:max-w-none" showCloseButton={false}>
        <Button variant="ghost" className="absolute top-4 right-4" onClick={onClose}>
          <X /> End drill
        </Button>
        <DialogTitle className="sr-only">Drill mode</DialogTitle>
        <DialogDescription className="sr-only">Answer each question in 20 seconds or less. Weak answers come back more often.</DialogDescription>
        {current ? (
          <>
            <p className="max-w-4xl text-center text-3xl leading-tight font-semibold tracking-tight md:text-4xl">{current.text}</p>
            <Ring elapsedMs={phase === "ready" ? 0 : elapsed} />
            {error ? (
              <div className="w-full max-w-xl">
                <ErrorAlert title="Could not score the answer" error={error} />
              </div>
            ) : null}
            {phase === "ready" ? (
              demoMode ? (
                <div className="flex flex-col items-center gap-2">
                  <p className="text-muted-foreground text-sm">Demo Mode answers with fixture recordings.</p>
                  <div className="flex gap-2">
                    <Button size="lg" onClick={() => void submit({ demoAnswer: "strong" }, 17_500)}>
                      Play a strong answer
                    </Button>
                    <Button size="lg" variant="outline" onClick={() => void submit({ demoAnswer: "weak" }, 24_000)}>
                      Play a weak answer
                    </Button>
                  </div>
                </div>
              ) : (
                <Button size="lg" onClick={start}>
                  <Mic /> Start answer
                </Button>
              )
            ) : null}
            {phase === "answering" ? (
              <Button size="lg" variant="destructive" onClick={stop}>
                <Square /> Stop answer
              </Button>
            ) : null}
            {phase === "scoring" ? (
              <p className="text-muted-foreground" aria-live="polite">
                Scoring your answer
              </p>
            ) : null}
            {phase === "scored" && result ? (
              <div className="grid w-full max-w-3xl gap-4" aria-live="polite">
                <dl className="grid grid-cols-4 gap-2 text-center">
                  {(
                    [
                      ["Score", result.score.total],
                      ["Length", result.score.length],
                      ["Directness", result.score.directness],
                      ["Evidence", result.score.evidence],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="rounded-lg border p-3">
                      <dt className="text-muted-foreground text-xs">{label}</dt>
                      <dd className="font-mono text-2xl font-semibold tabular-nums">{pct(value)}</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-muted-foreground text-sm">
                  {result.score.words} words in {(result.durationMs / 1000).toFixed(1)} s. You said: “{result.transcript}”
                </p>
                <p className="text-sm">
                  <span className="font-medium">Card:</span> {current.card?.script}
                </p>
                <Button size="lg" className="justify-self-center" onClick={next}>
                  <SkipForward /> Next question
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-muted-foreground">No questions with answer cards yet.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
