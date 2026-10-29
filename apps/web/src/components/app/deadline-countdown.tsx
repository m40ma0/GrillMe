"use client";
import { formatCountdown, formatInZone } from "@stage-ready/shared";
import { CalendarClock } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function DeadlineCountdown({ deadlineIso, timezone, className }: { deadlineIso: string | null; timezone: string; className?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  if (!deadlineIso)
    return (
      <span className={cn("text-muted-foreground inline-flex items-center gap-1.5", className)}>
        <CalendarClock size={16} strokeWidth={1.75} aria-hidden />
        No deadline
      </span>
    );
  const remaining = now === null ? null : Date.parse(deadlineIso) - now;
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} title={`Due ${formatInZone(deadlineIso, timezone)}`}>
      <CalendarClock size={16} strokeWidth={1.75} aria-hidden />
      <span className="font-mono tabular-nums">{remaining === null ? "…" : remaining > 0 ? `${formatCountdown(remaining)} left` : "Deadline passed"}</span>
    </span>
  );
}
