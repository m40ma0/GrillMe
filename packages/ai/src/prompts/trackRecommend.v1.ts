import { TrackRecommendation } from "@stage-ready/shared";
import { heuristicTrack } from "../heuristics";
import { UNTRUSTED_NOTICE, quoted } from "../json";
import type { Prompt } from "../types";

export function trackRecommendV1(input: { tracks: { name: string; description: string }[]; criteria: string[]; pitch: string }): Prompt<TrackRecommendation> {
  return {
    id: "trackRecommend",
    version: 1,
    model: "spark",
    schema: TrackRecommendation,
    system: [
      "Recommend the single best-fitting track for this project, with reasons tied to the named judging criteria.",
      UNTRUSTED_NOTICE,
      "track must be one of the given track names, or null if there are none.",
    ].join("\n"),
    user: [quoted("tracks", JSON.stringify(input.tracks)), quoted("criteria", input.criteria.join("\n")), quoted("pitch", input.pitch, 20_000)].join("\n\n"),
    mock: () => heuristicTrack(input.tracks, input.pitch, input.criteria),
  };
}
