import { WinnerExtraction } from "@stage-ready/shared";
import { heuristicWinners } from "../heuristics";
import { UNTRUSTED_NOTICE, quoted } from "../json";
import type { Prompt } from "../types";

export function winnerProfileV1(input: { pageText: string; url: string | null }): Prompt<WinnerExtraction> {
  return {
    id: "winnerProfile",
    version: 1,
    model: "wonder",
    schema: WinnerExtraction,
    system: [
      "You extract a WinnerProfile for every winning or placing project described on a results page.",
      UNTRUSTED_NOTICE,
      "For each field you fill, put the verbatim supporting span in sourceQuotes under the field name (title, placement, inputType, outputType, demoStructure, strongestMomentSec, domain, track, tech).",
      'Unknown text fields are "unknown", unknown nullable fields are null, unknown lists are empty. Never guess.',
      "strongestMomentSec is the second in the demo video where the most convincing moment happens, only when the page gives a timestamp.",
    ].join("\n"),
    user: `Source URL: ${input.url ?? "(pasted text)"}\n\n${quoted("winner_page", input.pageText)}`,
    mock: () => ({ winners: heuristicWinners(input.pageText) }),
  };
}
