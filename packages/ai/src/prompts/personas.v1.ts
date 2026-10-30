import { PersonaStyles, type PersonaRole } from "@stage-ready/shared";
import { heuristicPersonaStyles } from "../heuristics";
import { quoted } from "../json";
import type { Prompt } from "../types";

export function personaStylesV1(input: { eventName: string; difficulty: number; criteriaByRole: Record<PersonaRole, string[]> }): Prompt<PersonaStyles> {
  return {
    id: "personaStyles",
    version: 1,
    model: "spark",
    schema: PersonaStyles,
    system: [
      "You write the question style for three fictional judge personas: technical, impact, product.",
      "They are built only from the published criteria. Never name, imitate or describe a real person, including anyone named on the event page.",
      "Each style is one sentence of 240 characters or fewer describing what the judge probes and how hard, given difficulty 1 (friendly) to 5 (hostile). Prefer questions that make the presenter show evidence.",
    ].join("\n"),
    user: `Event: ${input.eventName}\nDifficulty: ${input.difficulty}\n\n${quoted("criteria_by_role", JSON.stringify(input.criteriaByRole, null, 2))}`,
    mock: () => ({ styles: heuristicPersonaStyles(input.criteriaByRole, input.difficulty) }),
  };
}
