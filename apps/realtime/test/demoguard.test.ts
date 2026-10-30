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

  it("Test the safety net injects an error-dialog signal, which switches like a real one", async () => {
    const { session, out, send } = setup();
    await session.event({ type: "demoguard.control", action: "preflight" }, send);
    await session.event({ type: "demoguard.control", action: "arm" }, send);
    session.frame(0, hashOf(0), screen());
    session.frame(250, hashOf(0xff), screen({ panel: true }));
    await session.event({ type: "demoguard.test" }, send);
    expect(out.filter((m) => m.type === "demoguard.state").at(-1)).toMatchObject({ state: "fallback" });
    expect(out.find((m) => m.type === "demoguard.signal")).toMatchObject({ kind: "error_dialog", critical: true, detail: expect.stringContaining("Test of the safety net") });
    await session.end();
  });
});

describe("golden-run keyframes", async () => {
  const { thumbnailDataUrl } = await import("../src/session/thumbnail");
  it("shrinks a frame to a 240 px JPEG data URL, and gives null for an unreadable frame", async () => {
    const jpeg = (await import("jpeg-js")).default;
    const big = jpeg.encode({ data: new Uint8Array(960 * 540 * 4).fill(200), width: 960, height: 540 }, 80).data;
    const url = thumbnailDataUrl(big);
    expect(url?.startsWith("data:image/jpeg;base64,")).toBe(true);
    const small = jpeg.decode(Buffer.from(url!.split(",")[1]!, "base64"));
    expect([small.width, small.height]).toEqual([240, 135]);
    expect(thumbnailDataUrl(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe("hosted SAM 3.1", () => {
  it("asks for each UI concept on the Meta Model API and returns normalised regions", async () => {
    const { HostedSamTracker } = await import("../src/vision/tracker");
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/models/sam-3.1")) return Response.json({ id: "sam-3.1" });
      const phrase = (JSON.parse(String(init?.body)) as { input: { content: { text?: string }[] }[] }).input[0]?.content[0]?.text;
      const text = phrase === "error dialog" ? "<0f>0<|box;x1=100;y1=50;x2=220;y2=110;w=320;h=180;c=0.92|><|mask;x=0;y=0;c=0.92;data=60,120,!abc|>" : "";
      return Response.json({ output_text: text });
    });
    vi.stubGlobal("fetch", fetchMock);
    const tracker = new HostedSamTracker({ baseUrl: "https://api.meta.ai/v1", apiKey: "k", model: "sam-3.1" });
    expect(await tracker.probe()).toBe(true);
    const regions = await tracker.track(screen());
    expect(regions).toEqual([{ label: "error_dialog", box: [100 / 320, 50 / 180, 220 / 320, 110 / 180], score: 0.92 }]);
    expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith("/responses"))).toHaveLength(3);
    vi.unstubAllGlobals();
  });

  it("with SAM, DemoGuard switches on a grey dialog the red heuristic cannot see", async () => {
    const grey = (): Uint8Array => {
      const data = Buffer.alloc(W * H * 4, 0);
      for (let i = 0; i < W * H; i++) data.set([150, 150, 150, 255], i * 4);
      return jpeg.encode({ data, width: W, height: H }, 85).data;
    };
    let dialog = false;
    const tracker = {
      available: true,
      probe: async () => true,
      track: async () => (dialog ? [{ label: "error_dialog" as const, box: [0.3, 0.3, 0.7, 0.6] as [number, number, number, number], score: 0.9 }] : []),
    };
    const db = {
      insert: () => ({ values: () => Promise.resolve() }),
      select: () => ({ from: () => ({ where: async () => [{ summary: {} }] }) }),
      update: () => ({ set: () => ({ where: async () => undefined }) }),
    };
    const session = new DemoGuardSession(ctx(), { db: db as never, logger: pino({ level: "silent" }), tracker: tracker as never });
    const out: ServerMessage[] = [];
    const send = (m: ServerMessage) => out.push(m);
    session.attach(send);
    await new Promise((r) => setTimeout(r, 10));
    await session.event({ type: "demoguard.control", action: "preflight" }, send);
    await session.event({ type: "demoguard.control", action: "arm" }, send);
    session.frame(0, hashOf(0), screen());
    session.frame(250, hashOf(0xff), screen({ panel: true }));
    await new Promise((r) => setTimeout(r, 10));
    dialog = true;
    session.frame(500, hashOf(0xf0f), grey());
    await new Promise((r) => setTimeout(r, 10));
    expect(out.filter((m) => m.type === "demoguard.state").at(-1)).toMatchObject({ state: "fallback", vision: "sam" });
    await session.end();
  });
});
