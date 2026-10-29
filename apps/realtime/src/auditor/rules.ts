import { promisedLatencyMs } from "@stage-ready/ai";
import { formatSeconds, percentile, type Claim, type ClaimVerdict } from "@stage-ready/shared";

// Deterministic verification. It runs before any model call (cost control) and decides what
// measurements can decide; everything else goes to the model or stays unverified.

export interface LatencyRecord {
  stepKey: string;
  startMs: number;
  durationMs: number;
}

export interface RepoFacts {
  dependencies: string[];
  capabilities: { summary: string; ref: string }[];
  evalFiles: string[];
}

export interface RuleResult {
  verdict: ClaimVerdict;
  /** True while a pending performance claim should be re-checked when a new latency sample arrives. */
  pending: boolean;
  /** "Numbers need a source": a Fix Task to create. */
  fixTask?: { title: string; detail: string; suggestedArtifact: string };
}

const CRYPTO =
  /^(crypto-js|bcrypt|bcryptjs|argon2|libsodium(-wrappers)?|tweetnacl|@noble\/(ciphers|hashes|curves)|jose|node-forge|openpgp|cryptography|pycryptodome|pynacl|ring|aes-gcm|sodium-native|@aws-sdk\/client-kms)$/i;
export const RECHECK_WINDOW_MS = 20_000;

const mmss = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0")}`;

export function verifyDeterministic(claim: Claim, latency: LatencyRecord[], repo: RepoFacts | null): RuleResult | null {
  if (claim.type === "performance") {
    const promised = promisedLatencyMs(claim.text);
    if (promised === null) return null;
    const after = latency.filter((l) => l.startMs >= claim.segmentStartMs - 2_000 && l.startMs <= claim.segmentStartMs + RECHECK_WINDOW_MS);
    const sample = after[0] ?? latency.filter((l) => l.startMs < claim.segmentStartMs).at(-1);
    if (!sample) {
      return { verdict: { status: "unverified", confidence: 0.3, evidence: [], suggestedRewrite: null }, pending: true };
    }
    const sameStep = latency.filter((l) => l.stepKey === sample.stepKey).map((l) => l.durationMs);
    const p95 = percentile(sameStep, 95) ?? sample.durationMs;
    const evidence = [
      {
        kind: "latency" as const,
        ref: `${sample.stepKey} @ ${mmss(sample.startMs)}`,
        summary: `Measured ${formatSeconds(sample.durationMs)} from action to result; promised ${formatSeconds(promised)} or less.`,
      },
    ];
    if (sample.durationMs > promised) {
      return {
        verdict: {
          status: "contradicted",
          confidence: 0.9,
          evidence,
          suggestedRewrite: `It takes ${sameStep.length > 1 ? `under ${formatSeconds(p95)} at p95` : `about ${formatSeconds(sample.durationMs)}`}.`,
        },
        pending: false,
      };
    }
    return { verdict: { status: "verified", confidence: 0.85, evidence, suggestedRewrite: null }, pending: false };
  }

  if (claim.type === "accuracy" || (claim.quantity && /%/.test(claim.quantity.unit) && claim.type !== "market")) {
    if (repo && repo.evalFiles.length > 0) return null;
    return {
      verdict: {
        status: "unverified",
        confidence: 0.6,
        evidence: repo ? [{ kind: "repo", ref: "repo digest", summary: "No eval file or result in the repo supports this number." }] : [],
        suggestedRewrite: null,
      },
      pending: false,
      fixTask: {
        title: `Add an eval for: "${claim.text.slice(0, 80)}"`,
        detail: "A numeric claim needs an eval file or result. Without one it stays Unverified.",
        suggestedArtifact: "eval/run_eval.py: score the model on a held-out labelled set and write eval/results.json",
      },
    };
  }

  if (claim.type === "security_privacy" && /encrypt/i.test(claim.text) && repo) {
    const lib = repo.dependencies.find((d) => CRYPTO.test(d));
    const cap = repo.capabilities.find((c) => /encrypt|cipher|aes|kms/i.test(c.summary));
    if (lib || cap) return null;
    return {
      verdict: {
        status: "unverified",
        confidence: 0.7,
        evidence: [{ kind: "repo", ref: "package.json", summary: `No encryption library among ${repo.dependencies.length} dependencies, and no encryption code path found.` }],
        suggestedRewrite: null,
      },
      pending: false,
    };
  }

  return null;
}

/** "No evidence means unverified, never verified" applies to model verdicts too. */
export function enforceEvidenceRule(verdict: ClaimVerdict): ClaimVerdict {
  if ((verdict.status === "verified" || verdict.status === "contradicted") && verdict.evidence.length === 0) return { ...verdict, status: "unverified", confidence: Math.min(verdict.confidence, 0.4) };
  return verdict;
}
