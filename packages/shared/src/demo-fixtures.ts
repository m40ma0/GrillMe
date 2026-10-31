import type { EventSpecExtraction, Persona, RepoFinding, WinningPattern } from "./calibration";
import type { ClaimStatus, ClaimType, WinnerProfile } from "./core";
import type { SectionKey } from "./project";

// Demo Mode fixtures. Everything here is fictional and is the only place
// fixture data is allowed (see BUILD_PROMPT "Hard rules").

export const DEMO_PROJECT_NAME = "Signal Garden";

export const demoEventPageText = `Global AI Builder Showcase (fictional)
Build an applied AI product that helps people act on messy real-world information.
Track: Applied AI. Products that turn unstructured input into decisions people can act on.
Judging criteria
Real-world impact (30%): Clear user need and measurable value.
Technical execution (30%): A working, well-integrated AI system.
User experience (20%): An understandable and useful experience.
Originality (20%): A distinctive approach to the problem.
Every project must use a generative AI model.
Submit a demo video of no more than 3 minutes and a public code repository.
Submissions close November 5, 2026 at 10:00 AM SGT (2026-11-05T02:00:00Z).
Judges: Avery Example and Jordan Placeholder.`;

export const demoEventSpec: EventSpecExtraction = {
  name: "Global AI Builder Showcase (fictional)",
  tracks: [{ name: "Applied AI", description: "Products that turn unstructured input into decisions people can act on." }],
  criteria: [
    { name: "Real-world impact", description: "Clear user need and measurable value.", weight: 0.3 },
    { name: "Technical execution", description: "A working, well-integrated AI system.", weight: 0.3 },
    { name: "User experience", description: "An understandable and useful experience.", weight: 0.2 },
    { name: "Originality", description: "A distinctive approach to the problem.", weight: 0.2 },
  ],
  weightsInferred: false,
  requiredTech: ["generative AI"],
  requirements: { videoMaxSec: 180, repoPublic: true, deadlineIso: "2026-11-05T02:00:00Z" },
  sourceQuotes: {
    name: "Global AI Builder Showcase (fictional)",
    "tracks.0": "Track: Applied AI. Products that turn unstructured input into decisions people can act on.",
    "criteria.0": "Real-world impact (30%): Clear user need and measurable value.",
    "criteria.0.weight": "Real-world impact (30%)",
    "criteria.1": "Technical execution (30%): A working, well-integrated AI system.",
    "criteria.1.weight": "Technical execution (30%)",
    "criteria.2": "User experience (20%): An understandable and useful experience.",
    "criteria.2.weight": "User experience (20%)",
    "criteria.3": "Originality (20%): A distinctive approach to the problem.",
    "criteria.3.weight": "Originality (20%)",
    "requiredTech.0": "Every project must use a generative AI model.",
    "requirements.videoMaxSec": "a demo video of no more than 3 minutes",
    "requirements.repoPublic": "a public code repository",
    "requirements.deadlineIso": "Submissions close November 5, 2026 at 10:00 AM SGT (2026-11-05T02:00:00Z)",
  },
  peopleNamed: ["Avery Example", "Jordan Placeholder"],
};

const winner = (w: Omit<WinnerProfile, "sourceQuotes">, quote: string): WinnerProfile => ({
  ...w,
  sourceQuotes: Object.fromEntries(["title", "placement", "inputType", "outputType", "demoStructure", "strongestMomentSec", "domain", "track", "tech"].map((k) => [k, quote])),
});

