"use client";
import { Check, Loader2, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/** What the seed does, in order; the list advances on a timer while the request runs. */
const STEPS = ["Opening a guest workspace", "Loading the fictional Signal Garden project", "Scoring twelve recorded takes", "Writing the judges' question bank", "Opening the project"];
const STEP_MS = 900;

// One request per page load, even when React mounts the effect twice in development.
let pending: Promise<{ location: string } | { error: string }> | null = null;

function startDemo() {
  pending ??= fetch("/api/demo", { method: "POST", headers: { accept: "application/json" } })
    .then(async (res) => {
      const body = (await res.json().catch(() => null)) as { location?: string; error?: { message?: string } } | null;
      if (res.ok && body?.location) return { location: body.location };
      return { error: body?.error?.message ?? "The demo project could not be created." };
    })
    .catch(() => ({ error: "Stage Ready could not be reached. Check your connection and try again." }));
  return pending;
}

export function DemoStarter() {
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 2)), STEP_MS);
    void startDemo().then((result) => {
      if (!live) return;
      clearInterval(timer);
      if ("location" in result) {
        setStep(STEPS.length - 1);
        window.location.replace(result.location);
      } else {
        pending = null;
        setError(result.error);
      }
    });
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [attempt]);

  return (
    <div className="grid gap-4">
      <ol className="grid gap-2 text-sm" aria-label="Progress">
        {STEPS.map((label, i) => {
          const done = i < step;
          const current = i === step && !error;
          return (
            <li key={label} className={done || current ? "flex items-center gap-2" : "text-muted-foreground flex items-center gap-2"} aria-current={current ? "step" : undefined}>
              {done ? <Check size={16} className="text-primary" aria-hidden /> : current ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <span className="size-4" aria-hidden />}
              {label}
            </li>
          );
        })}
      </ol>
      {error ? (
        <div className="grid gap-3" role="alert">
          <p className="text-destructive text-sm">{error}</p>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                setError(null);
                setStep(0);
                setAttempt((a) => a + 1);
              }}
            >
              <RotateCcw aria-hidden /> Try again
            </Button>
            <Button asChild variant="outline">
              <Link href="/">Home</Link>
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs" role="status">
          A fictional project in a guest workspace, kept for 24 hours. This takes a few seconds.
        </p>
      )}
      <noscript>
        <form action="/api/demo" method="post">
          <Button type="submit">Continue</Button>
        </form>
      </noscript>
    </div>
  );
}
