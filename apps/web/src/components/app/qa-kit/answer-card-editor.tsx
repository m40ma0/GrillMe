"use client";
import { ANSWER_MAX_WORDS, wordCount } from "@stage-ready/shared";
import { Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import type { QuestionDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

/** The 20-second script with a live word count against the cap, the bridge line and the evidence it cites. */
export function AnswerCardEditor({ question, onSaved }: { question: QuestionDTO; onSaved: () => void }) {
  const card = question.card;
  const [script, setScript] = useState(card?.script ?? "");
  const [bridge, setBridge] = useState(card?.bridgeLine ?? "");
  const [saving, setSaving] = useState(false);
  const words = wordCount(script);
  const over = words > ANSWER_MAX_WORDS;
  const dirty = card !== null && (script !== card.script || bridge !== card.bridgeLine);

  const save = async () => {
    if (!card) return;
    setSaving(true);
    try {
      await api(`/api/answer-cards/${card.id}`, { method: "PATCH", json: { script, bridgeLine: bridge } });
      toast.success("Answer card saved.");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg leading-7">{question.text}</CardTitle>
        <CardDescription>Answer first, then the proof. Read it aloud in 20 seconds or less.</CardDescription>
      </CardHeader>
      {card ? (
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="answer-script">Script</Label>
              <span className={cn("font-mono text-xs tabular-nums", over ? "text-status-contradicted-foreground font-semibold" : "text-muted-foreground")} aria-live="polite">
                {words} / {ANSWER_MAX_WORDS} words{over ? " (over the cap)" : ""}
              </span>
            </div>
            <Textarea id="answer-script" value={script} onChange={(e) => setScript(e.target.value)} rows={6} aria-invalid={over} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="answer-bridge">Bridge line</Label>
            <Input id="answer-bridge" value={bridge} maxLength={120} onChange={(e) => setBridge(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <span className="text-sm font-medium">Evidence</span>
            {card.evidenceRefs.length ? (
              <ul className="flex flex-wrap gap-2">
                {card.evidenceRefs.map((r) => (
                  <li key={r}>
                    <Badge variant="outline" className="font-mono">
                      {r}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-status-unverified-foreground text-sm">No evidence yet. A Fix Task tracks what would prove this answer.</p>
            )}
          </div>
        </CardContent>
      ) : (
        <CardContent>
          <p className="text-muted-foreground">This question has no answer card yet. Rebuild the questions to write one.</p>
        </CardContent>
      )}
      {card ? (
        <CardFooter className="justify-end">
          <Button onClick={save} disabled={!dirty || over || saving || script.trim().length === 0}>
            <Save /> {saving ? "Saving" : "Save card"}
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}
