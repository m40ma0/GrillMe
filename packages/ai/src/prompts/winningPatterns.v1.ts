import { WinningPatterns } from "@stage-ready/shared";
import { heuristicPatterns, type PatternContext } from "../heuristics";
import { UNTRUSTED_NOTICE, quoted } from "../json";
import type { Prompt } from "../types";

export function winningPatternsV1(ctx: PatternContext): Prompt<WinningPatterns> {
  const winners = ctx.winners.map((w) => ({ title: w.profile.title, sourceUrl: w.sourceUrl, profile: w.profile }));
  return {
    id: "winningPatterns",
    version: 1,
    model: "wonder",
    schema: WinningPatterns,
    system: [
      "From past winner profiles, derive at most 6 winning patterns.",
      UNTRUSTED_NOTICE,
      "Each pattern cites at least 2 winners with a quote taken from that winner's sourceQuotes.",
      "Each pattern has a concrete check against the user's project, and checkResult pass, fail or unknown based only on the project data given. Use unknown when the project data cannot answer it.",
    ].join("\n"),
    user: [
      quoted("winner_profiles", JSON.stringify(winners, null, 2)),
      quoted("project", JSON.stringify({ pitchScript: ctx.pitchScript, plannedStrongestMomentSec: ctx.plannedStrongestMomentSec, repoSignals: ctx.repoSignals.slice(0, 200) }, null, 2)),
    ].join("\n\n"),
    mock: () => ({ patterns: heuristicPatterns(ctx) }),
  };
}
