import type { CoachItem } from "@stage-ready/shared";

// Rehearsal Memory, deterministic part: weak spots carry stable keys, so sessions can be diffed.

export interface CoachDiff {
  /** Re-checked this session and passed (said again and verified, covered, re-measured within budget). */
  resolved: CoachItem[];
  open: CoachItem[];
  newIssues: CoachItem[];
  /** Not seen this session, but not re-checked either: absence of evidence is not a fix. */
  notRetested: CoachItem[];
}

const RANK = { high: 0, medium: 1, low: 2 } as const;

/**
 * Diffs weak spots by key. An earlier item is resolved only when `passed` says this session re-checked it
 * and it passed; one that merely did not come up again stays open as "not re-tested".
 */
export function diffWeakSpots(previous: CoachItem[], current: CoachItem[], passed: ReadonlySet<string> = new Set()): CoachDiff {
  const prev = new Map(previous.map((i) => [i.key, i]));
  const now = new Map(current.map((i) => [i.key, i]));
  const sort = (items: CoachItem[]) => items.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
  const gone = [...prev.values()].filter((i) => !now.has(i.key));
  return {
    resolved: sort(gone.filter((i) => passed.has(i.key))),
    notRetested: sort(gone.filter((i) => !passed.has(i.key))),
    open: sort([...now.values()].filter((i) => prev.has(i.key))),
    newIssues: sort([...now.values()].filter((i) => !prev.has(i.key))),
  };
}

/** Three focus items: open high-severity issues first, then new ones, padded with criterion drills. */
export function heuristicPlan(diff: CoachDiff, weakestCriteria: string[]): string[] {
  const plan = [...diff.open, ...diff.newIssues, ...diff.notRetested].sort((a, b) => RANK[a.severity] - RANK[b.severity]).map((i) => i.text);
  const drills = weakestCriteria.map((c) => `Drill a question on ${c}.`);
  const out = [...new Set([...plan, ...drills, "Run the full pitch once more at difficulty 4.", "Rehearse the Q&A with one number per answer.", "Record one clean take of the hook."])];
  return out.slice(0, 3).map((t) => t.slice(0, 200));
}
