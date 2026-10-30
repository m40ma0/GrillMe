import type { ClaimStatus, ClaimType, PersonaRole } from "@stage-ready/shared";
import { JUDGE_COOLDOWN_MS } from "@stage-ready/shared";

// Who may interrupt, and why, at a sentence boundary. Pure: the session feeds state in, the model only
// writes the question for a trigger this policy allowed, and the cooldowns are re-checked afterwards.

export type Trigger = "claim" | "coverage_gap" | "over_time" | "vague_answer" | "qa_phase";

export interface PolicyPersona {
  id: string;
  role: PersonaRole;
  criteria: string[];
  lastTurnAtMs: number | null;
}

export interface PolicyClaim {
  id: string;
  text: string;
  type: ClaimType;
  status: ClaimStatus;
  atMs: number;
  challenged: boolean;
}

export interface PolicyInput {
  nowMs: number;
  difficulty: number;
  phase: "pitch" | "qa";
  judgeSpeaking: boolean;
  lastInterruptAtMs: number | null;
  personas: PolicyPersona[];
  /** Claims from recent sentences, newest last. */
  claims: PolicyClaim[];
  /** Criteria with no coverage yet, by name, once enough of the pitch has passed to expect coverage. */
  uncovered: string[];
  overTimeSection: string | null;
  vagueAnswer: string | null;
  /** In Q&A, the presenter finished answering and the panel should ask the next question. */
  qaTurnDue: boolean;
}

export interface Candidate {
  trigger: Trigger;
  personaId: string;
  detail: string;
  claimId?: string;
}

/** Minimum gap between any two interruptions in the pitch, by difficulty 1–5. */
const GLOBAL_GAP_MS = [0, 40_000, 30_000, 20_000, 15_000, 10_000];

const allowed = (difficulty: number, trigger: Trigger, status?: ClaimStatus, type?: ClaimType) => {
  if (trigger === "qa_phase" || trigger === "vague_answer") return trigger === "qa_phase" || difficulty >= 2;
  // Feature claims are settled by show-or-strike at the end of the demo, not by interrupting.
  if (trigger === "claim" && type === "feature" && status === "unverified") return difficulty >= 5;
  if (trigger === "claim") return status === "contradicted" || (status === "unverified" && difficulty >= 3) || (status === "not_shown" && difficulty >= 3) || difficulty >= 5;
  if (trigger === "over_time") return difficulty >= 2;
  return difficulty >= 3; // coverage_gap
};

const ROLE_FOR_CLAIM: Record<ClaimType, PersonaRole> = {
  performance: "technical",
  accuracy: "technical",
  security_privacy: "technical",
  scale: "technical",
  feature: "product",
  comparison: "product",
  market: "impact",
};

export function eligiblePersonas(input: Pick<PolicyInput, "nowMs" | "personas">): PolicyPersona[] {
  return input.personas.filter((p) => p.lastTurnAtMs === null || input.nowMs - p.lastTurnAtMs >= JUDGE_COOLDOWN_MS);
}

/** Candidates ordered by priority. Empty means nobody speaks now. */
export function candidates(input: PolicyInput): Candidate[] {
  if (input.judgeSpeaking) return [];
  // The 45 s cooldown limits interruptions; Q&A questions rotate through the whole panel.
  const eligible = input.phase === "qa" ? input.personas : eligiblePersonas(input);
  if (eligible.length === 0) return [];
  const pick = (role: PersonaRole | null, criterion?: string) =>
    (criterion ? eligible.find((p) => p.criteria.includes(criterion)) : undefined) ??
    eligible.find((p) => p.role === role) ??
    [...eligible].sort((a, b) => (a.lastTurnAtMs ?? -1) - (b.lastTurnAtMs ?? -1))[0];

  const out: Candidate[] = [];
  if (input.phase === "qa") {
    if (input.vagueAnswer && allowed(input.difficulty, "vague_answer")) {
      const p = pick(null);
      if (p) out.push({ trigger: "vague_answer", personaId: p.id, detail: input.vagueAnswer });
    }
    if (input.qaTurnDue) {
      const p = [...eligible].sort((a, b) => (a.lastTurnAtMs ?? -1) - (b.lastTurnAtMs ?? -1))[0];
      if (p) out.push({ trigger: "qa_phase", personaId: p.id, detail: "" });
    }
    return out;
  }

  if (input.lastInterruptAtMs !== null && input.nowMs - input.lastInterruptAtMs < (GLOBAL_GAP_MS[input.difficulty] ?? 20_000)) return [];
  const severity: Record<ClaimStatus, number> = { contradicted: 0, not_shown: 1, unverified: 2, verified: 3 };
  for (const claim of [...input.claims].filter((c) => !c.challenged).sort((a, b) => severity[a.status] - severity[b.status] || b.atMs - a.atMs)) {
    if (!allowed(input.difficulty, "claim", claim.status, claim.type)) continue;
    const p = pick(ROLE_FOR_CLAIM[claim.type]);
    if (p) out.push({ trigger: "claim", personaId: p.id, detail: claim.text, claimId: claim.id });
  }
  if (input.overTimeSection && allowed(input.difficulty, "over_time")) {
    const p = pick("product");
    if (p) out.push({ trigger: "over_time", personaId: p.id, detail: input.overTimeSection });
  }
  for (const criterion of input.uncovered) {
    if (!allowed(input.difficulty, "coverage_gap")) break;
    const p = pick(null, criterion);
    if (p) out.push({ trigger: "coverage_gap", personaId: p.id, detail: criterion });
  }
  return out;
}