export const demoWinners: { sourceUrl: string; profile: WinnerProfile }[] = [
  {
    sourceUrl: "https://example.com/fictional-winners/mossline",
    profile: winner(
      {
        title: "Mossline (fictional)",
        placement: "1st place",
        inputType: "Sensor readings",
        outputType: "Irrigation plan",
        demoStructure: ["Show noisy readings", "Generate plan", "Explain water saved"],
        strongestMomentSec: 42,
        domain: "Agriculture",
        track: "Applied AI",
        tech: ["LLM", "time series"],
      },
      "Mossline turned noisy soil sensor readings into an irrigation plan, revealed at 0:42.",
    ),
  },
  {
    sourceUrl: "https://example.com/fictional-winners/clearroute",
    profile: winner(
      {
        title: "ClearRoute (fictional)",
        placement: "2nd place",
        inputType: "Incident reports",
        outputType: "Response map",
        demoStructure: ["Describe dispatch problem", "Resolve an incident", "Show route impact"],
        strongestMomentSec: 55,
        domain: "Public safety",
        track: "Applied AI",
        tech: ["computer vision", "LLM"],
      },
      "ClearRoute converted free-text incident reports into a live response map at 0:55.",
    ),
  },
  {
    sourceUrl: "https://example.com/fictional-winners/tidenote",
    profile: winner(
      {
        title: "TideNote (fictional)",
        placement: "3rd place",
        inputType: "Coastal observations",
        outputType: "Risk bulletin",
        demoStructure: ["Enter observation", "Compare locations", "Publish bulletin"],
        strongestMomentSec: 37,
        domain: "Climate",
        track: "Applied AI",
        tech: ["multimodal AI"],
      },
      "TideNote published a coastal risk bulletin from field observations at 0:37.",
    ),
  },
  {
    sourceUrl: "https://example.com/fictional-winners/careledger",
    profile: winner(
      {
        title: "CareLedger (fictional)",
        placement: "Honourable mention",
        inputType: "Care notes",
        outputType: "Follow-up checklist",
        demoStructure: ["Show fragmented notes", "Extract actions", "Confirm with clinician"],
        strongestMomentSec: 48,
        domain: "Healthcare",
        track: "Applied AI",
        tech: ["speech recognition", "LLM"],
      },
      "CareLedger extracted a follow-up checklist from fragmented care notes at 0:48.",
    ),
  },
];

export const demoPatterns: WinningPattern[] = [
  {
    statement: "Winners turned messy input into structured output on screen.",
    evidence: [
      { winnerTitle: "Mossline (fictional)", quote: "turned noisy soil sensor readings into an irrigation plan", sourceUrl: "https://example.com/fictional-winners/mossline" },
      { winnerTitle: "ClearRoute (fictional)", quote: "converted free-text incident reports into a live response map", sourceUrl: "https://example.com/fictional-winners/clearroute" },
    ],
    check: "Your demo shows a raw field report becoming a response plan.",
    checkResult: "pass",
    checkDetail: "Demo step 3 'Generate response plan' shows the transformation.",
  },
  {
    statement: "The strongest moment lands within the first minute.",
    evidence: [
      { winnerTitle: "TideNote (fictional)", quote: "at 0:37", sourceUrl: "https://example.com/fictional-winners/tidenote" },
      { winnerTitle: "Mossline (fictional)", quote: "revealed at 0:42", sourceUrl: "https://example.com/fictional-winners/mossline" },
    ],
    check: "Your plan reaches the response plan reveal before 60 s.",
    checkResult: "fail",
    checkDetail: "Hook and Problem take 39 s and the reveal is 30 s into the Demo section, at about 69 s.",
  },
  {
    statement: "Winners named a measurable outcome.",
    evidence: [
      { winnerTitle: "Mossline (fictional)", quote: "Explain water saved", sourceUrl: "https://example.com/fictional-winners/mossline" },
      { winnerTitle: "ClearRoute (fictional)", quote: "Show route impact", sourceUrl: "https://example.com/fictional-winners/clearroute" },
    ],
    check: "Your Impact section cites a measured result.",
    checkResult: "unknown",
    checkDetail: "No measured outcome is attached yet.",
  },
];

