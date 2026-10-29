"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { EventSpecUpdate, isoToLocalInput, localInputToIso } from "@stage-ready/shared";
import { Plus, Save, Trash2 } from "lucide-react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import type { EventSpecDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SourceQuote } from "./source-quote";
import { StatusBadge } from "./status-badge";

type Values = EventSpecUpdate;

const toValues = (spec: EventSpecDTO): Values => ({
  name: spec.name,
  tracks: spec.tracks,
  criteria: spec.criteria.map((c) => ({ id: c.id, name: c.name, description: c.description, weight: c.weight })),
  requiredTech: spec.requiredTech,
  requirements: spec.requirements,
  weightsInferred: spec.weightsInferred,
});

const pct = (weight: number) => Math.round(weight * 100);

/** Review and edit an EventSpec. Weights are edited in whole percent and must total 100% to save. */
export function EventSpecEditor({
  projectId,
  spec,
  timezone,
  submitLabel = "Save event",
  onSaved,
}: {
  projectId: string;
  spec: EventSpecDTO;
  timezone: string;
  submitLabel?: string;
  onSaved?: (spec: EventSpecDTO) => void;
}) {
  const form = useForm<Values>({ resolver: zodResolver(EventSpecUpdate), defaultValues: toValues(spec), mode: "onChange" });
  const criteria = useFieldArray({ control: form.control, name: "criteria", keyName: "key" });
  const watched = useWatch({ control: form.control, name: "criteria" });
  const total = (watched ?? []).reduce((sum, c) => sum + pct(c.weight ?? 0), 0);
  const balanced = total === 100;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const { eventSpec } = await api<{ eventSpec: EventSpecDTO }>(`/api/projects/${projectId}/event`, { method: "PATCH", json: values });
      form.reset(toValues(eventSpec));
      toast.success("Event saved.");
      onSaved?.(eventSpec);
    } catch (error) {
      toast.error((error as Error).message);
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="grid gap-6" noValidate>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Event name</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Name the event" />
              </FormControl>
              <SourceQuote quote={spec.sourceQuotes.name} fallback="Not found on the page; enter it yourself." />
              <FormMessage />
            </FormItem>
          )}
        />

        <section className="grid gap-3" aria-labelledby="criteria-heading">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="criteria-heading" className="text-base font-medium">
              Judging criteria
            </h3>
            <div className="flex items-center gap-2">
              {spec.weightsInferred ? <Badge variant="outline">Weights inferred: none published</Badge> : null}
              <StatusBadge status={balanced ? "pass" : "fail"} label={`Total ${total}%`} />
            </div>
          </div>
          {criteria.fields.length === 0 ? <p className="text-muted-foreground">No criteria were found on the page. Add them from the rules or judging guide.</p> : null}
          <div className="grid gap-3">
            {criteria.fields.map((field, index) => {
              const original = spec.criteria.find((c) => c.id === field.id);
              const weight = watched?.[index]?.weight ?? 0;
              return (
                <div key={field.key} className="grid gap-3 rounded-lg border p-4">
                  <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                    <div className="grid gap-2">
                      <Input aria-label={`Criterion ${index + 1} name`} {...form.register(`criteria.${index}.name`)} />
                      <Textarea aria-label={`Criterion ${index + 1} description`} rows={2} {...form.register(`criteria.${index}.description`)} />
                    </div>
                    <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${watched?.[index]?.name || "criterion"}`} onClick={() => criteria.remove(index)}>
                      <Trash2 />
                    </Button>
                  </div>
                  <div className="flex items-center gap-4">
                    <Slider
                      aria-label={`Weight for ${watched?.[index]?.name || "criterion"}`}
                      min={0}
                      max={100}
                      step={1}
                      value={[pct(weight)]}
                      onValueChange={([v]) => form.setValue(`criteria.${index}.weight`, (v ?? 0) / 100, { shouldDirty: true, shouldValidate: true })}
                    />
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={100}
                        className="w-20 text-right font-mono tabular-nums"
                        aria-label={`Weight percent for ${watched?.[index]?.name || "criterion"}`}
                        value={pct(weight)}
                        onChange={(e) => form.setValue(`criteria.${index}.weight`, Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100, { shouldDirty: true, shouldValidate: true })}
                      />
                      <span className="text-muted-foreground">%</span>
                    </div>
                  </div>
                  <SourceQuote quote={original?.sourceQuote} fallback="Added by you" />
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => criteria.append({ name: "New criterion", description: "", weight: 0 })}>
              <Plus /> Add criterion
            </Button>
            <p className={cn("text-sm", balanced ? "text-muted-foreground" : "text-status-contradicted-foreground")} role="status">
              {balanced ? "Weights total 100%." : `Weights total ${total}%. Adjust them to 100% to save.`}
            </p>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3" aria-label="Submission requirements">
          <FormField
            control={form.control}
            name="requirements.videoMaxSec"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Video limit (s)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    className="font-mono tabular-nums"
                    value={field.value ?? ""}
                    placeholder="Unknown"
                    onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                  />
                </FormControl>
                <SourceQuote
                  quote={spec.requirements.videoMaxSec === field.value ? spec.sourceQuotes["requirements.videoMaxSec"] : null}
                  fallback={field.value === null ? "Unknown" : "Entered by you"}
                />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="requirements.repoPublic"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Public repo</FormLabel>
                <Select value={field.value === null ? "unknown" : field.value ? "yes" : "no"} onValueChange={(v) => field.onChange(v === "unknown" ? null : v === "yes")}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="yes">Required</SelectItem>
                    <SelectItem value="no">Not required</SelectItem>
                    <SelectItem value="unknown">Unknown</SelectItem>
                  </SelectContent>
                </Select>
                <SourceQuote
                  quote={spec.requirements.repoPublic === field.value ? spec.sourceQuotes["requirements.repoPublic"] : null}
                  fallback={field.value === null ? "Unknown" : "Entered by you"}
                />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="requirements.deadlineIso"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Deadline ({timezone})</FormLabel>
                <FormControl>
                  <Input
                    type="datetime-local"
                    className="font-mono tabular-nums"
                    value={field.value ? isoToLocalInput(field.value, timezone) : ""}
                    onChange={(e) => field.onChange(e.target.value ? localInputToIso(e.target.value, timezone) : null)}
                  />
                </FormControl>
                <SourceQuote
                  quote={spec.requirements.deadlineIso === field.value ? spec.sourceQuotes["requirements.deadlineIso"] : null}
                  fallback={field.value === null ? "Unknown" : "Entered by you"}
                />
              </FormItem>
            )}
          />
        </section>

        <FormField
          control={form.control}
          name="requiredTech"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Required technology</FormLabel>
              <FormControl>
                <Input
                  key={field.value.join("|")}
                  defaultValue={field.value.join(", ")}
                  placeholder="None stated, comma separated"
                  onBlur={(e) =>
                    field.onChange(
                      e.target.value
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean),
                    )
                  }
                />
              </FormControl>
              <SourceQuote quote={spec.sourceQuotes["requiredTech.0"]} fallback={field.value.length ? "Entered by you" : "None stated on the page"} />
            </FormItem>
          )}
        />

        {spec.tracks.length > 0 ? (
          <section className="grid gap-2" aria-label="Tracks">
            <h3 className="text-base font-medium">Tracks</h3>
            <ul className="grid gap-2">
              {spec.tracks.map((t, i) => (
                <li key={t.name} className="rounded-lg border p-3">
                  <div className="font-medium">{t.name}</div>
                  {t.description ? <p className="text-muted-foreground">{t.description}</p> : null}
                  <SourceQuote quote={spec.sourceQuotes[`tracks.${i}`]} className="mt-1" />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {spec.droppedFields.length > 0 ? <p className="text-muted-foreground text-xs">Left blank because no verbatim quote supported them: {spec.droppedFields.join(", ")}.</p> : null}

        <div>
          <Button type="submit" disabled={!balanced || form.formState.isSubmitting}>
            <Save /> {form.formState.isSubmitting ? "Saving" : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}
