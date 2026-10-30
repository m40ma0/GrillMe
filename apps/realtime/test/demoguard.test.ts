import type { ServerMessage } from "@stage-ready/shared";
import jpeg from "jpeg-js";
import pino from "pino";
import { afterEach, describe, expect, it, vi } from "vitest";
import { frameStats, RedBaseline } from "../src/demoguard/detectors";
import { DemoGuardSession, type DemoGuardContext } from "../src/demoguard/session";

const W = 320;
const H = 180;

/** A grey app screen; `panel` adds a result panel (a big change), `dialog` a red error dialog. */
function screen(opts: { panel?: boolean; dialog?: boolean; blank?: boolean } = {}): Uint8Array {
  const data = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      let [r, g, b] = opts.blank ? [0, 0, 0] : [((x * 2) % 200) + 30, 120, ((y * 3) % 200) + 30];
      if (!opts.blank && opts.panel && x > 160 && y > 40) [r, g, b] = [240, 240, 240];
      if (opts.dialog && x > 100 && x < 220 && y > 60 && y < 120) [r, g, b] = [220, 30, 30];
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  return jpeg.encode({ data, width: W, height: H }, 85).data;
}

function ctx(): DemoGuardContext {
  return {
    sessionId: "00000000-0000-7000-8000-000000000001",
    projectId: "00000000-0000-7000-8000-000000000002",
    demoMode: true,
    stepMapId: "00000000-0000-7000-8000-000000000003",
    fallbackClipUrl: "demo/golden-run.webm",
    badgeVisible: true,
    ended: false,
    steps: [
      { id: "s1", name: "Open report inbox", narration: "", maxDurationMs: 10_000, fallbackInMs: 0, fallbackOutMs: 8_000, expectedHash: null },
      { id: "s2", name: "Generate response plan", narration: "", maxDurationMs: 15_000, fallbackInMs: 12_000, fallbackOutMs: 20_000, expectedHash: null },
    ],
  };
}

function setup() {
  const inserted: unknown[] = [];
  const db = {
    insert: () => ({ values: (v: unknown) => (inserted.push(v), Promise.resolve()) }),
    select: () => ({ from: () => ({ where: async () => [{ summary: {} }] }) }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  };
  const session = new DemoGuardSession(ctx(), { db: db as never, logger: pino({ level: "silent" }), tracker: { probe: async () => false, track: async () => null } as never });
  const out: ServerMessage[] = [];
  const send = (m: ServerMessage) => out.push(m);
  session.attach(send);
  return { session, out, send, inserted };
}

const hashOf = (n: number) => BigInt(n);

afterEach(() => vi.useRealTimers());

describe("DemoGuard detectors", () => {
  it("a red dialog rises above the baseline; a blank frame has no variance", () => {
    const base = frameStats(screen())!;
    const dialog = frameStats(screen({ dialog: true }))!;
    expect(dialog.red - base.red).toBeGreaterThan(0.012);
    const baseline = new RedBaseline();
    expect(baseline.isError(0, base)).toBe(false);
    expect(baseline.isError(250, dialog)).toBe(true);
    expect(frameStats(screen({ blank: true }))!.lumaStd).toBeLessThan(4);
  });
});

describe("DemoGuard session", () => {
  it("pre-flight blocks Arm until the critical checks pass", async () => {
    const { session, out, send } = setup();
    await session.event({ type: "demoguard.control", action: "preflight" }, send);
    await session.event({ type: "preflight.result", checks: [{ id: "env", label: "Env vars", status: "fail", detail: "API_URL missing", critical: true, source: "companion" }] }, send);
    await session.event({ type: "demoguard.control", action: "arm" }, send);
    expect(out.some((m) => m.type === "error" && m.code === "arm_blocked")).toBe(true);
    await session.event({ type: "preflight.result", checks: [{ id: "env", label: "Env vars", status: "pass", detail: "", critical: true, source: "companion" }] }, send);
    await session.event({ type: "demoguard.control", action: "arm" }, send);
    expect(out.filter((m) => m.type === "demoguard.state").at(-1)).toMatchObject({ state: "armed" });
    await session.end();
  });

  it("an injected error dialog switches to fallback on that frame, at the step's in-point, and records the incident", async () => {
    const { session, out, send, inserted } = setup();
    await session.event({ type: "demoguard.control", action: "preflight" }, send);
    await session.event({ type: "demoguard.control", action: "arm" }, send);
    session.frame(0, hashOf(0), screen());
    session.frame(250, hashOf(0xff), screen({ panel: true })); // first step detected
    expect(out.filter((m) => m.type === "demoguard.state").at(-1)).toMatchObject({ state: "live", stepIndex: 0 });
    session.frame(500, hashOf(0xff), screen({ panel: true }));
    session.frame(750, hashOf(0xff), screen({ panel: true, dialog: true }));
    const state = out.filter((m) => m.type === "demoguard.state").at(-1);
    expect(state).toMatchObject({ state: "fallback", fallbackSeekMs: 0, badgeVisible: true });
    const incident = out.find((m) => m.type === "demoguard.incident");
    expect(incident).toMatchObject({ action: "switch", signals: ["error_dialog"], atMs: 750 });
    expect(incident?.type === "demoguard.incident" && (incident.detectionMs ?? 99) < 100).toBe(true);
    expect(inserted).toHaveLength(1);
    await session.end();
  });

  it("a 5xx from the companion proxy switches; a single timeout is only suspect", async () => {
    const { session, out, send } = setup();
    await session.event({ type: "demoguard.control", action: "preflight" }, send);
    await session.event({ type: "demoguard.control", action: "arm" }, send);
    session.frame(0, hashOf(0), screen());
    session.frame(250, hashOf(0xff), screen({ panel: true }));
    await session.event({ type: "signal.network", url: "/api/plan", status: 0, durationMs: 5_000, ts: 1 }, send);
    expect(out.filter((m) => m.type === "demoguard.state").at(-1)).toMatchObject({ state: "suspect" });
    await session.event({ type: "signal.network", url: "/api/plan", status: 503, durationMs: 40, ts: 2 }, send);
    expect(out.filter((m) => m.type === "demoguard.state").at(-1)).toMatchObject({ state: "fallback" });
    await session.end();
  });

  it("hotkeys: panic, resume, freeze", async () => {
    const { session, out, send } = setup();
    await session.event({ type: "demoguard.control", action: "preflight" }, send);
    await session.event({ type: "demoguard.control", action: "arm" }, send);
    session.frame(0, hashOf(0), screen());
    session.frame(250, hashOf(0xff), screen({ panel: true }));
    const last = () => out.filter((m) => m.type === "demoguard.state").at(-1);
    await session.event({ type: "demoguard.hotkey", action: "panic" }, send);
    expect(last()).toMatchObject({ state: "fallback" });
    await session.event({ type: "demoguard.hotkey", action: "resume" }, send);
    expect(last()).toMatchObject({ state: "live" });
    await session.event({ type: "demoguard.hotkey", action: "freeze" }, send);
    expect(last()).toMatchObject({ state: "frozen" });
    await session.end();
  });
});
