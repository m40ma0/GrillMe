import { QuestionBank } from "@stage-ready/shared";
import { quoted } from "../json";
import { heuristicQuestionBank, type QaContext } from "../qa";
import type { Prompt } from "../types";

/** Evidence Q&A Kit: the ranked question bank with a 20-second answer card per question. */
export function questionBankV1(input: QaContext): Prompt<QuestionBank> {
  return {
    id: "questionBank",
    version: 1,
    model: "wonder",
    schema: QuestionBank,
    system: [
      "You prepare a hackathon team for the hardest questions judges will ask after their demo.",
      "Write 20 to 30 distinct questions. Draw them from the judging criteria, the claim ledger (contradicted and unverified claims first), the repo findings, the judge personas and the weak spots from past rehearsals.",
      "For each: likelihood (0–1) that a judge asks it, damage (0–1) if answered badly, sourceRefs naming where it comes from (criterion:<name>, claim:<text>, repo:<file:line>, latency:<step>, persona:<role>, session:<key>).",
      "card.script is a spoken answer of 55 words or fewer: answer first, then the proof. Use only numbers present in the data below; never invent a number.",
      "card.bridgeLine (120 characters or fewer) brings the answer back to the project's key message.",
      "card.evidenceRefs lists refs from the data that prove the answer; leave it empty when there is no evidence, and then set suggestedArtifact to what would prove it (for example an eval script). Otherwise suggestedArtifact is null.",
      "personaRole is technical, impact, product or null.",
    ].join("\n"),
    user: [
      `Project: ${input.projectName}`,
      quoted("criteria", JSON.stringify(input.criteria)),
      quoted("claims", JSON.stringify(input.claims.slice(0, 40))),
      quoted("repo_findings", JSON.stringify(input.findings.slice(0, 40))),
      quoted("personas", JSON.stringify(input.personas)),
      quoted("weak_spots", JSON.stringify(input.weakSpots.slice(0, 20))),
      quoted("latency_ms", JSON.stringify(input.latency)),
    ].join("\n\n"),
    mock: () => ({ questions: heuristicQuestionBank(input) }),
  };
}