export const demoPersonas: Persona[] = [
  {
    role: "technical",
    difficulty: 3,
    criteriaWeights: { "Technical execution": 0.7, Originality: 0.3 },
    questionStyle: "Asks how it works and for evaluation evidence behind every number.",
    voicePreset: "preset-a",
    isFictional: true,
  },
  {
    role: "impact",
    difficulty: 3,
    criteriaWeights: { "Real-world impact": 0.8, Originality: 0.2 },
    questionStyle: "Asks who the user is and what measured outcome changed for them.",
    voicePreset: "preset-b",
    isFictional: true,
  },
  {
    role: "product",
    difficulty: 3,
    criteriaWeights: { "User experience": 0.7, "Real-world impact": 0.3 },
    questionStyle: "Asks about adoption, workflow fit and what happens when the system is wrong.",
    voicePreset: "preset-c",
    isFictional: true,
  },
];

export const demoRepo = {
  githubFullName: "fictional-org/signal-garden",
  commitSha: "0000000000000000000000000000000000demo00",
  visibility: "public" as const,
  findings: [
    { kind: "dependency", filePath: "package.json", line: 14, summary: "Uses a generative AI SDK for summaries.", severity: "info" },
    { kind: "capability", filePath: "src/summarize.ts", line: 22, summary: "Generates a response plan from a field report with an LLM call.", severity: "info" },
    { kind: "todo", filePath: "src/offline.ts", line: 3, summary: "TODO: implement offline queue (claimed in the pitch).", severity: "medium" },
    { kind: "mock_response", filePath: "src/classifier.ts", line: 41, summary: "Returns a hard-coded confidence of 0.92 on the demo path.", severity: "high" },
    { kind: "test", filePath: "src/summarize.test.ts", line: null, summary: "4 tests cover summary formatting; none cover accuracy.", severity: "low" },
  ] satisfies RepoFinding[],
};

export const demoReadme = `# Signal Garden (fictional)

Signal Garden turns noisy field reports into a response plan for coordinators.

## Features
- Groups reports by location.
- Compares the latest incident with previous reports.
- Offline mode is on the roadmap.

## Evaluation
The classifier reaches 89% accuracy on 200 labelled reports.`;

export const demoSubmissionText = "Signal Garden helps field coordinators turn messy reports into a response plan in seconds, grouped by location.";

export const demoPitchScript = `Hook: Field teams send hundreds of messy reports a day. Signal Garden turns them into a response plan in seconds.
Problem: Coordinators copy and paste reports into spreadsheets and miss the urgent ones.
Demo: Open the report inbox, select a field report, generate the response plan, compare incident history, review the follow-up checklist.
How it works: An LLM extracts entities and urgency, then groups reports by location.
Impact: Coordinators triage faster and follow up on every urgent report.
Close: Signal Garden. Every report, a plan.`;

