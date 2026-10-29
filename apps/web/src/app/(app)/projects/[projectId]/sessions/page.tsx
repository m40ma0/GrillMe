import { ListChecks } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { sessions } from "@stage-ready/db";
import { desc, eq } from "drizzle-orm";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCurrentUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { requireProject } from "@/lib/server/projects";

export const metadata: Metadata = { title: "Sessions" };

const MODE = { full_pitch: "Full pitch", qa_only: "Q&A only", section_drill: "Section drill" } as const;

export default async function SessionsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  if (!user) return null;
  const project = await requireProject(user.id, projectId);
  const rows = await db().select().from(sessions).where(eq(sessions.projectId, project.id)).orderBy(desc(sessions.createdAt));
  return (
    <div className="grid gap-6">
      <PageHeader title="Sessions" description="Every recorded rehearsal for this project." />
      {rows.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          action={
            <Button asChild>
              <Link href={`/projects/${project.id}/rehearse`}>Start rehearsal</Link>
            </Button>
          }
        >
          No rehearsals yet.
        </EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Started</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead className="text-right">Length</TableHead>
              <TableHead className="text-right">Score</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <Link className="text-primary hover:underline" href={`/projects/${project.id}/sessions/${s.id}`}>
                    {s.startedAt ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: project.timezone }).format(s.startedAt) : "Not started"}
                  </Link>
                </TableCell>
                <TableCell>{MODE[s.mode]}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{s.startedAt && s.endedAt ? `${Math.round((s.endedAt.getTime() - s.startedAt.getTime()) / 1000)} s` : "–"}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{typeof s.summary?.score === "number" ? s.summary.score : "–"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
