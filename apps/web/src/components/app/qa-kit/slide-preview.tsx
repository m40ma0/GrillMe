"use client";
import { snapshotNumbers } from "@stage-ready/shared";
import { CircleCheck, Presentation, RefreshCw, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api-client";
import type { QuestionDTO } from "@/lib/types";
import { ErrorAlert } from "../error-alert";
import { JobProgress } from "../job-progress";

export function VerificationBadge({ status }: { status: "passed" | "failed" | "fallback" | null }) {
  if (status === "passed")
    return (
      <Badge variant="verified">
        <CircleCheck aria-hidden strokeWidth={1.75} /> Numbers verified
      </Badge>
    );
  return (
    <Badge variant="fallback">
      <ShieldAlert aria-hidden strokeWidth={1.75} /> {status === "fallback" ? "Fallback template" : "Not verified"}
    </Badge>
  );
}

/** The evidence slide with its verification status, and the exact numbers it was rendered from. */
export function SlidePreview({ question, onRendered }: { question: QuestionDTO; onRendered: () => void }) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [version, setVersion] = useState(0);
  const slide = question.slide;

  const regenerate = async () => {
    if (!question.card) return;
    setError(null);
    try {
      setJobId((await api<{ jobId: string }>(`/api/answer-cards/${question.card.id}/slide`, { method: "POST" })).jobId);
    } catch (e) {
      setError(e as Error);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Evidence slide</CardTitle>
          {slide ? <VerificationBadge status={slide.verification} /> : null}
        </div>
        <CardDescription>Rendered from stored data. A reader checks every number before the slide is used.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {slide?.hasPng ? (
          <img
            src={`/api/slides/${slide.id}/png?v=${version}`}
            alt={`Evidence slide: ${slide.snapshot.title}`}
            className="aspect-video w-full rounded-lg border object-contain"
            width={1920}
            height={1080}
          />
        ) : (
          <div className="bg-muted text-muted-foreground flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg border">
            <Presentation aria-hidden />
            <p className="text-sm">Not rendered yet</p>
          </div>
        )}
        {slide ? (
          <dl className="text-muted-foreground grid gap-1 text-xs">
            <div className="flex gap-2">
              <dt className="font-medium">Numbers</dt>
              <dd className="font-mono">{snapshotNumbers(slide.snapshot).join(" · ") || "none"}</dd>
            </div>
            {slide.snapshot.sources.length ? (
              <div className="flex gap-2">
                <dt className="font-medium">Source</dt>
                <dd>{slide.snapshot.sources.join(" · ")}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
        {error ? <ErrorAlert title="Could not queue the slide" error={error} onRetry={regenerate} /> : null}
        {jobId ? (
          <JobProgress
            jobId={jobId}
            title="Rendering and verifying the slide"
            onDone={() => {
              setJobId(null);
              setVersion((v) => v + 1);
              onRendered();
            }}
            onRetry={regenerate}
          />
        ) : null}
      </CardContent>
      <CardFooter className="justify-end">
        <Button variant="outline" onClick={regenerate} disabled={!question.card || Boolean(jobId)}>
          <RefreshCw /> Regenerate
        </Button>
      </CardFooter>
    </Card>
  );
}
