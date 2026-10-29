import type { CoachItem } from "@stage-ready/shared";

// Rehearsal Memory, deterministic part: weak spots carry stable keys, so sessions can be diffed.

export interface CoachDiff {
  resolved: CoachItem[];
  open: CoachItem[];
  newIssues: CoachItem[];
}

const RANK = { high: 0, medium: 1, low: 2 } as const;

export function diffWeakSpots(previous: CoachItem[], current: CoachItem[]): CoachDiff {
  const prev = new Map(previous.map((i) => [i.key, i]));
  const now = new Map(current.map((i) => [i.key, i]));
  const sort = (items: CoachItem[]) => items.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
  return {
    resolved: sort([...prev.values()].filter((i) => !now.has(i.key))),
    open: sort([...now.values()].filter((i) => prev.has(i.key))),
    newIssues: sort([...now.values()].filter((i) => !prev.has(i.key))),
  };
}

/** Three focus items: open high-severity issues first, then new ones, padded with criterion drills. */
export function heuristicPlan(diff: CoachDiff, weakestCriteria: string[]): string[] {
  const plan = [...diff.open, ...diff.newIssues].sort((a, b) => RANK[a.severity] - RANK[b.severity]).map((i) => i.text);
  const drills = weakestCriteria.map((c) => `Drill a question on ${c}.`);
  const out = [...new Set([...plan, ...drills, "Run the full pitch once more at difficulty 4.", "Rehearse the Q&A with one number per answer.", "Record one clean take of the hook."])];
  return out.slice(0, 3).map((t) => t.slice(0, 200));
}
