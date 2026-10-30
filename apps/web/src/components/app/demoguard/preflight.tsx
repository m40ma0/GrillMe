"use client";
import { MANUAL_CHECKS, type PreflightCheck } from "@stage-ready/shared";
import { Copy, MonitorPlay, RefreshCw, ShieldCheck, Terminal } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "../status-badge";
import type { useDemoGuardRun } from "./use-run";

type Run = ReturnType<typeof useDemoGuardRun>;

const STATUS = { pass: "pass", fail: "fail", warn: "unknown", unknown: "unknown" } as const;

function CheckRow({ c }: { c: PreflightCheck }) {
  return (
    <li className="flex items-start justify-between gap-4 border-b py-2 last:border-0">
      <div className="grid gap-0.5">
        <span className="text-sm font-medium">
          {c.label} {c.critical ? <span className="text-muted-foreground text-xs font-normal">(critical)</span> : null}
        </span>
        <span className="text-muted-foreground text-xs">{c.detail}</span>
      </div>
      {c.status === "warn" ? <StatusBadge status="unknown" label="Warning" /> : <StatusBadge status={STATUS[c.status]} />}
    </li>
  );
}

export function PreflightTab({ dg, hasSteps }: { dg: Run; hasSteps: boolean }) {
  const { run } = dg;
  const [source, setSource] = useState<"screen" | "camera">("screen");
  const [consent, setConsent] = useState(false);
  const [command, setCommand] = useState<string | null>(null);
  const started = run.sessionId !== null && !run.ended;
  const canArm = started && run.phase === "preflight" && run.criticalFailures === 0;
  const groups = [
    { label: "Stage Ready", items: run.checks.filter((c) => c.source !== "companion") },
    { label: "Presenter machine (companion)", items: run.checks.filter((c) => c.source === "companion") },
  ];

  const copyCommand = async () => {
    try {
      const cmd = await dg.companionCommand();
      setCommand(cmd);
      if (cmd)
        await navigator.clipboard.writeText(cmd).then(
          () => toast.success("Companion command copied."),
          () => undefined,
        );
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid content-start gap-4">
        {!started ? (
          <Card>
            <CardHeader>
              <CardTitle>Start pre-flight</CardTitle>
              <CardDescription>Run this about a minute before you present. DemoGuard watches the shared screen at 4 frames per second; frames are analysed and not recorded.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="dg-source">Demo screen</Label>
                <Select value={source} onValueChange={(v) => setSource(v as "screen" | "camera")}>
                  <SelectTrigger id="dg-source" className="w-72" aria-label="Demo screen">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="screen">Share a screen or window</SelectItem>
                    <SelectItem value="camera">Camera or virtual camera</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="dg-consent" checked={consent} onCheckedChange={(v) => setConsent(v === true)} />
                <Label htmlFor="dg-consent">I consent to DemoGuard analysing my shared screen.</Label>
              </div>
              <Button className="justify-self-start" onClick={() => void dg.start(source)} disabled={!consent || !hasSteps}>
                <MonitorPlay /> Start pre-flight
              </Button>
              {!hasSteps ? <p className="text-muted-foreground text-sm">Build the step map first.</p> : null}
            </CardContent>
          </Card>
        ) : null}
        {run.error ? (
          <Alert variant="destructive">
            <AlertTitle>DemoGuard</AlertTitle>
            <AlertDescription>
              <p>{run.error}</p>
            </AlertDescription>
          </Alert>
        ) : null}
        {started ? (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>Checks</CardTitle>
                <Badge variant={run.criticalFailures ? "contradicted" : "verified"}>
                  {run.criticalFailures ? `${run.criticalFailures} critical ${run.criticalFailures === 1 ? "check fails" : "checks fail"}` : "All critical checks pass"}
                </Badge>
              </div>
              <CardDescription>Arm is enabled only when every critical check passes.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {groups.map((g) => (
                <section key={g.label} aria-label={g.label}>
                  <h3 className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">{g.label}</h3>
                  {g.items.length ? (
                    <ul>
                      {g.items.map((c) => (
                        <CheckRow key={c.id} c={c} />
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      {g.label.startsWith("Presenter") ? "Connect the companion to check env vars, endpoints, the test login and disk space." : "Waiting for results."}
                    </p>
                  )}
                </section>
              ))}
              <div className="flex gap-2">
                <Button variant="outline" onClick={dg.rerun}>
                  <RefreshCw /> Re-run
                </Button>
                <Button onClick={dg.arm} disabled={!canArm}>
                  <ShieldCheck /> Arm
                </Button>
              </div>
              {run.phase === "armed" ? <p className="text-status-verified-foreground text-sm">Armed. DemoGuard goes live when the first step starts on screen.</p> : null}
            </CardContent>
          </Card>
        ) : null}
      </div>
      <div className="grid content-start gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Presenter checklist</CardTitle>
            <CardDescription>Tick these yourself. They do not block Arm.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {MANUAL_CHECKS.map((m) => (
              <div key={m.id} className="flex items-center gap-2">
                <Checkbox id={m.id} checked={run.manual[m.id] ?? false} onCheckedChange={(v) => dg.tickManual(m.id, v === true)} />
                <Label htmlFor={m.id}>{m.label}</Label>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Companion</CardTitle>
            <CardDescription>{run.companion.connected ? `Connected (v${run.companion.version}).` : "Optional. Run it on the presenter machine for network signals and local checks."}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Button variant="outline" onClick={copyCommand} disabled={!started}>
              <Terminal /> Copy companion command
            </Button>
            {command ? (
              <div className="bg-muted flex items-start gap-2 rounded-md p-2">
                <code className="min-w-0 flex-1 text-xs break-all">{command}</code>
                <Button size="icon" variant="ghost" aria-label="Copy command" onClick={() => void navigator.clipboard.writeText(command)}>
                  <Copy />
                </Button>
              </div>
            ) : null}
            <p className="text-muted-foreground text-xs">The command carries a 15-minute token. Copy a fresh one to reconnect.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
