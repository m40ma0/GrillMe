"use client";
import { useQuery } from "@tanstack/react-query";
import { FolderGit2, GitBranch, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useJob, useLatestJob } from "@/hooks/use-job";
import { api } from "@/lib/api-client";
import type { RepoDTO } from "@/lib/types";
import { ErrorAlert } from "./error-alert";
import { JobProgress } from "./job-progress";

const KIND_LABEL: Record<string, string> = {
  dependency: "Dependencies",
  capability: "Capabilities",
  test: "Test files",
  todo: "TODOs",
  mock_response: "Possible mock responses",
  secret: "Committed secrets",
};

export function RepoSummary({ repo, onRetry }: { repo: RepoDTO; onRetry?: () => void }) {
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <FolderGit2 size={16} aria-hidden /> {repo.githubFullName}
        </span>
        {repo.commitSha ? <span className="text-muted-foreground font-mono text-xs">{repo.commitSha.slice(0, 7)}</span> : null}
        <span className="text-muted-foreground">{repo.visibility === "unknown" ? "Visibility unknown" : repo.visibility === "public" ? "Public" : "Private"}</span>
        {repo.fileCount !== null ? (
          <span className="text-muted-foreground">
            <span className="font-mono tabular-nums">{repo.fileCount}</span> files read
          </span>
        ) : null}
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {Object.entries(KIND_LABEL).map(([kind, label]) => (
          <div key={kind} className="rounded-lg border p-3">
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="font-mono text-lg tabular-nums">{repo.findingCounts[kind as keyof RepoDTO["findingCounts"]] ?? 0}</dd>
          </div>
        ))}
      </dl>
      {repo.capabilitiesError ? (
        <div role="alert" className="text-status-unverified-foreground flex flex-wrap items-start gap-2 rounded-lg border p-3 text-sm">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 break-words">Capabilities unavailable: {repo.capabilitiesError} Dependencies, tests, TODOs and secrets were still scanned.</span>
          {onRetry ? (
            <Button size="sm" variant="outline" onClick={onRetry}>
              Retry
            </Button>
          ) : null}
        </div>
      ) : null}
      {repo.topFindings.filter((f) => f.severity === "high" || f.severity === "medium").length > 0 ? (
        <ul className="grid gap-1">
          {repo.topFindings
            .filter((f) => f.severity === "high" || f.severity === "medium")
            .slice(0, 8)
            .map((f) => (
              <li key={f.id} className="text-xs">
                <code className="font-mono">
                  {f.filePath}
                  {f.line ? `:${f.line}` : ""}
                </code>{" "}
                <span className="text-muted-foreground">{f.summary}</span>
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  );
}

/** GitHub picker (when signed in with GitHub) or owner/name entry, then digest progress. */
export function RepoPanel({ projectId, repo, onDone }: { projectId: string; repo: RepoDTO | null; onDone: () => void }) {
  const [fullName, setFullName] = useState(repo?.githubFullName ?? "");
  const [ref, setRef] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [starting, setStarting] = useState(false);
  // While the picker is open (or closing), the next click would be swallowed; the button waits for the selection.
  const [pickerOpen, setPickerOpen] = useState(false);
  const picker = useQuery({ queryKey: ["github-repos"], queryFn: () => api<{ signedIn: boolean; repos: { fullName: string; private: boolean }[] }>("/api/github/repos"), staleTime: 60_000 });
  // A digest started before a reload (or whose start request failed after queuing) is picked back up.
  const latest = useLatestJob(projectId, "repo-digest", jobId === null);
  useEffect(() => {
    const job = latest.data?.job;
    if (jobId === null && job && job.state !== "completed") setJobId(job.id);
  }, [latest.data, jobId]);

  const submit = async () => {
    if (starting) return;
    setError(null);
    setStarting(true);
    try {
      const { jobId: id } = await api<{ jobId: string }>(`/api/projects/${projectId}/repo`, { method: "POST", json: { githubFullName: fullName.trim(), ...(ref.trim() ? { ref: ref.trim() } : {}) } });
      setJobId(id);
    } catch (e) {
      setError(e);
      void latest.refetch();
    } finally {
      setStarting(false);
    }
  };
  const status = useJob(jobId);
  const running = jobId !== null && status.data?.state !== "completed" && status.data?.state !== "failed" && !status.error;

  return (
    <div className="grid gap-4">
      {repo ? <RepoSummary repo={repo} onRetry={submit} /> : null}
      <div className="grid gap-3 md:grid-cols-[1fr_12rem_auto] md:items-end">
        <div className="grid gap-2">
          <Label htmlFor="repo-name">Repository</Label>
          {picker.data?.signedIn && picker.data.repos.length > 0 ? (
            <Select value={fullName} onValueChange={setFullName} onOpenChange={(open) => setPickerOpen(open)}>
              <SelectTrigger id="repo-name" className="w-full">
                <SelectValue placeholder="Choose a repo" />
              </SelectTrigger>
              <SelectContent>
                {picker.data.repos.map((r) => (
                  <SelectItem key={r.fullName} value={r.fullName}>
                    {r.fullName}
                    {r.private ? " (private)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input id="repo-name" className="font-mono" placeholder="owner/name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="repo-ref">Branch or commit</Label>
          <Input id="repo-ref" className="font-mono" placeholder="Default branch" value={ref} onChange={(e) => setRef(e.target.value)} />
        </div>
        <Button onClick={submit} disabled={pickerOpen || starting || running || !/^[\w.-]+\/[\w.-]+$/.test(fullName.trim())}>
          <GitBranch /> {starting ? "Starting" : repo ? "Re-read repo" : "Read repo"}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">Read-only. Stage Ready never writes to your repo. {picker.data?.signedIn ? "" : "Without GitHub sign-in, only public repos can be read."}</p>
      {error ? <ErrorAlert title="Could not start the repo digest" error={error} onRetry={submit} /> : null}
      {jobId ? (
        <JobProgress
          key={jobId}
          jobId={jobId}
          title="Repo digest"
          onRetry={submit}
          onDone={() => {
            void latest.refetch();
            onDone();
          }}
        />
      ) : null}
    </div>
  );
}
