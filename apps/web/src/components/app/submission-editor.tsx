"use client";
import { Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";

/** The written submission. The Claim Auditor checks spoken claims against it and the README. */
export function SubmissionEditor({ projectId, initial }: { projectId: string; initial: string }) {
  const [text, setText] = useState(initial);
  const [saving, setSaving] = useState(false);
  return (
    <div className="grid gap-2">
      <Label htmlFor="submission">Submission text</Label>
      <Textarea id="submission" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the project description you will submit." />
      <div>
        <Button
          variant="outline"
          size="sm"
          disabled={saving || text === initial}
          onClick={async () => {
            setSaving(true);
            try {
              await api(`/api/projects/${projectId}`, { method: "PATCH", json: { submissionText: text } });
              toast.success("Submission text saved.");
            } catch (error) {
              toast.error((error as Error).message);
            } finally {
              setSaving(false);
            }
          }}
        >
          <Save /> Save
        </Button>
      </div>
    </div>
  );
}