export const demoSession = {
  mode: "full_pitch" as const,
  durationMs: 171_000,
  transcript: [
    "We turn noisy field reports into a clear response plan.",
    "The summary is instant.",
    "Signal Garden supports offline mode.",
    "We use encrypted storage.",
    "The dashboard groups reports by location.",
    "Our classifier reaches 92% accuracy.",
    "Teams can compare the latest incident with previous reports.",
    "Our customers save hours every week.",
  ],
  claims: [
    { type: "feature", status: "verified", evidence: { kind: "frame", ref: "00:12", summary: "Result panel visible at 00:12" }, rewrite: null },
    {
      type: "performance",
      status: "contradicted",
      evidence: { kind: "latency", ref: "Generate summary: 9.2 s", summary: "Measured 9.2 s from click to result" },
      rewrite: "The summary is ready in about 9 seconds.",
    },
    { type: "feature", status: "not_shown", evidence: { kind: "frame", ref: "demo section", summary: "No offline step shown in the recording" }, rewrite: null },
    { type: "security_privacy", status: "unverified", evidence: { kind: "repo", ref: "package.json", summary: "No encryption library found in dependencies" }, rewrite: null },
    { type: "feature", status: "verified", evidence: { kind: "frame", ref: "00:41", summary: "Location grouping visible at 00:41" }, rewrite: null },
    { type: "accuracy", status: "unverified", evidence: { kind: "repo", ref: "src/classifier.ts:41", summary: "Hard-coded 0.92 confidence; no eval file" }, rewrite: null },
    { type: "feature", status: "verified", evidence: { kind: "frame", ref: "01:03", summary: "Comparison view visible at 01:03" }, rewrite: null },
    { type: "market", status: "unverified", evidence: { kind: "doc", ref: "README.md", summary: "No customer data cited" }, rewrite: null },
  ] satisfies { type: ClaimType; status: ClaimStatus; evidence: { kind: "frame" | "latency" | "repo" | "test" | "doc"; ref: string; summary: string }; rewrite: string | null }[],
  latency: [
    ["generate_summary", 9200],
    ["load_comparison", 640],
    ["filter_reports", 510],
  ] as const,
  judgeTurns: [
    { role: "technical", atMs: 95_000, text: "How did you evaluate the 92% accuracy figure?", trigger: "claim" },
    { role: "impact", atMs: 128_000, text: "What evidence shows this changes responder outcomes?", trigger: "coverage_gap" },
    { role: "product", atMs: 153_000, text: "Who owns follow-up when the system is wrong?", trigger: "qa_phase" },
  ] as const,
};

/** Words spread evenly over a duration, for fixture transcripts. */
export function spreadWords(text: string, durationMs: number, leadMs = 300): { text: string; startMs: number; endMs: number }[] {
  const words = text.split(/\s+/).filter(Boolean);
  const span = Math.max(1, durationMs - 2 * leadMs) / Math.max(1, words.length);
  return words.map((w, i) => ({ text: w, startMs: Math.round(leadMs + i * span), endMs: Math.round(leadMs + (i + 0.8) * span) }));
}

export const DEMO_STRONGEST_MOMENT = "Signal Garden turns a messy field report into a response plan.";

/** Two fixture takes per section: the first is the stronger, tighter one; the second has fillers, overruns or a weaker hook. */
export const demoTakeScripts: Record<SectionKey, [string, string]> = {
  hook: [
    "Field teams send hundreds of messy reports a day. Watch Signal Garden turn a messy field report into a response plan, right here, while you watch. Every urgent report gets a plan and an owner.",
    "Um, so, basically, coordinators have a lot of reports, and, like, it is hard. We built something to help with that, and I think you will really like what it does for teams in the field.",
  ],
  problem: [
    "Coordinators copy reports into spreadsheets by hand. Urgent reports get buried under routine ones, and follow-ups slip through the cracks. In one pilot team, two urgent reports a week waited more than a day before anyone saw them, and nobody knew who owned the next step. That is the problem.",
    "So the problem is, um, that coordinators have, like, a lot of manual work, basically, with spreadsheets. And it is slow. And reports get lost sometimes. And people are busy. So, yeah, it is a real problem for, um, a lot of teams that we talked to, and they all said the same thing really, that it is hard.",
  ],
  demo: [
    "Here is the report inbox with today's field reports. I select a report about a blocked road near the river. Signal Garden reads it, pulls out the location, urgency and people affected, and generates a response plan. The plan groups this report with two nearby ones, assigns an owner and sets a follow-up time. I compare it with the last incident at the same bridge, then review the checklist the coordinator will send. From raw text to a plan the team can act on, in one screen, with every step visible and editable before anything goes out to the field.",
    "So this is the inbox. Um, I click here. And, uh, it is loading. Basically it reads the report. Now there is a plan, it is instant. And, like, here are the groups. And here is a comparison. I think it is really useful. And this is the checklist. So that is the demo, and it works really well, and the classifier is 92% accurate, and it also works offline, so teams can use it anywhere they go in the field without any signal.",
  ],
  how: [
    "Under the hood, a language model extracts entities and urgency from each report. Reports are clustered by location, and a rules layer turns each cluster into a plan with an owner and a deadline. A coordinator reviews every plan before it is sent, so a person stays accountable for each follow-up.",
    "How it works is, um, we use AI. Basically the AI reads it and, like, figures it out. Then there is some clustering and, uh, some rules. And then the plan comes out. It is pretty smart. We used a lot of good libraries. I think that covers how it works, more or less, at a high level.",
  ],
  impact: [
    "In our pilot with two teams, urgent reports were triaged in four minutes instead of twenty five, and no urgent report waited overnight. Coordinators told us they finally trust that nothing is buried. That is time back for responders, and safer outcomes for people in the field.",
    "The impact is, um, really big. Teams save, like, a lot of time. And it is better for everyone. Basically, it changes how coordinators work, and responders are happier. We think it could help a lot of people all over the world in many different industries.",
  ],
  close: [
    "Signal Garden. Every field report, a plan, an owner and a follow-up. Thank you, we would love your questions.",
    "So, um, yeah, that is Signal Garden. Thanks for listening, and, uh, basically we hope you liked it and that you will vote for us.",
  ],
};

