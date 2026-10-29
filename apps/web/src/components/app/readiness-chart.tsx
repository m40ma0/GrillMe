"use client";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const config = { readiness: { label: "Readiness (%)", color: "var(--primary)" } } satisfies ChartConfig;

/** Readiness per criterion, 0–100 %. */
export function ReadinessChart({ data }: { data: { criterion: string; readiness: number }[] }) {
  return (
    <ChartContainer config={config} className="aspect-auto h-72 w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, bottom: 16 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} label={{ value: "Readiness (%)", position: "insideBottom", offset: -2 }} height={36} />
        <YAxis type="category" dataKey="criterion" width={140} tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent formatter={(v) => `${v}%`} />} />
        <Bar dataKey="readiness" fill="var(--color-readiness)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
