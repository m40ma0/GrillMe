import { criteria, eventSpecs, personas, sectionPlans } from "@stage-ready/db";
import { PERSONA_ROLE_LABEL } from "@stage-ready/shared";
import { asc, eq } from "drizzle-orm";
import { UsersRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { Studio } from "@/components/app/studio/studio";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { requireProject } from "@/lib/server/projects";
import { expectedTracker } from "@/lib/server/vision";

export const metadata: Metadata = { title: "Rehearsal Studio" };

export default async function RehearsePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  if (!user) return null;
  const project = await requireProject(user.id, projectId);
  const [personaRows, [spec], sections, expectedVision] = await Promise.all([
    db().select().from(personas).where(eq(personas.projectId, project.id)).orderBy(asc(personas.createdAt)),
    db().select().from(eventSpecs).where(eq(eventSpecs.projectId, project.id)),
    db().select().from(sectionPlans).where(eq(sectionPlans.projectId, project.id)).orderBy(asc(sectionPlans.order)),
    expectedTracker(project),
  ]);
  const criteriaRows = spec ? await db().select().from(criteria).where(eq(criteria.eventSpecId, spec.id)).orderBy(asc(criteria.order)) : [];
  if (personaRows.length === 0) {
    return (
      <EmptyState
        icon={UsersRound}
        action={
          <Button asChild>
            <Link href={`/projects/${project.id}/calibration`}>Build judges</Link>
          </Button>
        }
      >
        Build the three fictional judges in Calibration before you rehearse.
      </EmptyState>
    );
  }
  return (
    <Studio
      projectId={project.id}
      projectName={project.name}
      demoMode={project.demoMode}
      cloudUploadEnabled={project.cloudUploadEnabled}
      personas={personaRows.map((p) => ({ id: p.id, role: p.role, label: PERSONA_ROLE_LABEL[p.role], voicePreset: p.voicePreset, questionStyle: p.questionStyle }))}
      criteria={criteriaRows.map((c) => ({ id: c.id, name: c.name }))}
      sections={sections.map((s) => ({ key: s.key, title: s.title, budgetSec: s.budgetSec }))}
      expectedVision={expectedVision}
    />
  );
}
