"use client";
import { Send } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import { ErrorAlert } from "./error-alert";
import { JobProgress } from "./job-progress";

/** URLs or pasted text → a background job with visible progress. Used for the event page and past winners. */
export function SourcesForm({
  endpoint,
  urlLabel,
  textLabel,
  submitLabel,
  jobTitle,
  onDone,
}: {
  endpoint: string;
  urlLabel: string;
  textLabel: string;
  submitLabel: string;
  jobTitle: string;
  onDone: (result: unknown) => void;
}) {
  const [urls, setUrls] = useState("");
  const [text, setText] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const urlList = urls
    .split(/\s+/)
    .map((u) => u.trim())
    .filter(Boolean);

  const submit = async () => {
    setError(null);
    setPending(true);
    try {
      const { jobId: id } = await api<{ jobId: string }>(endpoint, { method: "POST", json: { urls: urlList, ...(text.trim() ? { text } : {}) } });
      setJobId(id);
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor={`${endpoint}-urls`}>{urlLabel}</Label>
        <Textarea id={`${endpoint}-urls`} rows={2} placeholder="https://… (one per line)" value={urls} onChange={(e) => setUrls(e.target.value)} className="font-mono" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${endpoint}-text`}>{textLabel}</Label>
        <Textarea id={`${endpoint}-text`} rows={6} placeholder="Paste the page text if a URL is behind a login or does not load." value={text} onChange={(e) => setText(e.target.value)} />
        <p className="text-muted-foreground text-xs">Page content is treated as data. Instructions inside it are never followed.</p>
      </div>
      {error ? <ErrorAlert title="Could not start" error={error} onRetry={submit} /> : null}
      {jobId ? (
        <JobProgress
          key={jobId}
          jobId={jobId}
          title={jobTitle}
          onRetry={submit}
          onDone={(result) => {
            onDone(result);
          }}
        />
      ) : null}
      <div>
        <Button type="button" onClick={submit} disabled={pending || (urlList.length === 0 && !text.trim())}>
          <Send /> {submitLabel}
        </Button>
      </div>
    </div>
  );
}