export const demoTakes: Record<SectionKey, [number, number]> = {
  hook: [14_500, 17_000],
  problem: [24_000, 27_500],
  demo: [58_000, 63_000],
  how: [32_000, 36_000],
  impact: [27_000, 31_000],
  close: [13_000, 16_000],
};

export const demoSteps = ["Open report inbox", "Select field report", "Generate response plan", "Compare incident history", "Review follow-up checklist"].map((name, i) => ({
  name,
  maxDurationMs: [10_000, 8_000, 15_000, 10_000, 8_000][i] ?? 10_000,
  fallbackInMs: i * 12_000,
  fallbackOutMs: i * 12_000 + 8_000,
  narration: `Here you can see the app ${name.toLowerCase()}.`,
}));

/** Criterion name → section → coverage score (0–1) for the recorded rehearsal. */
export const demoRubricHeatmap: Record<string, Partial<Record<SectionKey, number>>> = {
  "Real-world impact": { hook: 0.7, problem: 0.8, demo: 0.5, how: 0.2, impact: 0.4, close: 0.6 },
  "Technical execution": { hook: 0.2, problem: 0.1, demo: 0.8, how: 0.7, impact: 0.2, close: 0.3 },
  "User experience": { hook: 0.3, problem: 0.4, demo: 0.9, how: 0.3, impact: 0.3, close: 0.2 },
  Originality: { hook: 0.6, problem: 0.3, demo: 0.5, how: 0.6, impact: 0.2, close: 0.4 },
};

/**
 * Demo Mode speech: the scripted STT replays these lines, one per detected utterance, so a rehearsal
 * works with no speech model. Pitch first, then answers for the Q&A phase.
 */
export const demoRehearsalScript = [
  "Field teams send hundreds of messy reports every day.",
  "Signal Garden turns noisy field reports into a clear response plan.",
  "The summary is instant.",
  "Our classifier reaches 92% accuracy.",
  "We use encrypted storage for every report.",
  "The dashboard groups reports by location so coordinators see clusters.",
  "Signal Garden supports offline mode.",
  "Teams can compare the latest incident with previous reports.",
  "Coordinators triage faster and follow up on every urgent report.",
  "Signal Garden. Every report, a plan.",
  "It kind of depends on the team.",
  "We measured 92% on 200 labelled reports from two pilot teams last month.",
  "A coordinator reviews every plan before it goes out, so a person owns each follow-up.",
  "In our pilot, urgent reports were triaged in 4 minutes instead of 25.",
];

/** The Demo Mode golden run, shipped with the web app (apps/web/public; re-record with `pnpm --filter @stage-ready/web fallback-clip`). */
export const DEMO_FALLBACK_CLIP = "/demo/fallback-golden-run.mp4";
