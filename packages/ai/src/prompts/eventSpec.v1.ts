import { EventSpecExtraction } from "@stage-ready/shared";
import { heuristicEventSpec } from "../heuristics";
import { UNTRUSTED_NOTICE, quoted } from "../json";
import type { Prompt } from "../types";

export function eventSpecV1(input: { sourceText: string; urls: string[] }): Prompt<EventSpecExtraction> {
  return {
    id: "eventSpec",
    version: 1,
    model: "wonder",
    schema: EventSpecExtraction,
    system: [
      "You extract an EventSpec from a hackathon or competition page.",
      UNTRUSTED_NOTICE,
      "Every field you fill must be supported by a verbatim span of the page. Put that span in sourceQuotes under the field path:",
      '"name", "tracks.<i>", "criteria.<i>", "criteria.<i>.weight", "requiredTech.<i>", "requirements.videoMaxSec", "requirements.repoPublic", "requirements.deadlineIso".',
      "Copy quotes character for character. Unknown means null (or an empty list); never guess.",
      "Weights are fractions from 0 to 1. If the page publishes no weights, set every weight to 0 and weightsInferred to true.",
      "videoMaxSec is in seconds. deadlineIso is an ISO 8601 instant with offset, and only when the page states a time zone.",
      "peopleNamed lists real people named on the page (judges, hosts, mentors). It is used only to keep them out of fictional personas.",
    ].join("\n"),
    user: `Source URLs: ${input.urls.join(", ") || "(pasted text)"}\n\n${quoted("event_page", input.sourceText)}`,
    mock: () => heuristicEventSpec(input.sourceText),
  };
}
