import { z } from "zod";

export const criterionSchema = z.object({
  id: z.string(), name: z.string(), description: z.string(), weight: z.number().min(0).max(100),
  source: z.string().nullable(), inferred: z.boolean().default(false),
});

export const eventSpecSchema = z.object({
  name: z.string(), tracks: z.array(z.string()), criteria: z.array(criterionSchema),
  requiredTechnology: z.array(z.string()), videoLimitSeconds: z.number().positive().nullable(),
  deadline: z.string().datetime().nullable(), sourceUrl: z.string().url().nullable(),
});

export const winnerProfileSchema = z.object({
  name: z.string(), inputType: z.string().nullable(), outputType: z.string().nullable(),
  demoStructure: z.array(z.string()), strongestMomentSeconds: z.number().nonnegative().nullable(),
  domain: z.string().nullable(), track: z.string().nullable(), technology: z.array(z.string()),
  sourceUrl: z.string().url(),
});

export const claimSchema = z.object({
  text: z.string(), type: z.enum(["performance", "accuracy", "feature", "security_privacy", "scale", "comparison", "market"]),
  status: z.enum(["verified", "contradicted", "unverified", "not_shown"]),
  evidence: z.string().nullable(), timestampSeconds: z.number().nonnegative().nullable(),
});

export const demoModeProject = {
  name: "Signal Garden",
  tagline: "Turn noisy field reports into a clear response plan.",
  timezone: "Asia/Singapore",
  event: {
    name: "Global AI Builder Showcase (fictional)",
    tracks: ["Applied AI"],
    criteria: [
      { id: "impact", name: "Real-world impact", description: "Clear user need and measurable value.", weight: 30, source: "Demo Mode fixture", inferred: false },
      { id: "technical", name: "Technical execution", description: "A working, well-integrated AI system.", weight: 30, source: "Demo Mode fixture", inferred: false },
      { id: "experience", name: "User experience", description: "An understandable and useful experience.", weight: 20, source: "Demo Mode fixture", inferred: false },
      { id: "originality", name: "Originality", description: "A distinctive approach to the problem.", weight: 20, source: "Demo Mode fixture", inferred: false },
    ],
    requiredTechnology: ["Generative AI"], videoLimitSeconds: 180,
    deadline: "2026-11-05T02:00:00.000Z", sourceUrl: null,
  },
  winners: [
    { name: "Mossline (fictional)", inputType: "Sensor readings", outputType: "Irrigation plan", demoStructure: ["Show noisy readings", "Generate plan", "Explain water saved"], strongestMomentSeconds: 42, domain: "Agriculture", track: "Applied AI", technology: ["LLM", "time series"], sourceUrl: "https://example.com/winners/mossline" },
    { name: "ClearRoute (fictional)", inputType: "Incident reports", outputType: "Response map", demoStructure: ["Describe dispatch problem", "Resolve an incident", "Show route impact"], strongestMomentSeconds: 55, domain: "Public safety", track: "Applied AI", technology: ["computer vision", "LLM"], sourceUrl: "https://example.com/winners/clearroute" },
    { name: "TideNote (fictional)", inputType: "Coastal observations", outputType: "Risk bulletin", demoStructure: ["Enter observation", "Compare locations", "Publish bulletin"], strongestMomentSeconds: 37, domain: "Climate", track: "Applied AI", technology: ["multimodal AI"], sourceUrl: "https://example.com/winners/tidenote" },
    { name: "CareLedger (fictional)", inputType: "Care notes", outputType: "Follow-up checklist", demoStructure: ["Show fragmented notes", "Extract actions", "Confirm with clinician"], strongestMomentSeconds: 48, domain: "Healthcare", track: "Applied AI", technology: ["speech recognition", "LLM"], sourceUrl: "https://example.com/winners/careledger" },
  ],
} as const;
