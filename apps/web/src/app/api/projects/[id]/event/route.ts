import { criteria, eventSpecs, projects } from "@stage-ready/db";
import { EventSpecUpdate } from "@stage-ready/shared";
import { eq } from "drizzle-orm";
import { ApiError, body, route } from "@/lib/server/api";
import { db } from "@/lib/server/db";
import { loadEventSpec, requireProject } from "@/lib/server/projects";

/** Saves the reviewed EventSpec. Criteria weights must sum to 100% (enforced by EventSpecUpdate). */
export const PATCH = route<{ id: string }>(async (req, { user, params }) => {
  const project = await requireProject(user.id, params.id);
  const input = await body(req, EventSpecUpdate);
  const [existing] = await db().select().from(eventSpecs).where(eq(eventSpecs.projectId, project.id));
  if (!existing) throw new ApiError(409, "no_event_spec", "Ingest the event page first.");
  const before = await db().select().from(criteria).where(eq(criteria.eventSpecId, existing.id));

  // A quote only survives while the value it supports is unchanged; edited values become user-supplied.
  const quotes: Record<string, string> = {};
  const keep = (key: string, same: boolean) => {
    const quote = existing.sourceQuotes[key];
    if (same && quote) quotes[key] = quote;
  };
  keep("name", input.name === existing.name);
  input.tracks.forEach((t, i) => keep(`tracks.${i}`, existing.tracks[i]?.name === t.name));
  input.requiredTech.forEach((t, i) => keep(`requiredTech.${i}`, existing.requiredTech[i] === t));
  for (const key of ["videoMaxSec", "repoPublic", "deadlineIso"] as const) keep(`requirements.${key}`, input.requirements[key] === existing.requirements[key]);
  const deadline = input.requirements.deadlineIso ? new Date(input.requirements.deadlineIso) : null;
  if (deadline && Number.isNaN(deadline.getTime())) throw new ApiError(400, "invalid_request", "The deadline is not a valid date.");

  await db().transaction(async (tx) => {
    if (input.requirements.videoMaxSec)
      await tx
        .update(projects)
        .set({ videoLimitSec: Math.round(input.requirements.videoMaxSec) })
        .where(eq(projects.id, project.id));
    await tx
      .update(eventSpecs)
      .set({
        name: input.name,
        tracks: input.tracks,
        requiredTech: input.requiredTech,
        requirements: input.requirements,
        deadlineAt: deadline,
        weightsInferred: input.weightsInferred,
        sourceQuotes: quotes,
        confirmedAt: new Date(),
      })
      .where(eq(eventSpecs.id, existing.id));
    await tx.delete(criteria).where(eq(criteria.eventSpecId, existing.id));
    await tx.insert(criteria).values(
      input.criteria.map((c, order) => {
        const prior = before.find((b) => b.id === c.id);
        // Existing criteria keep their id, so the editor still matches each one to its source quote after saving.
        return {
          ...(prior ? { id: prior.id } : {}),
          projectId: project.id,
          eventSpecId: existing.id,
          order,
          name: c.name,
          description: c.description,
          weight: c.weight,
          sourceQuote: prior && prior.name === c.name ? prior.sourceQuote : null,
        };
      }),
    );
  });
  return Response.json({ eventSpec: await loadEventSpec(project.id) });
});
