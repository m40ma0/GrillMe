import type { Db } from "@stage-ready/db";
import { criteria, eventSpecs, latencySamples, loadAuditFacts, personas, projects, sectionPlans, sessions } from "@stage-ready/db";
import type { PersonaRole, SectionKey } from "@stage-ready/shared";
import { and, asc, desc, eq, isNotNull, ne } from "drizzle-orm";
import type { StepSample } from "../auditor/canned";
import type { Docs, RepoFacts } from "../auditor/rules";

export interface SessionContext {
  sessionId: string;
  projectId: string;
  projectName: string;
  demoMode: boolean;
  eventName: string;
  mode: "full_pitch" | "qa_only" | "section_drill";
  difficulty: number;
  drillSection: SectionKey | null;
  personas: { id: string; role: PersonaRole; questionStyle: string; criteriaWeights: Record<string, number>; voicePreset: string }[];
  criteria: { id: string; name: string; description: string; weight: number }[];
  sections: { key: SectionKey; title: string; budgetSec: number }[];
  repo: RepoFacts | null;
  docs: Docs;
  /** Earlier rehearsals' step hashes, for the canned-response detector. */
  priorSteps: StepSample[];
  ended: boolean;
}

export async function loadContext(db: Db, sessionId: string, projectId: string): Promise<SessionContext | null> {
  const [row] = await db
    .select({ session: sessions, project: projects })
    .from(sessions)
    .innerJoin(projects, eq(projects.id, sessions.projectId))
    .where(and(eq(sessions.id, sessionId), eq(sessions.projectId, projectId)));
  if (!row) return null;
  const [spec] = await db.select().from(eventSpecs).where(eq(eventSpecs.projectId, projectId));
  const [personaRows, criteriaRows, sectionRows] = await Promise.all([
    db.select().from(personas).where(eq(personas.projectId, projectId)).orderBy(asc(personas.createdAt)),
    spec ? db.select().from(criteria).where(eq(criteria.eventSpecId, spec.id)).orderBy(asc(criteria.order)) : Promise.resolve([]),
    db.select().from(sectionPlans).where(eq(sectionPlans.projectId, projectId)).orderBy(asc(sectionPlans.order)),
  ]);
  const facts = await loadAuditFacts(db, projectId);
  const prior = await db
    .select({ sessionId: latencySamples.sessionId, stepKey: latencySamples.stepKey, startMs: latencySamples.startMs, inputHash: latencySamples.inputHash, outputHash: latencySamples.outputHash })
    .from(latencySamples)
    .where(and(eq(latencySamples.projectId, projectId), ne(latencySamples.sessionId, sessionId), isNotNull(latencySamples.outputHash)))
    .orderBy(desc(latencySamples.createdAt))
    .limit(500);
  const summary = row.session.summary ?? {};
  return {
    sessionId,
    projectId,
    projectName: row.project.name,
    demoMode: row.project.demoMode,
    eventName: spec?.name || row.project.name,
    mode: row.session.mode,
    difficulty: typeof summary.difficulty === "number" ? summary.difficulty : 3,
    drillSection: (typeof summary.drillSection === "string" ? summary.drillSection : null) as SectionKey | null,
    personas: personaRows.map((p) => ({ id: p.id, role: p.role, questionStyle: p.questionStyle, criteriaWeights: p.criteriaWeights, voicePreset: p.voicePreset })),
    criteria: criteriaRows.map((c) => ({ id: c.id, name: c.name, description: c.description, weight: c.weight })),
    sections: sectionRows.map((s) => ({ key: s.key, title: s.title, budgetSec: s.budgetSec })),
    repo: facts.repo,
    docs: facts.docs,
    priorSteps: prior,
    ended: row.session.endedAt !== null,
  };
}
