import { ClaimVerdict } from "@stage-ready/shared";
import { z } from "zod";
import { UNTRUSTED_NOTICE, quoted } from "../json";
import type { Prompt } from "../types";

export const AuditVerdicts = z.object({ verdicts: z.array(ClaimVerdict.extend({ claimId: z.string() })) });
export type AuditVerdicts = z.infer<typeof AuditVerdicts>;

/** After-session repo truth and cross-source pass (Muse Wonder) over claims still Unverified. */
export function sessionAuditV1(input: {
  claims: { claimId: string; text: string; type: string }[];
  findings: { kind: string; ref: string; summary: string }[];
  dependencies: string[];
  readme: string | null;
  submission: string | null;
}): Prompt<AuditVerdicts> {
  return {
    id: "sessionAudit",
    version: 1,
    model: "wonder",
    schema: AuditVerdicts,
    system: [
      "You check spoken claims against a repository digest (dependencies, code findings with file:line, tests, TODOs, hard-coded responses) and the written README and submission.",
      UNTRUSTED_NOTICE,
      "Return a verdict only for claims the evidence decides. Every verdict cites refs exactly as given (file:line, README.md, Submission text). No evidence means unverified, never verified.",
      "suggestedRewrite is honest, calibrated wording (140 characters or fewer), or null.",
    ].join("\n"),
    user: [
      quoted("claims", JSON.stringify(input.claims)),
      quoted("repo_findings", JSON.stringify(input.findings.slice(0, 300)), 40_000),
      quoted("dependencies", input.dependencies.join("\n"), 8_000),
      quoted("readme", input.readme ?? "(none)", 12_000),
      quoted("submission", input.submission ?? "(none)", 8_000),
    ].join("\n\n"),
    // The deterministic checks already ran live; without a model there is nothing more to decide.
    mock: () => ({ verdicts: [] }),
  };
}
