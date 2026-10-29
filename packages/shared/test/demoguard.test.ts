import { describe, expect, it } from "vitest";
import { criticalFailures, dgReduce, initialDgState, mergeChecks, type DgEvent, type DgPhase, type DgState, type DgStep, type SignalKind } from "../src/demoguard";

const steps: DgStep[] = [
  { maxDurationMs: 10_000, fallbackInMs: 0, fallbackOutMs: 8_000 },
  { maxDurationMs: 8_000, fallbackInMs: 12_000, fallbackOutMs: 20_000 },
  { maxDurationMs: 15_000, fallbackInMs: 24_000, fallbackOutMs: 32_000 },
];

const sig = (kind: SignalKind, atMs: number): DgEvent => ({ type: "signal", signal: { kind, atMs, detail: kind } });

function run(events: DgEvent[], from: DgState = initialDgState()) {
  let state = from;
  const effects = [];
  for (const e of events) {
    const r = dgReduce(state, e, steps);
    state = r.state;
    effects.push(...r.effects);
  }
  return { state, effects };
}

const armedLive: DgEvent[] = [
  { type: "preflight", atMs: 0 },
  { type: "arm", atMs: 0, criticalFailures: 0 },
  { type: "activity", atMs: 1_000 },
];

describe("DemoGuard state machine", () => {
  const table: [string, DgEvent[], DgPhase][] = [
    ["idle to pre-flight", [{ type: "preflight", atMs: 0 }], "preflight"],
    [
      "arm is blocked by a critical failure",
      [
        { type: "preflight", atMs: 0 },
        { type: "arm", atMs: 0, criticalFailures: 1 },
      ],
      "preflight",
    ],
    [
      "arm passes",
      [
        { type: "preflight", atMs: 0 },
        { type: "arm", atMs: 0, criticalFailures: 0 },
      ],
      "armed",
    ],
    ["first activity goes live", armedLive, "live"],
    ["one critical signal switches", [...armedLive, sig("error_dialog", 2_000)], "fallback"],
    ["a 5xx switches", [...armedLive, sig("http_5xx", 2_000)], "fallback"],
    ["one non-critical signal is suspect", [...armedLive, sig("blank_screen", 2_000)], "suspect"],
    ["a suspect signal clears after 1 s", [...armedLive, sig("blank_screen", 2_000), { type: "tick", atMs: 3_100 }], "live"],
    ["two corroborating signals switch", [...armedLive, sig("blank_screen", 2_000), sig("http_timeout", 2_500)], "fallback"],
    ["the same signal twice does not corroborate", [...armedLive, sig("blank_screen", 2_000), sig("blank_screen", 2_500)], "suspect"],
    ["signals outside the window do not corroborate", [...armedLive, sig("blank_screen", 2_000), { type: "tick", atMs: 3_500 }, sig("http_timeout", 6_000)], "suspect"],
    ["panic switches now", [...armedLive, { type: "hotkey", action: "panic", atMs: 2_000 }], "fallback"],
    ["freeze holds", [...armedLive, { type: "hotkey", action: "freeze", atMs: 2_000 }], "frozen"],
    ["resume after freeze", [...armedLive, { type: "hotkey", action: "freeze", atMs: 2_000 }, { type: "hotkey", action: "resume", atMs: 3_000 }], "live"],
    ["resume after fallback", [...armedLive, sig("error_dialog", 2_000), { type: "hotkey", action: "resume", atMs: 3_000 }], "live"],
    ["recovery waits for the step boundary", [...armedLive, sig("error_dialog", 2_000), { type: "recovered", atMs: 3_000 }, { type: "tick", atMs: 5_000 }], "recovering"],
    ["recovery cuts back at the boundary", [...armedLive, sig("error_dialog", 2_000), { type: "recovered", atMs: 3_000 }, { type: "tick", atMs: 10_000 }], "live"],
    ["last step completes", [...armedLive, { type: "step_complete", atMs: 2_000 }, { type: "step_complete", atMs: 3_000 }, { type: "step_complete", atMs: 4_000 }], "done"],
    ["signals are ignored before going live", [{ type: "preflight", atMs: 0 }, { type: "arm", atMs: 0, criticalFailures: 0 }, sig("error_dialog", 500)], "armed"],
  ];
  it.each(table)("%s", (_name, events, phase) => {
    expect(run(events).state.phase).toBe(phase);
  });

  it("switches to the current step's in-point and records the incident with its signals", () => {
    const { state, effects } = run([...armedLive, { type: "step_complete", atMs: 2_000 }, sig("error_dialog", 3_000)]);
    expect(state.stepIndex).toBe(1);
    expect(effects).toContainEqual({ type: "switch", to: "fallback", stepIndex: 1, seekMs: 12_000 });
    expect(effects).toContainEqual(expect.objectContaining({ type: "incident", action: "switch", stepIndex: 1, signals: [expect.objectContaining({ kind: "error_dialog" })] }));
  });

  it("cuts back at the next step, not mid-step, and totals the time on fallback", () => {
    const { state, effects } = run([...armedLive, sig("error_dialog", 2_000), { type: "recovered", atMs: 3_000 }, { type: "tick", atMs: 10_000 }]);
    expect(state.stepIndex).toBe(1);
    expect(effects).toContainEqual({ type: "switch", to: "live", stepIndex: 1, seekMs: null });
    expect(state.totalFallbackMs).toBe(8_000);
  });

  it("the fallback clip ends the run after the last step", () => {
    const { state } = run([...armedLive, { type: "step_complete", atMs: 2_000 }, { type: "step_complete", atMs: 3_000 }, sig("http_5xx", 4_000), { type: "tick", atMs: 12_500 }]);
    expect(state.phase).toBe("done");
  });

  it("arm is rejected with a reason", () => {
    const { effects } = run([
      { type: "preflight", atMs: 0 },
      { type: "arm", atMs: 0, criticalFailures: 2 },
    ]);
    expect(effects).toEqual([{ type: "rejected", reason: "2 critical pre-flight checks fail." }]);
  });
});

describe("pre-flight", () => {
  it("merges by id and counts critical failures", () => {
    const a = mergeChecks([], [{ id: "env", label: "Env", status: "fail", detail: "", critical: true, source: "companion" }]);
    expect(criticalFailures(a)).toBe(1);
    const b = mergeChecks(a, [{ id: "env", label: "Env", status: "pass", detail: "", critical: true, source: "companion" }]);
    expect(criticalFailures(b)).toBe(0);
    expect(criticalFailures([{ id: "x", label: "X", status: "unknown", detail: "", critical: true, source: "server" }])).toBe(1);
  });
});

describe("step map from a golden run", () => {
  it("orders steps, pads the clip and leaves headroom on the maximum", async () => {
    const { deriveSteps } = await import("../src/demoguard");
    const out = deriveSteps(
      [
        { stepKey: "load_comparison", startMs: 60_000, endMs: 60_640, durationMs: 640, outputHash: null },
        { stepKey: "generate_summary", startMs: 40_000, endMs: 49_200, durationMs: 9_200, outputHash: "ab" },
      ],
      [{ startMs: 38_000, endMs: 41_000, text: "Now I generate the plan." }],
    );
    expect(out.map((s) => s.name)).toEqual(["Generate summary", "Load comparison"]);
    expect(out[0]).toMatchObject({ maxDurationMs: 13_800, fallbackInMs: 39_000, fallbackOutMs: 50_700, narration: "Now I generate the plan.", successSignal: { outputHash: "ab" } });
    expect(out[1]?.maxDurationMs).toBe(3_000);
  });
});
