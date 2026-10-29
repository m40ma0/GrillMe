import { createHash } from "node:crypto";
import { prompts } from "@stage-ready/ai";
import { criteria, eventSpecs, projects, sectionPlans } from "@stage-ready/db";
import { autoSectionPlan, enforceEventSpecQuotes, normalizeForMatch, type JobPayload } from "@stage-ready/shared";
import { and, eq, ne } from "drizzle-orm";
import { UserFacingError, type JobContext } from "../lib/context";
import { fetchPageText } from "../lib/fetch-page";

type Payload = Extract<JobPayload, { name: "event-ingest" }>;

export async function collectSources(urls: string[], text: string | undefined, ctx: JobContext, label: string) {
  const parts: { url: string | null; text: string }[] = [];
  for (const [i, url] of urls.entries()) {
    await ctx.progress({ pct: 5 + Math.round((i / Math.max(1, urls.length)) * 35), step: `Fetching ${label} ${i + 1} of ${urls.length}` });
    try {
      parts.push(await fetchPageText(url));
    } catch (error) {
      throw new UserFacingError(`Could not read ${url}: ${(error as Error).message} Paste the page text instead.`);
    }
  }
  if (text?.trim()) parts.push({ url: null, text: text.trim() });
  return parts;
}

export async function eventIngest(payload: Payload, ctx: JobContext) {
  const parts = await collectSources(payload.urls, payload.text, ctx, "page");
  const sourceText = parts.map((p) => (p.url ? `Source: ${p.url}\n${p.text}` : p.text)).join("\n\n");
  if (sourceText.trim().length < 20) throw new UserFacingError("The event text is too short to read criteria from.");
  const sourceHash = createHash("sha256").update(normalizeForMatch(sourceText)).digest("hex");

  const [project] = await ctx.db.select().from(projects).where(eq(projects.id, payload.projectId));
  if (!project) throw new UserFacingError("Project not found.");

  // EventSpecs are cached by source hash across the owner's projects.
  const [cached] = await ctx.db
    .select({ spec: eventSpecs })
    .from(eventSpecs)
    .innerJoin(projects, eq(projects.id, eventSpecs.projectId))
    .where(and(eq(eventSpecs.sourceHash, sourceHash), eq(projects.ownerId, project.ownerId), ne(eventSpecs.projectId, project.id)))
    .limit(1);

  let spec;
  let dropped: string[];
  let cachedCriteria: { name: string; description: string; weight: number; sourceQuote: string | null }[] | null = null;
  if (cached) {
    await ctx.progress({ pct: 70, step: "Reusing the EventSpec already extracted from this page" });
    const rows = await ctx.db.select().from(criteria).where(eq(criteria.eventSpecId, cached.spec.id)).orderBy(criteria.order);
    cachedCriteria = rows.map((r) => ({ name: r.name, description: r.description, weight: r.weight, sourceQuote: r.sourceQuote }));
    spec = {
      name: cached.spec.name,
      tracks: cached.spec.tracks,
      requiredTech: cached.spec.requiredTech,
      requirements: cached.spec.requirements,
      weightsInferred: cached.spec.weightsInferred,
      sourceQuotes: cached.spec.sourceQuotes,
      peopleNamed: cached.spec.peopleNamed,
      criteria: [],
    };
    dropped = cached.spec.droppedFields;
  } else {
    await ctx.progress({ pct: 45, step: "Extracting tracks, criteria and requirements" });
    const ai = await ctx.aiFor(project.id);
    const result = await ai.llm.generateObject(prompts.eventSpecV1({ sourceText, urls: payload.urls }));
    await ctx.progress({ pct: 80, step: "Checking every field against its source quote" });
    ({ value: spec, dropped } = enforceEventSpecQuotes(result.value, sourceText));
  }

  const values = {
    name: spec.name,
    sourceUrls: payload.urls,
    sourceHash,
    tracks: spec.tracks,
    requirements: spec.requirements,
    requiredTech: spec.requiredTech,
    deadlineAt: spec.requirements.deadlineIso ? new Date(spec.requirements.deadlineIso) : null,
    weightsInferred: spec.weightsInferred,
    sourceQuotes: spec.sourceQuotes,
    peopleNamed: spec.peopleNamed,
    droppedFields: dropped,
    confirmedAt: null,
  };
  const criteriaRows = cachedCriteria ?? spec.criteria.map((c, i) => ({ ...c, sourceQuote: spec.sourceQuotes[`criteria.${i}`] ?? null }));

  const eventSpecId = await ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .insert(eventSpecs)
      .values({ projectId: project.id, ...values })
      .onConflictDoUpdate({ target: eventSpecs.projectId, set: values })
      .returning({ id: eventSpecs.id });
    if (!row) throw new Error("EventSpec upsert returned no row.");
    await tx.delete(criteria).where(eq(criteria.eventSpecId, row.id));
    if (criteriaRows.length > 0) await tx.insert(criteria).values(criteriaRows.map((c, order) => ({ projectId: project.id, eventSpecId: row.id, order, ...c })));
    if (spec.requirements.videoMaxSec) {
      // The section plan is auto-filled from the event's video limit.
      const limit = Math.round(spec.requirements.videoMaxSec);
      await tx.update(projects).set({ videoLimitSec: limit }).where(eq(projects.id, project.id));
      await tx.delete(sectionPlans).where(eq(sectionPlans.projectId, project.id));
      await tx.insert(sectionPlans).values(autoSectionPlan(limit).map((s, order) => ({ projectId: project.id, order, ...s })));
    }
    return row.id;
  });

  await ctx.progress({ pct: 100, step: "EventSpec ready to review" });
  return { eventSpecId, criteria: criteriaRows.length, dropped, cached: Boolean(cached) };
}
