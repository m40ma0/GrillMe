import "server-only";
import { heuristicPersonaStyles, prompts } from "@stage-ready/ai";
import { personas } from "@stage-ready/db";
import { PersonaRole, VOICE_PRESETS, mentionsPerson, normalizeWeights, type Persona } from "@stage-ready/shared";
import { eq } from "drizzle-orm";
import type { EventSpecDTO } from "@/lib/types";
import { ApiError } from "./api";
import { aiFor } from "./ai";
import { db } from "./db";

const ROLE_KEYWORDS: Record<PersonaRole, RegExp> = {
  technical: /tech|execution|engineering|implement|complex|quality|code|architecture|innovation|ai use|model/i,
  impact: /impact|domain|social|value|benefit|problem|real[- ]world|sustainab|community|outcome/i,
  product: /product|business|market|ux|user|experience|design|presentation|pitch|viab|adoption|feasib|commercial/i,
};

/** Splits criteria across the three roles by wording; unmatched criteria go to the role with the fewest. */
export function assignCriteria(criteria: { name: string; description: string; weight: number }[]): Record<PersonaRole, { name: string; weight: number }[]> {
  const out: Record<PersonaRole, { name: string; weight: number }[]> = { technical: [], impact: [], product: [] };
  const unmatched: typeof criteria = [];
  for (const c of criteria) {
    const role = PersonaRole.options.find((r) => ROLE_KEYWORDS[r].test(`${c.name} ${c.description}`));
    if (role) out[role].push(c);
    else unmatched.push(c);
  }
  for (const c of unmatched) {
    const role = [...PersonaRole.options].sort((a, b) => out[a].length - out[b].length)[0] ?? "technical";
    out[role].push(c);
  }
  // A role with no criterion of its own still judges against the full published set.
  for (const role of PersonaRole.options) if (out[role].length === 0) out[role] = criteria.map((c) => ({ name: c.name, weight: c.weight }));
  return out;
}

/** Builds three fictional personas from the published criteria and replaces the project's personas. */
export async function generatePersonas(project: { id: string; demoMode: boolean }, spec: EventSpecDTO, difficulty: number, peopleNamed: string[]): Promise<Persona[]> {
  if (spec.criteria.length === 0) throw new ApiError(409, "no_criteria", "Add judging criteria before generating personas.");
  const assigned = assignCriteria(spec.criteria);
  const criteriaByRole = Object.fromEntries(PersonaRole.options.map((r) => [r, assigned[r].map((c) => c.name)])) as Record<PersonaRole, string[]>;
  const { value } = await aiFor(project).llm.generateObject(prompts.personaStylesV1({ eventName: spec.name, difficulty, criteriaByRole }));
  const fallback = heuristicPersonaStyles(criteriaByRole, difficulty);

  const built: Persona[] = PersonaRole.options.map((role) => {
    let questionStyle = value.styles.find((s) => s.role === role)?.questionStyle ?? "";
    // Ethics guardrail: never carry a real person's name from the event page into a persona.
    if (!questionStyle || mentionsPerson(questionStyle, peopleNamed)) questionStyle = fallback.find((s) => s.role === role)?.questionStyle ?? "Asks for evidence behind each claim.";
    const weights = normalizeWeights(assigned[role].map((c) => c.weight || 1));
    return { role, difficulty, criteriaWeights: Object.fromEntries(assigned[role].map((c, i) => [c.name, weights[i] ?? 0])), questionStyle, voicePreset: VOICE_PRESETS[role], isFictional: true };
  });

  await db().transaction(async (tx) => {
    await tx.delete(personas).where(eq(personas.projectId, project.id));
    await tx.insert(personas).values(built.map((p) => ({ projectId: project.id, ...p })));
  });
  return built;
}
