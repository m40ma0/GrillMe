import { z } from "zod";
import { quoted } from "../json";
import type { Prompt } from "../types";

export const ShowVerdict = z.object({ shown: z.boolean(), atMs: z.number().nullable(), summary: z.string().max(160) });
export type ShowVerdict = z.infer<typeof ShowVerdict>;

export interface ShowInput {
  claim: string;
  claimAtMs: number;
  /** Frames sampled after the claim, oldest first. */
  frames: { atMs: number; jpeg: Uint8Array }[];
  /** Completed screen actions (latency samples) during the demo. */
  actions: { stepKey: string; startMs: number; durationMs: number }[];
}

const mmss = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0")}`;

/** Show or strike: was a feature the presenter mentioned actually shown on screen? */
export function showOrStrikeV1(input: ShowInput): Prompt<ShowVerdict> {
  return {
    id: "showOrStrike",
    version: 1,
    model: "spark",
    schema: ShowVerdict,
    images: input.frames.map((f) => f.jpeg),
    system: [
      "You check whether a feature the presenter mentioned was actually demonstrated on screen.",
      "The images are screenshots taken after the claim, in order; their times are listed in the text.",
      "shown is true only if a screenshot clearly shows the feature working. atMs is the time of that screenshot, else null.",
    ].join("\n"),
    user: [quoted("claim", input.claim), `Claim at ${mmss(input.claimAtMs)}. Screenshot times: ${input.frames.map((f) => mmss(f.atMs)).join(", ") || "none"}.`].join("\n"),
    // Without vision: a feature counts as shown if a screen action started soon after it was mentioned.
    mock: () => {
      const action = input.actions.find((a) => a.startMs >= input.claimAtMs - 5_000 && a.startMs <= input.claimAtMs + 20_000);
      return action
        ? { shown: true, atMs: action.startMs + action.durationMs, summary: `Screen step ${action.stepKey} ran right after the claim (${mmss(action.startMs)}).` }
        : { shown: false, atMs: null, summary: "No screen step showed it before the demo ended." };
    },
  };
}
