"use client";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProjectBundle } from "@/lib/types";
import { ComplianceCard } from "./compliance-card";
import { EventSpecEditor } from "./event-spec-editor";
import { PatternsList } from "./patterns-list";
import { PersonaCards } from "./persona-cards";
import { RepoPanel } from "./repo-panel";
import { SourcesForm } from "./sources-form";
import { SubmissionEditor } from "./submission-editor";
import { TrackCard } from "./track-card";
import { WinnersTable } from "./winners-table";

export function CalibrationClient({ bundle }: { bundle: ProjectBundle }) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const spec = bundle.eventSpec;
  if (!spec) return null;
  return (
    <div className="grid gap-6">
      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>EventSpec</CardTitle>
            <CardDescription>Weights must total 100% before they can be saved.</CardDescription>
          </CardHeader>
          <CardContent>
            <EventSpecEditor key={spec.criteria.map((c) => c.id + c.weight).join()} projectId={bundle.project.id} spec={spec} timezone={bundle.project.timezone} onSaved={refresh} />
          </CardContent>
        </Card>
        <div className="grid content-start gap-6">
          <ComplianceCard items={bundle.compliance} />
          <Card>
            <CardHeader>
              <CardTitle>Track recommendation</CardTitle>
            </CardHeader>
            <CardContent>
              <TrackCard projectId={bundle.project.id} hasTracks={spec.tracks.length > 0} />
            </CardContent>
          </Card>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Judges</CardTitle>
          <CardDescription>Fictional personas built only from the published criteria. No real judge&apos;s name, photo, voice or style is used.</CardDescription>
        </CardHeader>
        <CardContent>
          <PersonaCards projectId={bundle.project.id} personas={bundle.personas} canGenerate={spec.criteria.length > 0} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Past winners</CardTitle>
          <CardDescription>Every profile field links to its source.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <WinnersTable winners={bundle.winners} />
          <details>
            <summary className="text-primary cursor-pointer text-sm">Add winners</summary>
            <div className="mt-4">
              <SourcesForm
                projectId={bundle.project.id}
                jobName="winners"
                endpoint={`/api/projects/${bundle.project.id}/winners`}
                urlLabel="Winner or results page URLs"
                textLabel="Or paste the winner text"
                submitLabel="Read winners"
                jobTitle="Winner profiles"
                onDone={refresh}
              />
            </div>
          </details>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Winning patterns</CardTitle>
          <CardDescription>Each pattern cites at least two winners and is checked against your project.</CardDescription>
        </CardHeader>
        <CardContent>
          <PatternsList patterns={bundle.patterns} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Repo</CardTitle>
        </CardHeader>
        <CardContent>
          <RepoPanel projectId={bundle.project.id} repo={bundle.repo} onDone={refresh} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Written submission</CardTitle>
          <CardDescription>Spoken claims are checked against this and the repo README; mismatches show in the claim ledger.</CardDescription>
        </CardHeader>
        <CardContent>
          <SubmissionEditor projectId={bundle.project.id} initial={bundle.project.submissionText} />
        </CardContent>
      </Card>
    </div>
  );
}
