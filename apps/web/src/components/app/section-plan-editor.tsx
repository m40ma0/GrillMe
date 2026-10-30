"use client";
import { autoSectionPlan, formatDuration, type SectionPlanItem } from "@stage-ready/shared";
import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./status-badge";

/** Six sections with budgets; the default plan totals the video limit, and every budget is editable. */
export function SectionPlanEditor({ value, onChange, limitSec }: { value: SectionPlanItem[]; onChange: (plan: SectionPlanItem[]) => void; limitSec: number }) {
  const total = value.reduce((sum, s) => sum + s.budgetSec, 0);
  const over = total > limitSec;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground">
          Total <span className="text-foreground font-mono tabular-nums">{formatDuration(total)}</span> of <span className="font-mono tabular-nums">{formatDuration(limitSec)}</span>
        </p>
        <div className="flex items-center gap-2">
          <StatusBadge status={over ? "fail" : "pass"} label={over ? `${total - limitSec} s over` : "Within limit"} />
          <Button type="button" variant="outline" size="sm" onClick={() => onChange(autoSectionPlan(limitSec))}>
            <Wand2 /> Fill from limit
          </Button>
        </div>
      </div>
      <div className="grid gap-2">
        {value.map((section, i) => (
          <div key={section.key} className="grid grid-cols-[1fr_7rem] items-center gap-3 sm:grid-cols-[1fr_7rem_10rem]">
            <Input aria-label={`${section.key} title`} value={section.title} onChange={(e) => onChange(value.map((s, j) => (j === i ? { ...s, title: e.target.value } : s)))} />
            <div className="flex items-center gap-1">
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                aria-label={`${section.title} budget in seconds`}
                className="text-right font-mono tabular-nums"
                value={section.budgetSec}
                onChange={(e) => onChange(value.map((s, j) => (j === i ? { ...s, budgetSec: Math.max(1, Math.round(Number(e.target.value) || 1)) } : s)))}
              />
              <span className="text-muted-foreground">s</span>
            </div>
            <div className="bg-muted hidden h-2 overflow-hidden rounded-full sm:block" aria-hidden>
              <div className={cn("h-full", over ? "bg-status-contradicted" : "bg-primary")} style={{ width: `${Math.min(100, (section.budgetSec / Math.max(limitSec, total)) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
