import { prompts } from "@stage-ready/ai";
import { pastWinners, projects, repoFindings, repos, sectionPlans, winningPatterns } from "@stage-ready/db";
import { normalizeForMatch } from "@stage-ready/shared";
import { asc, eq } from "drizzle-orm";
import type { JobContext } from "../lib/context";

export async function repoSignals(ctx: JobContext, projectId: string): Promise<string[] | null> {
  const [repo] = await ctx.db.select().from(repos).where(eq(repos.projectId, projectId));
  if (!repo?.commitSha) return null;
  const findings = await ctx.db.select({ kind: repoFindings.kind, summary: repoFindings.summary }).from(repoFindings).where(eq(repoFindings.repoId, repo.id));
  return [...repo.dependencies.map((d) => d.name), ...findings.filter((f) => f.kind === "capability" || f.kind === "dependency").map((f) => f.summary)];
}

/** Rebuilds winning patterns from the corpus and checks each one against the project. */
export async function synthesizePatterns(ctx: JobContext, projectId: string) {
  const winners = await ctx.db.select().from(pastWinners).where(eq(pastWinners.projectId, projectId));
  if (winners.length < 2) {
    await ctx.db.delete(winningPatterns).where(eq(winningPatterns.projectId, projectId));
    return 0;
  }
  const [project] = await ctx.db.select().from(projects).where(eq(projects.id, projectId));
  const plan = await ctx.db.select().from(sectionPlans).where(eq(sectionPlans.projectId, projectId)).orderBy(asc(sectionPlans.order));
  let plannedStrongestMomentSec: number | null = null;
  if (plan.length > 0) {
    let t = 0;
    for (const section of plan) {
      if (section.key === "demo") {
        plannedStrongestMomentSec = t + section.budgetSec / 2;
        break;
      }
      t += section.budgetSec;
    }
  }
  const ai = await ctx.aiFor(projectId);
  const { value } = await ai.llm.generateObject(
    prompts.winningPatternsV1({
      winners: winners.map((w) => ({ title: w.title, sourceUrl: w.sourceUrl, profile: w.profile })),
      plannedStrongestMomentSec,
      repoSignals: (await repoSignals(ctx, projectId)) ?? [],
      pitchScript: project?.pitchScript ?? "",
    }),
  );

  // Keep only evidence that cites a real winner with a quote from that winner's own source.
  const byTitle = new Map(winners.map((w) => [normalizeForMatch(w.title), w]));
  const patterns = value.patterns
    .map((p) => ({
      ...p,
      evidence: p.evidence.filter((e) => {
        const winner = byTitle.get(normalizeForMatch(e.winnerTitle));
        if (!winner) return false;
        const haystack = normalizeForMatch(
          [...Object.values(winner.profile.sourceQuotes), ...winner.profile.demoStructure, ...winner.profile.tech, winner.profile.inputType, winner.profile.outputType].join("\n"),
        );
        e.sourceUrl = winner.sourceUrl;
        return haystack.includes(normalizeForMatch(e.quote));
      }),
    }))
    .filter((p) => new Set(p.evidence.map((e) => e.winnerTitle)).size >= 2)
    .slice(0, 6);

  await ctx.db.transaction(async (tx) => {
    await tx.delete(winningPatterns).where(eq(winningPatterns.projectId, projectId));
    if (patterns.length > 0) await tx.insert(winningPatterns).values(patterns.map((p) => ({ projectId, ...p })));
  });
  return patterns.length;
}
