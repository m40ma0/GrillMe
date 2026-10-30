import { ClaimVerdict, type Claim } from "@stage-ready/shared";
import { UNTRUSTED_NOTICE, quoted } from "../json";
import type { Prompt } from "../types";

export interface VerifyContext {
  claim: Claim;
  latency: { stepKey: string; durationMs: number }[];
  frames: { atMs: number; description: string }[];
  uiStates: { atMs: number; labels: string[] }[];
  repoChunks: { ref: string; text: string }[];
}

export function claimVerifyV1(ctx: VerifyContext): Prompt<ClaimVerdict> {
  return {
    id: "claimVerify",
    version: 1,
    model: "spark",
    schema: ClaimVerdict,
    system: [
      "Judge one spoken claim against the evidence given: latency samples, frame descriptions, UI states and repo digest chunks.",
      UNTRUSTED_NOTICE,
      "Rule: no evidence means unverified, never verified. Contradicted needs evidence that the claim is false.",
      "Each evidence item cites its ref exactly as given (a timestamp, file:line or step key). Summaries are 160 characters or fewer.",
      'suggestedRewrite is calibrated wording from the measured data (for example "under 2 seconds at p95"), or null.',
    ].join("\n"),
    user: [
      quoted("claim", JSON.stringify(ctx.claim)),
      quoted("latency_samples", JSON.stringify(ctx.latency)),
      quoted("frames", JSON.stringify(ctx.frames.slice(-10))),
      quoted("ui_states", JSON.stringify(ctx.uiStates.slice(-10))),
      quoted("repo_chunks", ctx.repoChunks.map((c) => `--- ${c.ref}\n${c.text}`).join("\n"), 20_000),
    ].join("\n\n"),
    // Without a model there is no evidence reader; deterministic rules in the auditor decide what they can.
    mock: () => ({ status: "unverified", confidence: 0.3, evidence: [], suggestedRewrite: null }),
  };
}
