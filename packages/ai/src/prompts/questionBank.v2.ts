import { PrePitchBriefBank, type PrePitchBrief } from "@stage-ready/shared";
import { quoted } from "../json";
import { heuristicQuestionBank, type QaContext } from "../qa";
import type { Prompt } from "../types";
import { questionBankV1 } from "./questionBank.v1";

/** Everything Muse Wonder reads in one long-context call: the Q&A context plus the event, winners, the submission and the memory. */
export interface BriefContext extends QaContext {
  eventName: string | null;
  winningPatterns: string[];
  submission: string | null;
  readme: string | null;
  repoCapabilities: { ref: string; summary: string }[];
  sessions: { when: string; score: number | null; contradicted: string[]; notShown: string[] }[];
  coachNotes: { when: string; open: string[]; notRetested: string[]; nextPlan: string[] }[];
}

/**
 * One Muse Wonder pass over everything (repo digest, event, winners, every session and Coach Note): the
 * one-page pre-pitch brief and the ranked question bank together, so both come from the same reading.
 */
export function questionBankV2(input: BriefContext): Prompt<PrePitchBriefBank> {
  const v1 = questionBankV1(input);
  return {
    id: "questionBank",
    version: 2,
    model: "wonder",
    schema: PrePitchBriefBank,
    system: [
      v1.system,
      "Also write brief, a one-page pre-pitch brief for the team to read before presenting:",
      "brief.summary: what the project is and why it can win, in 80 words or fewer, using only facts from the data.",
      "brief.strengths: up to 5 things to lean on, each with its evidence in brackets, e.g. [repo:src/a.ts:12].",
      "brief.risks: up to 5 things judges will catch (contradicted claims, unshown features, slow steps, thin criteria).",
      "brief.mustSay: up to 5 lines the team must say, each tied to a judging criterion.",
      "brief.mustShow: up to 5 demo moments to show, best first; follow the winning patterns when they apply.",
      "Never invent a number or a capability; cite only what the data contains.",
    ].join("\n"),
    user: [
      v1.user,
      `Event: ${input.eventName ?? "unknown"}`,
      quoted("winning_patterns", JSON.stringify(input.winningPatterns.slice(0, 12))),
      quoted("repo_capabilities", JSON.stringify(input.repoCapabilities.slice(0, 60))),
      quoted("readme", input.readme ?? "(none)", 20_000),
      quoted("written_submission", input.submission ?? "(none)", 20_000),
      quoted("sessions", JSON.stringify(input.sessions.slice(0, 20))),
      quoted("coach_notes", JSON.stringify(input.coachNotes.slice(0, 10))),
    ].join("\n\n"),
    mock: () => ({ questions: heuristicQuestionBank(input), brief: heuristicBrief(input) }),
  };
}

/** The deterministic brief (no model): risks from the ledger and memory, strengths from verified evidence. */
export function heuristicBrief(input: BriefContext): PrePitchBrief {
  const top = [...input.criteria].sort((a, b) => b.weight - a.weight);
  const verified = input.claims.filter((c) => c.status === "verified").map((c) => `${c.text}${c.evidence ? ` [${c.evidence}]` : ""}`);
  const capabilities = input.repoCapabilities.map((c) => `${c.summary} [repo:${c.ref}]`);
  const risks = [
    ...input.claims.filter((c) => c.status === "contradicted").map((c) => `Contradicted: "${c.text}"`),
    ...input.claims.filter((c) => c.status === "not_shown").map((c) => `Mentioned but not shown: "${c.text}"`),
    ...input.latency.filter((l) => l.p95 !== null && l.p95 > 2_000).map((l) => `Slow step ${l.stepKey}: ${((l.p95 ?? 0) / 1000).toFixed(1)} s at p95`),
    ...input.weakSpots.map((w) => w.text),
  ];
  return {
    summary:
      `${input.projectName}${input.eventName ? ` for ${input.eventName}` : ""}. Lead with ${top[0]?.name ?? "the problem"}, back every number with evidence, and show the strongest moment early.`.slice(
        0,
        600,
      ),
    strengths: [...verified, ...capabilities].slice(0, 5).map((s) => s.slice(0, 240)),
    risks: [...new Set(risks)].slice(0, 5).map((s) => s.slice(0, 240)),
    mustSay: top.slice(0, 5).map((c) => `How the project meets ${c.name}: ${c.description}`.slice(0, 240)),
    mustShow: [...input.winningPatterns, "The result screen with the measured time on it"].slice(0, 5).map((s) => s.slice(0, 240)),
  };
}
