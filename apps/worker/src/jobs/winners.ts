import { prompts } from "@stage-ready/ai";
import { pastWinners } from "@stage-ready/db";
import { enforceWinnerQuotes, type JobPayload } from "@stage-ready/shared";
import { UserFacingError, type JobContext } from "../lib/context";
import { collectSources } from "./event-ingest";
import { synthesizePatterns } from "./patterns";

type Payload = Extract<JobPayload, { name: "winners" }>;

export async function winners(payload: Payload, ctx: JobContext) {
  const parts = await collectSources(payload.urls, payload.text, ctx, "winner page");
  const ai = await ctx.aiFor(payload.projectId);
  let added = 0;
  for (const [i, part] of parts.entries()) {
    await ctx.progress({ pct: 40 + Math.round((i / parts.length) * 40), step: `Extracting winner profiles from source ${i + 1} of ${parts.length}` });
    const { value } = await ai.llm.generateObject(prompts.winnerProfileV1({ pageText: part.text, url: part.url }));
    const profiles = value.winners.map((w) => enforceWinnerQuotes(w, part.text).value).filter((w) => w.title !== "unknown");
    if (profiles.length > 0) {
      await ctx.db.insert(pastWinners).values(profiles.map((profile) => ({ projectId: payload.projectId, sourceUrl: part.url, title: profile.title, placement: profile.placement, profile })));
      added += profiles.length;
    }
  }
  if (added === 0) throw new UserFacingError("No winners found. Use a results page that names each winner and their placement, or paste that text.");
  await ctx.progress({ pct: 85, step: "Deriving winning patterns" });
  const patterns = await synthesizePatterns(ctx, payload.projectId);
  await ctx.progress({ pct: 100, step: `${added} winner profile${added === 1 ? "" : "s"} added` });
  return { added, patterns };
}
