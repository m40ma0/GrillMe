import { Quote } from "lucide-react";
import { cn } from "@/lib/utils";

/** Evidence first: shows the verbatim span a field came from, or says it was inferred or edited. */
export function SourceQuote({ quote, fallback = "Not on the page", className }: { quote: string | null | undefined; fallback?: string; className?: string }) {
  return (
    <p className={cn("text-muted-foreground flex items-start gap-1.5 text-xs leading-4", className)}>
      <Quote size={12} className="mt-0.5 shrink-0" aria-hidden />
      {quote ? <q className="line-clamp-2 italic">{quote}</q> : <span>{fallback}</span>}
    </p>
  );
}
