import type { CoachItem } from "@stage-ready/shared";
import { z } from "zod";
import { type CoachDiff, heuristicPlan } from "../coach";
import { quoted } from "../json";
import type { Prompt } from "../types";

export const CoachPlan = z.object({ nextPlan: z.array(z.string().min(5).max(200)).length(3) });
export type CoachPlan = z.infer<typeof CoachPlan>;

/** Coach Notes: compare this session with prior memory and write a three-item next plan. */
export function coachNotesV1(input: { projectName: string; diff: CoachDiff; memory: { when: string; items: CoachItem[] }[]; weakestCriteria: string[] }): Prompt<CoachPlan> {
  return {
    id: "coachNotes",
    version: 1,
    model: "wonder",
    schema: CoachPlan,
    system: [
      "You are a presentation coach writing Coach Notes after a rehearsal.",
      "Given what was resolved, what is still open and what is new, plus earlier sessions' notes, write exactly three focus items for the next session.",
      "Each item is one concrete action, 200 characters or fewer, starting with a verb. Put recurring open issues first.",
    ].join("\n"),
    user: [
      `Project: ${input.projectName}`,
      quoted("this_session", JSON.stringify(input.diff)),
      quoted("earlier_notes", JSON.stringify(input.memory.slice(0, 5))),
      quoted("weakest_criteria", input.weakestCriteria.join(", ")),
    ].join("\n\n"),
    mock: () => ({ nextPlan: heuristicPlan(input.diff, input.weakestCriteria) }),
  };
}
