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
  /** TODOs and possible mock or hard-coded responses outside tests, with file:line refs. */
  todos: { summary: string; ref: string }[];
  mocks: { summary: string; ref: string }[];
}

/** Written sources the spoken pitch must agree with. */
export interface Docs {
  readme: string | null;
  submission: string | null;
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

const STOP = new Set([
  "about",
  "every",
  "their",
  "there",
  "which",
  "these",
  "those",
  "would",
  "should",
  "could",
  "with",
  "from",
  "into",
  "that",
  "this",
  "what",
  "your",
  "supports",
  "support",
  "report",
  "reports",
  "using",
  "signal",
  "garden",
]);
/** Distinctive words (≥ 5 letters) for matching a claim against code findings and docs. */
export const distinctive = (text: string) => new Set((text.toLowerCase().match(/[a-z]{5,}/g) ?? []).filter((w) => !STOP.has(w)).map((w) => w.replace(/(ing|ed|es|s)$/, "")));
const overlap = (a: Set<string>, b: Set<string>) => [...a].filter((w) => b.has(w));

/** Numbers stated in a claim, as plain values (92% and 0.92 both give 92). */
const numbersIn = (text: string) =>
  [...text.matchAll(/(\d+(?:\.\d+)?)\s*(%)?/g)].map((m) => {
    const v = Number(m[1]);
    return m[2] ? v : v > 0 && v < 1 ? Math.round(v * 1000) / 10 : v;
  });

/** Repo truth check: a claim the code itself undercuts (a TODO for the feature, a hard-coded value for the number). */
export function repoTruth(claim: Claim, repo: RepoFacts | null): RuleResult | null {
  if (!repo) return null;
  const words = distinctive(claim.text);
  if (claim.type === "feature" || claim.type === "security_privacy" || claim.type === "scale") {
    const todo = repo.todos.find((t) => overlap(words, distinctive(t.summary)).length > 0);
    if (todo) {
      const feature = claim.featureName ?? claim.text.replace(/[.!?]+$/, "");
      return {
        verdict: {
          status: "contradicted",
          confidence: 0.75,
          evidence: [{ kind: "repo", ref: todo.ref, summary: todo.summary.slice(0, 160) }],
          suggestedRewrite: `Say ${feature} is planned, not built.`.slice(0, 140),
        },
        pending: false,
      };
    }
  }
  const claimed = numbersIn(claim.text).filter((n) => n !== 0);
  if (claimed.length > 0) {
    const mock = repo.mocks.find((m) => numbersIn(m.summary).some((n) => claimed.includes(n)));
    if (mock) {
      return {
        verdict: {
          status: "contradicted",
          confidence: 0.8,
          evidence: [{ kind: "repo", ref: mock.ref, summary: `The number is hard-coded on the demo path: ${mock.summary}`.slice(0, 160) }],
          suggestedRewrite: "Drop the number until an eval measures it.",
        },
        pending: false,
        fixTask: {
          title: `Replace the hard-coded value behind: "${claim.text.slice(0, 70)}"`,
          detail: `${mock.ref} returns a fixed value on the demo path.`,
          suggestedArtifact: "Compute the value from a real model call, and add an eval for it",
        },
      };
    }
  }
  return null;
}

const PLANNED = /\b(planned|coming soon|roadmap|not yet|todo|in progress|future|will (add|support|ship))\b/i;

/** Cross-source consistency: the spoken claim against the README and the written submission. */
export function crossSource(claim: Claim, docs: Docs): RuleResult | null {
  const sources = [
    ["README.md", docs.readme],
    ["Submission text", docs.submission],
  ] as const;
  const words = distinctive(claim.text);
  const claimed = numbersIn(claim.text);
  for (const [ref, text] of sources) {
    if (!text) continue;
    for (const sentence of text.split(/(?<=[.!?])\s+|\n+/)) {
      if (overlap(words, distinctive(sentence)).length === 0) continue;
      const written = numbersIn(sentence);
      const unit = /%/.test(claim.text) === /%/.test(sentence);
      if (claimed.length > 0 && written.length > 0 && unit && !written.some((n) => claimed.includes(n))) {
        return {
          verdict: {
            status: "contradicted",
            confidence: 0.6,
            evidence: [{ kind: "doc", ref, summary: `${ref} says: "${sentence.trim().slice(0, 120)}"` }],
            suggestedRewrite: "Use the same number everywhere, from the latest eval.",
          },
          pending: false,
        };
      }
      if (claim.type === "feature" && PLANNED.test(sentence)) {
        return {
          verdict: {
            status: "contradicted",
            confidence: 0.6,
            evidence: [{ kind: "doc", ref, summary: `${ref} lists it as not shipped: "${sentence.trim().slice(0, 110)}"` }],
            suggestedRewrite: "Say it is planned, as the written docs do.",
          },
          pending: false,
        };
      }
    }
  }
  return null;
}

export function verifyDeterministic(claim: Claim, latency: LatencyRecord[], repo: RepoFacts | null, docs: Docs = { readme: null, submission: null }): RuleResult | null {
  const truth = repoTruth(claim, repo) ?? crossSource(claim, docs);
  if (truth) return truth;
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
        suggestedRewrite: "Say how you measured it, or drop the number until an eval backs it.",
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
