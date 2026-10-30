import { modelCaption } from "@stage-ready/shared";
import { Cpu } from "lucide-react";
import { cn } from "@/lib/utils";

/** Which model produced this ("Muse Spark 1.3 · 1.9 s"), or "Mocked". Renders nothing when unknown. */
export function ModelCaption({
  modelId,
  latencyMs,
  fallback,
  className,
}: {
  modelId: string | null | undefined;
  latencyMs?: number | null;
  fallback?: "budget" | "error" | undefined;
  className?: string;
}) {
  if (!modelId) return null;
  return (
    <span className={cn("text-muted-foreground inline-flex items-center gap-1 font-mono text-[11px] tabular-nums", className)} data-model={modelId}>
      <Cpu size={11} aria-hidden />
      {modelCaption({ modelId, latencyMs: latencyMs ?? null, fallback })}
    </span>
  );
}
