import { Claim } from "@stage-ready/shared";
import { z } from "zod";
import { heuristicClaims } from "../claims";
import { quoted } from "../json";
import type { Prompt } from "../types";

export const ClaimList = z.object({ claims: z.array(Claim).max(6) });
export type ClaimList = z.infer<typeof ClaimList>;

export function claimExtractV1(input: { sentence: string; segmentStartMs: number; context: string[] }): Prompt<ClaimList> {
  return {
    id: "claimExtract",
    version: 1,
    model: "spark",
    schema: ClaimList,
    system: [
      "Extract factual, checkable claims from this sentence. Ignore opinions and plans.",
      "Types: performance, accuracy, feature, security_privacy, scale, comparison, market.",
      "quantity is the number and unit the claim states, or null. featureName names the feature for feature claims, or null.",
      `segmentStartMs is ${input.segmentStartMs} for every claim. Return {"claims": []} when there are none.`,
    ].join("\n"),
    user: [quoted("previous_sentences", input.context.slice(-3).join("\n"), 2_000), quoted("sentence", input.sentence, 2_000)].join("\n\n"),
    mock: () => ({ claims: heuristicClaims(input.sentence, input.segmentStartMs) }),
  };
}
