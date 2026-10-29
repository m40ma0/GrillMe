"use client";
import { CARD_MS, CROSSFADE_MS, type EdlItem } from "@stage-ready/shared";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { TakeDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatClock } from "./format";

const SECTION_COLOR = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--persona-1)"];

/** The assembled cut: intro, one clip per section, outro. Trim handles and the transition per clip. */
export function Timeline({
  items,
  takes,
  titles,
  selected,
  onSelect,
  onChange,
}: {
  items: EdlItem[];
  takes: Map<string, TakeDTO>;
  titles: Record<string, string>;
  selected: number;
  onSelect: (index: number) => void;
  onChange: (items: EdlItem[]) => void;
}) {
  const total = CARD_MS.intro + CARD_MS.outro + items.reduce((s, i) => s + i.outMs - i.inMs, 0);
  const item = items[selected];
  const take = item ? takes.get(item.takeId) : undefined;
  const update = (patch: Partial<EdlItem>) => onChange(items.map((it, i) => (i === selected ? { ...it, ...patch } : it)));

  return (
    <div className="grid gap-3">
      <div className="flex h-12 w-full overflow-hidden rounded-lg border" role="list" aria-label="Timeline">
        <div
          role="listitem"
          className="bg-muted text-muted-foreground flex items-center justify-center overflow-hidden text-xs"
          style={{ width: `${(CARD_MS.intro / total) * 100}%` }}
          title="Intro card"
        >
          <span className="sr-only">Intro card</span>
        </div>
        {items.map((it, i) => (
          <button
            key={it.sectionKey}
            type="button"
            role="listitem"
            onClick={() => onSelect(i)}
            aria-current={i === selected}
            className={cn("relative flex min-w-0 items-center justify-center border-l px-1 text-xs font-medium text-white", i === selected && "ring-ring z-10 ring-2 ring-inset")}
            style={{ width: `${((it.outMs - it.inMs) / total) * 100}%`, backgroundColor: SECTION_COLOR[i % SECTION_COLOR.length] }}
          >
            <span className="truncate rounded bg-black/75 px-1">{titles[it.sectionKey] ?? it.sectionKey}</span>
            {it.transition === "crossfade" ? <span className="absolute inset-y-0 left-0 w-1 bg-white/40" aria-hidden /> : null}
          </button>
        ))}
        <div
          role="listitem"
          className="bg-muted text-muted-foreground flex items-center justify-center overflow-hidden border-l text-xs"
          style={{ width: `${(CARD_MS.outro / total) * 100}%` }}
          title="Outro card"
        >
          <span className="sr-only">Outro card</span>
        </div>
      </div>
      {item && take ? (
        <div className="grid gap-3 rounded-lg border p-3">
          <div className="grid gap-2">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Trim {titles[item.sectionKey]}</span>
              <span className="text-muted-foreground font-mono tabular-nums">
                {formatClock(item.inMs)} – {formatClock(item.outMs)} ({formatClock(item.outMs - item.inMs)} of {formatClock(take.durationMs)})
              </span>
            </div>
            <Slider
              min={0}
              max={take.durationMs}
              step={100}
              minStepsBetweenThumbs={10}
              value={[item.inMs, item.outMs]}
              onValueChange={([inMs, outMs]) => inMs !== undefined && outMs !== undefined && update({ inMs, outMs })}
              aria-label="Trim handle"
            />
          </div>
          <div className="grid gap-1">
            <span className="text-muted-foreground text-xs">Transition in</span>
            <ToggleGroup type="single" value={item.transition} onValueChange={(v) => (v === "crossfade" || v === "cut") && update({ transition: v })} aria-label="Transition">
              <ToggleGroupItem value="crossfade">Crossfade {CROSSFADE_MS} ms</ToggleGroupItem>
              <ToggleGroupItem value="cut">Cut</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      ) : null}
    </div>
  );
}
