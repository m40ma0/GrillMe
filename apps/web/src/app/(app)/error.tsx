"use client";
import { ErrorAlert } from "@/components/app/error-alert";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorAlert title="This page could not load" error={error} onRetry={reset} />;
}
