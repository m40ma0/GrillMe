"use client";
import { CircleAlert, RotateCcw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ApiClientError } from "@/lib/api-client";

/** What happened and what to do, plus Retry. Raw codes stay in a collapsible detail. */
export function ErrorAlert({ title, error, onRetry }: { title: string; error: unknown; onRetry?: (() => void) | undefined }) {
  const message = error instanceof Error ? error.message : String(error);
  const code = error instanceof ApiClientError ? `${error.status} ${error.code}` : null;
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        <div className="flex flex-wrap items-center gap-3">
          {onRetry ? (
            <Button size="sm" variant="outline" onClick={onRetry}>
              <RotateCcw /> Retry
            </Button>
          ) : null}
          {code ? (
            <details className="text-xs">
              <summary className="cursor-pointer">Error detail</summary>
              <code className="font-mono">{code}</code>
            </details>
          ) : null}
        </div>
      </AlertDescription>
    </Alert>
  );
}
